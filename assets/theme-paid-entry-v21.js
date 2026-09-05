(()=>{
  'use strict';
  const SERVICE_ID='00000000-0000-4000-8000-000000002100';
  const SERVICE_NAME='ai việt hóa lockscreen';
  const TARGET='./theme-translator.html';
  let busy=false;

  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const isName=s=>norm(s).includes('ai viet hoa lockscreen');
  const skipAction=s=>/(đóng|dong|quay lại|quay lai|trở lại|tro lai|yêu thích|yeu thich|chia sẻ|chia se|menu|⋮|♡|♥)/i.test(String(s||''));
  const paidAction=s=>/(mua|thêm.*giỏ|them.*gio|thanh toán|thanh toan|dịch|dich|việt hóa|viet hoa|bắt đầu|bat dau|xem.*chi tiết|xem.*chi tiet)/i.test(String(s||''));

  function go(){
    if(/theme-translator\.html/i.test(location.pathname)) return;
    location.href=TARGET;
  }

  function candidateCards(){
    return [...document.querySelectorAll([
      '[data-product-id]','[data-product]','[data-id]','article',
      '.product-card','.product','.store-product','.card','.item-card','.shop-card'
    ].join(','))];
  }

  function serviceCard(){
    const cards=candidateCards().filter(el=>isName(el.textContent));
    if(!cards.length) return null;
    // Ưu tiên phần tử nhỏ nhất để không nhầm cả vùng grid/list.
    cards.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length);
    return cards[0];
  }

  function contextHasService(el){
    let n=el;
    for(let i=0;n && i<10;i++,n=n.parentElement){
      if(n===document.body) break;
      const txt=n.textContent||'';
      const attr=`${n.getAttribute?.('data-product-id')||''} ${n.getAttribute?.('data-id')||''} ${n.getAttribute?.('onclick')||''}`;
      if(isName(txt) || attr.includes(SERVICE_ID)) return n;
    }
    return null;
  }

  function fixText(root){
    if(!root) return;
    // Giá cố định 10.000đ chỉ là giá khởi điểm.
    for(const el of root.querySelectorAll('*')){
      if(el.children.length) continue;
      const t=(el.textContent||'').trim();
      if(/^10[.\s]?000\s*đ$/i.test(t) || /^10,?000\s*đ$/i.test(t)) el.textContent='Từ 10.000đ';
    }
    for(const b of root.querySelectorAll('button,a,[role="button"]')){
      const t=(b.textContent||'').trim();
      if(/^(mua|mua ngay|thanh toán|thanh toan)$/i.test(t)) b.textContent='🌐 Gửi MTZ & báo giá';
      if(/thêm.*giỏ|them.*gio/i.test(t)){
        b.textContent='Giá tính sau khi gửi file';
        b.setAttribute('aria-disabled','true');
        b.style.display='none';
      }
    }
  }

  function pinAndDecorate(){
    if(/theme-translator\.html/i.test(location.pathname)) return;
    const card=serviceCard();
    if(card){
      card.dataset.m4xThemeService='true';
      const parent=card.parentElement;
      // Chỉ prepend khi parent có ít nhất 2 card con, tránh kéo cả section sai vị trí.
      if(parent && parent.children.length>1 && parent.firstElementChild!==card){
        parent.prepend(card);
      }
      fixText(card);
      if(!card.querySelector('.m4x-v212-tag')){
        const tag=document.createElement('span');
        tag.className='m4x-v212-tag';
        tag.textContent='📌 GHIM · GIÁ TỰ TÍNH';
        const host=card.querySelector('.cover,.thumb,.image,.product-image')||card;
        host.style.position=host.style.position||'relative';
        host.appendChild(tag);
      }
    }

    // Nếu đang ở trang/modal chi tiết của dịch vụ, sửa toàn bộ nút mua thành luồng upload MTZ.
    for(const b of document.querySelectorAll('button,a,[role="button"]')){
      const ctx=contextHasService(b);
      if(!ctx) continue;
      fixText(ctx);
    }
  }

  document.addEventListener('click',e=>{
    if(/theme-translator\.html/i.test(location.pathname)) return;
    const raw=e.target;
    if(!(raw instanceof Element)) return;
    const clickable=raw.closest('button,a,[role="button"],article,.product-card,.product,.card,[data-product-id],[data-id]')||raw;
    const ctx=contextHasService(clickable);
    if(!ctx) return;

    const label=(clickable.textContent||'').trim();
    if(skipAction(label)) return;

    // Click trên card sản phẩm hoặc bất kỳ CTA mua/thanh toán của đúng dịch vụ đều phải sang trang báo giá.
    const isCard=clickable===ctx || clickable.matches?.('article,.product-card,.product,.card,[data-product-id],[data-id]');
    if(isCard || paidAction(label) || (ctx.dataset?.m4xThemeService==='true' && !clickable.closest('button,a,[role="button"]'))){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      go();
    }
  },true);

  const obs=new MutationObserver(()=>{
    if(busy) return;
    busy=true;
    queueMicrotask(()=>{try{pinAndDecorate()}finally{busy=false}});
  });
  obs.observe(document.documentElement,{subtree:true,childList:true});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',pinAndDecorate,{once:true});
  else pinAndDecorate();
  setTimeout(pinAndDecorate,400);
  setTimeout(pinAndDecorate,1200);
})();
