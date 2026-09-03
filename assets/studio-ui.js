
/* M4X STORE V13 — UI based on provided Google AI Studio preview */
(() => {
  let priceFilter='all';
  const favKey='m4x_studio_favs';
  const favs=()=>{try{return new Set(JSON.parse(localStorage.getItem(favKey)||'[]'))}catch{return new Set()}};
  const saveFav=s=>localStorage.setItem(favKey,JSON.stringify([...s]));
  const delivery=p=>{
    const x=String(p.delivery_type||'').toLowerCase();
    if(x==='download')return 'Tải xuống';
    if(['license','key','activation'].includes(x))return 'Bản quyền';
    return 'Kích hoạt dịch vụ';
  };
  const rscore=p=>Number(p.rating_avg??p.rating??4.9)||4.9;

  function setupChrome(){
    const brand=document.querySelector('.brand');
    if(brand&&!brand.querySelector('.m4x-studio-logo')){
      brand.innerHTML=`<span class="m4x-studio-logo">M4X</span><span class="m4x-brand-copy"><b>M4X <span>STORE</span></b><small>m4x-store.pages.dev</small></span>`;
    }
    let support=$('m4xStudioSupport');
    if(!support){
      support=document.createElement('button');
      support.id='m4xStudioSupport';support.className='btn ghost';support.textContent='♧';
      support.onclick=studioSupport;
      document.querySelector('.top')?.appendChild(support);
    }
    const aq=$('accountQuick');
    if(aq){
      aq.textContent=state.me?`▣ ${money(state.profile?.balance||0)}`:'Đăng nhập';
      aq.onclick=()=>state.me?setView('account'):M4X.auth('login');
    }
    document.documentElement.dataset.m4xTheme='studio';
  }

  function filtered(){
    const q=String(state.query||'').toLowerCase().trim();
    return state.products.filter(p=>{
      if(state.activeCat!=='all'&&String(p.category_id)!==String(state.activeCat))return false;
      if(q&&!`${p.name} ${p.description||''} ${p.categories?.name||''}`.toLowerCase().includes(q))return false;
      const n=Number(p.price||0);
      if(priceFilter==='free')return n===0;
      if(priceFilter==='under100')return n>0&&n<100000;
      if(priceFilter==='over100')return n>=100000;
      return true;
    });
  }

  function toggleFav(id){
    const s=favs();s.has(id)?s.delete(id):s.add(id);saveFav(s);renderStoreStudio();
  }

  function productCard(p){
    const own=state.owned.get(p.id),f=favs().has(p.id);
    const dis=!own&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    return `<article class="m4x-studio-card">
      <div class="m4x-studio-cover" style="background-image:url('${esc(p.cover_url||'')}')" onclick="M4X.product('${p.id}')">
        <span class="m4x-delivery">♙ ${esc(delivery(p))}</span>
        <button class="m4x-fav ${f?'on':''}" onclick="event.stopPropagation();M4X.studioFavorite('${p.id}')">${f?'♥':'♡'}</button>
      </div>
      <div class="m4x-studio-body">
        <div class="m4x-studio-meta"><span class="m4x-studio-cat">${esc(p.categories?.name||'Sản phẩm')}</span><span class="m4x-stars">★ ${rscore(p).toFixed(1)}</span></div>
        <div class="m4x-studio-name" onclick="M4X.product('${p.id}')">${esc(p.name)}</div>
        <div class="m4x-studio-price">${money(p.price)}</div>
        <div class="m4x-studio-bottom">
          <span class="m4x-studio-sold">Đã bán ${Number(p.sold_count||0)}</span>
          <button class="btn m4x-buy ${own&&p.delivery_type==='download'?'m4x-download':''}" ${dis?'disabled':''}
            onclick="M4X.studioAction('${p.id}')">${own&&p.delivery_type==='download'?'↓ Tải':'▣ Mua'}</button>
        </div>
      </div>
    </article>`;
  }

  function renderStoreStudio(){
    const list=filtered();
    const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-studiocat="all">Tất cả</button>`+
      state.categories.map(c=>`<button class="chip ${String(c.id)===String(state.activeCat)?'active':''}" data-studiocat="${c.id}">${esc(c.name)}</button>`).join('');
    $('view').innerHTML=`<div class="m4x-studio-store">
      <section class="m4x-studio-hero" onclick="M4X.systemStatus&&M4X.systemStatus()">
        <span class="m4x-studio-refresh">↻</span>
        <div class="m4x-studio-hero-copy">
          <span class="m4x-v82">M4X STORE V8.2</span>
          <h1>Kho Tài Khoản & Theme Số 1</h1>
          <p>Thanh toán VietQR tự động 24/7 · Bảo hành uy tín</p>
        </div>
        <span class="m4x-studio-dots"><i></i><i></i><i></i><i></i></span>
      </section>

      <div class="m4x-studio-search"><input id="studioSearch" class="search" placeholder="Tìm kiếm Youtube, Canva, CapCut, Theme..." value="${esc(state.query||'')}"></div>
      <div class="m4x-studio-cats">${cats}</div>
      <div class="m4x-studio-prices">
        <button class="m4x-price-chip ${priceFilter==='all'?'active':''}" data-price="all">Mọi mức giá</button>
        <button class="m4x-price-chip ${priceFilter==='free'?'active':''}" data-price="free">Miễn phí 0đ</button>
        <button class="m4x-price-chip ${priceFilter==='under100'?'active':''}" data-price="under100">&lt; 100.000đ</button>
        <button class="m4x-price-chip ${priceFilter==='over100'?'active':''}" data-price="over100">≥ 100.000đ</button>
      </div>
      <div class="m4x-studio-head"><h2>Sản phẩm (${list.length})</h2><button onclick="state.query='';state.activeCat='all';M4X.studioResetPrice();">Xem tất cả</button></div>
      <section class="m4x-studio-grid">${list.map(productCard).join('')||'<div class="muted">Không có sản phẩm phù hợp.</div>'}</section>
    </div>`;
    $('studioSearch').oninput=e=>{state.query=e.target.value;renderStoreStudio()};
    document.querySelectorAll('[data-studiocat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.studiocat;renderStoreStudio()});
    document.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>{priceFilter=b.dataset.price;renderStoreStudio()});
    setupChrome();
  }

  function studioAction(id){
    const p=state.products.find(x=>x.id===id),o=state.owned.get(id);if(!p)return;
    if(o&&p.delivery_type==='download')return M4X.download(o.order_code,o.access_token);
    return studioCheckout(id);
  }

  function studioProduct(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    const o=state.owned.get(id),imgs=[...new Set([p.cover_url,...(Array.isArray(p.gallery)?p.gallery:[])].filter(Boolean))];
    openModal(`<div class="m4x-support-box">
      ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:13px;border:1px solid #15446e">`:''}
      <div style="margin-top:12px;color:#925eff;font-size:9px">${esc(p.categories?.name||'Sản phẩm')} · ${esc(delivery(p))}</div>
      <h2 style="margin:5px 0">${esc(p.name)}</h2>
      <div style="display:flex;justify-content:space-between;gap:10px"><b style="font-size:21px;color:#12d9ff">${money(p.price)}</b><span class="m4x-stars">★ ${rscore(p).toFixed(1)}</span></div>
      <p>${esc(p.description||'Chưa có mô tả sản phẩm.')}</p>
      <div class="m4x-info-row"><span>Phiên bản</span><b>${esc(p.version_name||'1.0')}</b></div>
      <div class="m4x-info-row"><span>Tương thích</span><b>${esc(p.compatibility||'Xem mô tả')}</b></div>
      <div class="m4x-info-row"><span>Dung lượng</span><b>${esc(p.file_size_label||'—')}</b></div>
      <div class="m4x-info-row"><span>Bảo hành</span><b>${esc(p.warranty_label||p.warranty||'Theo chính sách M4X')}</b></div>
      ${p.changelog?`<div class="m4x-order-note"><b>Cập nhật mới</b><br>${esc(p.changelog)}</div>`:''}
      <div class="m4x-order-actions">
        ${o&&p.delivery_type==='download'
          ?`<button class="btn primary" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">↓ Tải file ngay</button>`
          :`<button class="btn m4x-buy" onclick="M4X.studioCheckout('${p.id}')">▣ Mua ngay</button>`}
        <button class="btn ghost" onclick="M4X.studioSupport()">♧ Nhận hỗ trợ</button>
      </div>
      <div id="dlmsg" class="muted"></div>
    </div>`);
  }

  function studioCheckout(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    if(!state.me)return M4X.auth('login');
    const bal=Number(state.profile?.balance||0),price=Number(p.price||0);
    const enough=bal>=price;
    openModal(`<div class="m4x-support-box">
      <div class="m4x-pay-title"><span style="color:#13d9ff">▦</span><h2>Thanh toán VietQR</h2></div>
      <div class="m4x-checkout-product">
        <div style="display:flex;justify-content:space-between;gap:10px"><span class="muted">Sản phẩm</span><b style="color:#8c5cff">M4X CHECKOUT</b></div>
        <h3 style="font-size:12px">${esc(p.name)}</h3>
        <div class="price">${money(price)}</div>
      </div>
      <div class="m4x-wallet-ready">
        <div><small style="color:#20e873">▣ Số dư ví M4X khả dụng</small><br><b>Hiện có: ${money(bal)}</b></div>
        <button class="btn ${enough?'m4x-download':''}" ${enough?'':'disabled'} onclick="M4X.studioWalletBuy('${p.id}')">Trừ ví</button>
      </div>
      <div style="text-align:center"><span class="m4x-expire">⏱ Đơn hàng hết hạn sau: 15:00</span></div>
      <button class="btn m4x-buy" style="width:100%" onclick="M4X.studioQRBuy('${p.id}')">Tạo VietQR ${money(price)}</button>
      ${!enough?`<p class="muted" style="font-size:9px;text-align:center">Ví thiếu ${money(price-bal)} — bạn vẫn có thể thanh toán bằng VietQR.</p>`:''}
    </div>`);
  }

  async function studioWalletBuy(id){
    closeModal();
    return M4X.buy(id);
  }

  function qrUrl(amount,desc){
    return `https://vietqr.app/img?acc=${encodeURIComponent(C.BANK.account)}&bank=${encodeURIComponent(C.BANK.name)}&amount=${amount}&des=${encodeURIComponent(desc)}&template=compact&showinfo=true&fullacc=true&holder=${encodeURIComponent(C.BANK.holder)}&store=${encodeURIComponent(C.BANK.store)}`;
  }
  function copy(v){navigator.clipboard?.writeText(String(v)).catch(()=>{});}

  async function studioQRBuy(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    const {data,error}=await sb.rpc('create_wallet_topup',{p_amount:Number(p.price||0)});
    if(error)return alert(error.message);
    const desc=`SEVQR ${data.topup_code}`,qr=qrUrl(data.amount,desc);
    let expire=Number(C.ORDER_EXPIRE_MINUTES||15)*60;
    openModal(`<div class="m4x-support-box">
      <div class="m4x-pay-title"><span style="color:#13d9ff">▦</span><h2>Thanh toán VietQR</h2></div>
      <div style="text-align:center"><span id="studioExpire" class="m4x-expire">⏱ Đơn hàng hết hạn sau: 15:00</span></div>
      <div class="m4x-qrbox"><img src="${qr}"><p class="muted" style="font-size:9px">Quét mã bằng app ngân hàng bất kỳ</p></div>
      ${[['Ngân hàng',C.BANK.name],['Số tài khoản',C.BANK.account],['Chủ tài khoản',C.BANK.holder],['Nội dung',desc]].map(([a,b])=>`<div class="m4x-payrow"><span>${a}</span><b>${esc(b)}</b><button class="m4x-copy" onclick="M4X.studioCopy('${esc(b)}')">▣</button></div>`).join('')}
      <button id="studioCheckPay" class="btn m4x-buy" style="width:100%;margin-top:10px" onclick="M4X.studioCheckQR('${data.topup_code}','${p.id}')">✓ Tôi đã chuyển khoản thành công</button>
      <div id="payState" class="muted" style="text-align:center;margin-top:8px;font-size:9px">Hệ thống sẽ tự xác nhận khi ngân hàng báo giao dịch.</div>
    </div>`);
    const t=setInterval(()=>{
      const el=$('studioExpire');if(!el)return clearInterval(t);
      expire=Math.max(0,expire-1);const m=Math.floor(expire/60),s=expire%60;
      el.textContent=`⏱ Đơn hàng hết hạn sau: ${m}:${String(s).padStart(2,'0')}`;
      if(!expire)clearInterval(t);
    },1000);
    if(state.poll)clearInterval(state.poll);
    state.poll=setInterval(()=>M4X.studioCheckQR(data.topup_code,p.id,true),3000);
  }

  async function studioCheckQR(code,id,silent=false){
    const {data:t}=await sb.from('topups').select('status').eq('topup_code',code).single();
    if(t?.status==='paid'){
      if(state.poll)clearInterval(state.poll);state.poll=null;
      await loadAuth();
      const box=$('payState');if(box)box.innerHTML='<span class="ok">✓ Đã nhận thanh toán, đang hoàn tất đơn...</span>';
      setTimeout(()=>M4X.buy(id),350);
    }else if(!silent){
      const box=$('payState');if(box)box.textContent='Chưa nhận được giao dịch. Vui lòng chờ hệ thống đối soát.';
    }
  }

  async function renderLibraryStudio(){
    if(!state.me){$('view').innerHTML=`<div class="m4x-studio-title"><h1>Thư viện</h1></div><div class="item"><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button></div>`;return}
    $('view').innerHTML='<div class="muted">Đang tải thư viện...</div>';
    const {data,error}=await sb.from('orders')
      .select('id,order_code,product_id,amount,status,paid_at,created_at,access_token,purchased_version,products(name,description,delivery_type,version_name,cover_url)')
      .eq('user_id',state.me.id).eq('status','paid').order('paid_at',{ascending:false}).limit(200);
    if(error){$('view').innerHTML=`<div class="badtxt">${esc(error.message)}</div>`;return}
    const a=data||[];
    $('view').innerHTML=`<div class="m4x-library-head"><div><h1>Thư viện của bạn</h1><p>Đã sở hữu ${a.length} sản phẩm</p></div><div class="m4x-lib-icon">▣</div></div>
      ${a.map(o=>{
        const p=o.products||{},down=p.delivery_type==='download';
        return `<article class="m4x-order-card">
          <div class="m4x-order-top"><span>Mã đơn: ${esc(o.order_code)}</span><span class="m4x-paid">● Đã thanh toán</span></div>
          <div class="m4x-order-main">
            ${p.cover_url?`<img src="${esc(p.cover_url)}">`:'<div></div>'}
            <div><h3>${esc(p.name||'Sản phẩm')}</h3><small>${money(o.amount)} · ${dt(o.paid_at||o.created_at)}</small><b>Bản: ${esc(o.purchased_version||p.version_name||'—')}</b></div>
          </div>
          <div class="m4x-order-note">${esc(down?'Nhấn “Tải file ngay” để tải sản phẩm về máy.':p.description||'Sản phẩm dịch vụ đã được ghi nhận. Liên hệ CSKH nếu cần hỗ trợ.')}</div>
          <div class="m4x-order-actions">
            ${down?`<button class="btn primary" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">↓ Tải file ngay</button>`:''}
            <button class="btn ghost" onclick="M4X.newTicket('${o.id}')">♧ Nhận hỗ trợ</button>
          </div>
        </article>`;
      }).join('')||'<div class="muted">Bạn chưa có sản phẩm.</div>'}`;
    setupChrome();
  }

  async function renderNotificationsStudio(){
    if(!state.me){$('view').innerHTML=`<div class="m4x-studio-title"><h1>Thông báo hệ thống</h1></div><div class="item"><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button></div>`;return}
    $('view').innerHTML=`<div class="m4x-studio-title"><h1>Thông báo hệ thống</h1><button class="btn ghost" onclick="M4X.readAll()">✓✓</button></div>
      <div class="m4x-notif-list">${state.notifications.map((n,i)=>`<article class="m4x-notif ${i%2?'update':''}" onclick="M4X.readNotif('${n.id}')">
        <div class="m4x-notif-icon">${i%2?'✦':'♟'}</div>
        <div><small style="color:#8c5cff">${n.read?'Đã đọc':'Mới'}</small><h3>${esc(n.title)}</h3><p>${esc(n.body||'')}</p></div>
        <time>${dt(n.created_at)}</time>
      </article>`).join('')||'<div class="muted">Chưa có thông báo.</div>'}</div>`;
    setupChrome();
  }

  async function renderAccountStudio(){
    if(!state.me){$('view').innerHTML=`<div class="m4x-studio-title"><h1>Tài khoản</h1></div><div class="item"><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button> <button class="btn ghost" onclick="M4X.auth('register')">Đăng ký</button></div>`;return}
    $('view').innerHTML=`<section class="m4x-profile">
      <div class="m4x-profile-top"><div class="m4x-avatar">●</div><div><h2>${esc(state.profile?.display_name||'Khách Hàng M4X')} <span style="color:#12d9ff">●</span></h2><small>${esc(state.me.email||'')}</small><br><span class="m4x-vip">Thành viên VIP</span></div></div>
      <div class="m4x-balance-box"><div><small>Số dư tài khoản M4X</small><b>${money(state.profile?.balance||0)}</b></div><button class="btn m4x-buy" onclick="M4X.topup()">▣ Nạp tiền</button></div>
    </section>
    <section class="m4x-account-card">
      <h3>▤ Thông tin thanh toán ngân hàng <span style="float:right;color:#12d9ff;font-size:8px">Napas 24/7</span></h3>
      ${[['Ngân hàng',C.BANK.name],['Số tài khoản',C.BANK.account],['Chủ tài khoản',C.BANK.holder],['Cửa hàng',C.BANK.store]].map(([a,b])=>`<div class="m4x-info-row"><span>${a}</span><b>${esc(b)} <button class="m4x-copy" onclick="M4X.studioCopy('${esc(b)}')">▣</button></b></div>`).join('')}
    </section>
    <section class="m4x-account-card"><h3>Kênh hỗ trợ & Cộng đồng</h3>
      <a class="m4x-channel" href="https://t.me/bengtayy">➤ <span>Telegram CSKH: @bengtayy</span></a>
      <a class="m4x-channel" href="https://www.tiktok.com/@m.dan_iuiu">▣ <span>TikTok Chính thức: @m.dan_iuiu</span></a>
      <a class="m4x-channel" href="https://m4x-store.pages.dev/">● <span>Website: m4x-store.pages.dev</span></a>
    </section>
    <div class="toolbar" style="margin-top:12px">
      <button class="btn ghost" onclick="M4X.orderHistory()">Đơn hàng</button>
      <button class="btn ghost" onclick="M4X.redeemCode()">Gift code</button>
      <button class="btn ghost" onclick="M4X.editProfile()">Sửa tài khoản</button>
      ${state.profile?.role==='admin'?`<button class="btn ghost" onclick="location.href='./admin.html'">Quản trị</button>`:''}
      <button class="btn bad" onclick="M4X.logout()">Đăng xuất</button>
    </div>`;
    setupChrome();
  }

  function topupStudio(){
    if(!state.me)return M4X.auth('login');
    openModal(`<div class="m4x-support-box">
      <div class="m4x-pay-title"><span style="color:#23e870">▣</span><h2>Nạp tiền vào tài khoản</h2></div>
      <p class="muted">Chọn mệnh giá nạp (VNĐ)</p>
      <div class="m4x-denoms">${[20000,50000,100000,200000,500000,1000000].map((v,i)=>`<button class="m4x-denom ${v===100000?'active':''}" onclick="M4X.studioTopupAmount(${v})">${money(v)}</button>`).join('')}</div>
      <input id="studioTopupCustom" class="input" type="number" min="10000" step="1000" value="100000" placeholder="Số tiền">
      <button class="btn m4x-confirm" onclick="M4X.studioTopupAmount(Number($('studioTopupCustom').value))">▣ Tạo mã nạp VietQR</button>
      <div id="topupMsg" class="muted"></div>
    </div>`);
  }

  async function topupAmount(amount){
    if(!amount||amount<10000)return alert('Tối thiểu 10.000đ');
    const {data,error}=await sb.rpc('create_wallet_topup',{p_amount:amount});
    if(error)return alert(error.message);
    const desc=`SEVQR ${data.topup_code}`,qr=qrUrl(data.amount,desc);
    openModal(`<div class="m4x-support-box">
      <div class="m4x-pay-title"><span style="color:#23e870">▣</span><h2>Nạp tiền vào tài khoản</h2></div>
      <div class="m4x-qrbox"><img src="${qr}"><p class="muted">Nạp tự động 24/7 qua VietQR Napas</p></div>
      ${[['Ngân hàng',C.BANK.name],['Số tài khoản',C.BANK.account],['Chủ tài khoản',C.BANK.holder],['Nội dung',desc]].map(([a,b])=>`<div class="m4x-payrow"><span>${a}</span><b>${esc(b)}</b><button class="m4x-copy" onclick="M4X.studioCopy('${esc(b)}')">▣</button></div>`).join('')}
      <button class="btn m4x-confirm" onclick="M4X.studioCheckTopup('${data.topup_code}')">▣ Tôi đã chuyển khoản (+${money(data.amount)})</button>
      <div id="payState" class="muted" style="text-align:center;margin-top:8px">Đang chờ ngân hàng xác nhận...</div>
    </div>`);
    if(state.poll)clearInterval(state.poll);
    state.poll=setInterval(()=>M4X.studioCheckTopup(data.topup_code,true),3000);
  }

  async function checkTopup(code,silent=false){
    const {data:t}=await sb.from('topups').select('status').eq('topup_code',code).single();
    if(t?.status==='paid'){
      if(state.poll)clearInterval(state.poll);state.poll=null;await loadAuth();setupChrome();
      const x=$('payState');if(x)x.innerHTML='<span class="ok">✓ Nạp thành công, số dư đã cập nhật</span>';
      setTimeout(()=>{closeModal();setView('account')},700);
    }else if(!silent){const x=$('payState');if(x)x.textContent='Chưa nhận được giao dịch. Hệ thống sẽ tự xác nhận khi tiền về.'}
  }

  function studioSupport(){
    openModal(`<div class="m4x-support-box">
      <div class="m4x-pay-title"><span style="color:#13d9ff">♧</span><h2>Hỗ trợ khách hàng M4X</h2></div>
      <p>Đội ngũ CSKH M4X STORE trực 24/7 để hỗ trợ kích hoạt tài khoản, bảo hành và giải đáp thắc mắc.</p>
      <div class="m4x-support-choice">
        <a href="https://t.me/bengtayy"><b>➤ Telegram CSKH</b><small>@bengtayy · Kích hoạt nhanh</small></a>
        <a href="https://www.tiktok.com/@m.dan_iuiu"><b>▣ TikTok Chính thức</b><small>@m.dan_iuiu · Video hướng dẫn</small></a>
      </div>
    </div>`);
  }

  // Override current V11/V12 rendering with reference UI.
  try{
    renderStore=renderStoreStudio;window.renderStore=renderStoreStudio;
    renderLibrary=renderLibraryStudio;window.renderLibrary=renderLibraryStudio;
    renderNotifications=renderNotificationsStudio;window.renderNotifications=renderNotificationsStudio;
    renderAccount=renderAccountStudio;window.renderAccount=renderAccountStudio;
    product=studioProduct;
    topup=topupStudio;
  }catch(e){console.warn('Studio UI globals',e)}

  Object.assign(M4X,{
    product:studioProduct,topup:topupStudio,
    studioAction,studioFavorite:toggleFav,studioCheckout,studioWalletBuy,studioQRBuy,
    studioCheckQR,studioCopy:copy,studioSupport,studioTopupAmount:topupAmount,
    studioCheckTopup:checkTopup,studioResetPrice:()=>{priceFilter='all';renderStoreStudio()}
  });

  setupChrome();
  try{renderView()}catch(e){console.warn('Studio first render',e)}
  setInterval(setupChrome,2500);
})();
