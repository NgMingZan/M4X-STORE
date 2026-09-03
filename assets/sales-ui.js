/* M4X STORE V10.2 — Sales UI */
(() => {
  document.documentElement.dataset.m4xTheme='sales';

  function status(p){
    return p.stock_mode==='limited' ? `Còn ${available(p)}` : statusText(p.sale_status);
  }

  function card(p){
    const own=state.owned.get(p.id);
    const label=actionLabel(p);
    const disabled=!own&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    const cat=p.categories?.name||'Sản phẩm';
    return `<article class="card m4x-sales-card" onclick="M4X.product('${p.id}')">
      <div class="cover" style="background-image:url('${esc(p.cover_url||'')}')">
        <span class="pill">${esc(cat)}</span>
        ${own?'<span class="pill right">Đã sở hữu</span>':(p.sale_status==='new'?'<span class="pill right">Mới</span>':'')}
      </div>
      <div class="cardbody">
        <div class="name">${esc(p.name)}</div>
        <div class="m4x-catline">${esc(cat)} · ${esc(status(p))}</div>
        <div class="m4x-sold">Đã bán ${Number(p.sold_count||0)}</div>
        <div class="price">${money(p.price)}</div>
        <button class="btn m4x-buy ${own?'m4x-owned':''}" ${disabled?'disabled':''}
          onclick="event.stopPropagation();M4X.action('${p.id}')">${own&&p.delivery_type==='download'?'☁ Tải lại':label==='Mua'?'🛍 Mua':label}</button>
      </div>
    </article>`;
  }

  function renderSalesStore(){
    const q=(state.query||'').toLowerCase().trim();

    const categories=[...(state.categories||[])].sort((a,b)=>{
      const an=String(a?.name||'').trim().toLowerCase();
      const bn=String(b?.name||'').trim().toLowerCase();
      const at=an==='theme'||an.includes('theme');
      const bt=bn==='theme'||bn.includes('theme');
      if(at!==bt)return at?-1:1;
      return 0;
    });

    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-cat="all">▦ Tất cả</button>`+
      categories.map(c=>`<button class="chip ${String(c.id)===state.activeCat?'active':''}" data-cat="${c.id}">${esc(c.icon||'')} ${esc(c.name)}</button>`).join('');

    const list=state.products.filter(p=>
      (state.activeCat==='all'||String(p.category_id)===state.activeCat) &&
      (!q||`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase().includes(q))
    );

    $('view').innerHTML=`
      <div class="m4x-sales-home">
        <section class="m4x-sales-hero">
          <div class="m4x-sales-hero-copy">
            <span class="m4x-sales-kicker">M4X STORE · DIGITAL MARKET</span>
            <h1>Theme đẹp.<br>Tool chất. <span>M4X.</span></h1>
            <p>Kho sản phẩm số dành cho bạn — mua nhanh, nhận ngay và tải lại thuận tiện trong tài khoản.</p>
            <div class="m4x-trust-row">
              <span class="m4x-trust-pill">🛡 Sản phẩm chất lượng</span>
              <span class="m4x-trust-pill">🔒 Thanh toán an toàn</span>
              <span class="m4x-trust-pill">⚡ Tải về nhanh chóng</span>
            </div>
          </div>
        </section>

        <div class="m4x-search-line">
          <div class="m4x-search-wrap">
            <input id="storeSearch" class="search" placeholder="Tìm kiếm theme, tool, AI..." value="${esc(state.query||'')}">
          </div>
          <button class="m4x-filter-btn" id="m4xFilterBtn">⌁</button>
        </div>

        <div class="cats" id="m4xSalesCats">${cats}</div>

        <div class="m4x-sales-section-head">
          <h2>🔥 Sản phẩm nổi bật</h2>
          <button id="m4xSeeAll">Xem tất cả ›</button>
        </div>

        <section class="m4x-sales-grid">${list.map(card).join('')||'<div class="muted">Chưa có sản phẩm phù hợp.</div>'}</section>

        <section class="m4x-sales-actions">
          <button class="m4x-sales-action" onclick="${state.me?"setView('rewards')":"M4X.auth('login')"}">
            <span>🎁</span><b>Nhiệm vụ & Phần thưởng</b><small>Kiếm xu miễn phí, nhận quà hấp dẫn</small>
          </button>
          <button class="m4x-sales-action" onclick="${state.me?'M4X.orderHistory()':"M4X.auth('login')"}">
            <span>🧾</span><b>Đơn hàng của tôi</b><small>Xem lịch sử mua và trạng thái đơn</small>
          </button>
          <button class="m4x-sales-action" onclick="${state.me&&M4X.v8OpenCommunity?'M4X.v8OpenCommunity()':"M4X.auth('login')"}">
            <span>👥</span><b>Cộng đồng M4X</b><small>Thảo luận, chia sẻ và nhận hỗ trợ</small>
          </button>
          <button class="m4x-sales-action" onclick="${state.me&&M4X.v8CustomRequests?'M4X.v8CustomRequests()':"M4X.auth('login')"}">
            <span>👑</span><b>Đặt hàng theo yêu cầu</b><small>Không thấy sản phẩm? Gửi yêu cầu riêng</small>
          </button>
        </section>

        <section class="m4x-sales-footer-trust">
          <div><i>🛡️</i><span><b>Uy tín & chất lượng</b><small>Sản phẩm được quản lý bởi M4X</small></span></div>
          <div><i>⚡</i><span><b>Tải về nhanh</b><small>Nhận sản phẩm ngay sau khi mua</small></span></div>
          <div><i>🎧</i><span><b>Hỗ trợ trực tiếp</b><small>Ticket và Community M4X</small></span></div>
        </section>
      </div>`;

    $('storeSearch').oninput=e=>{state.query=e.target.value;renderSalesStore()};
    document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.cat;renderSalesStore()});
    $('m4xSeeAll').onclick=()=>{state.activeCat='all';state.query='';renderSalesStore()};
    $('m4xFilterBtn').onclick=()=>document.getElementById('m4xSalesCats')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function refreshTop(){
    const b=document.getElementById('accountQuick');
    if(!b)return;
    b.innerHTML=state?.me
      ? `<span class="m4x-top-wallet"><small>Ví của bạn</small><b>${money(state.profile?.balance||0)}</b></span>`
      : `<span class="m4x-top-login">Đăng nhập</span>`;
  }

  try{
    renderStore=renderSalesStore;
    window.renderStore=renderSalesStore;
    refreshTop();
    if(state?.view==='store')renderSalesStore();
  }catch(e){console.warn('M4X Sales UI init:',e)}

  setInterval(()=>{try{refreshTop()}catch{}},2500);
})();
