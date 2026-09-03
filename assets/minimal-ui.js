/* M4X STORE V11 — Minimal Commerce */
(() => {
  document.documentElement.dataset.m4xTheme='minimal';

  function productCard(p){
    const own=state.owned.get(p.id);
    const label=actionLabel(p);
    const disabled=!own&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    const cat=p.categories?.name||'Sản phẩm';
    return `<article class="card m4x-min-card" onclick="M4X.product('${p.id}')">
      <div class="cover" style="background-image:url('${esc(p.cover_url||'')}')">
        <span class="pill">${esc(cat)}</span>
        ${own?'<span class="pill right">Đã sở hữu</span>':(p.sale_status==='new'?'<span class="pill right">Mới</span>':'')}
      </div>
      <div class="cardbody">
        <div class="name">${esc(p.name)}</div>
        <div class="m4x-min-meta">${esc(cat)}</div>
        <div class="price">${money(p.price)}</div>
        <button class="btn m4x-min-buy ${own?'m4x-min-owned':''}" ${disabled?'disabled':''}
          onclick="event.stopPropagation();M4X.action('${p.id}')">${own&&p.delivery_type==='download'?'Tải lại':label}</button>
      </div>
    </article>`;
  }

  function minimalRenderStore(){
    const q=(state.query||'').toLowerCase().trim();
    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-cat="all">Tất cả</button>`+
      state.categories.map(c=>`<button class="chip ${String(c.id)===state.activeCat?'active':''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');

    const list=state.products.filter(p=>
      (state.activeCat==='all'||String(p.category_id)===state.activeCat)&&
      (!q||`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase().includes(q))
    );

    const promo=state.promo&&state.promo.active&&new Date(state.promo.ends_at)>new Date();

    $('view').innerHTML=`
      <div class="m4x-minimal">
        <section class="m4x-minimal-intro">
          <div>
            <h1>M4X STORE</h1>
            <p>Theme, Tool, AI và sản phẩm số — gọn, dễ tìm, mua nhanh.</p>
          </div>
          ${state.me?`<button class="m4x-mini-wallet" onclick="setView('account')"><span>◈</span><div><small>Ví M4X</small><b>${money(state.profile?.balance||0)}</b></div></button>`:''}
        </section>

        ${promo?`<div class="m4x-promo-strip"><div><b>Ưu đãi +${Number(state.promo.bonus_percent||0)}%</b> khi nạp tiền</div><button class="btn" onclick="M4X.topup()">Nạp tiền</button></div>`:''}

        <div class="m4x-searchrow">
          <input id="storeSearch" class="search" placeholder="Tìm theme, tool, AI..." value="${esc(state.query||'')}">
        </div>

        <div class="cats">${cats}</div>

        <div class="m4x-min-head">
          <h2>Sản phẩm</h2>
          <button id="m4xResetStore">Xem tất cả</button>
        </div>

        <section class="m4x-min-grid">
          ${list.map(productCard).join('')||'<div class="muted">Không có sản phẩm phù hợp.</div>'}
        </section>

        <section class="m4x-min-links">
          <button onclick="${state.me?'M4X.orderHistory()':"M4X.auth('login')"}"><b>Đơn hàng</b><small>Lịch sử mua và hóa đơn</small></button>
          <button onclick="${state.me?'M4X.supportCenter()':"M4X.auth('login')"}"><b>Hỗ trợ</b><small>Gửi ticket cho M4X</small></button>
          <button onclick="${state.me&&M4X.v8CustomRequests?'M4X.v8CustomRequests()':"M4X.auth('login')"}"><b>Đặt hàng riêng</b><small>Theme/Tool theo yêu cầu</small></button>
        </section>
      </div>`;

    $('storeSearch').oninput=e=>{state.query=e.target.value;minimalRenderStore()};
    document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.cat;minimalRenderStore()});
    $('m4xResetStore').onclick=()=>{state.activeCat='all';state.query='';minimalRenderStore()};
  }

  function syncBell(){
    let bell=document.getElementById('m4xBell');
    const top=document.querySelector('.top');
    const cart=document.getElementById('m4xCartQuick');
    if(top&&!bell){
      bell=document.createElement('button');
      bell.id='m4xBell';
      bell.className='btn ghost m4xBell';
      bell.type='button';
      bell.innerHTML='●';
      bell.onclick=()=>setView('notifications');
      top.insertBefore(bell,document.getElementById('accountQuick'));
    }
    if(!bell)return;
    const unread=(state.notifications||[]).filter(n=>!n.read).length;
    bell.innerHTML=`●${unread?`<span class="badge">${unread>99?'99+':unread}</span>`:''}`;
  }

  function compactAccount(){
    const b=document.getElementById('accountQuick');
    if(!b)return;
    b.textContent=state.me
      ? `${state.profile?.display_name||'Tài khoản'} · ${money(state.profile?.balance||0)}`
      : 'Đăng nhập';
  }

  try{
    renderStore=minimalRenderStore;
    window.renderStore=minimalRenderStore;
    syncBell();
    compactAccount();
    if(state?.view==='store')minimalRenderStore();
  }catch(e){console.warn('M4X minimal UI init',e)}

  setInterval(()=>{try{syncBell();compactAccount()}catch{}},2500);
})();
