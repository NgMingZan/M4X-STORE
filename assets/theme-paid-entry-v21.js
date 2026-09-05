(()=>{
  const CARD_ID='m4xThemePaidPinnedV211';
  const SERVICE_ID='00000000-0000-4000-8000-000000002100';
  const TARGET='./theme-translator.html';
  let gridObserver=null;

  function findGrid(){
    const selectors=['#grid','#productsGrid','#productGrid','.product-grid','.products-grid','main.grid','[data-products-grid]'];
    for(const s of selectors){
      const el=document.querySelector(s);
      if(el) return el;
    }
    return null;
  }

  function isDuplicate(el){
    if(!el || el.id===CARD_ID) return false;
    const html=String(el.outerHTML||'');
    const text=String(el.textContent||'').toLowerCase();
    return html.includes(SERVICE_ID) || text.includes('ai việt hóa lockscreen') || text.includes('ai viet hoa lockscreen');
  }

  function makeCard(){
    const card=document.createElement('article');
    card.id=CARD_ID;
    card.className='v21-product-pin';
    card.dataset.m4xPinned='true';
    card.dataset.productId=SERVICE_ID;
    card.tabIndex=0;
    card.setAttribute('role','link');
    card.setAttribute('aria-label','AI Việt hóa Lockscreen - mở dịch vụ');
    card.innerHTML=`
      <div class="v21-product-pin-cover">
        <span class="v21-product-pin-badge">📌 GHIM ĐẦU</span>
        <div class="v21-product-pin-icon">🌐</div>
        <div class="v21-product-pin-art"><i></i><i></i><i></i></div>
        <span class="v21-product-pin-ai">AI SERVICE</span>
      </div>
      <div class="v21-product-pin-body">
        <div class="v21-product-pin-name">AI Việt hóa Lockscreen</div>
        <div class="v21-product-pin-desc">Dịch văn bản + chữ trong ảnh của lockscreen. Giá tự tính theo dung lượng, số ảnh và lượng text.</div>
        <div class="v21-product-pin-meta"><span>⚡ Tự động</span><span>🖼 Text + ảnh</span></div>
        <div class="v21-product-pin-row">
          <div><small>Giá từ</small><b>10.000đ</b></div>
          <button type="button">Việt hóa ngay</button>
        </div>
      </div>`;
    const open=()=>{location.href=TARGET};
    card.addEventListener('click',open);
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    return card;
  }

  function ensurePinned(){
    if(/theme-translator\.html/i.test(location.pathname)) return;
    const grid=findGrid();
    if(!grid) return false;

    for(const child of [...grid.children]){
      if(isDuplicate(child)) child.remove();
    }

    let card=document.getElementById(CARD_ID);
    if(!card) card=makeCard();
    if(card.parentElement!==grid || grid.firstElementChild!==card) grid.prepend(card);

    if(!gridObserver){
      gridObserver=new MutationObserver(()=>queueMicrotask(ensurePinned));
      gridObserver.observe(grid,{childList:true});
    }
    return true;
  }

  // Bỏ nút nổi của V21 cũ nếu trình duyệt còn DOM/cache cũ.
  document.querySelectorAll('.v21-entry').forEach(x=>x.remove());

  if(!ensurePinned()){
    let tries=0;
    const t=setInterval(()=>{
      tries++;
      if(ensurePinned()||tries>80) clearInterval(t);
    },250);
  }
})();
