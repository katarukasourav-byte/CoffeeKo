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

function wallDemo() { try { return JSON.parse(localStorage.getItem('ck-demo-wall') || 'null') || { posts: [], likes: [] }; } catch (e) { return { posts: [], likes: [] }; } }
function wallDemoSave(d) { try { localStorage.setItem('ck-demo-wall', JSON.stringify(d)); } catch (e) {} }
function fail(error) { if (error) { const e = new Error(error.message || 'Request failed'); e.code = error.code; throw e; } }

const API = {
  demo: !configured,

  /* ---------- auth ---------- */
  async currentUser() {
    if (!sb) return { id: 'demo', email: 'demo@example.com', name: 'there' };
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    return user ? { id: user.id, email: user.email, name: user.user_metadata?.name || user.user_metadata?.full_name || '' } : null;
  },
  onAuthChange(cb) { if (sb) sb.auth.onAuthStateChange((event, session) => { user = session?.user || null; cb(event, user); }); },
  async signUp(email, password, name) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname + '#profile' } });
    fail(error); return { needsConfirm: !data.session };
  },
  async resendConfirm(email) { const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + location.pathname + '#profile' } }); fail(error); },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error); },
  /* Google sign-in shows only once Google is switched on in Supabase (Authentication → Sign In / Providers) */
  async googleEnabled() {
    if (!sb) return false;
    try { const r = await fetch(S.supabaseUrl + '/auth/v1/settings', { headers: { apikey: S.supabaseAnonKey } }); const j = await r.json(); return !!j.external?.google; } catch (e) { return false; }
  },
  googleClientId: S.googleClientId || '',
  /* Google's own button / One Tap on coffeeko.in: Google hands us a signed token, Supabase checks it */
  async signInWithGoogleToken(token, nonce) { const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token, nonce }); fail(error); },
  async signInWithGoogle() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/#profile' } }); fail(error); },
  async signOut() { if (sb) await sb.auth.signOut(); },
  async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#reset' }); fail(error); },
  async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); fail(error); },

  /* ---------- Brew Wall: shared Instagram posts (approved by an admin before they show) ---------- */
  async wallList() {
    if (!sb) { const d = wallDemo(); return d.posts.map(p => ({ ...p, likes: d.likes.filter(l => l.post_id === p.id).length, liked: d.likes.some(l => l.post_id === p.id && l.user_id === 'demo'), mine: p.user_id === 'demo' })); }
    const { data, error } = await sb.from('brew_posts').select('id,user_id,ig_code,ig_kind,handle,caption,coffee,status,created_at,brew_likes(count)').order('created_at', { ascending: false }).limit(200); fail(error);
    let likedSet = new Set();
    if (user) { const { data: L } = await sb.from('brew_likes').select('post_id').eq('user_id', user.id); likedSet = new Set((L || []).map(x => x.post_id)); }
    return data.map(p => ({ ...p, likes: p.brew_likes?.[0]?.count || 0, liked: likedSet.has(p.id), mine: !!user && p.user_id === user.id }));
  },
  async wallAdd(post) {
    if (!sb) { const d = wallDemo(); if (d.posts.some(x => x.ig_code === post.ig_code)) { const e = new Error('duplicate key'); e.code = '23505'; throw e; } d.posts.unshift({ id: 'w' + Date.now(), user_id: 'demo', status: 'pending', created_at: new Date().toISOString(), ...post }); wallDemoSave(d); return; }
    const { error } = await sb.from('brew_posts').insert({ ...post, user_id: user.id }); fail(error);
  },
  async wallRemove(id) { if (!sb) { const d = wallDemo(); d.posts = d.posts.filter(p => p.id !== id); wallDemoSave(d); return; } const { error } = await sb.from('brew_posts').delete().eq('id', id); fail(error); },
  async wallLike(id, on) {
    if (!sb) { const d = wallDemo(); d.likes = d.likes.filter(l => !(l.post_id === id && l.user_id === 'demo')); if (on) d.likes.push({ post_id: id, user_id: 'demo' }); wallDemoSave(d); return; }
    const q = on ? sb.from('brew_likes').insert({ post_id: id, user_id: user.id }) : sb.from('brew_likes').delete().eq('post_id', id).eq('user_id', user.id);
    const { error } = await q; if (error && error.code !== '23505') fail(error);
  },
  async isAdmin() { if (!sb) return true; if (!user) return false; const { data } = await sb.rpc('is_admin'); return !!data; },
  async wallReview(id, status) { if (!sb) { const d = wallDemo(); const p = d.posts.find(x => x.id === id); if (p) p.status = status; wallDemoSave(d); return; } const { error } = await sb.from('brew_posts').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id); fail(error); },

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
    const K = 'ck-catalog-v2';
    try { const c = JSON.parse(sessionStorage.getItem(K) || 'null'); if (c && Date.now() - c.at < 30 * 60e3) return c.rows; } catch (e) {}
    const cols = 'id,roaster,name,url,image,images,price_inr,pack_g,price_250,currency,roaster_country,available,origin,region,estate,altitude,variety,process,process_detail,roast_level,notes,acidity,body,sweetness,bitterness,grade,blend,summary,source,updated_at,kind,pack_count';
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
