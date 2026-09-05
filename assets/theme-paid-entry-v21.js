(()=>{
  'use strict';

  const SERVICE_ID='00000000-0000-4000-8000-000000002100';
  const SERVICE_NAME='ai viet hoa lockscreen';
  const TARGET='./theme-translator.html';
  let applying=false;

  const norm=s=>String(s||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/\s+/g,' ')
    .trim();

  const isServiceName=s=>norm(s).includes(SERVICE_NAME);
  const isQuote=s=>/gui\s*mtz.*bao\s*gia/i.test(norm(s));
  const isBuy=s=>/^(mua|mua ngay|thanh toan|thanh toán|bat dau|bắt đầu|dich|dịch)$/i.test(String(s||'').trim());
  const isCart=s=>/(them|thêm).*gio hang|giỏ hàng/i.test(norm(s));
  const isIgnore=s=>/(yeu thich|yêu thích|chia se|chia sẻ|dong|đóng|quay lai|quay lại|menu|♡|♥|⋮)/i.test(norm(s));

  function go(){
    if(/theme-translator\.html/i.test(location.pathname)) return;
    location.href=TARGET;
  }

  function hasExactServiceId(el){
    if(!el || !(el instanceof Element)) return false;
    const vals=[
      el.getAttribute('data-product-id'),
      el.getAttribute('data-id'),
      el.getAttribute('data-product'),
      el.id,
      el.getAttribute('onclick')
    ].filter(Boolean).map(String);
    return vals.some(v=>v===SERVICE_ID || v.includes(SERVICE_ID));
  }

  function priceCount(text){
    return (String(text||'').match(/\d{1,3}(?:[.,]\d{3})+\s*(?:đ|d)/gi)||[]).length;
  }

  function looksLikeOneProduct(el){
    if(!el || !(el instanceof Element)) return false;
    const txt=(el.textContent||'').trim();
    if(!txt || txt.length>1400) return false;
    if(priceCount(txt)>2) return false;
    const hasAction=!!el.querySelector('button,a,[role="button"]');
    const hasPrice=/\b\d{1,3}(?:[.,]\d{3})+\s*(?:đ|d)\b/i.test(txt) || /tu\s*10[.,]?000/i.test(norm(txt));
    const hasSold=/(da ban|đã bán)/i.test(norm(txt));
    return hasAction && (hasPrice || hasSold);
  }

  function serviceRootFromTitleNode(node){
    if(!node || !(node instanceof Element)) return null;
    let el=node;
    let fallback=null;
    for(let i=0;i<9 && el && el!==document.body;i++,el=el.parentElement){
      const txt=(el.textContent||'').trim();
      if(!isServiceName(txt) && !hasExactServiceId(el)) continue;
      if(txt.length<900) fallback=el;
      if(looksLikeOneProduct(el)) return el;
    }
    return fallback;
  }

  function findServiceRoot(){
    const idNode=document.querySelector(`[data-product-id="${SERVICE_ID}"],[data-id="${SERVICE_ID}"],[data-product="${SERVICE_ID}"]`);
    if(idNode){
      const r=serviceRootFromTitleNode(idNode);
      if(r) return r;
    }

    const candidates=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,.name,.title,.product-name,.product-title,[data-name],div,span')]
      .filter(el=>{
        const t=(el.textContent||'').trim();
        if(!t || t.length>90) return false;
        return isServiceName(t);
      });

    for(const n of candidates){
      const r=serviceRootFromTitleNode(n);
      if(r) return r;
    }
    return null;
  }

  function serviceRootFromElement(start){
    if(!start || !(start instanceof Element)) return null;
    let el=start;
    for(let i=0;i<9 && el && el!==document.body;i++,el=el.parentElement){
      if(hasExactServiceId(el) && looksLikeOneProduct(el)) return el;
      const txt=(el.textContent||'').trim();
      if(txt.length<=1400 && isServiceName(txt) && looksLikeOneProduct(el)) return el;
    }
    return null;
  }

  function isDialogLike(el){
    return !!el?.closest?.('dialog,[role="dialog"],.modal,.sheet,.drawer,.product-detail,.product-modal,.detail-modal,.overlay');
  }

  function setServicePrice(root){
    for(const el of root.querySelectorAll('*')){
      if(el.children.length) continue;
      const t=(el.textContent||'').trim();
      if(/^10[.\s,]?000\s*(?:đ|d)$/i.test(t)) el.textContent='Từ 10.000đ';
    }
  }

  function decorateService(root){
    if(!root) return;
    root.dataset.m4xThemeService='true';
    setServicePrice(root);

    let foundAction=false;
    for(const b of root.querySelectorAll('button,a,[role="button"]')){
      const t=(b.textContent||'').trim();
      if(isIgnore(t)) continue;
      if(isBuy(t) || isQuote(t)){
        b.textContent='🌐 Gửi MTZ & báo giá';
        b.dataset.m4xThemeQuote='true';
        b.removeAttribute('disabled');
        b.setAttribute('aria-disabled','false');
        foundAction=true;
      } else if(isCart(t)){
        b.style.display='none';
        b.dataset.m4xThemeCartHidden='true';
      }
    }

    // Nếu UI không dùng button rõ ràng, thêm một nút riêng ngay trong card.
    if(!foundAction && !root.querySelector('[data-m4x-theme-fallback]')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.dataset.m4xThemeFallback='true';
      btn.dataset.m4xThemeQuote='true';
      btn.textContent='🌐 Gửi MTZ & báo giá';
      btn.style.cssText='width:100%;margin-top:10px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#111827;color:#fff;font:inherit;font-weight:800;';
      root.appendChild(btn);
    }

    if(!root.querySelector('.m4x-v214-tag')){
      const tag=document.createElement('span');
      tag.className='m4x-v214-tag';
      tag.textContent='📌 GHIM · GIÁ TỰ TÍNH';
      tag.style.cssText='position:absolute;z-index:5;left:10px;top:10px;padding:6px 9px;border-radius:999px;background:rgba(7,12,20,.88);border:1px solid rgba(255,211,112,.35);color:#ffe19a;font-size:11px;font-weight:800;backdrop-filter:blur(8px);';
      const host=root.querySelector('.cover,.thumb,.image,.product-image,.media')||root;
      const cs=getComputedStyle(host);
      if(cs.position==='static') host.style.position='relative';
      host.appendChild(tag);
    }
  }

  function repairWrongQuoteButtons(serviceRoot){
    for(const b of document.querySelectorAll('button,a,[role="button"]')){
      if(!isQuote(b.textContent)) continue;
      if(serviceRoot && serviceRoot.contains(b)) continue;
      if(serviceRootFromElement(b)) continue;
      b.textContent=isDialogLike(b)?'Mua ngay':'Mua';
      delete b.dataset.m4xThemeQuote;
      b.removeAttribute('aria-disabled');
    }
  }

  function pinService(root){
    if(!root) return;
    const p=root.parentElement;
    if(p && p.children.length>1 && p.firstElementChild!==root){
      // Chỉ ghim khi parent trông như danh sách/grid sản phẩm, không ghim trong modal.
      const siblings=[...p.children];
      if(siblings.length>=2 && siblings.length<=100 && !isDialogLike(root)) p.prepend(root);
    }
  }

  function applyFix(){
    if(/theme-translator\.html/i.test(location.pathname)) return;
    const service=findServiceRoot();
    if(service){
      decorateService(service);
      pinService(service);
    }

    // Modal chi tiết AI (nếu UI đã mở modal trước khi hotfix chạy).
    for(const dlg of document.querySelectorAll('dialog,[role="dialog"],.modal,.sheet,.drawer,.product-detail,.product-modal,.detail-modal,.overlay')){
      const txt=(dlg.textContent||'').trim();
      if(txt.length<=2500 && isServiceName(txt)) decorateService(dlg);
    }

    repairWrongQuoteButtons(service);
  }

  document.addEventListener('click',e=>{
    if(/theme-translator\.html/i.test(location.pathname)) return;
    const raw=e.target;
    if(!(raw instanceof Element)) return;

    const actionable=raw.closest('button,a,[role="button"]');
    if(actionable && actionable.dataset.m4xThemeQuote==='true'){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();go();return;
    }

    const ctx=serviceRootFromElement(actionable||raw);
    if(!ctx) return;
    const label=(actionable?.textContent||raw.textContent||'').trim();
    if(actionable && isIgnore(label)) return;

    // Click card AI hoặc bất kỳ hành động mua/thanh toán của AI -> trang gửi MTZ.
    if(!actionable || isBuy(label) || isQuote(label) || isCart(label)){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();go();
    }
  },true);

  const obs=new MutationObserver(()=>{
    if(applying) return;
    applying=true;
    queueMicrotask(()=>{
      try{applyFix();}finally{applying=false;}
    });
  });
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',applyFix,{once:true});
  else applyFix();
  setTimeout(applyFix,150);
  setTimeout(applyFix,500);
  setTimeout(applyFix,1200);
  setTimeout(applyFix,2500);
})();
