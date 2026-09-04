/* =========================================================
   M4X STORE V18.3 — HERO MANAGER (safe overlay)
   Does NOT replace renderStore / product / account logic.
   ========================================================= */
(() => {
  const FALLBACK_PROMO={
    id:'main',enabled:true,variant:'promo',
    eyebrow:'⚡ FLASH SALE · M4X STORE',
    title:'💥 Nạp tiền nhận ngay',accent_text:'+30%',
    description:'👉 Nạp càng nhiều, nhận càng nhiều! Tận dụng ưu đãi để mua sắm Theme, App, AI, Tool và các sản phẩm số tại M4X STORE.',
    primary_button_text:'💰 Nạp ngay hôm nay',primary_action:'topup',primary_url:'',
    secondary_button_text:'',secondary_action:'none',secondary_url:'',
    image_url:'',show_countdown:true,
    starts_at:'2026-09-03T17:00:00.000Z',ends_at:'2026-09-09T17:30:46.000Z',
    auto_restore:true,updated_at:'fallback'
  };

  let heroConfig=FALLBACK_PROMO, defaultHeroHtml='', defaultHeroClass='lux-hero';
  let timer=null, loading=false, lastFetch=0;

  const getSB=()=>{try{return typeof sb!=='undefined'?sb:window.sb}catch{return window.sb}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const validUrl=u=>{try{const x=new URL(String(u||''),location.href);return ['http:','https:'].includes(x.protocol)?x.href:''}catch{return ''}};

  function active(c){
    if(!c||!c.enabled)return false;
    const now=Date.now(),st=c.starts_at?Date.parse(c.starts_at):0,en=c.ends_at?Date.parse(c.ends_at):0;
    if(st&&now<st)return false;
    if(en&&now>=en&&c.auto_restore)return false;
    return true;
  }

  function action(kind,url){
    try{
      const k=String(kind||'none');
      if(k==='search')return document.getElementById('luxSearch')?.focus();
      if(k==='community'&&typeof setView==='function')return setView('community');
      if(k==='account'){
        if(typeof state!=='undefined'&&state?.me&&typeof setView==='function')return setView('account');
        if(typeof M4X!=='undefined'&&typeof M4X.auth==='function')return M4X.auth('login');
      }
      if(k==='topup'){
        if(typeof state!=='undefined'&&!state?.me&&typeof M4X!=='undefined'&&typeof M4X.auth==='function')return M4X.auth('login');
        if(typeof M4X!=='undefined'&&typeof M4X.topup==='function')return M4X.topup(0);
        if(typeof topup==='function')return topup(0);
        if(typeof setView==='function')return setView('account');
      }
      if(k==='url'){
        const u=validUrl(url);if(u)window.open(u,'_blank','noopener,noreferrer');
      }
    }catch(err){console.warn('M4X hero action',err)}
  }

  function parts(ms){
    const d=Math.max(0,ms);
    return [Math.floor(d/86400000),Math.floor((d%86400000)/3600000),Math.floor((d%3600000)/60000),Math.floor((d%60000)/1000)];
  }

  function restore(hero){
    if(!hero)return;
    if(defaultHeroHtml){hero.className=defaultHeroClass;hero.removeAttribute('style');hero.innerHTML=defaultHeroHtml}
    delete hero.dataset.m4xHeroManaged;
    if(timer){clearInterval(timer);timer=null}
  }

  function startCountdown(hero,c){
    if(timer){clearInterval(timer);timer=null}
    if(!c?.show_countdown||!c?.ends_at)return;
    const deadline=Date.parse(c.ends_at);if(!deadline)return;
    const tick=()=>{
      const left=deadline-Date.now(),v=parts(left);
      ['Days','Hours','Minutes','Seconds'].forEach((x,i)=>{const n=hero.querySelector(`#m4xHero${x}`);if(n)n.textContent=String(v[i]).padStart(2,'0')});
      if(left<=0){
        if(timer){clearInterval(timer);timer=null}
        if(c.auto_restore){restore(hero);return}
        const w=hero.querySelector('#m4xHeroDeadline');if(w)w.textContent='Ưu đãi đã kết thúc';
      }
    };
    tick();timer=setInterval(tick,1000);
  }

  function markup(c){
    const p1=c.primary_button_text?`<button type="button" class="btn lux-primary m4x-hero-btn" data-m4x-action="${esc(c.primary_action||'none')}" data-m4x-url="${esc(c.primary_url||'')}">${esc(c.primary_button_text)}</button>`:'';
    const p2=c.secondary_button_text?`<button type="button" class="btn ghost m4x-hero-btn" data-m4x-action="${esc(c.secondary_action||'none')}" data-m4x-url="${esc(c.secondary_url||'')}">${esc(c.secondary_button_text)}</button>`:'';
    const countdown=c.show_countdown&&c.ends_at?`<div class="m4x-hero-timer"><div><b id="m4xHeroDays">00</b><small>Ngày</small></div><div><b id="m4xHeroHours">00</b><small>Giờ</small></div><div><b id="m4xHeroMinutes">00</b><small>Phút</small></div><div><b id="m4xHeroSeconds">00</b><small>Giây</small></div></div>`:'';
    const until=c.ends_at?new Date(c.ends_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'';
    return `<div class="m4x-hero-grid ${c.image_url?'has-image':''}"><div class="lux-hero-copy m4x-hero-copy">${c.eyebrow?`<span class="lux-eyebrow m4x-hero-eyebrow"><i></i>${esc(c.eyebrow)}</span>`:''}<h1>${esc(c.title||'')} ${c.accent_text?`<span>${esc(c.accent_text)}</span>`:''}</h1>${c.description?`<p>${esc(c.description)}</p>`:''}${countdown}${(p1||p2)?`<div class="lux-hero-actions">${p1}${p2}</div>`:''}${until&&c.variant==='promo'?`<div class="m4x-hero-deadline" id="m4xHeroDeadline">⚠️ Kết thúc: ${esc(until)}</div>`:''}</div>${c.image_url?'<div class="m4x-hero-media" aria-hidden="true"></div>':''}</div>`;
  }

  function apply(){
    const hero=document.querySelector('.lux-hero');if(!hero)return;
    if(!defaultHeroHtml&&!hero.dataset.m4xHeroManaged){defaultHeroHtml=hero.innerHTML;defaultHeroClass=hero.className}
    const c=heroConfig;
    if(!active(c)){if(hero.dataset.m4xHeroManaged)restore(hero);return}
    const key=String(c.updated_at||JSON.stringify(c));if(hero.dataset.m4xHeroManaged===key)return;
    hero.className=`${defaultHeroClass} m4x-managed-hero m4x-hero-${esc(c.variant||'custom')}`;
    hero.innerHTML=markup(c);hero.dataset.m4xHeroManaged=key;
    const media=hero.querySelector('.m4x-hero-media'),img=validUrl(c.image_url);
    if(media&&img)media.style.backgroundImage=`url("${img.replace(/"/g,'%22')}")`;
    hero.querySelectorAll('.m4x-hero-btn').forEach(b=>b.onclick=()=>action(b.dataset.m4xAction,b.dataset.m4xUrl));
    startCountdown(hero,c);
  }

  async function load(force=false){
    if(loading)return;if(!force&&Date.now()-lastFetch<5000)return;loading=true;lastFetch=Date.now();
    try{
      const client=getSB();if(!client){apply();return}
      const {data,error}=await client.from('store_hero_settings').select('*').eq('id','main').maybeSingle();
      if(error){console.warn('M4X Hero Manager: dùng fallback',error.message||error)}else heroConfig=data||{enabled:false};
      apply();
    }catch(err){console.warn('M4X Hero Manager',err);apply()}finally{loading=false}
  }

  const observer=new MutationObserver(()=>apply());
  observer.observe(document.getElementById('view')||document.body,{childList:true,subtree:true});
  setTimeout(()=>load(true),80);setTimeout(()=>load(true),700);setInterval(()=>load(true),10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(true)});
  setTimeout(()=>{try{const client=getSB();client?.channel?.('m4x-store-hero-v183')?.on?.('postgres_changes',{event:'*',schema:'public',table:'store_hero_settings'},()=>load(true))?.subscribe?.()}catch{}},1200);
  window.M4XHeroV183={reload:()=>load(true),restore:()=>restore(document.querySelector('.lux-hero'))};
})();
