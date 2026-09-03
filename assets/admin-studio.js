
/* M4X ADMIN V14 — Studio Portal behavior */
(() => {
  const SVG={
    home:`<svg viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
    grid:`<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>`,
    order:`<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zm3 4h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>`,
    gear:`<svg viewBox="0 0 24 24"><path d="m9.4 2 .6 2.1a8 8 0 0 1 4 0L14.6 2l2.8 1.2-.9 2a8 8 0 0 1 2.8 2.8l2-.9L22.5 10l-2.1.6a8 8 0 0 1 0 4l2.1.6-1.2 2.8-2-.9a8 8 0 0 1-2.8 2.8l.9 2-2.8 1.2-.6-2.1a8 8 0 0 1-4 0l-.6 2.1-2.8-1.2.9-2A8 8 0 0 1 4.7 17l-2 .9L1.5 15l2.1-.6a8 8 0 0 1 0-4L1.5 10l1.2-2.8 2 .9A8 8 0 0 1 7.5 5.3l-.9-2zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8"/></svg>`,
    user:`<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m-9 9a9 9 0 0 1 18 0z"/></svg>`
  };

  function topChrome(){
    const top=document.querySelector('.adminTop'); if(!top)return;
    const brand=top.querySelector('.brand');
    if(brand&&!brand.querySelector('.adm-brand-copy')){
      brand.innerHTML=`<button class="adm-back" type="button" onclick="location.href='./index.html'">←</button>
        <span class="adm-brand-copy"><b>M4X ADMIN PORTAL</b><small>Bảng điều khiển & Quản trị hệ thống M4X Store</small></span>`;
    }
    if(!top.querySelector('.adm-online')){
      top.insertAdjacentHTML('beforeend',`<span class="adm-online"><i></i>ONLINE</span><button class="adm-lock" type="button" title="Phiên Admin được bảo vệ bởi Supabase Auth">◈</button>`);
    }
  }

  function relabelTabs(){
    const names={
      dashboard:'Tổng quan',products:`Sản phẩm (${st.products?.length||0})`,
      orders:`Đơn hàng (${st.orders?.length||0})`,notices:'Cấu hình VietQR',
      categories:'Danh mục',users:'Người dùng',topups:'Nạp tiền',codes:'Gift code',
      tasks:'Nhiệm vụ',support:'Hỗ trợ',security:'Bảo mật',appinfo:'Ứng dụng'
    };
    document.querySelectorAll('.tab').forEach(b=>{if(names[b.dataset.tab])b.textContent=names[b.dataset.tab]});
  }

  function switchTab(id){
    const b=document.querySelector(`.tab[data-tab="${id}"]`);
    if(b)b.click();
    syncBottom(id);
  }

  function bottomNav(){
    if(document.querySelector('.adm-bottom'))return;
    const nav=document.createElement('nav');nav.className='adm-bottom';
    nav.innerHTML=[
      ['dashboard','Tổng quan','home'],
      ['products','Sản phẩm','grid'],
      ['orders','Đơn hàng','order'],
      ['notices','Cấu hình','gear'],
      ['users','Tài khoản','user']
    ].map(([id,t,ic])=>`<button data-adm-go="${id}">${SVG[ic]}${t}</button>`).join('');
    document.body.appendChild(nav);
    nav.querySelectorAll('button').forEach(b=>b.onclick=()=>switchTab(b.dataset.admGo));
    syncBottom(document.querySelector('.tab.active')?.dataset.tab||'dashboard');
  }

  function syncBottom(id){
    document.querySelectorAll('.adm-bottom button').forEach(b=>b.classList.toggle('active',b.dataset.admGo===id));
  }

  function dashboardStudio(){
    const paid=(st.orders||[]).filter(o=>o.status==='paid');
    const revenue=paid.reduce((a,o)=>a+Number(o.amount||0),0);
    const pending=(st.topups||[]).filter(t=>['pending','review'].includes(t.status)).length;
    const stats=$('stats');if(!stats)return;
    if(!document.querySelector('.adm-revenue')){
      stats.insertAdjacentHTML('beforebegin',`<section class="adm-revenue">
        <div class="adm-revenue-top"><span class="adm-revenue-title">↗ TỔNG DOANH THU M4X</span><span class="adm-live">VietQR Live</span></div>
        <b>${money(revenue)}</b><small>Doanh thu tích lũy từ ${paid.length} đơn hàng qua VietinBank & Số dư</small>
      </section>`);
    }else{
      const x=document.querySelector('.adm-revenue');
      x.querySelector('b').textContent=money(revenue);
      x.querySelector('small').textContent=`Doanh thu tích lũy từ ${paid.length} đơn hàng qua VietinBank & Số dư`;
    }
    stats.innerHTML=`
      <div class="stat"><span class="adm-stat-icon">▣</span><div class="muted">Sản phẩm</div><div class="num">${st.products.length}</div><div class="muted">Đang bán trên sàn</div></div>
      <div class="stat"><span class="adm-stat-icon green">▤</span><div class="muted">Đơn hàng</div><div class="num">${st.orders.length}</div><div class="muted">${paid.length} đã thanh toán</div></div>
      <div class="stat"><span class="adm-stat-icon purple">▰</span><div class="muted">Tài khoản nhận</div><div class="num" style="font-size:18px!important">${esc(C.BANK?.name||'VietinBank')}</div><div class="muted">STK: ${esc(C.BANK?.account||'')}</div></div>
      <div class="stat"><span class="adm-stat-icon gold">◈</span><div class="muted">Chủ tài khoản</div><div class="num" style="font-size:18px!important">M. DAN</div><div class="muted">${esc(C.BANK?.holder||'')}</div></div>`;

    if(!document.querySelector('.adm-quick')){
      stats.insertAdjacentHTML('afterend',`<section class="adm-quick">
        <h3>Tác vụ nhanh quản trị</h3><div class="adm-quick-actions">
          <button class="btn adm-primary" onclick="ADMStudio.openProductForm()">＋ Thêm App / Theme</button>
          <button class="btn ghost adm-cyan-btn" onclick="ADMStudio.go('notices')">⌁ Gửi thông báo</button>
        </div>
      </section>
      <section class="adm-infra"><h3>Hạ tầng máy chủ M4X <span class="online">Trực tuyến 99.9%</span></h3>
        <pre>• Supabase Database: ${esc((C.SUPABASE_URL||'').replace(/^https?:\/\//,''))}
• VietQR Napas 247 Gateway
• Cloudflare Pages Host: m4x-store.pages.dev</pre>
      </section>`);
    }
  }

  function productsStudio(){
    const q=($('productSearch')?.value||'').toLowerCase().trim();
    const arr=st.products.filter(p=>!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q));
    const box=$('productList');if(!box)return;
    let head=document.querySelector('.adm-products-head');
    if(!head){
      $('productSearch')?.insertAdjacentHTML('beforebegin',`<div class="adm-products-head"><h2>DANH SÁCH SẢN PHẨM (${arr.length})</h2><button class="btn adm-add" onclick="ADMStudio.openProductForm()">＋ Thêm mới</button></div>`);
      head=document.querySelector('.adm-products-head');
    }
    head.querySelector('h2').textContent=`DANH SÁCH SẢN PHẨM (${arr.length})`;
    box.innerHTML=arr.map(p=>`<article class="adm-product-row">
      ${p.cover_url?`<img class="adm-product-img" src="${esc(p.cover_url)}">`:`<div class="adm-product-img"></div>`}
      <div><h3>${esc(p.name)}</h3><span class="adm-product-price">${money(p.price)}</span> <span class="muted">· ${esc(p.delivery_type==='download'?'Tải xuống':'Kích hoạt dịch vụ')}</span>
      <div class="adm-product-meta">Danh mục: ${esc(p.categories?.name||'Không danh mục')} | Đã bán: ${Number(p.sold_count||0)}</div></div>
      <div class="adm-icon-actions">
        <button class="adm-icon-btn" title="Sửa" onclick="ADMStudio.editProduct('${p.id}')">✎</button>
        <button class="adm-icon-btn delete" title="Xóa" onclick="ADM.deleteProduct('${p.id}')">▰</button>
      </div>
    </article>`).join('')||'<div class="muted">Chưa có sản phẩm.</div>';
  }

  function ordersStudio(){
    const q=($('orderSearch')?.value||'').toLowerCase().trim();
    const arr=st.orders.filter(o=>!q||`${o.order_code} ${o.products?.name||''} ${userName(o.user_id)}`.toLowerCase().includes(q));
    const box=$('orderList');if(!box)return;
    box.innerHTML=`<div class="sectionTitle">TẤT CẢ ĐƠN HÀNG TRÊN HỆ THỐNG (${arr.length})</div>`+
      arr.map(o=>`<article class="adm-order-card">
        <div class="adm-order-top"><span class="adm-order-code">${esc(o.order_code)}</span><span class="adm-order-status">${o.status==='paid'?'Đã thanh toán':esc(o.status)}</span></div>
        <h3>${esc(o.products?.name||'Sản phẩm')}</h3>
        <span class="adm-order-money">Số tiền: ${money(o.amount)}</span><span class="adm-order-date">${dt(o.created_at)}</span>
        ${o.status==='paid'?`<button class="btn ghost adm-order-action" onclick="ADMStudio.orderAction('${o.id}')">↻ Xử lý đơn hàng / Cấp Key</button>`:''}
      </article>`).join('')||'<div class="muted">Không có đơn.</div>';
  }

  function decorateNotices(){
    const panel=$('notices');if(!panel||panel.querySelector('.adm-bank-card'))return;
    const grid=panel.querySelector('.grid2');
    if(!grid)return;
    grid.insertAdjacentHTML('beforebegin',`<section class="adm-bank-card">
      <h3>▦ CẤU HÌNH TÀI KHOẢN NHẬN TIỀN VIETQR</h3>
      <div class="adm-bank-grid">
        <div class="adm-bank-field"><small>Tên Ngân Hàng</small><b>${esc(C.BANK?.name||'VietinBank')}</b></div>
        <div class="adm-bank-field"><small>Mã Ngân Hàng</small><b>ICB</b></div>
        <div class="adm-bank-field"><small>Số Tài Khoản (STK)</small><b>${esc(C.BANK?.account||'')}</b></div>
        <div class="adm-bank-field"><small>Tên Chủ Tài Khoản</small><b>${esc(C.BANK?.holder||'')}</b></div>
      </div>
      <p class="muted" style="font-size:8px;margin-bottom:0">Thông tin ngân hàng lấy từ cấu hình triển khai Cloudflare/GitHub Secrets. Không chỉnh trực tiếp trên trình duyệt để tránh giả mạo.</p>
    </section>`);
    const form=grid.querySelector('.item h2');if(form)form.textContent='📣 PHÁT THÔNG BÁO TOÀN SÀN';
  }

  function createProductModal(){
    if(document.querySelector('.adm-product-form-modal'))return;
    const source=$('products')?.querySelector('.grid2>div:first-child');if(!source)return;
    const modal=document.createElement('div');modal.className='adm-product-form-modal hidden';
    modal.innerHTML=`<div class="adm-form-shell"><button class="btn ghost" style="float:right" onclick="ADMStudio.closeProductForm()">×</button><div class="adm-form-slot"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.adm-form-slot').appendChild(source);
  }
  function openProductForm(){
    createProductModal();
    document.querySelector('.adm-product-form-modal')?.classList.remove('hidden');
  }
  function closeProductForm(){document.querySelector('.adm-product-form-modal')?.classList.add('hidden')}
  function editProductStudio(id){ADM.editProduct(id);openProductForm()}
  function orderAction(id){
    const o=st.orders.find(x=>x.id===id);if(!o)return;
    const act=confirm('OK = mở hỗ trợ/ xử lý đơn. Cancel = hoàn tiền nếu cần.');
    if(act){
      const ticket=(st.tickets||[]).find(t=>t.order_id===id);
      if(ticket&&ADM.openSupportTicket)return ADM.openSupportTicket(ticket.id);
      alert('Đơn đã thanh toán. Với sản phẩm dịch vụ, dùng Hỗ trợ hoặc thông tin giao hàng hiện có để xử lý.');
    }
  }

  function hook(){
    topChrome();bottomNav();relabelTabs();decorateNotices();createProductModal();
    dashboardStudio();productsStudio();ordersStudio();
    const ps=$('productSearch');if(ps)ps.oninput=productsStudio;
    const os=$('orderSearch');if(os)os.oninput=ordersStudio;
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>syncBottom(b.dataset.tab)));
  }

  const oldRefresh=ADM.refresh;
  ADM.refresh=async function(...args){
    const r=await oldRefresh.apply(this,args);
    setTimeout(hook,0);
    return r;
  };

  window.ADMStudio={go:switchTab,openProductForm,closeProductForm,editProduct:editProductStudio,orderAction};

  
  setTimeout(hook,250);
  setTimeout(hook,1200);
})();
