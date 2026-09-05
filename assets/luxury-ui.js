
/* =========================================================
   M4X STORE V16 — OBSIDIAN LUXURY
   ========================================================= */
(() => {
  let priceFilter='all';
  const THEME_SERVICE_ID='00000000-0000-4000-8000-000000002100';
  const isThemeService=p=>String(p?.id||'')===THEME_SERVICE_ID;
  const favKey='m4x_lux_favorites';
  const favs=()=>{try{return new Set(JSON.parse(localStorage.getItem(favKey)||'[]'))}catch{return new Set()}};
  const saveFav=s=>localStorage.setItem(favKey,JSON.stringify([...s]));

  const delivery=p=>{
    const x=String(p.delivery_type||'').toLowerCase();
    if(x==='download')return 'Tải xuống';
    if(['license','key','activation'].includes(x))return 'Bản quyền';
    if(['subscription','service','content'].includes(x))return 'Dịch vụ';
    return 'Sản phẩm số';
  };

  function ratingText(p){
    const n=Number(p.rating_avg??p.rating??0);
    return n>0?`★ ${n.toFixed(1)}`:'Mới';
  }

  function setupChrome(){
    document.documentElement.dataset.m4xTheme='luxury';
    const brand=document.querySelector('.brand');
    if(brand&&!brand.querySelector('.lux-logo')){
      brand.innerHTML=`<span class="lux-logo">M4X</span><span class="lux-brand-copy"><b>M4X <span>STORE</span></b><small>DIGITAL GOODS & COMMUNITY</small></span>`;
    }

    let bell=document.getElementById('luxNotifBell');
    const top=document.querySelector('.top');
    const account=document.getElementById('accountQuick');
    const cart=document.getElementById('m4xCartQuick');
    if(top&&!bell){
      bell=document.createElement('button');
      bell.id='luxNotifBell';bell.className='btn ghost lux-bell';bell.type='button';
      bell.onclick=()=>setView('notifications');
      if(account)top.insertBefore(bell,account);else top.appendChild(bell);
    }
    if(bell){
      const unread=(state.notifications||[]).filter(n=>!n.read).length;
      bell.innerHTML=`♟${unread?`<span class="badge">${unread>99?'99+':unread}</span>`:''}`;
    }
    if(account){
      account.textContent=state.me?money(state.profile?.balance||0):'Đăng nhập';
      account.onclick=()=>state.me?setView('account'):M4X.auth('login');
    }
    ensureCommunityNav();
  }

  function ensureCommunityNav(){
    const nav=document.querySelector('.bottomnav');
    if(!nav)return;
    let community=nav.querySelector('[data-view="community"]');
    if(!community){
      community=document.createElement('button');
      community.className='navbtn';community.dataset.view='community';community.textContent='Cộng đồng';
      community.onclick=()=>setView('community');
      const notif=nav.querySelector('[data-view="notifications"]');
      notif?nav.insertBefore(community,notif):nav.appendChild(community);
    }
    const order=['store','library','rewards','community','notifications','account'];
    order.forEach(v=>{
      const el=nav.querySelector(`[data-view="${v}"]`);
      if(el)nav.appendChild(el);
    });
  }

  function filtered(){
    const q=String(state.query||'').toLowerCase().trim();
    return state.products.filter(p=>{
      if(state.activeCat!=='all'&&String(p.category_id)!==String(state.activeCat))return false;
      if(q&&!`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase().includes(q))return false;
      const price=Number(p.price||0);
      if(priceFilter==='free')return price===0;
      if(priceFilter==='under100')return price>0&&price<100000;
      if(priceFilter==='over100')return price>=100000;
      return true;
    });
  }

  function toggleFav(id){
    const s=favs();s.has(id)?s.delete(id):s.add(id);saveFav(s);renderStoreLux();
  }

  function action(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    if(isThemeService(p)){location.href='./theme-translator.html';return}
    const o=state.owned.get(id);
    if(o&&p.delivery_type==='download')return M4X.download(o.order_code,o.access_token);
    return M4X.product(id);
  }

  function card(p){
    const o=state.owned.get(p.id),fav=favs().has(p.id);
    const disabled=!o&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    return `<article class="lux-card">
      <div class="lux-cover" style="background-image:url('${esc(p.cover_url||'')}')" onclick="M4X.product('${p.id}')">
        <span class="lux-delivery">${esc(delivery(p))}</span>
        <button class="lux-fav ${fav?'on':''}" onclick="event.stopPropagation();M4XLux.favorite('${p.id}')">${fav?'♥':'♡'}</button>
      </div>
      <div class="lux-body">
        <div class="lux-meta"><span class="lux-cat">${esc(p.categories?.name||'Sản phẩm')}</span><span class="lux-rating">${ratingText(p)}</span></div>
        <div class="lux-name" onclick="M4X.product('${p.id}')">${esc(p.name)}</div>
        <div class="lux-price">${isThemeService(p)?'Từ 10.000đ':money(p.price)}</div>
        <div class="lux-bottom">
          <span class="lux-sold">Đã bán ${Number(p.sold_count||0)}</span>
          <button class="btn lux-buy ${o&&p.delivery_type==='download'?'owned':''}" ${disabled?'disabled':''}
            onclick="M4XLux.action('${p.id}')">${isThemeService(p)?'🌐 Gửi MTZ & báo giá':(o&&p.delivery_type==='download'?'Tải lại':'Mua')}</button>
        </div>
      </div>
    </article>`;
  }

  function renderStoreLux(){
    const list=filtered().sort((a,b)=>Number(isThemeService(b))-Number(isThemeService(a)));
    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-lux-cat="all">Tất cả</button>`+
      state.categories.map(c=>`<button class="chip ${String(c.id)===String(state.activeCat)?'active':''}" data-lux-cat="${c.id}">${esc(c.name)}</button>`).join('');

    $('view').innerHTML=`<div class="lux-store">
      <section class="lux-hero">
        <div class="lux-hero-copy">
          <span class="lux-eyebrow"><i></i>M4X STORE · ONLINE</span>
          <h1>Sản phẩm số <span>được chọn lọc.</span></h1>
          <p>App Premium, AI, Theme và Tool trong một Store duy nhất. Thanh toán VietQR 24/7, quản lý đơn hàng trong tài khoản và cộng đồng realtime ngay trong M4X.</p>
          <div class="lux-hero-actions">
            <button class="btn lux-primary" onclick="document.getElementById('luxSearch')?.focus()">Khám phá sản phẩm</button>
            <button class="btn ghost" onclick="setView('community')">Vào Community</button>
          </div>
        </div>
        <div class="lux-status">
          <span><i></i>Supabase</span><span><i></i>VietQR</span><span><i></i>Community</span>
        </div>
      </section>

      <div class="lux-searchbar"><input id="luxSearch" class="search" placeholder="Tìm App, AI, Theme, Tool..." value="${esc(state.query||'')}"></div>
      <div class="lux-cats">${cats}</div>
      <div class="lux-price-row">
        <button class="lux-filter ${priceFilter==='all'?'active':''}" data-lux-price="all">Mọi mức giá</button>
        <button class="lux-filter ${priceFilter==='free'?'active':''}" data-lux-price="free">Miễn phí</button>
        <button class="lux-filter ${priceFilter==='under100'?'active':''}" data-lux-price="under100">Dưới 100K</button>
        <button class="lux-filter ${priceFilter==='over100'?'active':''}" data-lux-price="over100">Từ 100K</button>
      </div>

      <div class="lux-section-head"><h2>Sản phẩm nổi bật</h2><small>${list.length} sản phẩm</small></div>
      <section class="lux-grid">${list.map(card).join('')||'<div class="muted">Không có sản phẩm phù hợp.</div>'}</section>

      <section class="lux-links">
        <button onclick="${state.me?'M4X.orderHistory()':"M4X.auth('login')"}"><b>Đơn hàng</b><small>Theo dõi mua hàng & hóa đơn</small></button>
        <button onclick="setView('community')"><b>Community Chat</b><small>Phòng chat realtime của M4X</small></button>
        <button onclick="${typeof M4X.systemStatus==='function'?'M4X.systemStatus()':"setView('store')"}"><b>Trạng thái hệ thống</b><small>Store · Thanh toán · Download</small></button>
      </section>
    </div>`;

    $('luxSearch').oninput=e=>{state.query=e.target.value;renderStoreLux()};
    document.querySelectorAll('[data-lux-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.luxCat;renderStoreLux()});
    document.querySelectorAll('[data-lux-price]').forEach(b=>b.onclick=()=>{priceFilter=b.dataset.luxPrice;renderStoreLux()});
    setupChrome();
  }

  try{
    renderStore=renderStoreLux;
    window.renderStore=renderStoreLux;
  }catch(e){console.warn('M4X Luxury renderStore',e)}

  window.M4XLux={favorite:toggleFav,action};

  setupChrome();
  try{if(state?.view==='store')renderStoreLux()}catch(e){console.warn(e)}
  setInterval(()=>{try{setupChrome()}catch{}},2500);
})();
