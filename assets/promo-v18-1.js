/* M4X STORE V18.1 — Luxury V16-safe promo injection */
(()=>{
  const DEADLINE=new Date('2026-09-10T00:30:46+07:00').getTime();
  const HTML=`<section class="m4x-promo30" id="m4xPromo30" aria-label="Khuyến mãi nạp tiền M4X STORE">
    <div class="m4x-promo-glow"></div>
    <div class="m4x-promo-tag">⚡ FLASH SALE · NẠP TIỀN +30%</div>
    <div class="m4x-promo-main">
      <div>
        <h2 class="m4x-promo-title">💥 Nạp tiền nhận ngay <strong>+30%</strong></h2>
        <p class="m4x-promo-sub">Nạp càng nhiều, nhận càng nhiều. Tăng số dư để mua sắm thoải mái tại <b>M4X STORE</b>.</p>
        <div class="m4x-promo-timer">
          <div class="m4x-promo-time"><span class="m4x-promo-num" data-promo-part="days">00</span><span class="m4x-promo-label">Ngày</span></div>
          <div class="m4x-promo-time"><span class="m4x-promo-num" data-promo-part="hours">00</span><span class="m4x-promo-label">Giờ</span></div>
          <div class="m4x-promo-time"><span class="m4x-promo-num" data-promo-part="minutes">00</span><span class="m4x-promo-label">Phút</span></div>
          <div class="m4x-promo-time"><span class="m4x-promo-num" data-promo-part="seconds">00</span><span class="m4x-promo-label">Giây</span></div>
        </div>
      </div>
      <div class="m4x-promo-actions">
        <button class="m4x-promo-btn" type="button" data-m4x-promo-topup>💰 Nạp ngay hôm nay</button>
        <div class="m4x-promo-deadline" data-promo-deadline>⚠️ Đến 00:30:46 10/09/2026 — hết giờ là hết ưu đãi!</div>
      </div>
    </div>
  </section>`;
  const pad=n=>String(n).padStart(2,'0');
  let queued=false;

  function ensure(){
    queued=false;
    if(document.getElementById('m4xPromo30'))return tick();
    // Luxury V16 hiện tại: chèn ngay sau hero "Sản phẩm số được chọn lọc."
    const hero=document.querySelector('#view .lux-store .lux-hero, .lux-store .lux-hero');
    if(hero){hero.insertAdjacentHTML('afterend',HTML);return tick();}
    // Tương thích các build cũ nếu Luxury chưa render.
    const generic=document.querySelector('#view .m4x-v12-hero, #view .hero, main .hero, .hero');
    if(generic){generic.insertAdjacentHTML('afterend',HTML);return tick();}
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(ensure)}
  function tick(){
    const box=document.getElementById('m4xPromo30');
    if(!box)return;
    let left=DEADLINE-Date.now();
    const ended=left<=0; left=Math.max(0,left);
    const vals={days:Math.floor(left/86400000),hours:Math.floor((left%86400000)/3600000),minutes:Math.floor((left%3600000)/60000),seconds:Math.floor((left%60000)/1000)};
    for(const [k,v] of Object.entries(vals)){const e=box.querySelector(`[data-promo-part="${k}"]`);if(e)e.textContent=pad(v)}
    const d=box.querySelector('[data-promo-deadline]');
    if(d)d.textContent=ended?'Ưu đãi +30% đã kết thúc.':'⚠️ Đến 00:30:46 10/09/2026 — hết giờ là hết ưu đãi!';
    box.classList.toggle('m4x-promo-ended',ended);
  }
  function openTopup(){
    if(Date.now()>=DEADLINE)return;
    try{if(window.M4X&&typeof M4X.topup==='function')return M4X.topup(0)}catch(e){}
    try{if(typeof window.topup==='function')return window.topup(0)}catch(e){}
    try{if(typeof window.setView==='function')return window.setView('account')}catch(e){}
    location.hash='#account';
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-m4x-promo-topup]'))openTopup()});
  const start=()=>{
    ensure();
    const root=document.getElementById('view')||document.body;
    new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
    setInterval(tick,1000);
    setTimeout(ensure,300);setTimeout(ensure,1000);setTimeout(ensure,2500);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.M4XPromoV181={deadline:DEADLINE,ensure,tick};
})();
