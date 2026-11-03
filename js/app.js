/* App logic: Coffee Personality, Explore, Journal, Shelf.
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
const state={prefs:null,settings:{remindEvery:7,shelfCheckedAt:null,hidden:[]},journal:[],shelf:[],explore:null,cat:[],catState:'loading'};
const catById=new Map();
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
  if(!me){showAuth('signin');if(/^#(profile|explore|journal|shelf|app)$/.test(location.hash))setTimeout(()=>$('#auth').scrollIntoView(),60);return;}
  await loadUser();
}
async function loadUser(){
  document.body.classList.add('signed-in');
  userName=API.demo?'':(me.name||'').split(' ')[0];
  $('#storeNote').textContent=API.demo?'Demo mode: saved in this browser only':(me.email||'');
  try{
    const v=await API.load();
    state.prefs=v.prefs||null;state.settings=Object.assign(state.settings,v.settings||{});state.explore=v.explore||null;
    state.journal=(v.journal||[]).sort((a,b)=>b.createdAt-a.createdAt);state.shelf=v.shelf||[];
  }catch(e){console.warn(e);toast('Couldn’t load your coffee. Refresh to try again.');}
  migrate();renderAll();route();loadCatalog();
}
async function loadCatalog(force){
  if(force)try{sessionStorage.removeItem('ck-catalog-v1');}catch(e){}
  try{const rows=await API.catalog();state.cat=rows.map(fromCat);catById.clear();state.cat.forEach(c=>catById.set(c.id,c));state.catState=state.cat.length?'ready':'empty';}
  catch(e){console.warn(e);state.catState='error';}
  renderExplore();renderJournal();
}
const fromCat=r=>({id:r.id,catalogId:r.id,name:r.name,roaster:r.roaster,origin:r.origin||'',region:r.region||'',estate:r.estate||'',altitude:r.altitude||'',variety:r.variety||'',process:r.process||'',processDetail:r.process_detail||'',grade:r.grade||'',blend:r.blend,roastLevel:r.roast_level||'',notes:r.notes||[],tastingNotes:r.notes||[],acidity:r.acidity,body:r.body,sweetness:r.sweetness,bitterness:r.bitterness,summary:r.summary||'',url:r.url,image:r.image,images:(r.images&&r.images.length?r.images:[r.image]).filter(Boolean),price:r.price_inr,packG:r.pack_g,price250:r.price_250,available:r.available!==false,source:r.source,updatedAt:r.updated_at});

/* =================== taste model =================== */
const FAM=Object.fromEntries(Object.entries(SITE.flavours).map(([k,v])=>[k,{l:v.label,w:v.words}]));
function famsOf(notes){const f=new Set();(notes||[]).forEach(n=>{const s=String(n).toLowerCase();for(const k in FAM)if(FAM[k].w.some(w=>s.includes(w)))f.add(k);});return f;}
const ATTRS=[['acidity','Acidity','Smooth','Bright'],['body','Body','Light','Heavy'],['sweetness','Sweetness','Dry','Sweet'],['bitterness','Bitterness','None','Bold']];
const ROASTN=r=>({'medium-light':'light','light':'light','medium':'medium','medium-dark':'medium-dark','dark':'dark'}[r]||null);
const VW={loved:2,liked:1,ok:0.25,dislike:-1.5};
const RN={light:1,'medium-light':2,medium:3,'medium-dark':4,dark:5};
const roastNum=r=>RN[r]||null;
function perceived(e,k){const v=e.attrs?.[k]??e[k];if(v==null)return null;const r=e.ratings?.[k];let x=+v;if(r&&r.v==='disagree'&&r.dir)x+=r.dir;return Math.min(5,Math.max(1,x));}
const rated=()=>state.journal.filter(e=>e.status==='rated');
/* Your palate = quiz answers + every coffee you rate. The quiz counts like two
   loved coffees at the start and fades as ratings come in, so the profile
   keeps moving with what you actually drink. "Not for me" pushes away. */
function target(ex){
  const p=state.prefs, T={attrs:{},fams:{},roast:{},roastNum:null,n:0};
  const R=rated().filter(e=>e.id!==ex);
  const pos=R.filter(e=>VW[e.verdict]>0);
  const wq=p?4/(1+pos.length/2):0;T.quizWeight=wq;
  ATTRS.forEach(([k])=>{let s=0,w=0;if(p&&p[k]){s+=p[k]*wq;w+=wq;}pos.forEach(e=>{const v=perceived(e,k);if(v!=null){s+=v*VW[e.verdict];w+=VW[e.verdict];}});
    let t=w?s/w:null;
    if(t!=null)R.forEach(e=>{if(VW[e.verdict]<0){const v=perceived(e,k);if(v!=null&&Math.abs(v-t)<1.6)t+=(t>=v?1:-1)*.2;}});
    T.attrs[k]=t==null?null:Math.min(5,Math.max(1,t));});
  let rs=0,rw=0;
  if(p&&(p.roast||[]).length){const per=wq/p.roast.length;p.roast.forEach(r=>{const v=roastNum(r);if(v){rs+=v*per;rw+=per;}const c=ROASTN(r);if(c)T.roast[c]=(T.roast[c]||0)+per;});}
  if(p)(p.flavours||[]).forEach(f=>T.fams[f]=(T.fams[f]||0)+wq);
  R.forEach(e=>{const vw=VW[e.verdict]||0;famsOf(e.tastingNotes).forEach(f=>T.fams[f]=(T.fams[f]||0)+vw);const v=roastNum(e.roastLevel);if(v&&vw>0){rs+=v*vw;rw+=vw;}const c=ROASTN(e.roastLevel);if(c)T.roast[c]=(T.roast[c]||0)+vw;T.n++;});
  T.roastNum=rw?rs/rw:null;T.posWeight=pos.reduce((a,e)=>a+VW[e.verdict],0);
  T.ready=!!p||T.n>0;return T;
}
const andList=a=>{a=a.map((x,i)=>i?x.toLowerCase():x);return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];};
const ATTR_WORD={acidity:'acidity',body:'body',sweetness:'sweetness',bitterness:'bitterness'};
function match(c,T){
  T=T||target(c.id);if(!T.ready)return null;
  let score=82;const pros=[],cons=[];
  ATTRS.forEach(([k,n])=>{const v=c[k]??c.attrs?.[k],t=T.attrs[k];if(v==null||t==null)return;const d=Math.abs(v-t);score-=Math.max(0,d-.4)*9;
    if(d<=.6)pros.push(`${n} close to what you like`);else if(d>=1.5)cons.push(`${v>t?(k==='body'?'Heavier':'More '+ATTR_WORD[k]):(k==='body'?'Lighter':'Less '+ATTR_WORD[k])} than you usually like`);});
  const rn=roastNum(c.roastLevel);
  if(rn&&T.roastNum!=null){const d=Math.abs(rn-T.roastNum);if(d<=.75){score+=6;pros.unshift(`Your kind of roast (${c.roastLevel})`);}else if(d>=1.6){score-=10;cons.push(`${rn>T.roastNum?'Darker':'Lighter'} roast than you usually enjoy`);}else score-=3;}
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
async function identify(blob,hint,kind){
  let image=null;
  if(blob){image=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result).split(',')[1]);fr.readAsDataURL(blob);});}
  return API.ai(kind||'identify',{image,hint});
}
const amazon=p=>`https://www.amazon.in/s?k=${encodeURIComponent([p.roaster,p.name,'coffee'].filter(Boolean).join(' '))}`;
const imgW=(u,w)=>u&&/cdn\.shopify\.com|\/cdn\/shop\//.test(u)?u+(u.includes('?')?'&':'?')+'width='+w:u;
const priceText=p=>p.price?`₹${p.price.toLocaleString('en-IN')}${p.packG?' · '+p.packG+' g':''}`:(p.priceText||p.priceINR||'');
const originLine=p=>p.blend&&!p.origin?'Blend':[p.region,p.origin].filter(Boolean).join(', ')||'Origin not stated';
const search=p=>`https://www.google.com/search?q=${encodeURIComponent([p.roaster,p.name,'buy'].filter(Boolean).join(' '))}`;
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
/* ---------- Coffee Personality: nearest of the standard types in config/content.js ---------- */
const PERS=SITE.personalities;
function personality(T){
  if(!T.ready)return Object.assign({key:'newbie',close:[]},PERS.newbie);
  const FK=Object.keys(FAM);
  const uf=FK.map(k=>Math.max(0,T.fams[k]||0)),um=Math.max(...uf,0),ufn=uf.map(v=>um?v/um:0);
  const ua={roast:T.roastNum??3,acidity:T.attrs.acidity??3,body:T.attrs.body??3,sweetness:T.attrs.sweetness??3,bitterness:T.attrs.bitterness??2.2};
  const res=Object.entries(PERS).filter(([k,v])=>v.shape).map(([k,v])=>{const sh=v.shape;
    let d=((ua.roast-sh.roast)/1.2)**2*1.3+((ua.acidity-sh.acidity)/1.2)**2+((ua.body-sh.body)/1.2)**2+((ua.sweetness-sh.sweetness)/1.5)**2*.6+((ua.bitterness-sh.bitterness)/1.5)**2*.6;
    const pf=FK.map(f=>sh.flavours[f]||0),pm=Math.max(...pf,1),pfn=pf.map(x=>x/pm);
    const dot=ufn.reduce((a,x,i)=>a+x*pfn[i],0),nu=Math.hypot(...ufn),np=Math.hypot(...pfn);d+=(1-(nu&&np?dot/(nu*np):.5))*3;
    return{key:k,pct:Math.round(100*Math.exp(-d/2.4))};}).sort((a,b)=>b.pct-a.pct);
  const L=rated().filter(e=>e.verdict==='loved'||e.verdict==='liked');
  const lovedR=L.filter(e=>e.verdict==='loved').map(e=>roastNum(e.roastLevel)).filter(Boolean);
  const origins=new Set(L.map(e=>(e.origin||'').toLowerCase().split(',').pop().trim()).filter(Boolean));
  const explorer=L.length>=5&&lovedR.length>=3&&Math.max(...lovedR)-Math.min(...lovedR)>=2.5&&origins.size>=3;
  const key=explorer?'explorer':res[0].key;
  return Object.assign({key,close:res},PERS[key]);
}
function trackPersona(P){
  const s=state.settings,cur=s.persona;
  if(P.key==='newbie')return cur;
  if(!cur||cur.key!==P.key){s.persona={key:P.key,since:Date.now(),prev:cur&&cur.key!=='newbie'?cur.key:null};saveProfile();}
  return s.persona;
}
/* =================== render =================== */
function renderAll(){renderProfile();renderExplore();renderJournal();renderShelf();}
function renderProfile(){
  const el=$('#profile-body');const T=target();const p=state.prefs;
  if(!T.ready){el.innerHTML=remindBanner()+`<div class="tid empty-tid"><div class="tid-l"><span class="kicker">Coffee Personality</span><h3 class="tid-name">Find your coffee personality.</h3><p class="tid-desc">Eight quick questions about how you drink coffee now. Then every coffee you rate sharpens it.</p><div class="actions"><button class="btn accent big" data-act="quiz">Start the taste quiz</button><button class="btn ghost big" data-act="bulk">Add past coffees</button></div><button class="linkbtn" data-act="types">See all ${Object.keys(PERS).length-1} personalities</button></div><div class="tid-r ghost-radar">${radar({fams:{chocolate:2,nutty:1.4,caramel:1.8,fruity:1,citrus:.8,floral:.6,spicy:.9,earthy:.7}})}</div></div>`;return;}
  const r=rated(),loved=r.filter(e=>['loved','liked'].includes(e.verdict));
  const origins=new Set(r.map(e=>(e.origin||'').split(',')[0].trim()).filter(Boolean));
  const P=personality(T),hist=trackPersona(P);const pos=v=>((v-1)/4*100).toFixed(1)+'%';
  const second=P.close.find(c=>c.key!==P.key);const touch=P.key!=='explorer'&&second&&P.close[0]&&P.close[0].pct-second.pct<14?PERS[second.key].name.replace(/^The /,''):'';
  const likedAvg={};ATTRS.forEach(([k])=>{const v=loved.map(e=>perceived(e,k)).filter(x=>x!=null);likedAvg[k]=v.length?v.reduce((a,b)=>a+b,0)/v.length:null;});
  const quizShare=p?Math.round(100*T.quizWeight/(T.quizWeight+T.posWeight)):0;
  const shapers=r.filter(e=>e.verdict!=='ok').sort((a,b)=>Math.abs(VW[b.verdict])-Math.abs(VW[a.verdict])||b.createdAt-a.createdAt).slice(0,4);
  const changed=hist&&hist.prev&&hist.prev!==P.key&&PERS[hist.prev];
  el.innerHTML=remindBanner()+`<div class="tid">
   <div class="tid-l">
     <span class="kicker">${userName?esc(userName)+'’s ':''}Coffee Personality</span>
     <h3 class="tid-name">${esc(P.name)}</h3>
     ${touch?`<p class="tid-touch">with a touch of ${esc(touch)}</p>`:''}
     <p class="tid-desc">${esc(palateSentence())} ${esc(P.text)}</p>
     ${P.look?`<p class="tid-look"><span>You tend to enjoy</span>${esc(P.look)}</p>`:''}
     ${changed?`<p class="tid-change">Changed from <b>${esc(PERS[hist.prev].name)}</b> on ${fmtD(new Date(hist.since))}, after your latest ratings.</p>`:''}
     <div class="tid-stats"><div><b>${r.length}</b><span>rated</span></div><div><b>${loved.length}</b><span>loved or liked</span></div><div><b>${origins.size}</b><span>origins</span></div><div><b>${state.shelf.length}</b><span>on shelf</span></div></div>
     <div class="balance">${ATTRS.map(([k,n,lo,hi])=>`<div class="bal"><span class="bn">${n}</span><div class="bt">${p&&p[k]?`<span class="bm bm-pick" style="left:${pos(p[k])}" title="Your quiz answer"></span>`:''}${likedAvg[k]!=null?`<span class="bm bm-liked" style="left:${pos(likedAvg[k])}" title="Coffees you liked"></span>`:''}</div><span class="be"><span>${lo}</span><span>${hi}</span></span></div>`).join('')}
       <div class="legend"><span><i class="lg-pick"></i>Your quiz answers</span><span><i class="lg-liked"></i>Coffees you liked</span></div></div>
     <p class="tid-basis">Based on ${r.length} rating${r.length===1?'':'s'}${p?` and your quiz, which now counts for ${quizShare}%`:''}. It updates every time you rate a coffee.</p>
     ${shapers.length?`<div class="shapers"><span class="muted">Shaped most by</span>${shapers.map(e=>`<button class="chip" data-act="open" data-id="${e.id}"><i class="sd v-${e.verdict}"></i>${esc(e.name)}</button>`).join('')}</div>`:''}
     <div class="actions"><button class="btn ghost small" data-act="types">All personalities</button><button class="btn ghost small" data-act="bulk">Add past coffees</button><button class="btn quiet small" data-act="quiz">Retake quiz</button></div>
   </div>
   <div class="tid-r">${radar(T)}</div>
  </div>`;
}
function openTypes(){
  const T=target(),P=T.ready?personality(T):null;const pct=k=>P?.close.find(c=>c.key===k)?.pct;
  openSheet(`${head('Coffee Personalities')}<h3>${Object.keys(PERS).length-1} coffee personalities</h3><p class="lead">Everyone gets the one their ratings sit closest to. Rate more coffees and yours can change.</p>
   <div class="types">${Object.entries(PERS).filter(([k])=>k!=='newbie').map(([k,v])=>`<div class="type ${P&&P.key===k?'me':''}"><div class="type-h"><b>${esc(v.name)}</b>${P&&P.key===k?'<span class="vtag v-loved">You</span>':pct(k)!=null?`<span class="muted">${pct(k)}% like you</span>`:''}</div><p>${esc(v.text)}</p>${v.look?`<p class="muted">${esc(v.look)}</p>`:''}</div>`).join('')}</div>`);
}
/* ---------- explore ---------- */
let xf='all',xAll=false;
const XF=[['all','All'],['top','Top matches'],['light','Light roast'],['medium','Medium'],['dark','Dark'],['fruity','Fruity'],['chocolate','Chocolatey'],['natural','Natural'],['washed','Washed'],['india','Grown in India'],['world','Other origins'],['budget','Under ₹600']];
const keyOf=p=>((p.roaster||'')+'|'+(p.name||'')).toLowerCase();
const inJournal=p=>state.journal.find(e=>(p.id&&e.catalogId===p.id)||keyOf(e)===keyOf(p));
function diversify(L){const out=[],rest=L.slice();while(rest.length){let i=rest.findIndex(x=>!(out.length>=2&&out[out.length-1].p.roaster===x.p.roaster&&out[out.length-2].p.roaster===x.p.roaster));if(i<0)i=0;out.push(rest.splice(i,1)[0]);}return out;}
function exploreList(){
  const hidden=new Set(state.settings.hidden||[]);
  let L=state.cat.filter(p=>p.available&&!hidden.has(keyOf(p))&&!hidden.has(p.id)).map(p=>({p,m:match(p)}));
  L.sort((a,b)=>(b.m?.score||0)-(a.m?.score||0)||(a.p.price250||9e9)-(b.p.price250||9e9));
  const f=xf;
  L=L.filter(({p,m})=>{const r=ROASTN(p.roastLevel),fm=famsOf(p.notes),pr=(p.process||'').toLowerCase(),o=(p.origin||'').toLowerCase();
    if(f==='top')return m&&m.score>=75;if(f==='light')return r==='light';if(f==='medium')return r==='medium';if(f==='dark')return r==='medium-dark'||r==='dark';
    if(f==='fruity')return fm.has('fruity')||fm.has('citrus');if(f==='chocolate')return fm.has('chocolate')||fm.has('nutty');
    if(f==='natural')return /natural|anaerobic|carbonic/.test(pr);if(f==='washed')return /washed/.test(pr);
    if(f==='india')return o.includes('india');if(f==='world')return o&&!o.includes('india');if(f==='budget')return (p.price250||p.price)&&(p.price250||p.price)<600;return true;});
  return diversify(L).map(x=>Object.assign(x,{saved:!!inJournal(x.p)}));
}
function xcard({p,m,saved}){
  return`<article class="xcard" data-act="coffee" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)}, ${esc(p.roaster)}. Open details">
    <div class="x-img">${p.image?`<img src="${esc(imgW(p.image,480))}" alt="" loading="lazy" decoding="async">`:beanIcon()}${m?`<span class="x-ring">${ring(m.score,58,m.cls)}</span>`:''}${saved?'<span class="x-saved">Saved</span>':''}</div>
    <div class="x-body">${m?`<span class="x-lbl m-${m.cls}">${m.lbl}</span>`:''}
      <h4>${esc(p.name)}</h4><div class="by">${esc(p.roaster)}</div>
      <div class="x-origin"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.4" fill="currentColor"/></svg>${esc(originLine(p))}</div>
      <div class="chips">${p.roastLevel?`<span class="chip static">${esc(cap(p.roastLevel))}</span>`:''}${p.process?`<span class="chip static">${esc(p.process)}</span>`:''}${(p.notes||[]).slice(0,2).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
      <div class="x-foot"><span class="price">${esc(priceText(p))}</span><span class="x-more">Details</span></div></div>
  </article>`;
}
let XL=[];
function renderExplore(){
  const el=$('#explore-body');if(!el)return;
  XL=exploreList();const LIM=24;
  const st=state.catState;
  const body=st==='loading'?`<div class="rail-empty"><p>Loading coffees from Indian roasters…</p></div>`
    :st==='error'?`<div class="rail-empty"><p>Couldn’t load the coffee list.</p><button class="btn ghost small" data-act="reload-cat">Try again</button></div>`
    :!state.cat.length?`<div class="rail-empty"><p>The coffee list is being built from roasters’ shops. Check back in a little while.</p></div>`
    :!XL.length?`<p class="muted">Nothing matches this filter.</p>`
    :xAll?`<div class="xgrid">${XL.map(xcard).join('')}</div>`
    :`<div class="rail" tabindex="0" aria-label="Coffee matches">${XL.slice(0,LIM).map(xcard).join('')}${XL.length>LIM?`<button class="xcard xmore" data-act="xall"><b>See all ${XL.length}</b><span class="muted">coffees in this list</span></button>`:''}</div>`;
  const roasters=new Set(state.cat.map(c=>c.roaster)).size;
  el.innerHTML=`<div class="filters" role="group" aria-label="Filter">${XF.map(([k,l])=>`<button class="fchip" data-xf="${k}" aria-pressed="${xf===k}">${l}</button>`).join('')}</div>
   ${body}
   ${xAll&&XL.length?`<button class="btn ghost small" data-act="xall">Show fewer</button>`:''}
   ${state.cat.length?`<p class="muted fine">${state.cat.length} coffees from ${roasters} roasters. Prices, photos and links come from each roaster’s shop and are refreshed daily. Matches update every time you rate a coffee.</p>`:''}`;
  el.querySelectorAll('[data-xf]').forEach(b=>b.onclick=()=>{xf=b.dataset.xf;xAll=false;renderExplore();});
  $('#mmBtn').disabled=!XL.some(x=>!x.saved);
}
/* ---------- coffee details ---------- */
function bars(p){return`<div class="cbars">${ATTRS.map(([k,n,lo,hi])=>{const v=p[k]??p.attrs?.[k];return`<div class="cbar"><span>${n}</span><i>${[1,2,3,4,5].map(x=>`<b class="${v&&x<=v?'on':''}"></b>`).join('')}</i><em>${v?v+' of 5':'–'}</em></div>`;}).join('')}</div>`;}
function entryFrom(p,status){
  return{id:uid(),createdAt:Date.now(),status,photo:null,image:p.image||null,url:p.url||'',catalogId:p.catalogId||p.id||null,name:p.name,roaster:p.roaster||'',origin:[p.region,p.origin].filter(Boolean).join(', '),process:p.process||'',roastLevel:p.roastLevel||'',tastingNotes:p.notes||[],aroma:'',
    attrs:{acidity:p.acidity||null,body:p.body||null,sweetness:p.sweetness||null,bitterness:p.bitterness||null},packagingSays:p.summary||'',source:'roaster',brewTip:'',ratings:{},verdict:null,myNotes:'',
    buy:{price:p.price||null,packG:p.packG||null,priceText:priceText(p)},brew:(state.prefs?.brew||[]).find(x=>x!=='unsure')||'pourover'};
}
function openCoffee(p){
  if(!p)return;const m=match(p);const saved=inJournal(p);
  const row=(k,v)=>`<div class="spec"><span>${k}</span>${v?`<b>${esc(v)}</b>`:'<i>Not stated</i>'}</div>`;
  const imgs=(p.images||[p.image]).filter(Boolean).slice(0,4);
  openSheet(`${head('Coffee details')}
   <div class="cd">
    <div class="cd-gal${imgs.length>1?' multi':''}">${imgs.length?imgs.map((u,i)=>`<img src="${esc(imgW(u,900))}" alt="${i?'':'Packaging of '+esc(p.name)}" ${i?'loading="lazy"':''}>`).join(''):`<div class="cd-noimg">${beanIcon()}</div>`}</div>
    <div class="cd-head"><span class="kicker">${esc(p.roaster)}</span><h3>${esc(p.name)}</h3>
      ${p.summary?`<p class="cd-sum">${esc(p.summary)}</p>`:''}
      <div class="cd-price"><b>${esc(priceText(p))}</b>${p.price250&&p.packG&&p.packG!==250?`<span class="muted">≈ ₹${p.price250} per 250 g</span>`:''}${p.available===false?'<span class="vtag v-dislike">Out of stock</span>':''}</div>
      <div class="actions">${p.url?`<a class="btn accent" href="${esc(p.url)}" target="_blank" rel="noopener">Buy from ${esc(p.roaster)} ↗</a>`:''}<a class="btn ghost small" href="${amazon(p)}" target="_blank" rel="noopener">Search on Amazon.in</a></div>
    </div>
   </div>
   ${m?`<div class="matchbox">${matchBadge(m)}<ul>${m.pros.map(x=>`<li>${esc(x)}</li>`).join('')}${m.cons.map(x=>`<li class="con">${esc(x)}</li>`).join('')}${!m.pros.length&&!m.cons.length?'<li>Not enough detail to compare yet</li>':''}</ul></div>`:''}
   <div class="specs">
    <section><h4>Origin</h4>${row('Country',p.origin)}${row('Region',p.region)}${row('Estate / farm',p.estate)}${row('Altitude',p.altitude)}</section>
    <section><h4>The bean</h4>${row('Variety',p.variety)}${row('Grade',p.grade)}${row('Process',p.process)}${p.processDetail?`<p class="spec-note">${esc(p.processDetail)}</p>`:''}${row('Type',p.blend==null?'':p.blend?'Blend':'Single origin')}</section>
    <section class="wide"><h4>Roast and taste</h4>${row('Roast level',p.roastLevel?cap(p.roastLevel):'')}${row('Tasting notes',(p.notes||[]).join(', '))}${bars(p)}</section>
   </div>
   <p class="muted fine">From ${esc(p.roaster)}’s ${p.source==='web'?'website':'shop'}${p.updatedAt?', checked '+fmtD(new Date(p.updatedAt)):''}. “Not stated” means the roaster doesn’t say. Taste scores are estimated from the roaster’s description.</p>
   <div class="sheet-foot"><span class="actions">${saved?'':`<button class="btn quiet small" id="cdHide">Not for me</button>`}</span><span class="actions"><button class="btn ghost" id="cdRate">I’ve tried it: rate it</button><button class="btn accent" id="cdSave" ${saved?'disabled':''}>${saved?'Saved to try':'Save to try'}</button></span></div>`);
  const sv=$('#cdSave');sv.onclick=()=>{savePick(p);sv.textContent='Saved to try';sv.disabled=true;};
  const hd=$('#cdHide');if(hd)hd.onclick=()=>{hidePick(p);closeSheet();toast('Hidden from Explore');};
  $('#cdRate').onclick=()=>{const ex=inJournal(p);draft=ex||Object.assign(entryFrom(p,null),{_new:true});renderRate();};
}
/* ---------- search: the catalogue first, then the web ---------- */
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9₹ ]+/g,' ');
function searchCat(q,n){
  const toks=norm(q).split(' ').filter(t=>t.length>1);if(!toks.length)return[];
  return state.cat.map(p=>{const F=[[norm(p.name),3],[norm(p.roaster),2.5],[norm([p.origin,p.region,p.estate].join(' ')),1.6],[norm([p.process,p.variety,(p.notes||[]).join(' '),p.roastLevel].join(' ')),1]];
    let sc=0;for(const t of toks){let best=0;for(const[f,w]of F){if(f.split(' ').some(x=>x.startsWith(t)))best=Math.max(best,w);else if(f.includes(t))best=Math.max(best,w*.6);}if(!best)return null;sc+=best;}
    return{p,sc:sc+(p.available?.5:0)};}).filter(Boolean).sort((a,b)=>b.sc-a.sc).slice(0,n||8).map(x=>x.p);
}
function initSearch(){
  const q=$('#xq'),box=$('#xres');if(!q)return;q.placeholder=SITE.sections?.explore?.search||q.placeholder;
  let h=null;
  const draw=()=>{const v=q.value.trim();if(v.length<2){box.hidden=true;box.innerHTML='';return;}
    const R=searchCat(v,8);
    box.innerHTML=(R.length?R.map(p=>{const m=match(p);return`<button class="xr" data-act="coffee" data-id="${esc(p.id)}"><span class="xr-img">${p.image?`<img src="${esc(imgW(p.image,120))}" alt="">`:''}</span><span class="xr-t"><b>${esc(p.name)}</b><span>${esc(p.roaster)} · ${esc(originLine(p))}${p.price?' · '+esc(priceText(p)):''}</span></span>${m?`<span class="xr-m m-${m.cls}">${m.score}%</span>`:''}</button>`;}).join(''):`<p class="xr-none">No coffee called “${esc(v)}” in our list yet.</p>`)
      +`<button class="xr xr-web" data-act="websearch"><span class="xr-img">↗</span><span class="xr-t"><b>${R.length?'Not the one? ':''}Search the web for “${esc(v)}”</b><span>Finds it on roasters’ sites and checks the link works</span></span></button>`;
    box.hidden=false;};
  q.oninput=()=>{clearTimeout(h);h=setTimeout(draw,90);};
  q.onfocus=draw;
  q.onkeydown=e=>{if(e.key==='Escape'){q.value='';draw();q.blur();}if(e.key==='Enter'){const f=box.querySelector('.xr');if(f)f.click();}};
  document.addEventListener('click',e=>{if(!e.target.closest('.xsearch'))box.hidden=true;});
}
async function webSearch(){
  const v=$('#xq').value.trim();if(!v)return;$('#xres').hidden=true;
  openSheet(`${head('Search the web')}<h3>“${esc(v)}”</h3><p class="lead">Looking on roasters’ websites and checking every link opens…</p><div class="wres"><i class="spin"></i></div>`);
  if(!sample){$('.wres').innerHTML='<p class="muted">Web search works once you’re signed in on the live site.</p>';return;}
  try{
    const R=await API.ai('find',{q:v});
    const el=$('.wres');if(!el)return;
    el.innerHTML=R.length?R.map((it,i)=>`<div class="wr"><span class="xr-img">${it.image?`<img src="${esc(imgW(it.image,160))}" alt="">`:beanIcon()}</span><div class="wr-t"><b>${esc(it.name)}</b><span class="muted">${esc(it.roaster||new URL(it.url).host)}${it.price_inr?' · ₹'+it.price_inr+(it.pack_g?' / '+it.pack_g+' g':''):it.price_text?' · '+esc(it.price_text):''}</span>
      <span class="wr-a"><a class="btn ghost small" href="${esc(it.url)}" target="_blank" rel="noopener">Open page ↗</a><button class="btn accent small" data-w="${i}">Save to try</button></span></div></div>`).join(''):`<p class="muted">Nothing for sale turned up for “${esc(v)}”. Try the roaster’s name with the coffee’s name.</p>`;
    sheet.querySelector('.lead').textContent=R.length?'Each link below opened when we checked it. Saving adds the coffee to your journal and to CoffeeKo’s list for everyone.':'';
    el.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{const it=R[+b.dataset.w];savePick({id:it.catalogId,name:it.name,roaster:it.roaster,origin:it.origin,process:it.process,roastLevel:it.roast_level,notes:it.notes,image:it.image,url:it.url,price:it.price_inr,packG:it.pack_g,priceText:it.price_text});b.textContent='Saved';b.disabled=true;});
    loadCatalog(true);
  }catch(e){const el=$('.wres');if(el)el.innerHTML=`<p class="status err">${esc(errMsg(e))}</p>`;}
}
/* ---------- similar coffees after a rating (from the catalogue, no AI) ---------- */
function similarTo(e,n){
  if(!state.cat.length||!e.verdict)return[];
  const liked=['loved','liked'].includes(e.verdict);
  const v={a:perceived(e,'acidity'),b:perceived(e,'body'),s:perceived(e,'sweetness'),t:perceived(e,'bitterness'),r:roastNum(e.roastLevel),f:famsOf(e.tastingNotes)};
  const dist=p=>{let d=0;[['a','acidity'],['b','body'],['s','sweetness'],['t','bitterness']].forEach(([x,k])=>{if(v[x]!=null&&p[k]!=null)d+=(v[x]-p[k])**2;});if(v.r&&roastNum(p.roastLevel))d+=1.3*(v.r-roastNum(p.roastLevel))**2;const pf=famsOf(p.notes);const sh=[...v.f].filter(x=>pf.has(x)).length;d-=sh*.8;return d;};
  let L=state.cat.filter(p=>p.available&&p.id!==e.catalogId&&!inJournal(p)).map(p=>({p,d:dist(p),m:match(p)}));
  L=liked?L.sort((a,b)=>a.d-b.d):L.filter(x=>x.d>3).sort((a,b)=>(b.m?.score||0)-(a.m?.score||0));
  const out=[],seen=new Set();for(const x of L){if(seen.has(x.p.roaster)&&out.length<n-1&&L.length>n*3)continue;seen.add(x.p.roaster);out.push(x.p);if(out.length>=n)break;}
  return out;
}
function miniCard(p){const m=match(p);return`<button class="mini" data-act="coffee" data-id="${esc(p.id)}"><span class="xr-img">${p.image?`<img src="${esc(imgW(p.image,160))}" alt="" loading="lazy">`:''}</span><span class="xr-t"><b>${esc(p.name)}</b><span>${esc(p.roaster)} · ${esc(priceText(p))}</span></span>${m?`<span class="xr-m m-${m.cls}">${m.score}%</span>`:''}</button>`;}
/* ---------- journal ---------- */
const VL=SITE.verdicts;
function jcard(e){
  const m=match(e);
  return`<button class="jcard" data-act="open" data-id="${e.id}">
    <span class="jimg" ${e.photo||e.image?`style="background-image:url('${esc(e.photo||imgW(e.image,400))}')"`:''}>${e.photo||e.image?'':beanIcon()}${m?`<span class="jring">${ring(m.score,46,m.cls)}</span>`:''}</span>
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
   ${S.length?`<div class="rail jrail">${S.map(jcard).join('')}</div>`:`<p class="muted">Save coffees from Explore, search or the Match maker and they’ll wait here.</p>`}`;
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
  if(mmI>=XL.length){openSheet(`${head('Match maker')}<div class="mm-done"><h3>That’s everyone for now.</h3><p class="lead">Your saved coffees are in your journal. Get a fresh set of matches any time.</p><div class="actions"><a class="btn accent" href="#explore" data-close>Back to Explore</a><a class="btn ghost" href="#journal" data-close>See saved coffees</a></div></div>`);return;}
  const {p,m}=XL[mmI];
  openSheet(`${head(`Match maker · ${mmI+1} of ${XL.length}`)}
   <div class="mm-stage"><article class="mm-card" id="mmCard">
     ${p.image?`<div class="mm-img"><img src="${esc(imgW(p.image,600))}" alt="" draggable="false"></div>`:''}
     <div class="mm-ring">${m?ring(m.score,p.image?96:132,m.cls,m.lbl):''}</div>
     <h3>${esc(p.name)}</h3><p class="by">${esc([p.roaster,p.origin].filter(Boolean).join(' · '))}</p>
     <div class="chips center"><span class="chip static">${esc(originLine(p))}</span>${p.roastLevel?`<span class="chip static">${esc(cap(p.roastLevel))} roast</span>`:''}${(p.notes||[]).slice(0,3).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
     ${m?`<ul class="mm-why">${m.pros.map(x=>`<li>${esc(x)}</li>`).join('')}${m.cons.map(x=>`<li class="con">${esc(x)}</li>`).join('')}</ul>`:''}
     ${p.summary?`<p class="why">${esc(p.summary)}</p>`:''}
     <p class="price">${esc(priceText(p))} · <a href="${esc(p.url)}" target="_blank" rel="noopener">View on ${esc(p.roaster)}’s shop ↗</a></p>
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
function hidePick(p){const h=new Set(state.settings.hidden||[]);h.add(p.id||keyOf(p));state.settings.hidden=[...h];saveProfile();renderExplore();}

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
}

/* ---------- picks ---------- */
function savePick(p,quiet){
  if(inJournal(p))return quiet||toast('Already in your journal');
  const e=entryFrom(p,'saved');
  state.journal.unshift(e);saveEntry(e);renderJournal();renderExplore();quiet||toast('Saved to try');
}

/* ---------- scan / entry ---------- */
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
    try{const r=await identify(photoBlob,hint);draft=fromAI(r);linkCat(draft);draft._conf=r.found===false?'low':r.confidence;renderResult(false);}
    catch(e){$('#idStatus').classList.add('err');$('#idStatus').textContent=errMsg(e);g.disabled=false;}
  };
}
function blank(name){return{id:uid(),createdAt:Date.now(),status:null,photo:photoThumb,name:name||'',roaster:'',origin:'',process:'',roastLevel:'',tastingNotes:[],aroma:'',attrs:{acidity:null,body:null,sweetness:null,bitterness:null},packagingSays:'',source:'',brewTip:'',ratings:{},verdict:null,myNotes:'',brew:(state.prefs?.brew||[]).find(x=>x!=='unsure')||'pourover',_new:true};}
/* If a scanned coffee is in the catalogue, attach its shop link and photo */
function linkCat(e){if(!e.name||!state.cat.length)return;const hit=searchCat([e.roaster,e.name].filter(Boolean).join(' '),1)[0];if(!hit)return;
  const rr=norm(e.roaster),hr=norm(hit.roaster);if(rr&&!(rr.includes(hr.split(' ')[0])||hr.includes(rr.split(' ')[0])))return;
  const nt=norm(e.name).split(' ').filter(t=>t.length>2),ht=norm(hit.name);if(nt.length&&nt.filter(t=>ht.includes(t)).length/nt.length<.6)return;
  Object.assign(e,{catalogId:hit.id,url:hit.url,image:hit.image});}
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
  const ph=e.photo||imgW(e.image,300);
  return`<div class="coffee-head"><span class="thumb" ${ph?`style="background-image:url('${esc(ph)}')"`:''}>${ph?'':beanIcon()}</span>
   <div><h3>${esc(e.name||'Unidentified coffee')}</h3><div class="by">${esc([e.roaster,e.origin].filter(Boolean).join(' · '))}</div></div></div>
   <div class="facts">${e.roastLevel?`<span class="chip static">${esc(cap(e.roastLevel))} roast</span>`:''}${e.process?`<span class="chip static">${esc(e.process)}</span>`:''}${(e.tastingNotes||[]).map(n=>`<span class="chip static">${esc(n)}</span>`).join('')}</div>
   ${e.packagingSays?`<p class="bagsays"><span class="src">${e.source==='packaging'?'From the bag':e.source==='knowledge'?'From AI':e.source==='roaster'?'From the roaster':'Bag + AI'}</span>${esc(e.packagingSays)}</p>`:''}
   ${e.brewTip?`<p class="tip">Brew tip: ${esc(e.brewTip)}</p>`:''}`;
}
function matchBox(e){
  const m=match(e);if(!m)return`<div class="matchbox"><span class="muted" style="grid-column:1/-1">Take the taste quiz to see how well coffees match your personality. <button class="btn ghost small" data-act="quiz">Start quiz</button></span></div>`;
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
   <div class="sec"><h4>Where to buy</h4><div class="where">${e.buy?.priceText||e.buy?.priceINR?`<span class="price">${esc(e.buy.priceText||e.buy.priceINR)}</span>`:''}${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.roaster||'Roaster')}’s shop ↗</a>`:''}${e.catalogId&&catById.get(e.catalogId)?`<a href="#" data-act="coffee" data-id="${esc(e.catalogId)}">Full details</a>`:''}<a href="${amazon(e)}" target="_blank" rel="noopener">Search Amazon.in</a></div></div>
   ${(()=>{const S=e.status==='rated'?similarTo(e,3):[];return S.length?`<div class="sec"><h4>${['loved','liked'].includes(e.verdict)?'If you liked this, try':'Try something different'}</h4><div class="minis">${S.map(miniCard).join('')}</div></div>`:'';})()}
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
    e.status='rated';delete e.suggestions;
    commit(e);if(bag){state.shelf.push(bag);saveBag(bag);}
    closeSheet();renderAll();document.getElementById('journal').scrollIntoView({behavior:'smooth'});
    toast(bag?'Rated. Your personality and matches are updated':'Rating saved. Your personality and matches are updated');
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
  const sk=$('#bSkip');if(sk)sk.onclick=()=>{closeSheet();toast(OB.skipToast||'You can add past coffees any time from your Coffee Personality');};
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
      try{const r=await identify(b.blob,'','identify_bulk');const f=fromAI(r);linkCat(f);Object.assign(e,f,{id:e.id,createdAt:e.createdAt,photo:b.thumb,status:'torate',unidentified:r.found===false||!f.name});delete e._new;b.st=e.unidentified?'failed':'done';}
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
    openSheet(`${head('Rate your coffees')}<div class="mm-done"><h3>${rated0?`Nice. ${rated0} coffee${rated0>1?'s':''} rated.`:'All caught up.'}</h3><p class="lead">${rated0?'Your Coffee Personality and matches have been updated.':'Come back whenever you’re ready.'}</p><div class="actions"><a class="btn accent" href="#profile" data-close>See my Coffee Personality</a></div></div>`);return;
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
  return`<div class="remind"><div><b>${n} coffee${n>1?'s are':' is'} waiting for your rating.</b><span>${esc(RM.text||'Every rating updates your Coffee Personality and your matches.')}</span></div>
   <div class="actions"><button class="btn accent small" data-act="rate-deck">Rate now</button><button class="btn quiet small" data-act="snooze">${esc(RM.later||'Remind me later')}</button></div></div>`;
}

/* =================== content & login =================== */
function applyContent(){
  const t=(sel,v)=>{const el=document.querySelector(sel);if(el&&v!=null)el.textContent=v;};
  t('.brand',SITE.brand);document.title=SITE.pageTitle||SITE.brand;
  t('#navApp',SITE.nav?.app);
  const S=SITE.sections||{};t('#navProfile',S.profile?.tab);
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
   <form class="auth-card" id="authForm" novalidate>${authMode==='signin'||authMode==='signup'?`<div class="auth-tabs" role="tablist"><button type="button" role="tab" data-auth="signin" aria-selected="${authMode==='signin'}">Sign in</button><button type="button" role="tab" data-auth="signup" aria-selected="${authMode==='signup'}">Create account</button></div>`:''}<h3>${F.h}</h3>${authMode==='sent'?`<p class="muted">${esc(box.dataset.msg||'')}</p>`:''}
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
function goMyCoffee(){
  if(document.body.classList.contains('signed-in')){document.getElementById('profile').scrollIntoView({behavior:'smooth'});return;}
  if(!['signin','signup'].includes(authMode)||!$('#auth').innerHTML.trim())showAuth('signin');
  $('#auth').scrollIntoView({behavior:'smooth'});
  setTimeout(()=>{const f=$('#aEmail');f&&f.focus({preventScroll:true});},500);
}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');if(!a)return;
  const act=a.dataset.act;
  if(a.tagName==='A'&&['mycoffee','coffee'].includes(act))e.preventDefault();
  if(act==='mycoffee')return goMyCoffee();
  if(act==='coffee'){const p=catById.get(a.dataset.id);if(p)openCoffee(p);return;}
  if(act==='types')return openTypes();
  if(act==='websearch')return webSearch();
  if(act==='xall'){xAll=!xAll;renderExplore();if(!xAll)document.getElementById('explore').scrollIntoView();return;}
  if(act==='reload-cat'){state.catState='loading';renderExplore();loadCatalog(true);return;}
  if(act==='quiz')openQuiz();
  else if(act==='scan')openScan(false);
  else if(act==='manual')openScan(true);
  else if(act==='addbag')openBag(null);
  else if(act==='mm')openMatchmaker();
  else if(act==='bulk')openBulk(false);
  else if(act==='rate-deck')openRateDeck();
  else if(act==='snooze'){state.settings.rateSnoozeUntil=Date.now()+(RM.snoozeDays||3)*DAY;saveProfile();renderProfile();toast(`We’ll remind you in ${RM.snoozeDays||3} days`);}
  else if(act==='hide'){const x=XL[+a.dataset.i];if(x){hidePick(x.p);toast('Hidden from Explore');}}
  else if(act==='open')openEntry(a.dataset.id);
  else if(act==='checked'){state.settings.shelfCheckedAt=Date.now();saveProfile();renderShelf();toast('Shelf marked up to date');}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('article[data-act=coffee]')){e.preventDefault();e.target.click();}});
/* floating buttons: Scan a bag, Back to top */
(function(){const top=$('#toTop'),fabs=$('#fabs');let tk=false;
  const upd=()=>{tk=false;const app=document.getElementById('app').getBoundingClientRect().top;const inApp=app<innerHeight*.5;fabs.classList.toggle('on',inApp&&document.body.classList.contains('signed-in'));top.hidden=!(inApp&&scrollY>document.getElementById('app').offsetTop+innerHeight*.9);};
  addEventListener('scroll',()=>{if(!tk){tk=true;requestAnimationFrame(upd);}},{passive:true});
  top.onclick=()=>{const a=document.getElementById('app');scrollTo({top:a.offsetTop,behavior:'smooth'});};
  new MutationObserver(upd).observe(document.body,{attributes:true,attributeFilter:['class']});})();
initSearch();
$('#signOut').onclick=async()=>{await API.signOut();if(API.demo)toast('Demo mode has no account to sign out of');};
init();
})();
