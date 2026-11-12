/* Scroll story. Content comes from config/content.js */
/* =========================================================
   STORY
   ========================================================= */
(function(){
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
/* Each stage: photo file, scroll range [a,b] (0–1 of the story), focus point for zooming, caption. */
const SITE=window.SITE;
/* Phones and tablets get lighter photos from photos/m/ (about 1800 px, still sharp
   on high-density screens); laptops and big screens get the 4K set. Loading 4K
   photos on phones used to make the first visit slow or crash. */
const DIR=Math.max(screen.width||0,screen.height||0,innerWidth,innerHeight)<=1100?'photos/m/':'photos/';
/* Build stages from config/content.js. Scroll ranges are spread evenly. */
const RAW=SITE.story;
const Z0=RAW[0].zoomInto||{photoWidth:3983,photoHeight:5233,x:1700,y:3250,closeup:'01-roasted-bean-crease',closeupWidth:1800,closeupHeight:1200};
const n=RAW.length-1, w=(1.01-.115)/n;
const STAGES=RAW.map((r,i)=>{
  const s={f:r.photo,by:r.credit,url:r.creditUrl,focus:r.focus||'50% 50%',alt:r.alt||'',h:r.title,t:r.text,cta:r.button};
  if(i===0)Object.assign(s,{a:0,b:.13,detail:Z0.closeup,detailFocus:'50% 50%',IW:Z0.photoWidth,IH:Z0.photoHeight,cx:Z0.x/Z0.photoWidth,cy:Z0.y/Z0.photoHeight,DW:Z0.closeupWidth,DH:Z0.closeupHeight});
  else{s.a=.115+(i-1)*w;s.b=i===n?1.01:s.a+w+.012;}
  return s;
});
document.querySelector('#hero h1').textContent=SITE.hero.title;
document.querySelector('#hero p').textContent=SITE.hero.sub;
document.querySelector('#hero .scroll-cue').lastChild.textContent=SITE.hero.scrollLabel||'Scroll';
if(SITE.hero.button)document.querySelector('#hero .hero-cta').textContent=SITE.hero.button;
document.querySelector('#hero .hero-note').textContent=SITE.hero.buttonNote||'';
const wrap=document.getElementById('photos'), capWrap=document.getElementById('captions'), meter=document.getElementById('meter');
STAGES.forEach((s,i)=>{
  const d=document.createElement('div');d.className='ph';
  const img=new Image();img.alt=s.alt;img.decoding='async';
  img.style.objectPosition=s.focus;img.style.transformOrigin=s.focus;
  img.onerror=()=>{if(!img.dataset.tried){img.dataset.tried=1;img.src='photos/'+s.f+'.jpg';}else{d.classList.add('missing');d.dataset.label='Photo: '+s.alt;}};
  s.src=DIR+s.f+'.jpg';if(i===0)img.src=s.src;     /* other photos load just before they are needed */
  d.appendChild(img);wrap.appendChild(d);s.el=d;s.img=img;
  if(s.detail){d.classList.add('bean');img.classList.add('main');img.style.transformOrigin=`${s.cx*100}% ${s.cy*100}%`;const di=new Image();di.alt='';di.className='detail';di.decoding='async';s.dsrc=DIR+s.detail+'.jpg';di.style.transformOrigin=s.detailFocus;di.style.objectPosition=s.detailFocus;d.appendChild(di);s.det=di;}
  if(s.h){const c=document.createElement('div');c.className='caption';c.innerHTML='';const hb=document.createElement('b');hb.textContent=s.h;c.appendChild(hb);c.appendChild(document.createTextNode(s.t||''));if(s.cta){c.appendChild(document.createElement('br'));const a=document.createElement('a');a.className='cta';a.href='#profile';a.dataset.act='mycoffee';a.textContent=s.cta;c.appendChild(a);}capWrap.appendChild(c);s.cap=c;}
  meter.appendChild(document.createElement('i'));
});
const line=document.createElement('div');line.className='story-line';document.getElementById('stage').appendChild(line);
const stage=document.getElementById('stage'), credit=document.getElementById('credit'), shade=document.querySelector('.shade'), hero=document.getElementById('hero'), story=document.getElementById('story'), bar=document.getElementById('bar');
/* Load photos in order, a little ahead of the scroll position */
function want(P){STAGES.forEach((s,i)=>{if(i&&!s.img.src&&P>s.a-.45)s.img.src=s.src;if(s.det&&!s.det.src&&P>.004)s.det.src=s.dsrc;});}
addEventListener('load',()=>{const q=STAGES.filter((s,i)=>i);let k=0;const next=()=>{const s=q[k++];if(!s)return;if(!s.img.src)s.img.src=s.src;setTimeout(()=>window.requestIdleCallback?requestIdleCallback(next,{timeout:600}):next(),150);};   /* the story is short now, so fetch every photo early */
  const first=STAGES[0];if(first.det&&!first.det.src)first.det.src=first.dsrc;setTimeout(next,400);});
/* "Skip story": jump straight to CoffeeKo from anywhere in the story */
const skip=document.createElement('button');skip.className='story-skip';skip.type='button';skip.hidden=true;skip.textContent='Skip story ↓';
skip.onclick=()=>{const app=document.getElementById('app');if(app)scrollTo({top:app.offsetTop,behavior:'smooth'});};document.body.appendChild(skip);
function render(){
  const r=story.getBoundingClientRect();
  const P=clamp(-r.top/(story.offsetHeight-innerHeight));want(P);skip.hidden=!(P>.02&&P<.93);
  const onStory=r.bottom>60;
  bar.classList.toggle('on-story',onStory);bar.classList.toggle('on-app',!onStory);
  shade.style.opacity=ss(.1,.135,P);line.style.width=(P*100).toFixed(2)+'%';
  hero.style.opacity=1-ss(0,.03,P);hero.style.visibility=P>.04?'hidden':'visible';hero.style.transform=`translateY(${-ss(0,.03,P)*30}px)`;
  let cur=0;
  STAGES.forEach((s,i)=>{
    const fin=i===0?1:ss(s.a,s.a+.02,P);
    const fout=i===STAGES.length-1?1:1-ss(s.b-.02,s.b,P);
    const o=Math.min(fin,fout);
    s.el.style.opacity=o;s.el.style.visibility=o<=0.001?'hidden':'visible';
    const local=clamp((P-s.a)/(s.b-s.a));
    let sc;
    if(i===0){
      const vw=innerWidth, vh=stage.clientHeight, portrait=vw/vh<1.3;
      let dW,dH,L,T;
      if(portrait){
        const heroTop=hero.getBoundingClientRect().top+(parseFloat(hero.style.transform.replace(/[^\d.-]/g,''))||0)*-1;
        const room=Math.max(vh*.35,Math.min(heroTop,vh*.62)-24-64);        /* space between the top bar and the headline */
        dH=Math.min(room/.52, (vw*.8)/.41*s.IH/s.IW);                      /* bean is ~45% of the photo's height, ~41% of its width */
        dW=dH*s.IW/s.IH;
        L=vw/2-.475*dW; T=64+room/2-.645*dH;
      }
      else{dH=vh*1.04;dW=dH*s.IW/s.IH;L=vw*.68-dW*s.cx;T=(vh-dH)/2;}
      const c=Math.max(vw/s.DW,vh/s.DH);
      const Zmax=2.4*s.IH*c/dH;
      const z=ss(.02,.125,P), Z=Math.exp(Math.log(Zmax)*z*z), k=ss(.02,.07,P);
      const px=L+s.cx*dW, py=T+s.cy*dH;
      const qx=px+(vw/2-px)*k, qy=py+(vh/2-py)*k;
      const W=dW*Z, H=dH*Z;
      const st=s.img.style;st.transform='none';st.width=W+'px';st.height=H+'px';st.left=(qx-s.cx*W)+'px';st.top=(qy-s.cy*H)+'px';
      if(s.det){const dd=Z*dH/(s.IH*c);const ds=s.det.style;ds.opacity=ss(1,1.2,dd);if(dd>.95){const w2=s.DW*c*Math.max(1,dd),h2=s.DH*c*Math.max(1,dd);ds.width=w2+'px';ds.height=h2+'px';ds.left=(vw-w2)/2+'px';ds.top=(vh-h2)/2+'px';}}
    } else {
      sc=lerp(1.03,1.15,local);
      if(s.img)s.img.style.transform=`scale(${sc})`;
    }
    if(s.cap){const co=ss(s.a+.015,s.a+.028,P)*(i===STAGES.length-1?1:1-ss(s.b-.03,s.b-.018,P));s.cap.style.opacity=co;s.cap.style.transform=`translateY(${(1-co)*10}px)`;s.cap.classList.toggle('live',co>.5);}
    if(P>=s.a+.01)cur=i;
  });
  [...meter.children].forEach((e,i)=>e.classList.toggle('on',i===cur));
  if(credit.dataset.i!=String(cur)){credit.dataset.i=cur;const st=STAGES[cur];credit.innerHTML='';if(st.by){credit.append('Photo: ');const a=document.createElement('a');a.href=st.url||'#';a.textContent=st.by;a.target='_blank';a.rel='noopener';credit.append(a);if((st.url||'').includes('unsplash'))credit.append(' on Unsplash');}}
}
let ticking=false;
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(()=>{ticking=false;render();});}},{passive:true});
addEventListener('resize',render);
render();

/* Clean stop at the end of the story: a fast flick that started in the story and carried past it
   settles exactly at the top of CoffeeKo (sign-up form or Personality), never halfway into it.
   Scrolling up, or scrolling that starts inside CoffeeKo, is never moved. */
{let startY=null,idle,touching=false;const appEl=document.getElementById('app');
 addEventListener('touchstart',()=>{touching=true;},{passive:true});addEventListener('touchend',()=>{touching=false;},{passive:true});
 const settle=()=>{const y=scrollY,s0=startY;startY=null;if(touching||s0===null||!appEl||document.documentElement.classList.contains('app-resume'))return;
   if(document.body.style.overflow==='hidden')return;   // a sheet or full-screen view is open
   const top=appEl.offsetTop,vh=innerHeight;
   if(s0<top-vh*.2&&y>s0&&y>top-vh*.5&&y<top+vh*.9&&Math.abs(y-top)>4)scrollTo({top,behavior:'smooth'});};
 addEventListener('scroll',()=>{if(startY===null)startY=scrollY;clearTimeout(idle);idle=setTimeout(settle,'onscrollend' in window?400:160);},{passive:true});
 if('onscrollend' in window)addEventListener('scrollend',()=>{clearTimeout(idle);settle();});}
})();
