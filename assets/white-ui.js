/* M4X STORE V9 — functional white storefront */
(() => {
  document.documentElement.dataset.m4xTheme = 'light';
  try{ localStorage.setItem('m4x_theme','light'); }catch{}

  const safeStatus = p => p.stock_mode==='limited' ? `Còn ${available(p)}` : statusText(p.sale_status);

  function productCard(p){
    const own=state.owned.get(p.id);
    const label=actionLabel(p);
    const disabled=!own&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    const canCart=!own&&!disabled && window.M4X?.v8AddCart;
    return `<article class="card m4x-product-card" onclick="M4X.product('${p.id}')">
      <div class="cover" style="background-image:url('${esc(p.cover_url||'')}')">
        <span class="pill">${esc(p.categories?.name||'Sản phẩm')}</span>
        ${own?'<span class="pill right">✓ Đã sở hữu</span>':(p.sale_status==='new'?'<span class="pill right">MỚI</span>':'')}
      </div>
      <div class="cardbody">
        <div class="name">${esc(p.name)}</div>
        <div class="row">
          <div><div class="price">${money(p.price)}</div><div class="stock">${safeStatus(p)}</div></div>
          <button class="btn" ${disabled?'disabled':''} onclick="event.stopPropagation();M4X.action('${p.id}')">${label}</button>
        </div>
        ${canCart?`<button class="btn ghost m4x-cart-add" onclick="event.stopPropagation();M4X.v8AddCart('${p.id}')">＋ Thêm vào giỏ</button>`:''}
      </div>
    </article>`;
  }

  function quickButton(icon,label,onclick){return `<button onclick="${onclick}"><span>${icon}</span>${label}</button>`}

  function lightRenderStore(){
    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-cat="all">✦ Tất cả</button>`+
      state.categories.map(c=>`<button class="chip ${String(c.id)===state.activeCat?'active':''}" data-cat="${c.id}">${esc(c.icon||'')} ${esc(c.name)}</button>`).join('');
    const q=state.query.toLowerCase().trim();
    const list=state.products.filter(p=>(state.activeCat==='all'||String(p.category_id)===state.activeCat)&&(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q)));
    const displayName=state.profile?.display_name||state.me?.email||'Khách';
    const balance=money(state.profile?.balance||0);
    const recent=(state.notifications||[]).slice(0,3);
    const promo=state.promo&&state.promo.active&&new Date(state.promo.ends_at)>new Date();

    $('view').innerHTML=`
      <div class="m4x-home">
        <div class="m4x-main">
          <section class="m4x-hero">
            <span class="m4x-kicker">WELCOME TO</span>
            <h1><span>M4X</span> STORE</h1>
            <p>Kho sản phẩm số chất lượng cao: Theme, Tool, AI, Game, tiện ích và nhiều hơn thế nữa.</p>
            <div class="m4x-hero-actions">
              <button class="btn" onclick="document.getElementById('m4xProducts')?.scrollIntoView({behavior:'smooth'})">🚀 Khám phá ngay</button>
              <button class="btn ghost" onclick="${state.me?"setView('library')":"M4X.auth('login')"}">${state.me?'▦ Thư viện của tôi':'Đăng nhập'}</button>
            </div>
          </section>

          ${promo?`<div class="m4x-promo"><div><strong>🎁 Ưu đãi khai trương +${Number(state.promo.bonus_percent||0)}%</strong><div class="muted">Nạp tiền trong thời gian chương trình để nhận thêm giá trị ví.</div></div><button class="btn" onclick="M4X.topup()">Nạp ngay</button></div>`:''}

          <div class="m4x-search-row"><input id="storeSearch" class="search" placeholder="Tìm theme, tool, preset..." value="${esc(state.query)}"></div>
          <div class="cats">${cats}</div>

          <div class="m4x-section-head" id="m4xProducts"><h2>Sản phẩm nổi bật</h2><button class="m4x-linkbtn" data-cat-reset>Xem tất cả ›</button></div>
          <section class="m4x-product-grid">${list.map(productCard).join('')||'<div class="muted">Chưa có sản phẩm.</div>'}</section>

          <div class="m4x-feature-strip">
            <div class="m4x-feature"><i>🛡️</i><div><b>Sản phẩm chất lượng</b><small>Được chọn lọc kỹ càng</small></div></div>
            <div class="m4x-feature"><i>↻</i><div><b>Cập nhật liên tục</b><small>Sản phẩm mới mỗi ngày</small></div></div>
            <div class="m4x-feature"><i>🎧</i><div><b>Hỗ trợ nhanh chóng</b><small>Hỗ trợ trực tiếp</small></div></div>
            <div class="m4x-feature"><i>🔒</i><div><b>Thanh toán an toàn</b><small>Qua ví M4X STORE</small></div></div>
          </div>

          <div class="toolbar" style="margin-top:12px">
            <button class="btn ghost" onclick="M4X.policy('terms')">Điều khoản</button>
            <button class="btn ghost" onclick="M4X.policy('refund')">Hoàn tiền</button>
            <button class="btn ghost" onclick="M4X.policy('safety')">Lưu ý tool/trick</button>
          </div>
        </div>

        <aside class="m4x-side">
          <div class="m4x-side-card m4x-wallet">
            <div class="m4x-side-title">💳 Tài khoản</div>
            <div class="m4x-userline">${esc(displayName)}</div>
            <div class="muted">Số dư</div>
            <div class="m4x-balance">${balance}</div>
            <div class="m4x-side-actions">
              <button class="btn" onclick="${state.me?'M4X.topup()':"M4X.auth('login')"}">${state.me?'＋ Nạp tiền':'Đăng nhập'}</button>
              <button class="btn ghost" onclick="${state.me?'M4X.orderHistory()':"M4X.auth('login')"}">◷ Lịch sử</button>
            </div>
          </div>

          <div class="m4x-side-card">
            <div class="m4x-side-title">Truy cập nhanh</div>
            <div class="m4x-quick">
              ${quickButton('✦','Nhiệm vụ',state.me?"setView('rewards')":"M4X.auth('login')")}
              ${quickButton('🎁','Rewards',state.me?"setView('rewards')":"M4X.auth('login')")}
              ${quickButton('▦','Thư viện',state.me?"setView('library')":"M4X.auth('login')")}
              ${quickButton('🧾','Đơn hàng',state.me?'M4X.orderHistory()':"M4X.auth('login')")}
              ${quickButton('↓','Tải xuống',state.me?"setView('library')":"M4X.auth('login')")}
              ${quickButton('🎧','Hỗ trợ',state.me?'M4X.supportCenter()':"M4X.auth('login')")}
            </div>
          </div>

          <div class="m4x-side-card">
            <div class="m4x-section-head" style="margin:0 0 4px"><div class="m4x-side-title" style="margin:0">Thông báo</div><button class="m4x-linkbtn" onclick="setView('notifications')">Xem tất cả</button></div>
            ${state.me?(recent.length?recent.map(n=>`<div class="m4x-notice"><b>${esc(n.title||'Thông báo')}</b><small>${esc(n.body||'')}</small></div>`).join(''):'<div class="muted">Chưa có thông báo.</div>'):'<div class="muted">Đăng nhập để xem thông báo.</div>'}
          </div>

          <div class="m4x-side-card m4x-community">
            <div class="m4x-side-title">Cộng đồng M4X</div>
            <p>Tham gia Community để trao đổi, chia sẻ và nhận hỗ trợ từ mọi người.</p>
            <button class="btn" style="width:100%" onclick="${state.me?'M4X.v8OpenCommunity()':"M4X.auth('login')"}">Tham gia ngay</button>
          </div>
        </aside>
      </div>`;

    $('storeSearch').oninput=e=>{state.query=e.target.value;lightRenderStore()};
    document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.cat;lightRenderStore()});
    const reset=document.querySelector('[data-cat-reset]');if(reset)reset.onclick=()=>{state.activeCat='all';state.query='';lightRenderStore()};
  }

  try{renderStore=lightRenderStore;window.renderStore=lightRenderStore}catch(e){console.warn('M4X white UI render hook:',e)}
  try{if(state?.view==='store')lightRenderStore()}catch{}
})();
