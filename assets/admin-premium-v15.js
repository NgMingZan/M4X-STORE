
/* =========================================================
   M4X ADMIN PREMIUM V15
   ========================================================= */
(() => {
  const ICON = {
    back:`<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/><path d="M9 12h10"/></svg>`,
    home:`<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/></svg>`,
    box:`<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M8 4h8v3"/><path d="M9 11h6"/></svg>`,
    order:`<svg viewBox="0 0 24 24"><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>`,
    qr:`<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2v6h-6v-2h4zM14 18v2"/></svg>`,
    user:`<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    refresh:`<svg viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/></svg>`,
    logout:`<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/></svg>`,
    plus:`<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    bell:`<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
    grid:`<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>`,
    ticket:`<svg viewBox="0 0 24 24"><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M12 7v12"/></svg>`,
    shield:`<svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3 8.5-8 10-5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
    wallet:`<svg viewBox="0 0 24 24"><path d="M4 6h15a2 2 0 0 1 2 2v10H4z"/><path d="M4 6V4h13v2"/><path d="M16 11h5v4h-5z"/></svg>`,
    edit:`<svg viewBox="0 0 24 24"><path d="m4 20 4-1 10-10-3-3L5 16z"/><path d="m14 7 3 3"/></svg>`,
    trash:`<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 14h10l1-14"/></svg>`,
    category:`<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>`,
    people:`<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M14 16a5 5 0 0 1 7 4"/></svg>`,
    code:`<svg viewBox="0 0 24 24"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg>`,
    task:`<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="m8 9 2 2 4-4M8 15h8"/></svg>`,
    headset:`<svg viewBox="0 0 24 24"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v6H4zM17 13h3v6h-3z"/><path d="M17 19c-1 2-3 2-5 2"/></svg>`,
    community:`<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
    lock:`<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`
  };

  const secondaryTabs = new Set([
    'categories','topups','codes','tasks','customorders','communityadmin','support','security','appinfo'
  ]);

  const tabIcons = {
    dashboard:'home',products:'box',orders:'order',notices:'qr',
    users:'user',categories:'category',topups:'wallet',codes:'code',tasks:'task',
    customorders:'ticket',communityadmin:'community',support:'headset',security:'shield',appinfo:'grid'
  };

  function safe(fn){try{return fn()}catch(e){console.warn('M4X Admin V15',e)}}

  function statusLabel(s){
    return ({
      paid:'Đã thanh toán',pending:'Chờ thanh toán',review:'Đang kiểm tra',
      refunded:'Đã hoàn tiền',expired:'Hết hạn',cancelled:'Đã hủy'
    })[s]||s||'—';
  }

  function deliveryLabel(v){
    return ({
      download:'Tải xuống',content:'Nội dung premium',license:'License / Key',
      service:'Kích hoạt dịch vụ',subscription:'Subscription',external:'Link ngoài'
    })[v]||v||'Sản phẩm';
  }

  function enhanceHeader(){
    const top=document.querySelector('.adminTop');
    if(!top)return;
    const brand=top.querySelector('.brand');
    if(brand && !brand.querySelector('.p15-title')){
      brand.innerHTML=`<button class="p15-back" type="button" onclick="location.href='./index.html'" aria-label="Về Store">${ICON.back}</button>
        <span class="p15-title"><b>M4X ADMIN PORTAL</b><small>Quản trị hệ thống M4X STORE</small></span>`;
    }
    if(!top.querySelector('.p15-header-actions')){
      top.insertAdjacentHTML('beforeend',`<div class="p15-header-actions">
        <span class="p15-online"><i></i>ONLINE</span>
        <button class="btn p15-icon-btn" type="button" onclick="ADM.refresh()" title="Làm mới">${ICON.refresh}</button>
        <button class="btn p15-icon-btn" type="button" onclick="ADM.logout()" title="Đăng xuất">${ICON.logout}</button>
      </div>`);
    }
  }

  function enhanceTabs(){
    document.querySelectorAll('.tab').forEach(b=>{
      const id=b.dataset.tab;
      if(!id)return;
      if(secondaryTabs.has(id))b.dataset.secondary='1';
      if(!b.dataset.p15){
        b.dataset.p15='1';
        const raw=b.textContent.trim();
        b.innerHTML=`${ICON[tabIcons[id]||'grid']}<span>${raw}</span>`;
      }
      b.onclick=()=>{
        document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
        document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===id));
        syncBottom(id);
      };
    });

    const rename={
      dashboard:'Tổng quan',
      products:`Sản phẩm${typeof st!=='undefined'?` (${st.products?.length||0})`:''}`,
      orders:`Đơn hàng${typeof st!=='undefined'?` (${st.orders?.length||0})`:''}`,
      notices:'VietQR & Thông báo',
      users:'Tài khoản'
    };
    document.querySelectorAll('.tab').forEach(b=>{
      const span=b.querySelector('span');
      if(span&&rename[b.dataset.tab])span.textContent=rename[b.dataset.tab];
    });
  }

  function go(id){
    const b=document.querySelector(`.tab[data-tab="${id}"]`);
    if(b){b.click();window.scrollTo({top:0,behavior:'smooth'});}
  }

  function addBottom(){
    if(document.querySelector('.p15-bottom'))return;
    const nav=document.createElement('nav');
    nav.className='p15-bottom';
    const items=[
      ['dashboard','Tổng quan','home'],
      ['products','Sản phẩm','box'],
      ['orders','Đơn hàng','order'],
      ['notices','VietQR','qr'],
      ['users','Tài khoản','user']
    ];
    nav.innerHTML=items.map(([id,label,icon])=>`<button type="button" data-go="${id}" onclick="M4XAdminV15.go('${id}')">${ICON[icon]}${label}</button>`).join('');
    document.body.appendChild(nav);
    syncBottom(document.querySelector('.tab.active')?.dataset.tab||'dashboard');
  }
  function syncBottom(id){
    document.querySelectorAll('.p15-bottom button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));
  }

  function renderDashboardV15(){
    if(typeof st==='undefined')return;
    const paid=st.orders.filter(o=>o.status==='paid');
    const revenue=paid.reduce((a,o)=>a+Number(o.amount||0),0);
    const pending=st.topups.filter(t=>['pending','review'].includes(t.status)).length;

    const stats=document.getElementById('stats');
    if(!stats)return;

    let hero=document.querySelector('.p15-hero');
    if(!hero){
      stats.insertAdjacentHTML('beforebegin',`<section class="p15-hero"></section>`);
      hero=document.querySelector('.p15-hero');
    }
    hero.innerHTML=`<div class="p15-hero-top"><span class="p15-kicker">TỔNG DOANH THU M4X</span><span class="p15-live">VietQR Live</span></div>
      <div class="p15-revenue">${money(revenue)}</div>
      <p>Doanh thu tích lũy từ ${paid.length} đơn hàng đã thanh toán.</p>`;

    stats.innerHTML=`
      <div class="stat"><span class="p15-stat-icon">${ICON.box}</span><div class="muted">Sản phẩm</div><div class="num">${st.products.length}</div><div class="muted">Đang quản lý trên Store</div></div>
      <div class="stat"><span class="p15-stat-icon green">${ICON.order}</span><div class="muted">Đơn hàng</div><div class="num">${st.orders.length}</div><div class="muted">${paid.length} đã thanh toán</div></div>
      <div class="stat"><span class="p15-stat-icon purple">${ICON.wallet}</span><div class="muted">Nạp chờ duyệt</div><div class="num">${pending}</div><div class="muted">Pending / review</div></div>
      <div class="stat"><span class="p15-stat-icon yellow">${ICON.people}</span><div class="muted">Người dùng</div><div class="num">${st.users.length}</div><div class="muted">Tài khoản hệ thống</div></div>`;

    let grid=document.querySelector('.p15-dashboard-grid');
    if(!grid){
      stats.insertAdjacentHTML('afterend',`<div class="p15-dashboard-grid">
        <section class="p15-card p15-actions-card"></section>
        <section class="p15-card p15-system-card"></section>
      </div>`);
      grid=document.querySelector('.p15-dashboard-grid');
    }
    grid.querySelector('.p15-actions-card').innerHTML=`<h3>Tác vụ nhanh</h3>
      <div class="p15-quick">
        <button class="btn p15-primary" onclick="M4XAdminV15.openProductForm()">${ICON.plus}<span>Thêm sản phẩm</span></button>
        <button class="btn ghost" onclick="M4XAdminV15.go('notices')">${ICON.bell}<span>Gửi thông báo</span></button>
      </div>
      <h3 style="margin-top:14px">Quản lý khác</h3>
      <div class="p15-secondary-links">
        ${[
          ['categories','Danh mục','category'],['topups','Nạp tiền','wallet'],['codes','Gift code','code'],
          ['tasks','Nhiệm vụ','task'],['customorders','Đặt riêng','ticket'],['communityadmin','Community','community'],
          ['support','Hỗ trợ','headset'],['security','Bảo mật','shield'],['appinfo','Ứng dụng','grid']
        ].map(([id,l,ic])=>document.getElementById(id)?`<button class="btn ghost" onclick="M4XAdminV15.go('${id}')">${ICON[ic]}<span>${l}</span></button>`:'').join('')}
      </div>`;
    const host=(C.SUPABASE_URL||'').replace(/^https?:\/\//,'');
    grid.querySelector('.p15-system-card').innerHTML=`<h3>Hạ tầng M4X</h3>
      <div class="p15-server-line"><b>Supabase</b><span>Online</span></div>
      <div class="p15-server-line"><b>VietQR / SePay</b><span>Active</span></div>
      <div class="p15-server-line"><b>Cloudflare Pages</b><span>Online</span></div>
      <div class="muted" style="font-size:8px;margin-top:9px;overflow-wrap:anywhere">${esc(host)}</div>`;
    const best=document.getElementById('bestSeller');
    const title=best?.previousElementSibling;
    if(best)best.style.display='none';
    if(title&&title.classList.contains('sectionTitle'))title.style.display='none';
  }

  function renderProductsV15(){
    if(typeof st==='undefined')return;
    const q=(document.getElementById('productSearch')?.value||'').toLowerCase().trim();
    const arr=st.products.filter(p=>!q||`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase().includes(q));
    const box=document.getElementById('productList');
    if(!box)return;

    const search=document.getElementById('productSearch');
    if(search){
      search.classList.add('p15-search');
      const parent=search.parentElement;
      let head=parent.querySelector('.p15-list-head');
      if(!head){
        search.insertAdjacentHTML('beforebegin',`<div class="p15-list-head"><h2></h2><button class="btn p15-primary" type="button" onclick="M4XAdminV15.openProductForm()">${ICON.plus}<span>Thêm mới</span></button></div>`);
        head=parent.querySelector('.p15-list-head');
      }
      head.querySelector('h2').textContent=`Danh sách sản phẩm (${arr.length})`;
      search.parentElement.classList.add('p15-search-wrap-host');
      search.oninput=renderProductsV15;
    }

    box.innerHTML=arr.map(p=>`<article class="p15-product">
      ${p.cover_url?`<img src="${esc(p.cover_url)}" loading="lazy" alt="">`:`<div class="p15-product-placeholder"></div>`}
      <div>
        <h3>${esc(p.name)}</h3>
        <div class="p15-product-price">${money(p.price)}</div>
        <div class="p15-product-meta">${esc(p.categories?.name||'Không danh mục')} · ${esc(deliveryLabel(p.delivery_type))}<br>Đã bán ${Number(p.sold_count||0)} · v${esc(p.version_name||'1.0')}</div>
      </div>
      <div class="p15-actions">
        <button class="btn ghost p15-mini" type="button" title="Sửa" onclick="M4XAdminV15.editProduct('${p.id}')">${ICON.edit}</button>
        <button class="btn p15-mini delete" type="button" title="Xóa" onclick="ADM.deleteProduct('${p.id}')">${ICON.trash}</button>
      </div>
    </article>`).join('')||'<div class="muted">Chưa có sản phẩm.</div>';
  }

  function renderOrdersV15(){
    if(typeof st==='undefined')return;
    const q=(document.getElementById('orderSearch')?.value||'').toLowerCase().trim();
    const arr=st.orders.filter(o=>!q||`${o.order_code||''} ${o.products?.name||''} ${userName(o.user_id)}`.toLowerCase().includes(q));
    const box=document.getElementById('orderList');
    if(!box)return;
    const input=document.getElementById('orderSearch');
    if(input)input.oninput=renderOrdersV15;

    box.innerHTML=arr.map(o=>`<article class="p15-order">
      <div class="p15-order-top"><span class="p15-order-code">${esc(o.order_code)}</span><span class="p15-order-status">${esc(statusLabel(o.status))}</span></div>
      <h3>${esc(o.products?.name||'Sản phẩm')}</h3>
      <div class="p15-order-meta"><span class="p15-order-money">${money(o.amount)}</span><span>${dt(o.created_at)}</span></div>
      ${o.status==='paid'
        ?`<button class="btn ghost" onclick="M4XAdminV15.orderMenu('${o.id}')">Xử lý đơn hàng</button>`
        :''}
    </article>`).join('')||'<div class="muted">Không có đơn hàng.</div>';
  }

  function decorateVietQR(){
    const panel=document.getElementById('notices');
    if(!panel)return;
    if(!panel.querySelector('.p15-bank')){
      const grid=panel.querySelector('.grid2');
      if(grid){
        grid.insertAdjacentHTML('beforebegin',`<section class="p15-bank">
          <div class="p15-bank-card" style="grid-column:1/-1"><h3>Thông tin nhận tiền VietQR</h3><div class="muted" style="font-size:9px">Dữ liệu lấy từ cấu hình triển khai hiện tại.</div></div>
          ${[
            ['Ngân hàng',C.BANK?.name||'VietinBank'],
            ['Mã ngân hàng','ICB'],
            ['Số tài khoản',C.BANK?.account||''],
            ['Chủ tài khoản',C.BANK?.holder||'']
          ].map(([a,b])=>`<div class="p15-bank-field"><small>${a}</small><b>${esc(b)}</b></div>`).join('')}
        </section>`);
      }
    }
    const h=panel.querySelector('.grid2>.item h2');
    if(h)h.textContent='Phát thông báo toàn hệ thống';
  }

  function openProductForm(){
    const sec=document.getElementById('products');
    if(!sec)return;
    sec.classList.add('p15-form-open');
    go('products');
    const form=sec.querySelector('.grid2>.item:first-child');
    if(form)form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function closeProductForm(){
    document.getElementById('products')?.classList.remove('p15-form-open');
  }

  function editProduct(id){
    if(ADM.editProduct)ADM.editProduct(id);
    openProductForm();
  }

  function orderMenu(id){
    const o=st.orders.find(x=>x.id===id);
    if(!o)return;
    const canRefund=o.status==='paid';
    const html=`<h2>Xử lý đơn ${esc(o.order_code)}</h2>
      <div class="item"><b>${esc(o.products?.name||'Sản phẩm')}</b><div class="muted">${money(o.amount)} · ${dt(o.created_at)}</div></div>
      <div class="toolbar">
        <button class="btn ghost" onclick="document.getElementById('modal').classList.remove('open');M4XAdminV15.go('support')">${ICON.headset} Hỗ trợ</button>
        ${canRefund?`<button class="btn bad" onclick="document.getElementById('modal').classList.remove('open');ADM.refund('${o.id}')">Hoàn tiền</button>`:''}
      </div>`;
    document.getElementById('modalContent').innerHTML=html;
    document.getElementById('modal').classList.add('open');
  }

  function wrapRenderers(){
    if(window.__M4X_ADMIN_V15_WRAPPED)return;
    window.__M4X_ADMIN_V15_WRAPPED=true;

    try{
      renderStats=renderDashboardV15;
      renderProducts=renderProductsV15;
      renderOrders=renderOrdersV15;
    }catch(e){console.warn(e)}

    const oldRefresh=ADM.refresh;
    ADM.refresh=async function(...args){
      const r=await oldRefresh.apply(this,args);
      setTimeout(applyAll,0);
      return r;
    };

    const oldReset=ADM.resetProductForm;
    ADM.resetProductForm=function(...args){
      const r=oldReset.apply(this,args);
      closeProductForm();
      return r;
    };

    const oldSave=ADM.saveProduct;
    ADM.saveProduct=async function(...args){
      const r=await oldSave.apply(this,args);
      setTimeout(()=>safe(()=>{
        const msg=document.getElementById('pMsg')?.textContent||'';
        if(msg.includes('Đã'))closeProductForm();
        renderProductsV15();
        enhanceTabs();
      }),50);
      return r;
    };
  }

  function applyAll(){
    safe(enhanceHeader);
    safe(enhanceTabs);
    safe(addBottom);
    safe(renderDashboardV15);
    safe(renderProductsV15);
    safe(renderOrdersV15);
    safe(decorateVietQR);
  }

  window.M4XAdminV15={go,openProductForm,closeProductForm,editProduct,orderMenu};

  wrapRenderers();
  setTimeout(applyAll,120);
  setTimeout(applyAll,700);
  setTimeout(applyAll,1600);
})();
