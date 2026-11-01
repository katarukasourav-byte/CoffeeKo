/* App logic: Taste ID, Explore, Journal, Shelf.
   Words and options come from config/content.js; saving and AI from js/data.js */
/* =========================================================
   APP
   ========================================================= */
(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const DAY=864e5;
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const parseD=s=>{if(!s)return null;const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const isoD=d=>{const z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;};
const fmtD=d=>d.toLocaleDateString(undefined,{day:'numeric',month:'short'});
const days=(a,b)=>Math.round((b-a)/DAY);
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),2600);}

/* =================== state & storage =================== */
const SITE=window.SITE, API=window.API;
const state={prefs:null,settings:{remindEvery:7,shelfCheckedAt:null,hidden:[]},journal:[],shelf:[],explore:null};
let sample=!API.demo, sampleImages=true, userName='', me=null;
const queues={};
function enqueue(key,fn){queues[key]=(queues[key]||Promise.resolve()).then(fn).catch(e=>{console.warn(e);toast('Couldn’t save that change. Check your connection and try again.');});return queues[key];}
function clean(o){const c=Object.assign({},o);Object.keys(c).forEach(k=>{if(k[0]==='_')delete c[k];});return c;}
function saveProfile(){return enqueue('profile',()=>API.saveProfile({prefs:state.prefs,settings:state.settings,explore:state.explore}));}
function saveEntry(e){return enqueue('j'+e.id,()=>API.saveEntry(clean(e)));}
function delEntry(id){return enqueue('j'+id,()=>API.delEntry(id));}
function saveBag(b){return enqueue('s'+b.id,()=>API.saveBag(clean(b)));}
function delBag(id){return enqueue('s'+id,()=>API.delBag(id));}
function migrate(){state.journal.forEach(e=>{if(e.verdict==='like')e.verdict='liked';if(e.verdict==='okay')e.verdict='ok';if(!e.status)e.status=e.verdict?'rated':'saved';});}

async function init(){
  applyContent();initNav();
  me=await API.currentUser();
  API.onAuthChange((ev,u)=>{
    if(ev==='PASSWORD_RECOVERY'){showAuth('newpass');return;}
    if(ev==='SIGNED_IN'&&!me){location.reload();}
    if(ev==='SIGNED_OUT'){location.reload();}
  });
  if(location.hash==='#reset'&&!API.demo){showAuth('newpass');return;}
  if(!me){showAuth('signin');return;}
  await loadUser();
}
async function loadUser(){
  document.body.classList.add('signed-in');
  userName=(me.name||'').split(' ')[0];
  $('#storeNote').textContent=API.demo?'Demo mode: saved in this browser only':(me.email||'');
  try{
    const v=await API.load();
    state.prefs=v.prefs||null;state.settings=Object.assign(state.settings,v.settings||{});state.explore=v.explore||null;
    state.journal=(v.journal||[]).sort((a,b)=>b.createdAt-a.createdAt);state.shelf=v.shelf||[];
  }catch(e){console.warn(e);toast('Couldn’t load your coffee. Refresh to try again.');}
  migrate();renderAll();route();
}

/* =================== taste model =================== */
const FAM=Object.fromEntries(Object.entries(SITE.flavours).map(([k,v])=>[k,{l:v.label,w:v.words}]));
function famsOf(notes){const f=new Set();(notes||[]).forEach(n=>{const s=String(n).toLowerCase();for(const k in FAM)if(FAM[k].w.some(w=>s.includes(w)))f.add(k);});return f;}
const ATTRS=[['acidity','Acidity','Smooth','Bright'],['body','Body','Light','Heavy'],['sweetness','Sweetness','Dry','Sweet'],['bitterness','Bitterness','None','Bold']];
const ROASTN=r=>({'medium-light':'light','light':'light','medium':'medium','medium-dark':'medium-dark','dark':'dark'}[r]||null);
const VW={loved:2,liked:1,ok:0,dislike:-1.5};
function perceived(e,k){const v=e.attrs?.[k];if(v==null)return null;const r=e.ratings?.[k];let x=+v;if(r&&r.v==='disagree'&&r.dir)x+=r.dir;return Math.min(5,Math.max(1,x));}
const rated=()=>state.journal.filter(e=>e.status==='rated');
function target(ex){
  const p=state.prefs, T={attrs:{},fams:{},roast:{},n:0};
  const R=rated().filter(e=>e.id!==ex);
  ATTRS.forEach(([k])=>{let s=0,w=0;if(p&&p[k]){s+=p[k]*2;w+=2;}R.forEach(e=>{const vw=VW[e.verdict];if(vw>0){const v=perceived(e,k);if(v!=null){s+=v*vw;w+=vw;}}});T.attrs[k]=w?s/w:null;});
  if(p){(p.flavours||[]).forEach(f=>T.fams[f]=(T.fams[f]||0)+2);(p.roast||[]).forEach(r=>T.roast[r]=(T.roast[r]||0)+2);}
  R.forEach(e=>{const vw=VW[e.verdict]||0;famsOf(e.tastingNotes).forEach(f=>T.fams[f]=(T.fams[f]||0)+vw);const r=ROASTN(e.roastLevel);if(r)T.roast[r]=(T.roast[r]||0)+vw;T.n++;});
  T.ready=!!p||T.n>0;return T;
}
const andList=a=>{a=a.map((x,i)=>i?x.toLowerCase():x);return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];};
const ATTR_WORD={acidity:'acidity',body:'body',sweetness:'sweetness',bitterness:'bitterness'};
function match(c,T){
  T=T||target(c.id);if(!T.ready)return null;
  let score=82;const pros=[],cons=[];
  ATTRS.forEach(([k,n])=>{const v=c[k]??c.attrs?.[k],t=T.attrs[k];if(v==null||t==null)return;const d=Math.abs(v-t);score-=Math.max(0,d-.4)*9;
    if(d<=.6)pros.push(`${n} close to what you like`);else if(d>=1.5)cons.push(`${v>t?(k==='body'?'Heavier':'More '+ATTR_WORD[k]):(k==='body'?'Lighter':'Less '+ATTR_WORD[k])} than you usually like`);});
  const r=ROASTN(c.roastLevel);
  if(r&&Object.keys(T.roast).length){const w=T.roast[r]||0;if(w>0){score+=6;pros.unshift(`Your kind of roast (${r})`);}else if(w<0){score-=10;cons.push(`You haven’t enjoyed ${r} roasts so far`);}else score-=4;}
  const f=[...famsOf(c.tastingNotes||c.notes)];
  const good=f.filter(x=>(T.fams[x]||0)>0), bad=f.filter(x=>(T.fams[x]||0)<0);
  if(good.length){score+=Math.min(14,good.length*6);pros.unshift(`${andList(good.map(x=>FAM[x].l.split(' &')[0]))} notes you enjoy`);}
  if(bad.length){score-=bad.length*7;cons.push(`${andList(bad.map(x=>FAM[x].l.split(' &')[0]))} notes haven’t worked for you`);}
  score=Math.round(Math.max(8,Math.min(98,score)));
  const cls=score>=85?'great':score>=70?'good':score>=50?'try':'low';
  const lbl={great:'Great match',good:'Good match',try:'Worth a try',low:'Probably not for you'}[cls];
  return{score,cls,lbl,pros:pros.slice(0,3),cons:cons.slice(0,2)};
}
function matchBadge(m){return m?`<div class="match m-${m.cls}"><span class="pct">${m.score}%</span><span class="lbl">${m.lbl}</span></div>`:'';}
function palateSentence(){
  const T=target();if(!T.ready)return'';
  const fams=Object.entries(T.fams).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>FAM[x[0]].l.toLowerCase());
  const roast=Object.entries(T.roast).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1])[0];
  const a=T.attrs.acidity, bd=T.attrs.body;
  const acid=a==null?'':a<2.5?'low acidity':a>3.6?'bright, juicy acidity':'gentle acidity';
  const body=bd==null?'':bd<2.5?'a light body':bd>3.6?'a rich, heavy body':'a medium body';
  const parts=[];
  if(fams.length)parts.push(`${fams.join(' and ')} coffees`);else parts.push('coffees');
  let s=`You lean toward ${roast?roast[0]+'-roast ':''}${parts[0]}`;
  const tail=[acid,body].filter(Boolean);if(tail.length)s+=` with ${tail.join(' and ')}`;
  return s+'.';
}

/* =================== AI (via the Netlify function) =================== */
function errMsg(e){
  if(e&&e.code==='limit_reached')return e.message||'You’ve reached today’s limit for this. Try again tomorrow.';
  if(e&&e.code==='demo')return'AI features switch on once Supabase and the AI key are set up.';
  if(e&&e.code==='http_401')return'Please sign in again.';
  return'That didn’t work. Try again in a moment.';
}
function tasteSummary(){
  const p=state.prefs||{};const T=target();
  const hist=rated().slice(0,25).map(e=>`- ${e.name}${e.roaster?' ('+e.roaster+')':''}: ${e.verdict}; roast ${e.roastLevel||'?'}; notes ${(e.tastingNotes||[]).join(', ')}${e.myNotes?'; their words: '+e.myNotes:''}`).join('\n')||'none yet';
  return`Taste quiz: drinks ${p.from||'?'} now; takes it ${p.milk||'?'}; brews with ${(p.brew||[]).join(', ')||'?'}; likes roasts ${(p.roast||[]).join(', ')||'?'}; enjoys ${(p.flavours||[]).join(', ')||'?'} flavours.
Current palate targets (1–5): ${ATTRS.map(([k])=>k+' '+(T.attrs[k]?T.attrs[k].toFixed(1):'?')).join(', ')}.
Rated coffees:\n${hist}`;
}
const known=()=>state.journal.map(e=>[e.roaster,e.name].filter(Boolean).join(' ')).slice(0,60);
async function getPicks(){return(await API.ai('picks',{taste:tasteSummary(),exclude:known()}))||[];}
async function getSimilar(e){
  return(await API.ai('similar',{taste:tasteSummary(),exclude:known(),coffee:{name:e.name,roaster:e.roaster,verdict:e.verdict,
    reactions:Object.entries(e.ratings||{}).map(([k,r])=>k+' '+r.v+(r.dir?(r.dir>0?' (stronger)':' (weaker)'):'')).join(', ')}}))||[];
}
async function identify(blob,hint,kind){
  let image=null;
  if(blob){image=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result).split(',')[1]);fr.readAsDataURL(blob);});}
  return API.ai(kind||'identify',{image,hint});
}
const amazon=p=>`https://www.amazon.in/s?k=${encodeURIComponent([p.roaster,p.name,'coffee'].filter(Boolean).join(' '))}`;
const search=p=>`https://www.google.com/search?q=${encodeURIComponent([p.roaster,p.name,'buy'].filter(Boolean).join(' '))}`;
function pickCard(p,i,src){
  const m=match(p);
  return`<article class="pick">
    <div class="pick-top"><div><h4>${esc(p.name)}</h4><div class="by">${esc([p.roaster,p.origin].filter(Boolean).join(' · '))}</div></div>${matchBadge(m)}</div>
    <div class="chips">${p.type?`<span class="badge ${p.type==='Imported'?'imp':'in'}">${esc(p.type)}</span>`:''}${p.roastLevel?`<span class="chip static">${esc(cap(p.roastLevel))} roast</span>`:''}${(p.notes||[]).slice(0,3).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
    ${p.why?`<p class="why" style="margin:0">${esc(p.why)}</p>`:''}
    <div class="where">${p.priceINR?`<span class="price">${esc(p.priceINR)}</span>`:''}
      <a href="${amazon(p)}" target="_blank" rel="noopener">Amazon.in</a>
      <a href="${search(p)}" target="_blank" rel="noopener">${p.where&&p.where.includes('Roaster website')?'Roaster site':'Find it'}</a>
      <button class="btn quiet small" data-act="save-pick" data-src="${src}" data-i="${i}">Save</button></div>
  </article>`;
}

/* =================== section nav =================== */
const SECS=['profile','explore','journal','shelf'];
function initNav(){
  const links=[...document.querySelectorAll('.subnav a')];
  const io=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting){links.forEach(a=>a.toggleAttribute('aria-current',a.getAttribute('href')==='#'+en.target.id));}});},{rootMargin:'-45% 0px -50% 0px'});
  SECS.forEach(id=>{const el=document.getElementById(id);if(el)io.observe(el);});
}
function route(){const h=location.hash.slice(1);if(['home','palate'].includes(h))document.getElementById('profile').scrollIntoView();}
addEventListener('hashchange',route);

/* =================== visual helpers =================== */
function ring(score,size,cls,label){
  const r=size/2-5,C=2*Math.PI*r,off=C*(1-score/100);
  return`<span class="ring ring-${cls}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size/2}" cy="${size/2}" r="${r}" class="rt"/><circle cx="${size/2}" cy="${size/2}" r="${r}" class="rv" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"/></svg><b>${score}<small>%</small></b>${label?`<i>${label}</i>`:''}</span>`;
}
function ringFor(c,size){const m=match(c);return m?ring(m.score,size,m.cls):'';}
function radar(T){
  const keys=Object.keys(FAM);const S=340,c=S/2,R=118;
  let vals=keys.map(k=>Math.max(0,T.fams[k]||0));const mx=Math.max(...vals,0);
  vals=vals.map(v=>mx?Math.max(.1,v/mx):.1);
  const pt=(i,f)=>{const a=-Math.PI/2+i*2*Math.PI/keys.length;return[c+Math.cos(a)*R*f,c+Math.sin(a)*R*f];};
  const grid=[.25,.5,.75,1].map(f=>`<polygon class="rg" points="${keys.map((k,i)=>pt(i,f).join(',')).join(' ')}"/>`).join('');
  const spokes=keys.map((k,i)=>{const[x,y]=pt(i,1);return`<line class="rs" x1="${c}" y1="${c}" x2="${x}" y2="${y}"/>`;}).join('');
  const poly=keys.map((k,i)=>pt(i,vals[i]).join(',')).join(' ');
  const dots=keys.map((k,i)=>{const[x,y]=pt(i,vals[i]);return`<circle class="rd" cx="${x}" cy="${y}" r="3.5"/>`;}).join('');
  const labels=keys.map((k,i)=>{const[x,y]=pt(i,1.24);const anc=Math.abs(x-c)<8?'middle':x>c?'start':'end';return`<text x="${x}" y="${y+4}" text-anchor="${anc}" class="${vals[i]>.55?'hi':''}">${FAM[k].l.split(' &')[0]}</text>`;}).join('');
  return`<svg class="radar" viewBox="-40 0 ${S+80} ${S}" role="img" aria-label="Flavour fingerprint"><defs><radialGradient id="rgFill" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#E9C9A2" stop-opacity=".55"/><stop offset="1" stop-color="#C98A5A" stop-opacity=".18"/></radialGradient><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>${grid}${spokes}<polygon points="${poly}" fill="#D4B08C" opacity=".35" filter="url(#glow)"/><polygon class="rp" points="${poly}"/>${dots}${labels}</svg>`;
}
function archetype(T){
  const f=T.fams,g=k=>Math.max(0,f[k]||0),A=SITE.archetypes,o=k=>({n:A[k].name,d:A[k].text});
  const choc=g('chocolate')+g('nutty')+g('caramel')*.6, bright=g('fruity')+g('citrus')+g('floral'), bold=g('earthy')+g('spicy'), sweet=g('caramel');
  const roast=Object.entries(T.roast).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const top=Math.max(choc,bright,bold,sweet);
  if(!top)return o('open');
  if(bright===top)return g('floral')>g('fruity')?o('floral'):o('bright');
  if(bold===top||roast==='dark')return o('bold');
  if(sweet===top&&sweet>choc*.8)return o('sweet');
  return o('chocolate');
}

/* =================== render =================== */
function renderAll(){renderProfile();renderExplore();renderJournal();renderShelf();}
function renderProfile(){
  const el=$('#profile-body');const T=target();const p=state.prefs;
  if(!T.ready){el.innerHTML=remindBanner()+`<div class="tid empty-tid"><div class="tid-l"><span class="kicker">Taste ID</span><h3 class="tid-name">Find your taste in a minute.</h3><p class="tid-desc">Eight quick questions about how you drink coffee now. We’ll build your flavour fingerprint and start matching coffees to you.</p><div class="actions"><button class="btn accent big" data-act="quiz">Start the taste quiz</button><button class="btn ghost big" data-act="bulk">Add past coffees</button></div></div><div class="tid-r ghost-radar">${radar({fams:{chocolate:2,nutty:1.4,caramel:1.8,fruity:1,citrus:.8,floral:.6,spicy:.9,earthy:.7}})}</div></div>`;return;}
  const r=rated(),loved=r.filter(e=>['loved','liked'].includes(e.verdict));
  const origins=new Set(r.map(e=>(e.origin||'').split(',')[0].trim()).filter(Boolean));
  const A=archetype(T);const pos=v=>((v-1)/4*100).toFixed(1)+'%';
  const likedAvg={};ATTRS.forEach(([k])=>{const v=loved.map(e=>perceived(e,k)).filter(x=>x!=null);likedAvg[k]=v.length?v.reduce((a,b)=>a+b,0)/v.length:null;});
  el.innerHTML=remindBanner()+`<div class="tid">
   <div class="tid-l">
     <span class="kicker">${userName?esc(userName)+'’s ':''}Taste ID</span>
     <h3 class="tid-name">${A.n}</h3>
     <p class="tid-desc">${esc(palateSentence())} ${A.d}</p>
     <div class="tid-stats"><div><b>${r.length}</b><span>rated</span></div><div><b>${loved.length}</b><span>loved</span></div><div><b>${origins.size}</b><span>origins</span></div><div><b>${state.shelf.length}</b><span>on shelf</span></div></div>
     <div class="balance">${ATTRS.map(([k,n,lo,hi])=>`<div class="bal"><span class="bn">${n}</span><div class="bt">${p&&p[k]?`<span class="bm bm-pick" style="left:${pos(p[k])}" title="Your answer"></span>`:''}${likedAvg[k]!=null?`<span class="bm bm-liked" style="left:${pos(likedAvg[k])}" title="Coffees you liked"></span>`:''}</div><span class="be"><span>${lo}</span><span>${hi}</span></span></div>`).join('')}
       <div class="legend"><span><i class="lg-pick"></i>Your answers</span><span><i class="lg-liked"></i>Coffees you liked</span></div></div>
     <div class="actions"><button class="btn ghost small" data-act="bulk">Add past coffees</button><button class="btn quiet small" data-act="quiz">Retake quiz</button></div>
   </div>
   <div class="tid-r">${radar(T)}</div>
  </div>`;
}
/* ---------- explore ---------- */
let xf='all';
const XF=[['all','All'],['top','Top matches'],['in','Indian specialty'],['imp','Imported'],['light','Light'],['medium','Medium'],['dark','Dark'],['fruity','Fruity'],['chocolate','Chocolatey']];
const keyOf=p=>(p.roaster+'|'+p.name).toLowerCase();
function exploreList(){
  const hidden=new Set(state.settings.hidden||[]);const have=new Set(state.journal.map(keyOf));
  let L=(state.explore?.list||[]).filter(p=>!hidden.has(keyOf(p))).map(p=>({p,m:match(p)}));
  L.sort((a,b)=>(b.m?.score||0)-(a.m?.score||0));
  const f=xf;
  L=L.filter(({p,m})=>{const r=ROASTN(p.roastLevel),fm=famsOf(p.notes);
    if(f==='top')return m&&m.score>=70;if(f==='in')return p.type!=='Imported';if(f==='imp')return p.type==='Imported';
    if(f==='light')return r==='light';if(f==='medium')return r==='medium';if(f==='dark')return r==='medium-dark'||r==='dark';
    if(f==='fruity')return fm.has('fruity')||fm.has('citrus');if(f==='chocolate')return fm.has('chocolate')||fm.has('nutty');return true;});
  return L.map(x=>Object.assign(x,{saved:have.has(keyOf(x.p))}));
}
function xcard(p,m,saved,src,i){
  return`<article class="xcard">
    <div class="x-top">${m?ring(m.score,74,m.cls):''}<div class="x-lbl">${m?`<b>${m.lbl}</b>${m.pros[0]?`<span>${esc(m.pros[0])}</span>`:''}`:''}</div></div>
    <h4>${esc(p.name)}</h4><div class="by">${esc([p.roaster,p.origin].filter(Boolean).join(' · '))}</div>
    <div class="chips">${p.type?`<span class="badge ${p.type==='Imported'?'imp':'in'}">${esc(p.type)}</span>`:''}${p.roastLevel?`<span class="chip static">${esc(cap(p.roastLevel))}</span>`:''}${(p.notes||[]).slice(0,3).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
    ${p.why?`<p class="why">${esc(p.why)}</p>`:''}
    <div class="x-foot"><span class="price">${esc(p.priceINR||'')}</span><span class="x-links"><a href="${amazon(p)}" target="_blank" rel="noopener">Amazon.in</a><a href="${search(p)}" target="_blank" rel="noopener">Roaster</a></span></div>
    <div class="x-act"><button class="btn ${saved?'ghost':'accent'} small" data-act="save-pick" data-src="${src}" data-i="${i}" ${saved?'disabled':''}>${saved?'Saved':'Save to try'}</button>${src==='x'?`<button class="btn quiet small" data-act="hide" data-i="${i}">Not for me</button>`:''}</div>
  </article>`;
}
let XL=[];
function renderExplore(){
  const el=$('#explore-body');
  XL=exploreList();
  const has=(state.explore?.list||[]).length;
  el.innerHTML=`<div class="filters" role="group" aria-label="Filter">${XF.map(([k,l])=>`<button class="fchip" data-xf="${k}" aria-pressed="${xf===k}">${l}</button>`).join('')}</div>
   ${has?(XL.length?`<div class="rail" tabindex="0" aria-label="Coffee matches">${XL.map(({p,m,saved},i)=>xcard(p,m,saved,'x',i)).join('')}</div>`:`<p class="muted">Nothing matches this filter yet.</p>`)
    :`<div class="rail-empty">${!sample?'Explore switches on once the AI key is set up (see the setup guide).':`<p>Get a set of coffees you can buy in India, ranked by how well they fit you.</p><button class="btn accent" data-act="refresh-explore">Find my matches</button>`}</div>`}
   <p class="status" id="xStatus"></p>
   ${has?`<p class="muted fine">Suggested by AI on ${fmtD(new Date(state.explore.at))}. Availability and prices change, so check before you buy.</p>`:''}`;
  el.querySelectorAll('[data-xf]').forEach(b=>b.onclick=()=>{xf=b.dataset.xf;renderExplore();});
  $('#mmBtn').disabled=!XL.length;
  const rb=$('#xRefresh');rb.hidden=!has||!sample;
}
/* ---------- journal ---------- */
const VL=SITE.verdicts;
function jcard(e){
  const m=match(e);
  return`<button class="jcard" data-act="open" data-id="${e.id}">
    <span class="jimg" ${e.photo?`style="background-image:url(${e.photo})"`:''}>${e.photo?'':beanIcon()}${m?`<span class="jring">${ring(m.score,46,m.cls)}</span>`:''}</span>
    <span class="jtxt"><b>${esc(e.name||'Unidentified coffee')}</b><span>${esc(e.roaster||e.origin||'')}</span>
    <span class="vtag v-${e.status==='saved'?'saved':e.status==='torate'?'torate':e.verdict}">${e.status==='saved'?'Saved to try':e.status==='torate'?'To rate':VL[e.verdict]||'Rated'}</span></span></button>`;
}
function renderJournal(){
  const R=state.journal.filter(e=>e.status==='rated'),S=state.journal.filter(e=>e.status==='saved'),Q=toRate();
  const jl=document.querySelector('.subnav a[href="#journal"]');if(jl)jl.innerHTML=(SITE.sections?.journal?.title||'Journal')+(Q.length?` <span class="dot">${Q.length}</span>`:'');
  $('#journal-body').innerHTML=(Q.length?`<div class="rail-h row-h"><h4>To rate · ${Q.length}</h4><button class="btn accent small" data-act="rate-deck">Rate them now</button></div><div class="rail jrail">${Q.map(jcard).join('')}</div>`:'')+`
   <div class="rail-h"><h4>Tried · ${R.length}</h4></div>
   <div class="rail jrail"><button class="jcard add" data-act="scan"><span class="jimg plus">+</span><span class="jtxt"><b>Scan a bag</b><span>Rate what you’re drinking</span></span></button><button class="jcard add" data-act="bulk"><span class="jimg plus">⧉</span><span class="jtxt"><b>Add past coffees</b><span>Several photos at once</span></span></button>${R.map(jcard).join('')}</div>
   <div class="rail-h"><h4>Saved to try · ${S.length}</h4></div>
   ${S.length?`<div class="rail jrail">${S.map(jcard).join('')}</div>`:`<p class="muted">Save coffees from Explore or the Match maker and they’ll wait here.</p>`}`;
}
const beanIcon=()=>'<svg width="30" height="40" viewBox="-12 -16 24 32" aria-hidden="true"><ellipse rx="10" ry="14" fill="#5A3A26"/><path d="M0 -12 C 4 -5,-4 3,1 12" stroke="#1E120A" stroke-width="2" fill="none"/></svg>';

/* =================== shelf =================== */
const WIN=SITE.freshness;
function fresh(b){
  const rd=parseD(b.roastDate)||today();const[rest,peak]=WIN[b.roastLevel]||WIN.medium;
  const now=today();const age=days(rd,now);const peakEnd=new Date(+rd+peak*DAY);
  const op=parseD(b.openedDate);const openEnd=op?new Date(+op+(SITE.openedBagDays||30)*DAY):null;
  const useBy=openEnd&&openEnd<peakEnd?openEnd:peakEnd;
  const cups=Math.floor((b.leftG||0)/(b.doseG||15));
  const runOut=new Date(+now+Math.ceil(cups/(b.cupsPerDay||1))*DAY);
  let stage=age<rest?'rest':age<=peak?'peak':age<=peak+30?'fade':'stale';
  if(openEnd&&now>openEnd&&stage==='peak')stage='fade';
  return{rd,rest,peak,age,peakEnd,openEnd,useBy,cups,runOut,stage,now};
}
function advice(b,f){
  if(b.leftG<=0)return['Empty. Mark it finished and rate it in your journal.',''];
  if(f.stage==='rest')return[`Still resting. It should open up from ${fmtD(new Date(+f.rd+f.rest*DAY))}.`,''];
  if(f.stage==='stale')return['Past its best. Fine for cold brew or milk drinks.','bad'];
  if(f.stage==='fade')return['Starting to fade. Brew it soon; a slightly finer grind helps.','warn'];
  const extra=Math.round((b.leftG||0)-days(f.now,f.useBy)*(b.cupsPerDay||1)*(b.doseG||15));
  if(f.runOut>f.useBy&&extra>(b.doseG||15)*2)return[`About ${extra} g will be left after its best date (${fmtD(f.useBy)}). Brew a little more often, or share some.`,'warn'];
  return[`At its best until ${fmtD(f.useBy)}. About ${f.cups} cup${f.cups===1?'':'s'} left.`,''];
}
function shelfDue(){const s=state.settings;return s.remindEvery>0&&state.shelf.length&&(!s.shelfCheckedAt||Date.now()-s.shelfCheckedAt>s.remindEvery*DAY);}
const STG={rest:'Resting',peak:'At its best',fade:'Fading',stale:'Past its best'};
function freshRing(f,size){
  const span=f.peak+30, frac=Math.max(0,Math.min(1,f.age/span));
  const r=size/2-6,C=2*Math.PI*r;
  const seg=(a,b,cls)=>`<circle cx="${size/2}" cy="${size/2}" r="${r}" class="${cls}" stroke-dasharray="${(C*(b-a)).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-C*a).toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"/>`;
  const a=-Math.PI/2+frac*2*Math.PI, x=size/2+Math.cos(a)*r, y=size/2+Math.sin(a)*r;
  return`<span class="fring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${seg(0,f.rest/span,'fr-rest')}${seg(f.rest/span,f.peak/span,'fr-peak')}${seg(f.peak/span,1,'fr-fade')}<circle cx="${x}" cy="${y}" r="6" class="fr-now"/></svg><b>Day ${Math.max(0,f.age)}</b><i>${STG[f.stage]}</i></span>`;
}
function renderShelf(){
  const s=state.settings;
  const list=state.shelf.map(b=>[b,fresh(b)]).sort((a,b)=>(a[0].leftG<=0)-(b[0].leftG<=0)||a[1].useBy-b[1].useBy);
  const firstIdx=list.findIndex(([b,f])=>b.leftG>0&&f.stage!=='stale');
  $('#shelf-body').innerHTML=`${shelfDue()?`<div class="banner"><span><b>Time for a shelf check.</b> ${s.shelfCheckedAt?'Last update was '+days(new Date(s.shelfCheckedAt),new Date())+' days ago.':'Update how much is left in each bag.'}</span><button class="btn small" data-act="checked">Everything’s up to date</button></div>`:''}
   <div class="rail srail"><button class="scard add" data-act="addbag"><span class="plus">+</span><b>Add a bag</b><span class="muted">Roast date and grams</span></button>
   ${list.map(([b,f],idx)=>`<article class="scard ${idx===firstIdx&&list.length>1?'first':''}" data-id="${b.id}">
     ${idx===firstIdx&&list.length>1?'<span class="flag">Brew this first</span>':''}
     <button class="s-open" data-s="view" aria-label="Open ${esc(b.name)}">${freshRing(f,128)}</button>
     <h4>${esc(b.name)}</h4><span class="muted">${esc(cap(b.roastLevel))} · roasted ${fmtD(f.rd)}</span>
     <div class="s-left"><b>${Math.round(b.leftG)}</b> g left <span class="muted">· ~${f.cups} cups</span></div>
     <div class="gauge"><i style="width:${Math.min(100,b.leftG/b.bagG*100)}%"></i></div>
     <button class="btn small" data-s="cup" ${b.leftG<=0?'disabled':''}>Brewed a cup</button></article>`).join('')}</div>
   <div class="actions fine-row"><label class="muted" for="remind">Shelf check reminder</label><select id="remind" style="width:auto">${[[3,'Every 3 days'],[5,'Every 5 days'],[7,'Every week'],[14,'Every 2 weeks'],[0,'Off']].map(([v,l])=>`<option value="${v}" ${s.remindEvery==v?'selected':''}>${l}</option>`).join('')}</select><span class="muted">Shown here when you open the page.</span></div>`;
  $('#remind').onchange=e=>{s.remindEvery=+e.target.value;saveProfile();renderShelf();};
  document.querySelectorAll('#shelf-body .scard[data-id]').forEach(card=>{
    const b=state.shelf.find(x=>x.id===card.dataset.id);
    card.querySelector('[data-s=view]').onclick=()=>openBagView(b);
    card.querySelector('[data-s=cup]').onclick=()=>{b.leftG=Math.max(0,b.leftG-b.doseG);if(!b.openedDate)b.openedDate=isoD(today());b.updatedAt=Date.now();state.settings.shelfCheckedAt=Date.now();saveBag(b);saveProfile();renderShelf();toast(`−${b.doseG} g. ${Math.round(b.leftG)} g left`);};
  });
}
function openBagView(b){
  const f=fresh(b);const[adv,cls]=advice(b,f);const span=f.peak+30;const pct=d=>Math.max(0,Math.min(100,d/span*100));
  openSheet(`${head('On your shelf')}<div class="bv-top">${freshRing(f,150)}<div><h3>${esc(b.name)}</h3><p class="muted">${esc(cap(b.roastLevel))} roast · roasted ${fmtD(f.rd)}${b.openedDate?' · opened '+fmtD(parseD(b.openedDate)):''}</p></div></div>
   <div class="tl-wrap"><div class="timeline"><span class="tl-rest" style="width:${pct(f.rest)}%"></span><span class="tl-peak" style="width:${pct(f.peak)-pct(f.rest)}%"></span><span class="tl-fade" style="width:${100-pct(f.peak)}%"></span></div><span class="tl-today" style="left:${pct(f.age)}%" data-l="Today"></span></div>
   <div class="tl-legend"><span>Resting</span><span>Best</span><span>Fading</span></div>
   <p class="advice ${cls}">${adv}</p>
   <div class="row c2" style="margin-top:18px"><div class="field"><label for="bvLeft">Grams left</label><input id="bvLeft" type="number" min="0" value="${Math.round(b.leftG)}"></div><div class="field"><label>&nbsp;</label>${!b.openedDate?'<button class="btn ghost" id="bvOpen" style="width:100%">Opened today</button>':''}</div></div>
   <div class="sheet-foot"><span class="actions"><button class="btn quiet" id="bvEdit">Edit details</button><button class="btn quiet danger" id="bvDone">Finished</button></span><button class="btn accent" id="bvSave">Save</button></div>`);
  const touch=()=>{b.updatedAt=Date.now();state.settings.shelfCheckedAt=Date.now();saveBag(b);saveProfile();renderShelf();};
  $('#bvSave').onclick=()=>{b.leftG=Math.max(0,+$('#bvLeft').value||0);touch();closeSheet();toast('Updated');};
  const o=$('#bvOpen');if(o)o.onclick=()=>{b.openedDate=isoD(today());touch();openBagView(b);};
  $('#bvEdit').onclick=()=>openBag(b);
  const d=$('#bvDone');d.onclick=()=>{if(d.dataset.sure){state.shelf=state.shelf.filter(x=>x.id!==b.id);delBag(b.id);closeSheet();renderAll();toast('Bag finished');}else{d.dataset.sure=1;d.textContent='Tap again to remove';}};
}

/* =================== match maker =================== */
let mmI=0;
function openMatchmaker(){XL=exploreList().filter(x=>!x.saved);mmI=0;renderMM();}
function renderMM(){
  if(mmI>=XL.length){openSheet(`${head('Match maker')}<div class="mm-done"><h3>That’s everyone for now.</h3><p class="lead">Your saved coffees are in your journal. Get a fresh set of matches any time.</p><div class="actions"><button class="btn accent" data-act="refresh-explore" data-close>Find new matches</button><a class="btn ghost" href="#journal" data-close>See saved coffees</a></div></div>`);return;}
  const {p,m}=XL[mmI];
  openSheet(`${head(`Match maker · ${mmI+1} of ${XL.length}`)}
   <div class="mm-stage"><article class="mm-card" id="mmCard">
     <div class="mm-ring">${m?ring(m.score,132,m.cls,m.lbl):''}</div>
     <h3>${esc(p.name)}</h3><p class="by">${esc([p.roaster,p.origin].filter(Boolean).join(' · '))}</p>
     <div class="chips center">${p.type?`<span class="badge ${p.type==='Imported'?'imp':'in'}">${esc(p.type)}</span>`:''}${p.roastLevel?`<span class="chip static">${esc(cap(p.roastLevel))} roast</span>`:''}${(p.notes||[]).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
     ${m?`<ul class="mm-why">${m.pros.map(x=>`<li>${esc(x)}</li>`).join('')}${m.cons.map(x=>`<li class="con">${esc(x)}</li>`).join('')}</ul>`:''}
     ${p.why?`<p class="why">${esc(p.why)}</p>`:''}
     <p class="price">${esc(p.priceINR||'')}</p>
     <span class="stamp s-yes">Save</span><span class="stamp s-no">Pass</span>
   </article></div>
   <div class="mm-btns"><button class="mm-b no" id="mmNo" aria-label="Pass">✕</button><span class="muted">Swipe or use ← →</span><button class="mm-b yes" id="mmYes" aria-label="Save to try">♥</button></div>`);
  const card=$('#mmCard');
  const decide=yes=>{
    card.style.transition='transform .28s ease,opacity .28s';card.style.transform=`translateX(${yes?420:-420}px) rotate(${yes?14:-14}deg)`;card.style.opacity=0;
    if(yes)savePick(p,true);else hidePick(p);
    setTimeout(()=>{mmI++;renderMM();},240);
  };
  $('#mmYes').onclick=()=>decide(true);$('#mmNo').onclick=()=>decide(false);
  let sx=null,dx=0;
  card.onpointerdown=e=>{sx=e.clientX;dx=0;card.setPointerCapture(e.pointerId);card.style.transition='none';};
  card.onpointermove=e=>{if(sx==null)return;dx=e.clientX-sx;card.style.transform=`translateX(${dx}px) rotate(${dx/22}deg)`;card.style.setProperty('--yes',Math.max(0,Math.min(1,dx/110)));card.style.setProperty('--no',Math.max(0,Math.min(1,-dx/110)));};
  card.onpointerup=()=>{if(sx==null)return;sx=null;if(Math.abs(dx)>110)decide(dx>0);else{card.style.transition='transform .2s';card.style.transform='';card.style.setProperty('--yes',0);card.style.setProperty('--no',0);}};
  sheet.onkeydown=e=>{if(e.key==='ArrowRight')decide(true);if(e.key==='ArrowLeft')decide(false);};
}
function hidePick(p){const h=new Set(state.settings.hidden||[]);h.add(keyOf(p));state.settings.hidden=[...h];saveProfile();renderExplore();}

/* =================== sheet =================== */
const wrap=$('#sheetWrap'), sheet=$('#sheet');
let lastFocus=null;
function openSheet(html){lastFocus=document.activeElement;sheet.innerHTML=html;wrap.classList.add('on');document.body.style.overflow='hidden';sheet.scrollTop=0;setTimeout(()=>{const f=sheet.querySelector('[autofocus]')||sheet.querySelector('.x');f&&f.focus();},30);}
function closeSheet(){wrap.classList.remove('on');sheet.innerHTML='';document.body.style.overflow='';lastFocus&&lastFocus.focus&&lastFocus.focus();}
wrap.addEventListener('click',e=>{if(e.target===wrap)closeSheet();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.classList.contains('on'))closeSheet();});
const head=(step)=>`<div class="sheet-head"><span class="step">${step||''}</span><button class="x" aria-label="Close" data-close>×</button></div>`;
sheet.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet();});

/* ---------- quiz ---------- */
const QUIZ=SITE.quiz.map(q=>({k:q.key,q:q.q,lead:q.lead,multi:!!q.multi,max:q.max,opts:q.options}));
let qi=0, qa={};
function openQuiz(){qa=JSON.parse(JSON.stringify(state.prefs||{}));qi=0;renderQuiz();}
function renderQuiz(){
  const Q=QUIZ[qi];const val=qa[Q.k];
  const sel=v=>Q.multi?(val||[]).includes(v):val===v;
  openSheet(`${head(`Question ${qi+1} of ${QUIZ.length}`)}<div class="progress"><i style="width:${(qi/QUIZ.length*100).toFixed(0)}%"></i></div>
   <h3>${Q.q}</h3><p class="lead">${Q.lead||(Q.multi?'Pick any that apply.':'Pick one.')}</p>
   <div class="opts ${Q.opts.length>4?'two':''}">${Q.opts.map(([v,b,s])=>`<button class="opt" data-v="${v}" aria-pressed="${sel(v)}"><b>${b}</b>${s?`<span>${s}</span>`:''}</button>`).join('')}</div>
   <div class="sheet-foot"><button class="btn quiet" data-q="back" ${qi===0?'style="visibility:hidden"':''}>Back</button>
   ${Q.multi?`<button class="btn accent" data-q="next">${qi===QUIZ.length-1?'Finish':'Next'}</button>`:''}</div>`);
  sheet.querySelectorAll('.opt').forEach(o=>o.onclick=()=>{
    let v=o.dataset.v;if(typeof Q.opts[0][0]==='number')v=+v;
    if(Q.multi){const a=new Set(qa[Q.k]||[]);if(a.has(v))a.delete(v);else{if(Q.max&&a.size>=Q.max)return toast(`Pick up to ${Q.max}`);a.add(v);}qa[Q.k]=[...a];o.setAttribute('aria-pressed',a.has(v));}
    else{qa[Q.k]=v;sheet.querySelectorAll('.opt').forEach(x=>x.setAttribute('aria-pressed',x===o));setTimeout(nextQ,180);}
  });
  sheet.querySelector('[data-q=back]').onclick=()=>{qi=Math.max(0,qi-1);renderQuiz();};
  const nx=sheet.querySelector('[data-q=next]');if(nx)nx.onclick=nextQ;
}
function nextQ(){
  if(qi<QUIZ.length-1){qi++;renderQuiz();return;}
  qa.sweetness=qa.sweetness||((qa.flavours||[]).some(f=>['caramel','chocolate','fruity'].includes(f))?4:3);
  qa.country=qa.country||'India';
  const first=!state.settings.bulkOffered&&!state.journal.length;
  state.prefs=qa;state.settings.bulkOffered=true;saveProfile();renderAll();toast('Your palate is set');
  if(first)openBulk(true);else{closeSheet();document.getElementById('profile').scrollIntoView({behavior:'smooth'});}
  if(sample&&!state.explore?.list?.length)refreshExplore();
}

/* ---------- picks ---------- */
function savePick(p,quiet){
  if(state.journal.some(e=>keyOf(e)===keyOf(p)))return quiet||toast('Already in your journal');
  const e={id:uid(),createdAt:Date.now(),status:'saved',photo:null,name:p.name,roaster:p.roaster||'',origin:p.origin||'',process:p.process||'',roastLevel:p.roastLevel||'',tastingNotes:p.notes||[],aroma:'',attrs:{acidity:p.acidity||null,body:p.body||null,sweetness:p.sweetness||null,bitterness:p.bitterness||null},packagingSays:'',source:'knowledge',brewTip:'',ratings:{},verdict:null,myNotes:'',buy:{priceINR:p.priceINR||'',type:p.type||''}};
  state.journal.unshift(e);saveEntry(e);renderJournal();renderExplore();quiet||toast('Saved to try');
}

/* ---------- scan / entry ---------- */
async function refreshExplore(){
  if(!sample)return;const st=$('#xStatus');document.querySelectorAll('[data-act=refresh-explore]').forEach(b=>b.disabled=true);
  if(st){st.classList.remove('err');st.textContent='Finding coffees that match you…';}
  try{const list=await getPicks();state.explore={at:Date.now(),list};saveProfile();xf='all';renderExplore();document.getElementById('explore').scrollIntoView({behavior:'smooth'});}
  catch(e){if(st){st.classList.add('err');st.textContent=errMsg(e);}document.querySelectorAll('[data-act=refresh-explore]').forEach(b=>b.disabled=false);}
}
let draft=null, photoBlob=null, photoThumb=null;
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const i=new Image();i.onload=()=>res([i,u]);i.onerror=rej;i.src=u;});}
function scaleTo(img,max){const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}
function openScan(byName){
  photoBlob=null;photoThumb=null;
  openSheet(`${head(byName?'Log a coffee':'Scan a bag')}
   <h3>${byName?'Which coffee?':'Scan a coffee bag'}</h3>
   <p class="lead">${byName?'Type the name and roaster. AI fills in the rest.':'A clear photo of the front of the pack works best. AI reads the label and works out how well it matches your palate.'}</p>
   ${byName?'':`<label class="drop" id="drop" for="photo"><strong>Choose a photo</strong><span class="muted">or drop it here</span></label><input id="photo" type="file" accept="image/*" style="display:none"><div class="or">and, if you like</div>`}
   <div class="field"><label for="hint">Coffee name</label><input id="hint" type="text" placeholder="e.g. Monsoon Malabar AA, Blue Tokai" ${byName?'autofocus':''}></div>
   <div class="actions"><button class="btn accent big" id="go">${sample?(byName?'Look it up':'Identify'):'Continue'}</button>${sample?'<button class="btn quiet" id="manual">Fill in by hand</button>':''}</div>
   <p class="status" id="idStatus">${!sample?'Photo identification switches on once the AI key is set up. You can still fill it in by hand.':(!byName&&!sampleImages?'':'')}</p>`);
  const drop=$('#drop'),photo=$('#photo');
  if(drop){
    const take=async file=>{
      if(!file||!file.type.startsWith('image/')){$('#idStatus').textContent='That file isn’t an image.';return;}
      try{const[img,u]=await loadImg(file);const big=scaleTo(img,1280);photoBlob=await new Promise(r=>big.toBlob(r,'image/jpeg',.85));photoThumb=scaleTo(img,320).toDataURL('image/jpeg',.72);URL.revokeObjectURL(u);drop.innerHTML=`<img src="${photoThumb}" alt="Your coffee photo"><span class="muted">Choose a different photo</span>`;$('#idStatus').textContent='';}
      catch(e){$('#idStatus').textContent='Couldn’t read that image. Try another photo.';}
    };
    photo.onchange=()=>take(photo.files[0]);
    ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
    drop.addEventListener('drop',e=>take(e.dataTransfer.files[0]));
  }
  const manual=()=>{draft=blank($('#hint').value.trim());renderResult(true);};
  const m=$('#manual');if(m)m.onclick=manual;
  $('#go').onclick=async()=>{
    const hint=$('#hint').value.trim();
    if(!sample)return manual();
    if(!photoBlob&&!hint){$('#idStatus').textContent='Add a photo or type the coffee’s name.';return;}
    if(!sampleImages&&!hint){$('#idStatus').textContent='Type the coffee’s name so it can be looked up.';return;}
    const g=$('#go');g.disabled=true;$('#idStatus').classList.remove('err');$('#idStatus').textContent=photoBlob?'Reading the label…':'Looking it up…';
    try{const r=await identify(photoBlob,hint);draft=fromAI(r);draft._conf=r.found===false?'low':r.confidence;renderResult(false);}
    catch(e){$('#idStatus').classList.add('err');$('#idStatus').textContent=errMsg(e);g.disabled=false;}
  };
}
function blank(name){return{id:uid(),createdAt:Date.now(),status:null,photo:photoThumb,name:name||'',roaster:'',origin:'',process:'',roastLevel:'',tastingNotes:[],aroma:'',attrs:{acidity:null,body:null,sweetness:null,bitterness:null},packagingSays:'',source:'',brewTip:'',ratings:{},verdict:null,myNotes:'',brew:(state.prefs?.brew||[]).find(x=>x!=='unsure')||'pourover',_new:true};}
function fromAI(r){
  const cl=v=>v==null||isNaN(+v)?null:Math.min(5,Math.max(1,Math.round(+v)));
  const e=blank(r.name);Object.assign(e,{roaster:r.roaster||'',origin:[r.origin,r.region].filter(Boolean).join(', '),process:r.process||'',roastLevel:r.roastLevel||'',roastDate:r.roastDate||'',netWeightG:r.netWeightG||null,tastingNotes:r.tastingNotes||[],aroma:r.aroma||'',attrs:{acidity:cl(r.acidity),body:cl(r.body),sweetness:cl(r.sweetness),bitterness:cl(r.bitterness)},packagingSays:r.packagingSays||'',source:r.source||'',brewTip:r.brewTip||''});return e;
}
const BREWS=SITE.brews;
function detailsForm(e,open){
  const sel=(k)=>`<select id="m_${k}"><option value="">–</option>${[1,2,3,4,5].map(v=>`<option ${e.attrs[k]==v?'selected':''}>${v}</option>`).join('')}</select>`;
  return`<details class="more" ${open?'open':''}><summary>${open?'Coffee details':'Edit details'}</summary><div style="margin-top:14px">
   <div class="row c2"><div class="field"><label for="dName">Coffee</label><input id="dName" type="text" value="${esc(e.name)}"></div><div class="field"><label for="dRoaster">Roaster</label><input id="dRoaster" type="text" value="${esc(e.roaster)}"></div></div>
   <div class="row c3"><div class="field"><label for="dOrigin">Origin</label><input id="dOrigin" type="text" value="${esc(e.origin)}"></div><div class="field"><label for="dProcess">Process</label><input id="dProcess" type="text" value="${esc(e.process)}"></div>
   <div class="field"><label for="dRoast">Roast</label><select id="dRoast">${['','light','medium-light','medium','medium-dark','dark'].map(v=>`<option value="${v}" ${v===e.roastLevel?'selected':''}>${v?cap(v):'Not sure'}</option>`).join('')}</select></div></div>
   <div class="row c2">${ATTRS.map(([k,n])=>`<div class="field"><label for="m_${k}">${n} (1–5)</label>${sel(k)}</div>`).join('')}</div>
   <div class="field"><label for="dNotes">Tasting notes, comma separated</label><input id="dNotes" type="text" value="${esc((e.tastingNotes||[]).join(', '))}"></div>
   <button class="btn ghost small" id="applyDetails">Update</button></div></details>`;
}
function readDetails(e){
  if(!$('#dName'))return;
  e.name=$('#dName').value.trim()||e.name;e.roaster=$('#dRoaster').value.trim();e.origin=$('#dOrigin').value.trim();e.process=$('#dProcess').value.trim();e.roastLevel=$('#dRoast').value;
  ATTRS.forEach(([k])=>{const v=$('#m_'+k).value;e.attrs[k]=v?+v:null;});
  e.tastingNotes=$('#dNotes').value.split(',').map(s=>s.trim()).filter(Boolean);
}
function coffeeHeader(e){
  return`<div class="coffee-head"><span class="thumb" ${e.photo?`style="background-image:url(${e.photo})"`:''}>${e.photo?'':beanIcon()}</span>
   <div><h3>${esc(e.name||'Unidentified coffee')}</h3><div class="by">${esc([e.roaster,e.origin].filter(Boolean).join(' · '))}</div></div></div>
   <div class="facts">${e.roastLevel?`<span class="chip static">${esc(cap(e.roastLevel))} roast</span>`:''}${e.process?`<span class="chip static">${esc(e.process)}</span>`:''}${(e.tastingNotes||[]).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
   ${e.packagingSays?`<p class="bagsays"><span class="src">${e.source==='packaging'?'From the bag':e.source==='knowledge'?'From AI':'Bag + AI'}</span>${esc(e.packagingSays)}</p>`:''}
   ${e.brewTip?`<p class="tip">Brew tip: ${esc(e.brewTip)}</p>`:''}`;
}
function matchBox(e){
  const m=match(e);if(!m)return`<div class="matchbox"><span class="muted" style="grid-column:1/-1">Take the taste quiz to see how well coffees match you. <button class="btn ghost small" data-act="quiz">Start quiz</button></span></div>`;
  return`<div class="matchbox">${matchBadge(m)}<ul>${m.pros.map(x=>`<li>${esc(x)}</li>`).join('')}${m.cons.map(x=>`<li class="con">${esc(x)}</li>`).join('')}${!m.pros.length&&!m.cons.length?'<li>Not enough detail about this coffee to compare</li>':''}</ul></div>`;
}
function renderResult(editOpen){
  const e=draft;const hasAttrs=ATTRS.some(([k])=>e.attrs[k]);
  openSheet(`${head(e._new?'Your match':'Coffee')}
   ${e._conf==='low'?'<p class="status err" style="margin:0 0 14px">The AI wasn’t sure about this one. Check the details.</p>':''}
   ${coffeeHeader(e)}${matchBox(e)}
   ${detailsForm(e,editOpen||(!e.name)||!hasAttrs)}
   <div class="actions" style="margin-top:22px"><button class="btn accent big" id="toRate">${e.status==='rated'?'Edit rating':'I’ve tried it: rate it'}</button>${e.status!=='rated'?`<button class="btn ghost big" id="saveTry">${e.status==='saved'?'Saved':'Save to try'}</button>`:''}</div>
   ${!e._new?entryExtras(e):''}`);
  const ap=$('#applyDetails');if(ap)ap.onclick=()=>{readDetails(e);renderResult(true);};
  $('#toRate').onclick=()=>{readDetails(e);if(!e.name)return toast('Add the coffee’s name');renderRate();};
  const st=$('#saveTry');if(st)st.onclick=()=>{readDetails(e);if(!e.name)return toast('Add the coffee’s name');if(e.status==='saved'){closeSheet();return;}e.status='saved';commit(e);closeSheet();toast('Saved to try');};
  if(!e._new)wireExtras(e);
}
function entryExtras(e){
  const onShelf=state.shelf.some(b=>b.entryId===e.id);
  return`${e.status==='rated'?`<div class="sec"><h4>Your rating</h4><p class="muted"><span class="vtag v-${e.verdict}" style="margin:0 8px 0 0">${VL[e.verdict]}</span>${e.myNotes?esc(e.myNotes):''}</p></div>`:''}
   ${e.buy&&(e.buy.priceINR)?`<div class="sec"><h4>Where to buy</h4><div class="where"><span class="price">${esc(e.buy.priceINR)}</span><a href="${amazon(e)}" target="_blank" rel="noopener">Amazon.in</a><a href="${search(e)}" target="_blank" rel="noopener">Find it</a></div></div>`:''}
   <div class="sec" id="simSec">${e.suggestions?.length?`<h4>${['loved','liked'].includes(e.verdict)?'If you liked this, try':'Try something different'}</h4><p class="muted">Available in India.</p><div class="picks" style="grid-template-columns:1fr">${e.suggestions.map((p,i)=>pickCard(p,i,'e:'+e.id)).join('')}</div>`:''}</div>
   <div class="actions sec">${!onShelf?'<button class="btn ghost small" id="eShelf">Add to shelf</button>':''}<button class="btn quiet small danger" id="eDel">Remove from journal</button></div>`;
}
function wireExtras(e){
  const sh=$('#eShelf');if(sh)sh.onclick=()=>{closeSheet();openBag({name:e.name+(e.roaster?' · '+e.roaster:''),roastLevel:e.roastLevel,entryId:e.id});};
  const d=$('#eDel');d.onclick=()=>{if(d.dataset.sure){state.journal=state.journal.filter(x=>x.id!==e.id);delEntry(e.id);closeSheet();renderAll();toast('Removed');}else{d.dataset.sure=1;d.textContent='Tap again to remove';}};
}
const CLAIMS=[['acidity','Acidity',true],['body','Body',true],['sweetness','Sweetness',true],['bitterness','Bitterness',true],['notes','Tasting notes',false],['roast','Roast level',false]];
function claimVal(e,k){if(k==='notes')return e.tastingNotes.length?e.tastingNotes.join(', '):null;if(k==='roast')return e.roastLevel?cap(e.roastLevel):null;const v=e.attrs[k];return v?`${v} of 5`:null;}
function renderRate(){
  const e=draft;
  const claims=CLAIMS.filter(([k])=>claimVal(e,k));
  openSheet(`${head('Rate it')}<h3>How was ${esc(e.name)}?</h3><p class="lead">Your answer shapes future matches.</p>
   <div class="verdicts" id="verdicts">${Object.entries(VL).map(([v,l])=>`<button data-v="${v}" aria-pressed="${e.verdict===v}">${l}</button>`).join('')}</div>
   ${claims.length?`<div class="sec"><h4>Does the bag get it right?</h4><p class="muted">Optional. Tell us where your cup differed.</p><div id="claims"></div></div>`:''}
   <div class="sec"><div class="field"><label for="rNotes">Notes</label><textarea id="rNotes" placeholder="What did you taste? Grind, ratio, anything you’d change.">${esc(e.myNotes)}</textarea></div>
   <div class="row c2"><div class="field"><label for="rBrew">Brewed with</label><select id="rBrew">${Object.entries(BREWS).map(([k,v])=>`<option value="${k}" ${k===e.brew?'selected':''}>${v}</option>`).join('')}</select></div>
   <div class="field"><label for="rBought">Bought on</label><input id="rBought" type="date" value="${esc(e.purchased||isoD(today()))}"></div></div></div>
   ${e._new&&!state.shelf.some(b=>b.entryId===e.id)?`<div class="sec"><label class="toggle"><input type="checkbox" id="rShelf"> I have this bag at home: add it to my shelf</label>
     <div class="row c3" id="rShelfF" hidden style="margin-top:12px"><div class="field"><label for="rRD">Roasted on</label><input id="rRD" type="date" value="${esc(e.roastDate||'')}"></div><div class="field"><label for="rBag">Bag (g)</label><input id="rBag" type="number" min="1" value="${e.netWeightG||250}"></div><div class="field"><label for="rLeft">Grams left</label><input id="rLeft" type="number" min="0" value="${e.netWeightG||250}"></div></div></div>`:''}
   <div class="sheet-foot"><button class="btn quiet" id="rBack">Back</button><button class="btn accent big" id="rSave">Save rating</button></div>`);
  sheet.querySelectorAll('#verdicts button').forEach(b=>b.onclick=()=>{e.verdict=b.dataset.v;sheet.querySelectorAll('#verdicts button').forEach(x=>x.setAttribute('aria-pressed',x===b));});
  const drawClaims=()=>{const el=$('#claims');if(!el)return;el.innerHTML=claims.map(([k,n,num])=>{const r=e.ratings[k]||{};return`<div class="claim" data-k="${k}"><div><b>${n}</b><span class="val">Bag says: ${esc(claimVal(e,k))}</span></div>
     <div class="seg" role="group" aria-label="${n}">${['agree','neutral','disagree'].map(v=>`<button class="${v}" data-r="${v}" aria-pressed="${r.v===v}">${cap(v)}</button>`).join('')}</div>
     ${num&&r.v==='disagree'?`<div class="dirrow">I found it <span class="seg"><button class="dir" data-d="1" aria-pressed="${r.dir===1}">${k==='body'?'heavier':'stronger'}</button><button class="dir" data-d="-1" aria-pressed="${r.dir===-1}">${k==='body'?'lighter':'weaker'}</button></span></div>`:''}</div>`;}).join('');
    el.querySelectorAll('.claim').forEach(c=>{const k=c.dataset.k;c.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{const cur=e.ratings[k]||{};e.ratings[k]={v:b.dataset.r,dir:b.dataset.r==='disagree'?cur.dir||0:0};drawClaims();});c.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{e.ratings[k].dir=+b.dataset.d;drawClaims();});});};
  drawClaims();
  const sh=$('#rShelf');if(sh)sh.onchange=()=>$('#rShelfF').hidden=!sh.checked;
  $('#rBack').onclick=()=>renderResult(false);
  $('#rSave').onclick=async()=>{
    if(!e.verdict)return toast('Pick how it was first');
    e.myNotes=$('#rNotes').value.trim();e.brew=$('#rBrew').value;e.purchased=$('#rBought').value;
    let bag=null;
    if($('#rShelf')?.checked){const rd=$('#rRD').value;bag={id:uid(),entryId:e.id,name:e.name+(e.roaster?' · '+e.roaster:''),roastLevel:e.roastLevel||'medium',roastDate:rd||isoD(today()),roastDateGuessed:!rd,openedDate:'',bagG:+$('#rBag').value||250,leftG:+$('#rLeft').value||0,doseG:15,cupsPerDay:1,updatedAt:Date.now()};}
    const wasRated=e.status==='rated';e.status='rated';e.suggestions=wasRated?e.suggestions:[];
    commit(e);if(bag){state.shelf.push(bag);saveBag(bag);}
    closeSheet();renderAll();document.getElementById('journal').scrollIntoView({behavior:'smooth'});
    toast(bag?'Rated and added to your shelf':'Rating saved');
    if(sample){try{const s=await getSimilar(e);e.suggestions=s;saveEntry(e);renderJournal();}catch(err){if(err.code==='limit_reached')toast(errMsg(err));}}
  };
}
function commit(e){delete e._new;delete e._conf;const i=state.journal.findIndex(x=>x.id===e.id);if(i>=0)state.journal[i]=e;else state.journal.unshift(e);saveEntry(e);renderAll();}
function openEntry(id){const e=state.journal.find(x=>x.id===id);if(!e)return;draft=e;renderResult(false);}

/* ---------- bag form ---------- */
function openBag(b){
  const edit=b&&b.id;b=b||{};
  openSheet(`${head(edit?'Edit bag':'Add a bag')}<h3>${edit?'Edit bag':'Add a bag to your shelf'}</h3><p class="lead">The roast date matters most. It’s usually printed on the back or bottom of the bag.</p>
   <div class="field"><label for="bName">Coffee</label><input id="bName" type="text" value="${esc(b.name||'')}" placeholder="e.g. Ratnagiri Estate, washed" autofocus></div>
   <div class="row c2"><div class="field"><label for="bRoast">Roast</label><select id="bRoast">${['light','medium-light','medium','medium-dark','dark'].map(v=>`<option value="${v}" ${(b.roastLevel||'medium')===v?'selected':''}>${cap(v)}</option>`).join('')}</select></div>
   <div class="field"><label for="bRD">Roasted on</label><input id="bRD" type="date" max="${isoD(today())}" value="${b.roastDateGuessed?'':esc(b.roastDate||'')}"></div></div>
   <div class="row c2"><div class="field"><label for="bOpened">Opened on (if opened)</label><input id="bOpened" type="date" value="${esc(b.openedDate||'')}"></div><div class="field"><label for="bBag">Bag size (g)</label><input id="bBag" type="number" min="1" value="${b.bagG||250}"></div></div>
   <div class="row c3"><div class="field"><label for="bLeft">Grams left</label><input id="bLeft" type="number" min="0" value="${b.leftG??b.bagG??250}"></div><div class="field"><label for="bDose">Grams per cup</label><input id="bDose" type="number" min="1" value="${b.doseG||15}"></div><div class="field"><label for="bCpd">Cups per day</label><input id="bCpd" type="number" min="0.5" step="0.5" value="${b.cupsPerDay||1}"></div></div>
   <div class="sheet-foot"><span></span><button class="btn accent big" id="bSave">${edit?'Save bag':'Add to shelf'}</button></div>`);
  $('#bSave').onclick=()=>{
    const name=$('#bName').value.trim();if(!name){toast('Add the coffee’s name');$('#bName').focus();return;}
    if(!$('#bRD').value){toast('Add the roast date');$('#bRD').focus();return;}
    const t=edit?b:{id:uid(),entryId:b.entryId||null};
    Object.assign(t,{name,roastLevel:$('#bRoast').value,roastDate:$('#bRD').value,roastDateGuessed:false,openedDate:$('#bOpened').value,bagG:Math.max(1,+$('#bBag').value||250),leftG:Math.max(0,+$('#bLeft').value||0),doseG:Math.max(1,+$('#bDose').value||15),cupsPerDay:Math.max(.5,+$('#bCpd').value||1),updatedAt:Date.now()});
    if(!edit)state.shelf.push(t);state.settings.shelfCheckedAt=Date.now();saveBag(t);saveProfile();closeSheet();renderAll();toast(edit?'Bag saved':'Added to shelf');
  };
}

/* =================== past coffees: bulk add, rating deck, reminders =================== */
const OB=SITE.onboarding||{}, RM=SITE.reminders||{};
const toRate=()=>state.journal.filter(e=>e.status==='torate');
let bulk=[], bulkFromQuiz=false, bulkRunning=false;
function openBulk(fromQuiz){bulk=[];bulkFromQuiz=!!fromQuiz;renderBulk();}
function renderBulk(){
  const max=OB.maxPhotos||20, done=bulk.length&&bulk.every(b=>b.st==='done'||b.st==='failed');
  openSheet(`${head(bulkFromQuiz?'Almost done':'Add past coffees')}
   <h3>${esc(OB.title||'Add coffees you’ve had before')}</h3>
   <p class="lead">${esc(OB.sub||'')}</p>
   ${bulkRunning||done?'':`<label class="drop" id="bdrop" for="bfiles"><strong>${bulk.length?'Add more photos':'Choose photos'}</strong><span class="muted">Select several at once, up to ${max}. One bag per photo works best.</span></label><input id="bfiles" type="file" accept="image/*" multiple style="display:none">`}
   <div class="bgrid" id="bgrid">${bulk.map((b,i)=>`<div class="btile st-${b.st}"><span class="bimg" style="background-image:url(${b.thumb})"></span>
     <span class="bst">${b.st==='working'?'<i class="spin"></i>':b.st==='done'?'✓':b.st==='failed'?'!':''}</span>
     ${b.st==='ready'?`<button class="bx" data-rm="${i}" aria-label="Remove photo">×</button>`:''}
     <span class="bname">${esc(b.st==='done'?(b.entry.name||'Unidentified coffee'):b.st==='failed'?'Couldn’t read it':b.st==='working'?'Reading…':'')}</span></div>`).join('')}</div>
   <p class="status" id="bStatus">${bulkRunning?`Identifying ${bulk.filter(b=>b.st==='done'||b.st==='failed').length+1} of ${bulk.length}… keep this window open.`:done?`${bulk.filter(b=>b.st==='done').length} added to your “To rate” list.${bulk.some(b=>b.st==='failed')?' The ones marked ! were added too; you can name them when you rate.':''}`:''}</p>
   <div class="sheet-foot">${done?`<button class="btn quiet" data-close>${esc(RM.later||'Rate them later')}</button><button class="btn accent big" data-act="rate-deck">Rate them now</button>`
     :`<button class="btn quiet" id="bSkip" ${bulkRunning?'disabled':''}>${esc(OB.skip||'Skip for now')}</button><button class="btn accent big" id="bGo" ${!bulk.length||bulkRunning?'disabled':''}>${bulk.length?`Add ${bulk.length} coffee${bulk.length>1?'s':''}`:'Add coffees'}</button>`}</div>`);
  const inp=$('#bfiles'),drop=$('#bdrop');
  const take=async files=>{
    files=[...files].filter(f=>f.type.startsWith('image/'));
    const room=max-bulk.length;if(files.length>room)toast(`Up to ${max} photos at a time`);
    for(const f of files.slice(0,room)){try{const[img,u]=await loadImg(f);const big=scaleTo(img,1280);const blob=await new Promise(r=>big.toBlob(r,'image/jpeg',.85));bulk.push({blob,thumb:scaleTo(img,320).toDataURL('image/jpeg',.72),st:'ready'});URL.revokeObjectURL(u);}catch(e){}}
    renderBulk();
  };
  if(inp){inp.onchange=()=>take(inp.files);
    ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
    drop.addEventListener('drop',e=>take(e.dataTransfer.files));}
  sheet.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{bulk.splice(+b.dataset.rm,1);renderBulk();});
  const sk=$('#bSkip');if(sk)sk.onclick=()=>{closeSheet();toast(OB.skipToast||'You can add past coffees any time from your Taste ID');};
  const go=$('#bGo');if(go)go.onclick=runBulk;
}
async function runBulk(){
  bulkRunning=true;renderBulk();let stopped=null;
  for(const b of bulk){
    if(b.st!=='ready')continue;
    const e=blank('');Object.assign(e,{photo:b.thumb,status:'torate',name:'',unidentified:true});delete e._new;
    b.entry=e;
    if(sample&&!stopped){
      b.st='working';renderBulk();
      try{const r=await identify(b.blob,'','identify_bulk');const f=fromAI(r);Object.assign(e,f,{id:e.id,createdAt:e.createdAt,photo:b.thumb,status:'torate',unidentified:r.found===false||!f.name});delete e._new;b.st=e.unidentified?'failed':'done';}
      catch(err){b.st='failed';if(err.code==='limit_reached'||err.code==='demo')stopped=err;}
    }else b.st='failed';
    if(!e.name)e.name='';
    state.journal.unshift(e);saveEntry(e);
  }
  bulkRunning=false;renderAll();renderBulk();
  if(stopped&&stopped.code==='limit_reached')toast('Today’s identification limit was reached. Name the rest when you rate them.');
}
/* ---------- rating deck ---------- */
let deck=[], di=0, rated0=0;
function openRateDeck(){deck=toRate().slice().sort((a,b)=>(!!a.unidentified-!!b.unidentified)||(a.createdAt-b.createdAt));di=0;rated0=0;renderDeck();}
function renderDeck(){
  if(di>=deck.length){
    openSheet(`${head('Rate your coffees')}<div class="mm-done"><h3>${rated0?`Nice. ${rated0} coffee${rated0>1?'s':''} rated.`:'All caught up.'}</h3><p class="lead">${rated0?'Your Taste ID and matches have been updated.':'Come back whenever you’re ready.'}</p><div class="actions"><a class="btn accent" href="#profile" data-close>See my Taste ID</a></div></div>`);return;
  }
  const e=deck[di];
  openSheet(`${head(`Rate your coffees · ${di+1} of ${deck.length}`)}
   <div class="progress"><i style="width:${(di/deck.length*100).toFixed(0)}%"></i></div>
   <div class="rd-card">
     <span class="rd-img" ${e.photo?`style="background-image:url(${e.photo})"`:''}>${e.photo?'':beanIcon()}</span>
     <div class="rd-txt">${e.unidentified||!e.name?`<label class="muted" for="rdName">We couldn’t read this one. What was it?</label><input id="rdName" type="text" value="${esc(e.name)}" placeholder="Coffee name and roaster">`
       :`<h3>${esc(e.name)}</h3><p class="by">${esc([e.roaster,e.origin].filter(Boolean).join(' · '))}</p><div class="chips">${e.roastLevel?`<span class="chip static">${esc(cap(e.roastLevel))} roast</span>`:''}${(e.tastingNotes||[]).slice(0,3).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>`}</div>
   </div>
   <h4 class="rd-q">How was it?</h4>
   <div class="verdicts" id="dv">${Object.entries(VL).map(([v,l])=>`<button data-v="${v}">${l}</button>`).join('')}</div>
   <div class="sheet-foot"><span class="actions"><button class="btn quiet small" id="dSkip">Skip for now</button><button class="btn quiet small danger" id="dDel">I never had this</button></span><button class="btn ghost small" id="dMore">Rate in detail</button></div>`);
  const nm=()=>{const i=$('#rdName');if(i){const v=i.value.trim();if(v){e.name=v;e.unidentified=false;}return !!v;}return true;};
  sheet.querySelectorAll('#dv button').forEach(b=>b.onclick=()=>{
    if(!nm()){toast('Add the coffee’s name first');$('#rdName').focus();return;}
    b.setAttribute('aria-pressed','true');e.verdict=b.dataset.v;e.status='rated';e.purchased=e.purchased||'';saveEntry(e);rated0++;
    setTimeout(()=>{di++;renderAll();renderDeck();},180);
  });
  $('#dSkip').onclick=()=>{nm()&&saveEntry(e);di++;renderDeck();};
  const d=$('#dDel');d.onclick=()=>{if(d.dataset.sure){state.journal=state.journal.filter(x=>x.id!==e.id);delEntry(e.id);deck.splice(di,1);renderAll();renderDeck();}else{d.dataset.sure=1;d.textContent='Tap again to remove';}};
  $('#dMore').onclick=()=>{if(!nm()){toast('Add the coffee’s name first');return;}draft=e;renderRate();};
}
function remindBanner(){
  const n=toRate().length;if(!n||Date.now()<(state.settings.rateSnoozeUntil||0))return'';
  return`<div class="remind"><div><b>${n} coffee${n>1?'s are':' is'} waiting for your rating.</b><span>${esc(RM.text||'Rating the coffees you’ve had sharpens your Taste ID and your matches.')}</span></div>
   <div class="actions"><button class="btn accent small" data-act="rate-deck">Rate now</button><button class="btn quiet small" data-act="snooze">${esc(RM.later||'Remind me later')}</button></div></div>`;
}

/* =================== content & login =================== */
function applyContent(){
  const t=(sel,v)=>{const el=document.querySelector(sel);if(el&&v!=null)el.textContent=v;};
  t('.brand',SITE.brand);document.title=SITE.brand;
  t('#navStory',SITE.nav?.story);t('#navApp',SITE.nav?.app);
  const S=SITE.sections||{};
  t('#xh',S.explore?.title);t('#xh + p',S.explore?.sub);t('#mmBtn',S.explore?.matchmaker);
  t('#jh',S.journal?.title);t('#jh + p',S.journal?.sub);
  t('#sh',S.shelf?.title);t('#sh + p',S.shelf?.sub);
  t('footer',SITE.footer);
}
let authMode='signin';
function showAuth(mode){
  authMode=mode||authMode;document.body.classList.remove('signed-in');
  const L=SITE.login||{};
  const box=$('#auth');
  const F={
    signin:{h:'Sign in',btn:'Sign in',fields:['email','password'],alt:`<button class="btn quiet" data-auth="forgot">Forgot password?</button><span class="muted">New here? <button class="linkbtn" data-auth="signup">Create an account</button></span>`},
    signup:{h:'Create your account',btn:'Create account',fields:['name','email','newpassword'],alt:`<span class="muted">Already have an account? <button class="linkbtn" data-auth="signin">Sign in</button></span>`},
    forgot:{h:'Reset your password',btn:'Send reset link',fields:['email'],alt:`<button class="linkbtn" data-auth="signin">Back to sign in</button>`},
    newpass:{h:'Choose a new password',btn:'Save password',fields:['newpassword'],alt:''},
    sent:{h:'Check your email',btn:null,fields:[],alt:`<button class="linkbtn" data-auth="signin">Back to sign in</button>`}
  }[authMode];
  const field={
    name:'<div class="field"><label for="aName">Your first name</label><input id="aName" type="text" autocomplete="given-name" required></div>',
    email:'<div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>',
    password:'<div class="field"><label for="aPass">Password</label><input id="aPass" type="password" autocomplete="current-password" required></div>',
    newpassword:'<div class="field"><label for="aPass">Password</label><input id="aPass" type="password" autocomplete="new-password" minlength="8" required><span class="muted">At least 8 characters.</span></div>'
  };
  box.innerHTML=`<div class="auth-wrap"><div class="auth-intro"><span class="kicker">${esc(SITE.brand)}</span><h2>${esc(L.title||'')}</h2><p>${esc(L.sub||'')}</p></div>
   <form class="auth-card" id="authForm" novalidate><h3>${F.h}</h3>${authMode==='sent'?`<p class="muted">${esc(box.dataset.msg||'')}</p>`:''}
   ${F.fields.map(f=>field[f]).join('')}
   <p class="status err" id="aErr" role="alert"></p>
   ${F.btn?`<button class="btn accent big" style="width:100%" type="submit">${F.btn}</button>`:''}
   <div class="auth-alt">${F.alt}</div></form></div>`;
  box.querySelectorAll('[data-auth]').forEach(b=>b.onclick=e=>{e.preventDefault();showAuth(b.dataset.auth);});
  const f=$('#authForm');
  f.onsubmit=async e=>{
    e.preventDefault();const err=$('#aErr');err.textContent='';
    const email=$('#aEmail')?.value.trim(),pass=$('#aPass')?.value,name=$('#aName')?.value.trim();
    if($('#aEmail')&&!/^\S+@\S+\.\S+$/.test(email)){err.textContent='Enter a valid email address.';return;}
    if((authMode==='signup'||authMode==='newpass')&&(!pass||pass.length<8)){err.textContent='Use at least 8 characters for your password.';return;}
    if(authMode==='signup'&&!name){err.textContent='Add your first name.';return;}
    const btn=f.querySelector('[type=submit]');btn.disabled=true;
    try{
      if(authMode==='signin'){await API.signIn(email,pass);me=await API.currentUser();box.innerHTML='';await loadUser();}
      else if(authMode==='signup'){const r=await API.signUp(email,pass,name);if(r.needsConfirm){box.dataset.msg=`We’ve sent a confirmation link to ${email}. Open it, then sign in.`;showAuth('sent');}else{me=await API.currentUser();box.innerHTML='';await loadUser();}}
      else if(authMode==='forgot'){await API.resetPassword(email);box.dataset.msg=`If an account exists for ${email}, a reset link is on its way.`;showAuth('sent');}
      else if(authMode==='newpass'){await API.updatePassword(pass);history.replaceState(null,'',location.pathname+'#profile');me=await API.currentUser();box.innerHTML='';toast('Password updated');await loadUser();}
    }catch(x){
      const m=String(x.message||'');
      err.textContent=/invalid login/i.test(m)?'That email and password don’t match.':/already registered/i.test(m)?'An account with this email already exists. Sign in instead.':/not confirmed/i.test(m)?'Confirm your email first: check your inbox for the link.':m||'Something went wrong. Try again.';
      btn.disabled=false;
    }
  };
}

/* =================== global actions =================== */
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');if(!a)return;
  const act=a.dataset.act;
  if(act==='quiz')openQuiz();
  else if(act==='scan')openScan(false);
  else if(act==='manual')openScan(true);
  else if(act==='addbag')openBag(null);
  else if(act==='refresh-explore')refreshExplore();
  else if(act==='mm')openMatchmaker();
  else if(act==='bulk')openBulk(false);
  else if(act==='rate-deck')openRateDeck();
  else if(act==='snooze'){state.settings.rateSnoozeUntil=Date.now()+(RM.snoozeDays||3)*DAY;saveProfile();renderProfile();toast(`We’ll remind you in ${RM.snoozeDays||3} days`);}
  else if(act==='hide'){const x=XL[+a.dataset.i];if(x){hidePick(x.p);toast('Hidden from Explore');}}
  else if(act==='open')openEntry(a.dataset.id);
  else if(act==='checked'){state.settings.shelfCheckedAt=Date.now();saveProfile();renderShelf();toast('Shelf marked up to date');}
  else if(act==='save-pick'){const src=a.dataset.src;const p=src==='x'?(XL[+a.dataset.i]||{}).p:((state.journal.find(x=>x.id===src.slice(2))||{}).suggestions||[])[+a.dataset.i];if(p){savePick(p);a.textContent='Saved';a.disabled=true;}}
});
$('#scanTop').onclick=()=>openScan(false);
$('#signOut').onclick=async()=>{await API.signOut();if(API.demo)toast('Demo mode has no account to sign out of');};
init();
})();
