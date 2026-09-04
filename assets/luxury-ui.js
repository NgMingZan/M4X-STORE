
/* =========================================================
   M4X STORE V16 — OBSIDIAN LUXURY
   ========================================================= */
(() => {
  let priceFilter='all';
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
        <div class="lux-price">${money(p.price)}</div>
        <div class="lux-bottom">
          <span class="lux-sold">Đã bán ${Number(p.sold_count||0)}</span>
          <button class="btn lux-buy ${o&&p.delivery_type==='download'?'owned':''}" ${disabled?'disabled':''}
            onclick="M4XLux.action('${p.id}')">${o&&p.delivery_type==='download'?'Tải lại':'Mua'}</button>
        </div>
      </div>
    </article>`;
  }

  function promoTopup(){
    try{
      if(!state.me && typeof M4X?.auth==='function') return M4X.auth('login');
      if(typeof M4X?.topup==='function') return M4X.topup(0);
      if(typeof topup==='function') return topup(0);
      if(typeof setView==='function') return setView('account');
    }catch(e){console.warn('M4X promo topup',e)}
  }

  function initPromoCountdown(){
    try{
      if(window.__m4xPromoTimer){clearInterval(window.__m4xPromoTimer);window.__m4xPromoTimer=null}
      const deadline=new Date('2026-09-10T00:30:46+07:00').getTime();
      const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=String(v).padStart(2,'0')};
      const tick=()=>{
        const d=deadline-Date.now();
        if(d<=0){
          ['m4xPromoDays','m4xPromoHours','m4xPromoMinutes','m4xPromoSeconds'].forEach(id=>set(id,0));
          const t=document.getElementById('m4xPromoDeadline');if(t)t.textContent='🚀 Ưu đãi đã kết thúc!';
          const b=document.getElementById('m4xPromoTopupBtn');if(b){b.disabled=true;b.textContent='Ưu đãi đã kết thúc'}
          if(window.__m4xPromoTimer){clearInterval(window.__m4xPromoTimer);window.__m4xPromoTimer=null}
          return;
        }
        set('m4xPromoDays',Math.floor(d/86400000));
        set('m4xPromoHours',Math.floor((d%86400000)/3600000));
        set('m4xPromoMinutes',Math.floor((d%3600000)/60000));
        set('m4xPromoSeconds',Math.floor((d%60000)/1000));
      };
      tick();window.__m4xPromoTimer=setInterval(tick,1000);
    }catch(e){console.warn('M4X promo countdown',e)}
  }

  function renderStoreLux(){
    const list=filtered();
    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-lux-cat="all">Tất cả</button>`+
      state.categories.map(c=>`<button class="chip ${String(c.id)===String(state.activeCat)?'active':''}" data-lux-cat="${c.id}">${esc(c.name)}</button>`).join('');

    $('view').innerHTML=`<div class="lux-store">
      <section class="lux-hero lux-promo-hero" id="m4xPromoHero">
        <div class="lux-hero-copy lux-promo-copy">
          <span class="lux-eyebrow lux-promo-tag"><i></i>⚡ FLASH SALE · M4X STORE</span>
          <div class="lux-promo-domain">m4x-store.pages.dev · Ưu đãi độc quyền</div>
          <h1>💥 Nạp tiền nhận ngay <span>+30%</span></h1>
          <p>👉 Nạp càng nhiều, nhận càng nhiều! Tận dụng ưu đãi để mua sắm Theme, App, AI, Tool và các sản phẩm số tại M4X STORE.</p>

          <div class="lux-promo-timer" id="m4xPromoCountdown">
            <div><b id="m4xPromoDays">00</b><small>Ngày</small></div>
            <div><b id="m4xPromoHours">00</b><small>Giờ</small></div>
            <div><b id="m4xPromoMinutes">00</b><small>Phút</small></div>
            <div><b id="m4xPromoSeconds">00</b><small>Giây</small></div>
          </div>

          <div class="lux-hero-actions lux-promo-actions">
            <button class="btn lux-primary lux-promo-btn" id="m4xPromoTopupBtn" onclick="M4XLux.promoTopup()">💰 Nạp ngay hôm nay</button>
            <span class="lux-promo-warning" id="m4xPromoDeadline">⚠️ Đến 00:30:46 10/09/2026 · Hết giờ là hết ưu đãi!</span>
          </div>
        </div>
        <div class="lux-status lux-promo-status">
          <span><i></i>+30% số dư</span><span><i></i>VietQR</span><span><i></i>Tự động cộng</span>
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

    initPromoCountdown();
    $('luxSearch').oninput=e=>{state.query=e.target.value;renderStoreLux()};
    document.querySelectorAll('[data-lux-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.luxCat;renderStoreLux()});
    document.querySelectorAll('[data-lux-price]').forEach(b=>b.onclick=()=>{priceFilter=b.dataset.luxPrice;renderStoreLux()});
    setupChrome();
  }

  try{
    renderStore=renderStoreLux;
    window.renderStore=renderStoreLux;
  }catch(e){console.warn('M4X Luxury renderStore',e)}

  window.M4XLux={favorite:toggleFav,action,promoTopup};

  setupChrome();
  try{if(state?.view==='store')renderStoreLux()}catch(e){console.warn(e)}
  setInterval(()=>{try{setupChrome()}catch{}},2500);
})();
