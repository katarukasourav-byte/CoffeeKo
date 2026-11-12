/* Brew Wall: home brewers share their Instagram posts by pasting the post's link.
   Posts are shown with Instagram's official embed (full credit to the creator, nothing copied),
   only after an admin approves them. Loaded only when the Brew Wall is opened. */

const LINK = /instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/i;
const HANDLE_IN_LINK = /instagram\.com\/([A-Za-z0-9._]{1,30})\/(?:p|reels?|tv)\//i;
export function parseLink(s) {
  const m = String(s || '').match(LINK); if (!m) return null;
  const kind = m[1].toLowerCase().startsWith('reel') ? 'reel' : m[1].toLowerCase();
  const h = String(s).match(HANDLE_IN_LINK);
  return { ig_kind: kind, ig_code: m[2], handle: h ? h[1] : '' };
}
const embedUrl = p => `https://www.instagram.com/${p.ig_kind === 'reel' ? 'reel' : p.ig_kind}/${encodeURIComponent(p.ig_code)}/embed/`;
const postUrl = p => `https://www.instagram.com/${p.ig_kind === 'reel' ? 'reel' : p.ig_kind}/${encodeURIComponent(p.ig_code)}/`;
const frame = (p, cls = '') => `<iframe class="ig-frame ${cls}" src="${embedUrl(p)}" loading="lazy" title="Instagram post by @${p.handle}" frameborder="0" scrolling="no" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write; picture-in-picture"></iframe>`;
const heart = on => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

let POSTS = [], ADMIN = false, VIEW = 'all';

export async function renderWall(el, ctx) {
  const { esc, API } = ctx;
  if (!el.firstChild) el.innerHTML = '<p class="muted">Loading the Brew Wall…</p>';
  try { [POSTS, ADMIN] = await Promise.all([API.wallList(), ctx.signedIn() ? API.isAdmin().catch(() => false) : false]); }
  catch (e) { el.innerHTML = '<p class="muted">The Brew Wall couldn’t load. Try again in a moment.</p>'; return; }
  if (!ctx.signedIn()) VIEW = 'all';
  const shown = VIEW === 'mine' ? POSTS.filter(p => p.mine) : POSTS.filter(p => p.status === 'approved');
  const nMine = POSTS.filter(p => p.mine).length;
  const waiting = ADMIN ? POSTS.filter(p => p.status === 'pending').length : 0;
  el.innerHTML = `<div class="wall">
    <div class="wall-acts"><button class="btn accent" data-w="share">Share your Instagram post</button>${shown.some(p => p.status === 'approved') ? `<button class="btn ghost" data-w="feed" data-i="0">Watch full screen</button>` : ''}${ADMIN ? `<button class="btn ghost" data-w="review">Review${waiting ? ` <span class="dot">${waiting}</span>` : ''}</button>` : ''}</div>
    ${ctx.signedIn() ? `<div class="seg-tabs wall-filter" role="group" aria-label="Show"><button data-w="view" data-v="all" aria-pressed="${VIEW === 'all'}">All</button><button data-w="view" data-v="mine" aria-pressed="${VIEW === 'mine'}">Mine${nMine ? ` · ${nMine}` : ''}</button></div>` : ''}
    ${shown.length ? `<div class="wall-rail">${shown.map(p => card(p, ctx)).join('')}</div>`
      : VIEW === 'mine' ? `<div class="wall-empty"><p>You haven’t shared anything yet. Share a photo or reel of your coffee from Instagram – it shows with your handle and links back to you.</p></div>`
      : `<div class="wall-empty"><p><b>Be the first on the Brew Wall.</b> Share a photo or reel of your coffee from Instagram – every post shows your handle and links back to you.</p></div>`}
  </div>`;
  bind(el, ctx, () => renderWall(el, ctx));
}

function card(p, { esc }) {
  const i = POSTS.filter(x => x.status === 'approved').indexOf(p);
  const badge = p.status === 'pending' ? '<span class="wbadge">Waiting for review</span>' : p.status === 'rejected' ? '<span class="wbadge no">Not approved</span>' : '';
  return `<article class="wcard">
    <div class="wframe">${frame(p)}${badge}${i >= 0 ? `<button class="wfull" data-w="feed" data-i="${i}" aria-label="Watch full screen">⤢</button>` : ''}</div>
    ${foot(p, esc)}${p.mine ? `<button class="linkbtn wdel" data-w="del" data-id="${esc(p.id)}">Remove from Brew Wall</button>` : ''}</article>`;
}
function foot(p, esc) {
  return `<div class="wfoot"><a class="whandle" href="https://www.instagram.com/${encodeURIComponent(p.handle)}/" target="_blank" rel="noopener">@${esc(p.handle)}</a>
    ${p.status !== 'approved' ? '<span></span>' : `<button class="wlike ${p.liked ? 'on' : ''}" data-w="like" data-id="${esc(p.id)}" aria-pressed="${p.liked}" aria-label="Like">${heart(p.liked)}<span>${p.likes || ''}</span></button>`}
    ${p.caption ? `<p class="wcap">${esc(p.caption)}</p>` : ''}${p.coffee ? `<p class="wcoffee">☕ ${esc(p.coffee)}</p>` : ''}</div>`;
}

function bind(root, ctx, refresh) {
  root.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', async ev => {
    ev.stopPropagation(); const w = b.dataset.w;
    if (w === 'share') return ctx.signedIn() ? openShare(ctx, refresh) : ctx.needSignIn('Sign in to share your post on the Brew Wall');
    if (w === 'feed') return openFeed(+b.dataset.i || 0, ctx);
    if (w === 'view') { VIEW = b.dataset.v; return refresh(); }
    if (w === 'review') return openReview(ctx, refresh);
    if (w === 'del') { if (!confirm('Remove this post from CoffeeKo?')) return; try { await ctx.API.wallRemove(b.dataset.id); refresh(); } catch (e) { ctx.toast('Couldn’t remove it. Try again.'); } return; }
    if (w === 'like') {
      if (!ctx.signedIn()) return ctx.needSignIn('Sign in to like posts');
      const p = POSTS.find(x => x.id === b.dataset.id); if (!p) return;
      p.liked = !p.liked; p.likes = (p.likes || 0) + (p.liked ? 1 : -1);
      document.querySelectorAll(`.wlike[data-id="${CSS.escape(p.id)}"]`).forEach(x => { x.classList.toggle('on', p.liked); x.setAttribute('aria-pressed', p.liked); x.innerHTML = heart(p.liked) + `<span>${p.likes || ''}</span>`; });
      try { await ctx.API.wallLike(p.id, p.liked); } catch (e) { ctx.toast('Couldn’t save your like.'); }
    }
  }));
}

/* full-screen feed: swipe up and down through posts, like Reels, without leaving CoffeeKo */
function openFeed(start, ctx) {
  const { esc } = ctx, live = POSTS.filter(p => p.status === 'approved'); if (!live.length) return;
  const v = document.createElement('div'); v.className = 'wfeed'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Brew Wall');
  v.innerHTML = `<div class="wf-track">${live.map((p, i) => `<section class="wf-slide" data-i="${i}"><div class="wf-frame" data-src="${i}"></div>${foot(p, esc)}</section>`).join('')}</div>
    <button class="v-x" aria-label="Close Brew Wall">×</button><p class="wf-hint">Swipe up for the next post</p>`;
  ctx.openOverlay(v);
  const track = v.querySelector('.wf-track');
  /* load only the post on screen and its neighbours */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const box = e.target.querySelector('.wf-frame'); if (!box.firstChild) box.innerHTML = frame(live[+box.dataset.src], 'big'); } }), { root: track, rootMargin: '100% 0px' });
  v.querySelectorAll('.wf-slide').forEach(s => io.observe(s));
  requestAnimationFrame(() => { track.scrollTop = start * track.clientHeight; });
  v.querySelector('.v-x').onclick = () => ctx.closeOverlay();
  bind(v, ctx, () => {});
  track.addEventListener('scroll', () => v.classList.add('moved'), { once: true, passive: true });
}

function openShare(ctx, refresh) {
  const { esc, API, state } = ctx;
  const coffees = [...new Set((state.journal || []).filter(e => e.status === 'rated').map(e => [e.name, e.roaster].filter(Boolean).join(' · ')))].slice(0, 60);
  ctx.openSheet(`${ctx.head('Share on the Brew Wall')}
    <p class="muted">Paste the link to one of your Instagram posts or reels about coffee. It shows here with your handle, and links back to you.</p>
    <label class="fld"><span>Instagram post link</span><input id="wLink" inputmode="url" autocomplete="off" placeholder="https://www.instagram.com/p/…" autofocus></label>
    <p class="fine muted">In Instagram: tap ⋯ or the share arrow on your post → <b>Copy link</b>, then paste it here.</p>
    <div id="wPrev"></div>
    <label class="fld"><span>Your Instagram handle</span><input id="wHandle" autocomplete="off" placeholder="@yourhandle" maxlength="31"></label>
    <label class="fld"><span>Caption <small>(optional)</small></span><input id="wCap" maxlength="160" placeholder="e.g. Sunday V60 with a washed Ethiopian"></label>
    ${coffees.length ? `<label class="fld"><span>Which coffee? <small>(optional)</small></span><select id="wCoffee"><option value="">–</option>${coffees.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>` : ''}
    <label class="chk"><input type="checkbox" id="wOk"> <span>This is my post, or the creator said I can share it.</span></label>
    <p class="fine muted">Works with any public Instagram account (posts from private accounts can’t be shown). Reels up to 20 seconds. Posts appear after a quick review.</p>
    <div class="actions"><button class="btn accent big" id="wGo">Share</button></div><p class="fine err" id="wErr" role="alert"></p>`);
  const $ = s => document.querySelector(s);
  let parsed = null;
  const check = () => {
    parsed = parseLink($('#wLink').value.trim());
    $('#wPrev').innerHTML = parsed ? `<div class="wprev">${frame(parsed)}</div>` : '';
    if (parsed?.handle && !$('#wHandle').value) $('#wHandle').value = '@' + parsed.handle;
  };
  $('#wLink').addEventListener('input', () => { clearTimeout(check.t); check.t = setTimeout(check, 350); });
  $('#wLink').addEventListener('paste', () => setTimeout(check, 30));
  $('#wGo').onclick = async () => {
    const err = m => { $('#wErr').textContent = m; };
    check(); if (!parsed) return err('That doesn’t look like an Instagram post or reel link.');
    const handle = $('#wHandle').value.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return err('Add your Instagram handle (letters, numbers, dots and underscores).');
    if (!$('#wOk').checked) return err('Please confirm it’s your post, or that you have the creator’s OK.');
    $('#wGo').disabled = true; err('');
    try {
      await API.wallAdd({ ig_code: parsed.ig_code, ig_kind: parsed.ig_kind, handle, caption: $('#wCap').value.trim() || null, coffee: $('#wCoffee')?.value || null });
      ctx.closeSheet(() => { ctx.toast('Thanks! Your post appears once it’s reviewed.'); refresh(); });
    } catch (e) {
      $('#wGo').disabled = false;
      err(e.code === '23505' || /duplicate/i.test(e.message) ? 'That post is already on the Brew Wall (or waiting for review).' : /row-level|policy/i.test(e.message) ? 'You have 5 posts waiting for review – please wait for those first.' : 'Couldn’t share it. Try again.');
    }
  };
}

function openReview(ctx, refresh) {
  const { esc, API } = ctx;
  const pend = POSTS.filter(p => p.status === 'pending');
  ctx.openSheet(`${ctx.head('Review the Brew Wall')}${pend.length ? pend.map(p => `<div class="rv" data-id="${esc(p.id)}"><div class="wprev">${frame(p)}</div>
    <p><b>@${esc(p.handle)}</b>${p.caption ? ` – ${esc(p.caption)}` : ''}${p.coffee ? `<br><small>☕ ${esc(p.coffee)}</small>` : ''}</p>
    <p class="fine muted">Check: it’s about coffee, the handle matches the post, and a reel is 20 seconds or shorter.</p>
    <div class="actions"><button class="btn accent" data-r="approved">Approve</button><button class="btn ghost" data-r="rejected">Reject</button><a class="btn quiet" href="${postUrl(p)}" target="_blank" rel="noopener">Open on Instagram</a></div></div>`).join('') : '<p class="muted">Nothing waiting for review.</p>'}`);
  document.querySelectorAll('.rv [data-r]').forEach(b => b.onclick = async () => {
    const box = b.closest('.rv'); b.disabled = true;
    try { await API.wallReview(box.dataset.id, b.dataset.r); box.innerHTML = `<p class="muted">${b.dataset.r === 'approved' ? 'Approved – it’s on the Brew Wall.' : 'Rejected.'}</p>`; refresh(); }
    catch (e) { b.disabled = false; ctx.toast('Couldn’t save. Try again.'); }
  });
}
