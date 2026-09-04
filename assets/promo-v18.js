/* M4X STORE V18 — promo countdown */
(()=>{
  const DEADLINE = new Date('2026-09-10T00:30:46+07:00').getTime();
  const pad=n=>String(n).padStart(2,'0');
  function tick(){
    const box=document.getElementById('m4xPromo30');
    if(!box)return;
    let d=DEADLINE-Date.now();
    const ended=d<=0;
    d=Math.max(0,d);
    const day=Math.floor(d/86400000);
    const hour=Math.floor((d%86400000)/3600000);
    const min=Math.floor((d%3600000)/60000);
    const sec=Math.floor((d%60000)/1000);
    const vals={m4xPromoDays:day,m4xPromoHours:hour,m4xPromoMinutes:min,m4xPromoSeconds:sec};
    Object.entries(vals).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=pad(v)});
    const deadline=document.getElementById('m4xPromoDeadline');
    if(deadline)deadline.textContent=ended?'🚀 Ưu đãi đã kết thúc!':'⚠️ Đến 00:30:46 10/09/2026 — hết giờ là hết ưu đãi!';
    box.classList.toggle('m4x-promo-ended',ended);
  }
  window.M4XPromoV18={deadline:DEADLINE,tick};
  tick();
  setInterval(tick,1000);
})();
