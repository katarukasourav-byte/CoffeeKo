/* Web search for a coffee that isn't in the catalogue (used by ai.mjs, and by
   catalog-sync.mjs for the owner's tests). Every link is opened before it is shown. */
import cfg from '../../config/ai.json';
import { db, strip, packOf, UA } from './catalog.mjs';
const env = k => process.env[k] || '';
const clip = (s, n) => String(s || '').slice(0, n);
function parseJSON(text) { const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error('No JSON in reply'); return JSON.parse(m[0]); }
/* ---------- live web search for a coffee that isn't in the catalogue ---------- */
const FIND_PROMPT = (q, where) => `Find coffee products matching this search: "${q}".
Use web search. Only return coffee beans or ground coffee in a bag that can be bought online today from the roaster's own shop or a coffee retailer${where ? `, preferring shops that sell to ${where}` : ''}.
Each url must be the exact product page you saw in the search results (not a home page, blog or search page). Never make up a URL.
Return ONLY JSON: {"results":[{"name":string,"roaster":string,"url":string,"origin":string|null,"process":string|null,"roastLevel":"light"|"medium-light"|"medium"|"medium-dark"|"dark"|null,"notes":[string],"price":string|null}]} with at most 5 results, best match first.`;

/* Where the visitor is: two-letter region from their browser, or their time zone. Nothing else is used. */
function placeOf(region, tz) {
  const r = String(region || '').toUpperCase().slice(0, 2);
  const z = String(tz || '').slice(0, 40);
  const country = /^[A-Z]{2}$/.test(r) ? r : (/^Asia\/(Kolkata|Calcutta)$/.test(z) ? 'IN' : null);
  return { country, timezone: /^[A-Za-z_]+\/[A-Za-z_\-]+$/.test(z) ? z : null };
}
let regionNames; try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
export async function findCoffee(q, region, tz) {
  const pl = placeOf(region, tz);
  const where = pl.country ? (regionNames?.of(pl.country) || pl.country) : null;
  const loc = pl.country ? { type: 'approximate', country: pl.country, ...(pl.timezone ? { timezone: pl.timezone } : {}) } : null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 3000, ...(cfg.thinking === false ? { thinking: { type: 'disabled' } } : {}), messages: [{ role: 'user', content: FIND_PROMPT(clip(q, 120), where) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: cfg.findSearches || 2, ...(loc ? { user_location: loc } : {}) }] })
  });
  const out = await r.json();
  if (!r.ok) throw new Error('Anthropic: ' + (out.error?.message || r.status));
  const seen = new Set();
  (out.content || []).forEach(b => { if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(x => x.url && seen.add(x.url.split('#')[0])); });
  const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let list = []; try { list = parseJSON(text).results || []; } catch {}
  const checked = await Promise.all(list.slice(0, 5).map(x => verify(x, seen)));
  return checked.filter(Boolean);
}
/* Open each page: keep it only if it loads. Shopify shops give us the real photo and price. */
const CUR = t => { const s = String(t || ''); return /₹|\bRs\.?|\bINR\b/i.test(s) ? 'INR' : /£|\bGBP\b/i.test(s) ? 'GBP' : /€|\bEUR\b/i.test(s) ? 'EUR' : /A\$|\bAUD\b/i.test(s) ? 'AUD' : /C\$|\bCAD\b/i.test(s) ? 'CAD' : /\bAED\b|د\.إ/i.test(s) ? 'AED' : /S\$|\bSGD\b/i.test(s) ? 'SGD' : /¥|\bJPY\b/i.test(s) ? 'JPY' : /\$|\bUSD\b/i.test(s) ? 'USD' : null; };
async function verify(x, seen) {
  let u; try { u = new URL(x.url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const item = { name: clip(x.name, 120), roaster: clip(x.roaster, 80), url: u.href, origin: x.origin || null, process: x.process || null, roast_level: x.roastLevel || null, notes: (x.notes || []).slice(0, 5), price_text: x.price || null, image: null, inSearch: seen.has(u.href.split('#')[0]) };
  try {
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    if (m) {
      const r = await fetch(`${u.origin}/products/${m[1]}.json`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const p = (await r.json()).product;
        Object.assign(item, { name: p.title, url: `${u.origin}/products/${p.handle}`, image: p.images?.[0]?.src || null, images: (p.images || []).slice(0, 4).map(i => i.src), raw: `Title: ${p.title}\nTags: ${p.tags}\nDescription: ${strip(p.body_html).slice(0, 1800)}`, ...packOf(p) });
        // Shopify doesn't say which currency; take it from the price the search saw, else leave the number out
        item.currency = CUR(x.price) || (/\.in$/.test(u.hostname) ? 'INR' : null);
        if (!item.currency) { item.price_inr = null; item.price_250 = null; }
        item.verified = true; return item;
      }
    }
    const r = await fetch(u.href, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 300000);
    const og = k => (html.match(new RegExp(`<meta[^>]+property=["']og:${k}["'][^>]+content=["']([^"']+)`, 'i')) || [])[1];
    item.image = og('image') || null; item.verified = true; return item;
  } catch { return item.inSearch ? item : null; }
}
/* Save a found coffee into the shared catalogue so everyone can find it next time. */
export async function addToCatalog(it) {
  const id = new URL(it.url).host.replace(/^www\./, '') + new URL(it.url).pathname.replace(/\/$/, '');
  const row = { id, roaster: it.roaster || new URL(it.url).host, name: it.name, url: it.url, image: it.image, images: it.images || (it.image ? [it.image] : []),
    price_inr: it.price_inr || null, pack_g: it.pack_g || null, price_250: it.price_250 || null, currency: it.currency || null, available: it.available !== false,
    origin: it.origin, process: it.process, roast_level: it.roast_level, notes: it.notes, source: 'web', raw: it.raw || null, extracted: !it.raw, is_coffee: true, updated_at: new Date().toISOString() };
  await db('catalog?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify([row]) });
  return id;
}

