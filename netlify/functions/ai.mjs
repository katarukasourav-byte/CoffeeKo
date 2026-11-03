/* =====================================================================
   AI FUNCTION — runs on Netlify's servers, never in the browser.
   1. Checks the visitor is logged in (Supabase).
   2. Checks and counts their daily limit (config/ai.json → dailyLimits).
   3. identify / identify_bulk: reads a coffee bag photo.
      find: searches the web for a coffee that isn't in the catalogue,
            checks every link opens, and adds the coffee to the catalogue.

   Secret keys are set in Netlify → Site configuration → Environment variables:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
     ANTHROPIC_API_KEY   (or GEMINI_API_KEY if provider is "gemini")
   ===================================================================== */
import cfg from '../../config/ai.json';
import { db, strip, packOf, UA } from '../lib/catalog.mjs';

const env = k => process.env[k] || '';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* ---------- prompts ---------- */
const clip = (s, n) => String(s || '').slice(0, n);

function buildPrompt(task, p) {
  if (task === 'identify' || task === 'identify_bulk') {
    return `You are a specialty coffee expert helping someone build a taste profile.
${p.image ? 'Look at the attached photo of a coffee (usually the retail bag). Read every bit of text on the packaging.' : ''}
${p.hint ? `The person says the coffee is: "${clip(p.hint, 160)}".` : ''}
Identify the coffee and describe it. Where the packaging states something, use it. Where it does not, fill in from general knowledge of that coffee, roaster, origin and processing, and mark source accordingly. Never invent a roast date or weight that isn't visible.
Return ONLY a JSON object:
{"found":true|false,"name":string,"roaster":string|null,"origin":string|null,"region":string|null,"process":string|null,"variety":string|null,"roastLevel":"light"|"medium-light"|"medium"|"medium-dark"|"dark"|null,"roastDate":"YYYY-MM-DD"|null,"netWeightG":number|null,"tastingNotes":[up to 5 short notes],"aroma":short phrase,"acidity":1-5,"body":1-5,"sweetness":1-5,"bitterness":1-5,"packagingSays":one or two sentences summarising what the bag claims or null,"source":"packaging"|"knowledge"|"mixed","brewTip":one sentence of pour-over advice (ratio, grind, water temperature),"confidence":"high"|"medium"|"low"}`;
  }
  return null;
}

/* ---------- providers ---------- */
async function callAnthropic(prompt, image) {
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
  content.push({ type: 'text', text: prompt });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens || 3000, ...(cfg.thinking === false ? { thinking: { type: 'disabled' } } : {}), messages: [{ role: 'user', content }] })
  });
  const out = await r.json();
  if (!r.ok) throw new Error('Anthropic: ' + (out.error?.message || r.status));
  return (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
async function callGemini(prompt, image) {
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });
  parts.push({ text: prompt });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } })
  });
  const out = await r.json();
  if (!r.ok) throw new Error('Gemini: ' + (out.error?.message || r.status));
  return out.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}
function parseJSON(text) { const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error('No JSON in reply'); return JSON.parse(m[0]); }

/* ---------- Supabase helpers ---------- */
async function getUser(token) {
  if (!token) return null;
  const r = await fetch(env('SUPABASE_URL') + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + token } });
  return r.ok ? r.json() : null;
}
async function useQuota(userId, kind, limit) {
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/rpc/use_ai_quota', {
    method: 'POST',
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'), 'content-type': 'application/json' },
    body: JSON.stringify({ p_user: userId, p_kind: kind, p_limit: limit })
  });
  if (!r.ok) throw new Error('Quota check failed: ' + r.status);
  return r.json();
}


/* ---------- live web search for a coffee that isn't in the catalogue ---------- */
const FIND_PROMPT = q => `Find coffee products matching this search: "${q}".
Use web search. Only return coffee beans or ground coffee in a bag that a person in ${cfg.country} can buy online today, from the roaster's own shop or an Indian retailer.
Each url must be the exact product page you saw in the search results (not a home page, blog or search page). Never make up a URL.
Return ONLY JSON: {"results":[{"name":string,"roaster":string,"url":string,"origin":string|null,"process":string|null,"roastLevel":"light"|"medium-light"|"medium"|"medium-dark"|"dark"|null,"notes":[string],"price":string|null}]} with at most 5 results, best match first.`;

async function findCoffee(q) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 3000, ...(cfg.thinking === false ? { thinking: { type: 'disabled' } } : {}), messages: [{ role: 'user', content: FIND_PROMPT(clip(q, 120)) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: cfg.findSearches || 2, user_location: { type: 'approximate', country: 'IN', timezone: 'Asia/Kolkata' } }] })
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
async function addToCatalog(it) {
  const id = new URL(it.url).host.replace(/^www\./, '') + new URL(it.url).pathname.replace(/\/$/, '');
  const row = { id, roaster: it.roaster || new URL(it.url).host, name: it.name, url: it.url, image: it.image, images: it.images || (it.image ? [it.image] : []),
    price_inr: it.price_inr || null, pack_g: it.pack_g || null, price_250: it.price_250 || null, available: it.available !== false,
    origin: it.origin, process: it.process, roast_level: it.roast_level, notes: it.notes, source: 'web', raw: it.raw || null, extracted: !it.raw, is_coffee: true, updated_at: new Date().toISOString() };
  await db('catalog?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify([row]) });
  return id;
}

/* ---------- handler ---------- */
export default async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'method', message: 'Use POST' });
  let body; try { body = await req.json(); } catch { return json(400, { code: 'bad_request', message: 'Invalid request' }); }
  const { task, payload = {} } = body || {};
  const limit = cfg.dailyLimits?.[task];
  if (!limit) return json(400, { code: 'bad_task', message: 'Unknown request' });
  if (payload.image && payload.image.length > 4_500_000) return json(413, { code: 'too_big', message: 'That photo is too large. Try a smaller one.' });

  const user = await getUser((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!user?.id) return json(401, { code: 'http_401', message: 'Please sign in again.' });

  try {
    const ok = await useQuota(user.id, task, limit);
    if (!ok) return json(429, { code: 'limit_reached', message: `You’ve used today’s ${task.startsWith('identify') ? 'scans' : task === 'find' ? 'web searches' : 'suggestions'}. They reset at midnight (UTC).` });
    if (task === 'find') {
      const results = await findCoffee(String(payload.q || ''));
      for (const it of results) { try { it.catalogId = await addToCatalog(it); } catch (e) { console.warn(e.message); } delete it.raw; }
      return json(200, { result: results });
    }
    const prompt = buildPrompt(task, payload);
    const text = cfg.provider === 'gemini' ? await callGemini(prompt, payload.image) : await callAnthropic(prompt, payload.image);
    const data = parseJSON(text);
    return json(200, { result: task.startsWith('identify') ? data : (data.picks || []) });
  } catch (e) {
    console.error(e);
    return json(502, { code: 'ai_error', message: 'The AI service didn’t respond properly. Try again in a moment.' });
  }
};
