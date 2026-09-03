/* M4X CSKH FLOAT V11.1 */
(() => {
  if(document.getElementById('m4xCskh')) return;

  const box=document.createElement('div');
  box.id='m4xCskh';
  box.className='m4x-cskh';
  box.innerHTML=`
    <div class="m4x-cskh-menu">
      <a class="m4x-cskh-link tg" href="https://t.me/bengtayy" aria-label="CSKH Telegram @bengtayy">
        <span class="m4x-cskh-icon">TG</span>
        <span class="m4x-cskh-text"><b>Telegram</b><small>@bengtayy</small></span>
      </a>
      <a class="m4x-cskh-link zalo" href="https://zalo.me/0386410377" aria-label="CSKH Zalo 0386410377">
        <span class="m4x-cskh-icon">Z</span>
        <span class="m4x-cskh-text"><b>Zalo</b><small>0386410377</small></span>
      </a>
    </div>
    <span class="m4x-cskh-label">CSKH</span>
    <button class="m4x-cskh-main" type="button" aria-label="Mở hỗ trợ khách hàng" aria-expanded="false">☏</button>
  `;
  document.body.appendChild(box);

  const btn=box.querySelector('.m4x-cskh-main');

  function setOpen(v){
    box.classList.toggle('open',v);
    btn.setAttribute('aria-expanded',v?'true':'false');
    btn.textContent=v?'×':'☏';
  }

  btn.addEventListener('click',e=>{
    e.stopPropagation();
    setOpen(!box.classList.contains('open'));
  });

  document.addEventListener('click',e=>{
    if(!box.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') setOpen(false);
  });
})();
