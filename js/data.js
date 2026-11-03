/* =====================================================================
   DATA LAYER — login, saving and the AI function.
   Uses Supabase for accounts and storage. If config/settings.js still has
   the placeholder values, the site runs in DEMO MODE: data stays in this
   browser and the AI features are switched off.
   ===================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const S = window.SETTINGS || {};
const hasKeys = !!(S.supabaseUrl && S.supabaseAnonKey && !/YOUR-/.test(S.supabaseUrl + S.supabaseAnonKey));
/* Preview copies (not coffeeko.in) can be opened with ?demo=1 to try the dashboard without an account. */
const forceDemo = /[?&]demo=1/.test(location.search) && !/(^|\.)coffeeko\.in$/.test(location.hostname);
const configured = hasKeys && !forceDemo;
const sb = configured ? createClient(S.supabaseUrl, S.supabaseAnonKey) : null;
const LS = 'palate-pour-demo';

let user = null;

function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
function lsPut(fn) { try { const v = lsGet() || { profile: {}, journal: {}, shelf: {} }; fn(v); localStorage.setItem(LS, JSON.stringify(v)); } catch (e) {} }

function fail(error) { if (error) { const e = new Error(error.message || 'Request failed'); e.code = error.code; throw e; } }

const API = {
  demo: !configured,

  /* ---------- auth ---------- */
  async currentUser() {
    if (!sb) return { id: 'demo', email: 'demo@example.com', name: 'there' };
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    return user ? { id: user.id, email: user.email, name: user.user_metadata?.name || '' } : null;
  },
  onAuthChange(cb) { if (sb) sb.auth.onAuthStateChange((event, session) => { user = session?.user || null; cb(event, user); }); },
  async signUp(email, password, name) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname + '#profile' } });
    fail(error); return { needsConfirm: !data.session };
  },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error); },
  async signOut() { if (sb) await sb.auth.signOut(); },
  async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#reset' }); fail(error); },
  async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); fail(error); },

  /* ---------- load & save ---------- */
  async load() {
    if (!sb) { const v = lsGet() || { profile: {}, journal: {}, shelf: {} }; return { ...v.profile, journal: Object.values(v.journal), shelf: Object.values(v.shelf) }; }
    const uid = user.id;
    const [p, j, s] = await Promise.all([
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('journal').select('data').eq('user_id', uid),
      sb.from('shelf').select('data').eq('user_id', uid)
    ]);
    fail(p.error); fail(j.error); fail(s.error);
    return { prefs: p.data?.prefs || null, settings: p.data?.settings || null, explore: p.data?.explore || null,
             journal: (j.data || []).map(r => r.data), shelf: (s.data || []).map(r => r.data) };
  },
  async saveProfile(v) {
    if (!sb) return lsPut(d => { d.profile = v; });
    const { error } = await sb.from('profiles').upsert({ user_id: user.id, prefs: v.prefs, settings: v.settings, explore: v.explore, updated_at: new Date().toISOString() });
    fail(error);
  },
  async saveEntry(e) {
    if (!sb) return lsPut(d => { d.journal[e.id] = e; });
    const { error } = await sb.from('journal').upsert({ id: e.id, user_id: user.id, data: e }); fail(error);
  },
  async delEntry(id) {
    if (!sb) return lsPut(d => { delete d.journal[id]; });
    const { error } = await sb.from('journal').delete().eq('id', id).eq('user_id', user.id); fail(error);
  },
  async saveBag(b) {
    if (!sb) return lsPut(d => { d.shelf[b.id] = b; });
    const { error } = await sb.from('shelf').upsert({ id: b.id, user_id: user.id, data: b }); fail(error);
  },
  async delBag(id) {
    if (!sb) return lsPut(d => { delete d.shelf[id]; });
    const { error } = await sb.from('shelf').delete().eq('id', id).eq('user_id', user.id); fail(error);
  },

  async deleteAccount() {
    if (!sb) { try { localStorage.removeItem(LS); } catch (e) {} return; }
    const { data } = await sb.auth.getSession();
    const res = await fetch('/.netlify/functions/account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') }, body: JSON.stringify({ action: 'delete', confirm: 'DELETE' }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || 'Couldn’t delete the account');
    await sb.auth.signOut();
  },

  /* ---------- coffee catalogue (public, refreshed from roasters' shops) ---------- */
  async catalog() {
    if (!hasKeys) return [];
    const K = 'ck-catalog-v1';
    try { const c = JSON.parse(sessionStorage.getItem(K) || 'null'); if (c && Date.now() - c.at < 30 * 60e3) return c.rows; } catch (e) {}
    const cols = 'id,roaster,name,url,image,images,price_inr,pack_g,price_250,available,origin,region,estate,altitude,variety,process,process_detail,roast_level,notes,acidity,body,sweetness,bitterness,grade,blend,summary,source,updated_at';
    const rows = [];
    for (let from = 0; from < 3000; from += 1000) {
      const r = await fetch(`${S.supabaseUrl}/rest/v1/catalog?select=${cols}&is_coffee=eq.true&extracted=eq.true&order=roaster,name`, { headers: { apikey: S.supabaseAnonKey, Authorization: 'Bearer ' + S.supabaseAnonKey, Range: `${from}-${from + 999}` } });
      if (!r.ok) throw new Error('Catalogue ' + r.status);
      const part = await r.json(); rows.push(...part); if (part.length < 1000) break;
    }
    try { sessionStorage.setItem(K, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
    return rows;
  },

  /* ---------- AI (runs on Netlify, see netlify/functions/ai.mjs) ---------- */
  async ai(task, payload) {
    if (!sb) { const e = new Error('AI is off in demo mode'); e.code = 'demo'; throw e; }
    const { data } = await sb.auth.getSession();
    const res = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') },
      body: JSON.stringify({ task, payload })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(out.message || 'AI request failed'); e.code = out.code || ('http_' + res.status); throw e; }
    return out.result;
  }
};

window.API = API;
