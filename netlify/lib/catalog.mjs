/* =====================================================================
   CATALOGUE WORKER — shared by catalog-cron.mjs (runs every hour) and
   catalog-sync.mjs (manual trigger).
   1. sync:    reads one roaster's Shopify shop (products.json) and stores each
               coffee's name, direct link, packaging photo, price and stock.
   2. extract: asks Claude Haiku to read new or changed product descriptions
               and fill in origin, process, roast, notes and taste scores.
   ===================================================================== */
import cfg from '../../config/catalog.json';
import ai from '../../config/ai.json';

const env = k => process.env[k] || '';
const UA = 'CoffeeKoCatalog/1.0 (+https://coffeeko.in)';
const NOT_COFFEE = /(gift|subscription|subscribe|capsule|pod|cold ?brew|can |iced latte|bottle|matcha|tea\b|chai|hot chocolate|cocoa powder|cookie|merch|t-?shirt|tote|mug|cup\b|tumbler|grinder|kettle|dripper|v60|chemex|aeropress|french press|moka|filter paper|scale|machine|brewer|kit\b|workshop|training|course|event|tour|voucher|card\b|sampler box|instant|sachet|drip bag|easy pour|syrup|accessor|equipment|notebook|candle)/i;

/* ---------- Supabase REST with the service role ---------- */
async function db(path, opts = {}) {
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + path, {
    ...opts,
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'),
      'content-type': 'application/json', ...(opts.headers || {}) }
  });
  if (!r.ok) throw new Error('DB ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

const strip = h => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function grams(t) { const s = String(t || '').toLowerCase(); let m = s.match(/(?<![a-z0-9#.])(\d+(?:\.\d+)?)\s*kgs?\b/); if (m) return Math.round(+m[1] * 1000); m = s.match(/(?<![a-z0-9#.])(\d{2,4})\s*(?:g|gm|gms|grams?)\b/); return m && +m[1] >= 30 ? +m[1] : null; }

/* Pick the pack to show: smallest whole-bean size, otherwise the smallest size. */
function packOf(p) {
  const vs = (p.variants || []).map(v => ({ g: grams(v.title) || grams(p.title), price: Math.round(+v.price * 100) / 100, avail: v.available !== false, ground: /ground|grind|filter|espresso|french|moka|aeropress|pour/i.test(v.title) && !/whole/i.test(v.title) }))
    .filter(v => v.price > 0);
  if (!vs.length) return { price_inr: null, pack_g: null, price_250: null, available: false };
  const whole = vs.filter(v => !v.ground);
  const pool = (whole.length ? whole : vs).sort((a, b) => (a.g || 9999) - (b.g || 9999) || a.price - b.price);
  const v = pool[0];
  return { price_inr: v.price, pack_g: v.g, price_250: v.g ? Math.round(v.price * 250 / v.g * 100) / 100 : null, available: vs.some(x => x.avail) };
}

async function fetchShop(domain) {
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); const ps = j.products || [];
    all.push(...ps); if (ps.length < 250) break;
  }
  return all;
}

/* ---------- 1. sync one roaster ---------- */
export async function syncRoaster(name) {
  const known = await db('catalog_roasters?select=domain,roaster,last_synced');
  const list = cfg.roasters;
  let R = name ? list.find(r => r.name.toLowerCase() === String(name).toLowerCase()) : null;
  if (!R) { // the roaster synced longest ago (never-synced first)
    const last = n => { const k = known.find(x => x.roaster === n); return k?.last_synced ? Date.parse(k.last_synced) : 0; };
    R = list.slice().sort((a, b) => last(a.name) - last(b.name))[0];
  }
  let domain = null, products = null, err = null;
  for (const d of R.domains) { try { products = await fetchShop(d); domain = d; break; } catch (e) { err = e.message; } }
  const status = products ? 'ok' : 'failed: ' + err;
  if (!products) {
    await db('catalog_roasters?on_conflict=domain', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ domain: R.domains[0], roaster: R.name, last_synced: new Date().toISOString(), status, products: 0 }]) });
    return { roaster: R.name, status };
  }
  const base = 'https://' + domain.replace(/^www\./, 'www.');
  const coffees = products.filter(p => {
    const txt = [p.title, p.product_type, (p.tags || []).join(' ')].join(' ');
    if ((p.tags || []).some(t => /hide/i.test(t))) return false;
    if (NOT_COFFEE.test(p.title) || NOT_COFFEE.test(p.product_type || '')) return false;
    return /coffee|roast|bean|estate|arabica|robusta|blend|espresso|filter|single origin|natural|washed|honey/i.test(txt + ' ' + strip(p.body_html).slice(0, 400));
  });
  const existing = await db(`catalog?select=id,content_hash&roaster=eq.${encodeURIComponent(R.name)}`);
  const prev = Object.fromEntries(existing.map(x => [x.id, x.content_hash]));
  const rows = coffees.map(p => {
    const raw = [`Roaster: ${R.name}, based in ${R.country || 'IN'}`, `Title: ${p.title}`, `Type: ${p.product_type || ''}`, `Tags: ${(p.tags || []).join(', ')}`, `Sizes: ${(p.variants || []).map(v => v.title).slice(0, 8).join(' | ')}`, `Description: ${strip(p.body_html).slice(0, 1800)}`].join('\n');
    const h = hash(raw), id = domain.replace(/^www\./, '') + '/' + p.handle;
    const row = { id, roaster: R.name, name: p.title.trim(), url: `https://${domain}/products/${p.handle}`, image: p.images?.[0]?.src || null,
      images: (p.images || []).slice(0, 4).map(i => i.src), product_type: p.product_type || null, raw, content_hash: h, source: 'shop', currency: R.currency || 'INR', roaster_country: R.country || 'IN', updated_at: new Date().toISOString(), ...packOf(p) };
    if (prev[id] !== h) { row.extracted = false; row.is_coffee = true; row.tries = 0; }
    return row;
  });
  // Upsert in two groups so unchanged rows keep their AI-read details
  const changed = rows.filter(r => 'extracted' in r), same = rows.filter(r => !('extracted' in r));
  for (const grp of [changed, same]) if (grp.length) await db('catalog?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(grp) });
  // Anything no longer listed in the shop is marked unavailable
  const gone = existing.map(x => x.id).filter(id => !rows.some(r => r.id === id));
  if (gone.length) await db(`catalog?id=in.(${gone.map(g => '"' + g.replace(/"/g, '') + '"').join(',')})`, { method: 'PATCH', body: JSON.stringify({ available: false }) });
  await db('catalog_roasters?on_conflict=domain', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ domain, roaster: R.name, last_synced: new Date().toISOString(), status, products: rows.length }]) });
  return { roaster: R.name, domain, status, products: rows.length, changed: changed.length, gone: gone.length };
}

/* ---------- 2. AI reads descriptions ---------- */
const PROMPT = items => `You are cataloguing specialty coffee sold online by roasters around the world. For each product below, read ONLY the text given.
Rules:
- isCoffee: true only for roasted coffee sold as beans or ground coffee in a bag (single origins and blends). false for equipment, gift boxes, subscriptions, capsules, drip bags, cold brew, tea, merchandise, sample sets of many coffees.
- origin (country), region, estate (farm/estate/cooperative), altitude, variety (e.g. SL795, Catuai), grade (e.g. AA, Plantation A, PB, Specialty 84+), roastLevel: fill ONLY if the text states or clearly implies it; otherwise null. Never guess an estate, altitude or variety. When the roaster is based in IN (India) and the coffee comes from a named Indian estate or region (Chikmagalur, Coorg, Araku, Baba Budangiri, Nilgiris, Wayanad, BR Hills, Malabar…) and no other country is named, origin is "India". For roasters elsewhere, never assume the origin is the roaster's own country.
- process: the short name only, at most 3 words (e.g. "Washed", "Natural", "Honey", "Anaerobic natural", "Carbonic maceration", "Monsooned", "Yeast fermented", "Co-ferment"). processDetail: the longer description if the text gives one (fermentation hours, drying), else null.
- notes: up to 5 tasting notes as written.
- acidity, body, sweetness, bitterness: 1–5. Use any stated scores (tags like "acidity-medium" = 3, "high" = 4, "low" = 2); otherwise estimate from the notes and roast.
- blend: true if it is a blend of several coffees.
- summary: one plain sentence (max 25 words) describing how it tastes. No marketing words.
Output format: one JSON object per product, each on its own single line, nothing else (no array, no code fences, no commentary). Use double quotes and escape any double quote inside text. Each line:
{"id":string,"isCoffee":boolean,"origin":string|null,"region":string|null,"estate":string|null,"altitude":string|null,"variety":string|null,"process":string|null,"processDetail":string|null,"grade":string|null,"roastLevel":"light"|"medium-light"|"medium"|"medium-dark"|"dark"|null,"notes":[string],"acidity":1-5,"body":1-5,"sweetness":1-5,"bitterness":1-5,"blend":boolean,"summary":string}

${items.map(i => `### id: ${i.id}\n${i.raw}`).join('\n\n')}`;

export async function extractBatch(n) {
  const todo = await db(`catalog?select=id,raw,tries&extracted=eq.false&is_coffee=eq.true&raw=not.is.null&limit=${Math.max(1, Math.min(12, n || cfg.extractPerRun || 6))}`);
  if (!todo.length) return { extracted: 0, left: 0 };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ai.model, max_tokens: 4000, ...(ai.thinking === false ? { thinking: { type: 'disabled' } } : {}), messages: [{ role: 'user', content: PROMPT(todo) }] }),
    signal: AbortSignal.timeout(25000)
  });
  const out = await r.json();
  if (!r.ok) throw new Error('Anthropic: ' + (out.error?.message || r.status));
  const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const items = [];
  for (const line of text.split('\n')) { const l = line.trim().replace(/,$/, ''); if (!l.startsWith('{')) continue; try { items.push(JSON.parse(l)); } catch {} }
  // A product the AI can't read after 3 tries is hidden rather than retried for ever
  const missed = todo.filter(t => !items.some(i => i.id === t.id));
  for (const t of missed) { const n = (t.tries || 0) + 1; await db(`catalog?id=eq.${encodeURIComponent(t.id)}`, { method: 'PATCH', body: JSON.stringify(n >= 3 ? { tries: n, extracted: true, is_coffee: false } : { tries: n }) }); }
  const cl = v => v == null || isNaN(+v) ? null : Math.min(5, Math.max(1, Math.round(+v)));
  const ROAST = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];
  for (const it of items) {
    if (!todo.some(t => t.id === it.id)) continue;
    const patch = it.isCoffee === false ? { is_coffee: false, extracted: true } : {
      extracted: true, is_coffee: true, origin: it.origin || null, region: it.region || null, estate: it.estate || null, altitude: it.altitude || null,
      variety: it.variety || null, process: it.process ? String(it.process).slice(0, 40) : null, process_detail: it.processDetail ? String(it.processDetail).slice(0, 220) : null, grade: it.grade || null, roast_level: ROAST.includes(it.roastLevel) ? it.roastLevel : null,
      notes: (it.notes || []).slice(0, 5), acidity: cl(it.acidity), body: cl(it.body), sweetness: cl(it.sweetness), bitterness: cl(it.bitterness),
      blend: !!it.blend, summary: it.summary ? String(it.summary).slice(0, 220) : null };
    await db(`catalog?id=eq.${encodeURIComponent(it.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
  // anything the AI skipped is retried next time; count what is left
  const left = await fetch(env('SUPABASE_URL') + '/rest/v1/catalog?select=id&extracted=eq.false&is_coffee=eq.true', { method: 'HEAD', headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'), Prefer: 'count=exact' } });
  return { extracted: items.length, left: +(left.headers.get('content-range') || '/0').split('/')[1] || 0, usage: out.usage };
}

export async function status() {
  const roasters = await db('catalog_roasters?select=*&order=roaster');
  return { roasters };
}
export { db, strip, hash, packOf, UA };
