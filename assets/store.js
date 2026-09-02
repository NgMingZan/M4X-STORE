
const BASE = window.M4X_CONFIG || {};
let SAVED={}; try{SAVED=JSON.parse(localStorage.getItem('m4x_supabase_config')||'{}')}catch{}
const C={...BASE,SUPABASE_URL:SAVED.url||BASE.SUPABASE_URL||'',SUPABASE_ANON_KEY:SAVED.key||BASE.SUPABASE_ANON_KEY||''};
const sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);

const state={
  me:null,profile:null,products:[],categories:[],owned:new Map(),
  notifications:[],view:'store',activeCat:'all',query:'',poll:null
};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const money=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0))+'đ';
const dt=v=>v?new Date(v).toLocaleString('vi-VN'):'';
const statusText=s=>({active:'Đang bán',new:'Mới',coming_soon:'Sắp ra mắt',out_of_stock:'Hết hàng',discontinued:'Ngừng bán'}[s]||s||'Đang bán');

function openModal(html){$('modalContent').innerHTML=html;$('modal').classList.add('open')}
function closeModal(){if(state.poll)clearInterval(state.poll);state.poll=null;$('modal').classList.remove('open')}
window.M4X={closeModal};

async function loadAuth(){
  const {data:{user}}=await sb.auth.getUser();
  state.me=user||null;
  if(state.me){
    const {data}=await sb.from('profiles').select('id,display_name,balance,role,is_blocked,blocked_reason').eq('id',state.me.id).single();
    state.profile=data||null;
    $('accountQuick').textContent=`${state.profile?.display_name||'Tài khoản'} · ${money(state.profile?.balance||0)}`;
  }else{
    state.profile=null;
    $('accountQuick').textContent='Đăng nhập';
  }
}
async function loadOwned(){
  state.owned.clear();
  if(!state.me)return;
  const {data,error}=await sb.from('orders')
    .select('id,product_id,order_code,access_token,paid_at,purchased_version,status,amount,products(name,delivery_type,version_name,changelog,cover_url)')
    .eq('user_id',state.me.id)
    .eq('status','paid')
    .order('paid_at',{ascending:false});
  if(error){console.warn(error);return}
  for(const o of data||[]) if(o.product_id&&!state.owned.has(o.product_id)) state.owned.set(o.product_id,o);
}
async function loadProducts(){
  const [{data:c},{data:p}]=await Promise.all([
    sb.from('categories').select('*').eq('active',true).order('sort_order'),
    sb.from('products').select('*,categories(name)').eq('active',true).order('created_at',{ascending:false})
  ]);
  state.categories=c||[]; state.products=p||[];
}
async function loadNotifications(){
  state.notifications=[];
  if(!state.me){updateNotifBadge();return}
  const [{data:n},{data:r}]=await Promise.all([
    sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(100),
    sb.from('notification_reads').select('notification_id').eq('user_id',state.me.id)
  ]);
  const read=new Set((r||[]).map(x=>x.notification_id));
  state.notifications=(n||[]).map(x=>({...x,read:read.has(x.id)}));
  updateNotifBadge();
}
function updateNotifBadge(){
  const count=state.notifications.filter(x=>!x.read).length;
  $('notifBadge').innerHTML=count?`<span class="badge">${count>99?'99+':count}</span>`:'';
}
async function bootstrap(){
  await loadAuth();
  await Promise.all([loadProducts(),loadOwned(),loadNotifications()]);
  renderView();
  checkUpdate(false);
}
function setView(v){
  state.view=v;
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  renderView();
}
function renderView(){
  if(state.profile?.is_blocked){
    const reason=state.profile.blocked_reason?`<br>${esc(state.profile.blocked_reason)}`:'';
    $('updateBar').classList.add('show');
    $('updateText').innerHTML=`Tài khoản đang bị khóa.${reason}`;
    $('updateBtn').style.display='none';
  }else{
    $('updateBtn').style.display='';
  }
  if(state.view==='store')renderStore();
  else if(state.view==='library')renderLibrary();
  else if(state.view==='notifications')renderNotifications();
  else renderAccount();
}
function available(p){
  return p.stock_mode==='limited'
    ?Math.max(0,(p.stock_limit||0)-(p.sold_count||0)-(p.reserved_count||0))
    :Infinity;
}
function actionLabel(p){
  const o=state.owned.get(p.id);
  if(o)return p.delivery_type==='download'?'Tải':'Đã mua';
  if(p.sale_status==='coming_soon')return 'Sắp ra mắt';
  if(p.sale_status==='out_of_stock'||(p.stock_mode==='limited'&&available(p)<=0))return 'Hết hàng';
  if(p.sale_status==='discontinued')return 'Ngừng bán';
  return 'Mua';
}
function renderStore(){
  const cats=`<button class="chip ${state.activeCat==='all'?'active':''}" data-cat="all">Tất cả</button>`+
    state.categories.map(c=>`<button class="chip ${String(c.id)===state.activeCat?'active':''}" data-cat="${c.id}">${esc(c.icon||'')} ${esc(c.name)}</button>`).join('');
  const q=state.query.toLowerCase().trim();
  const list=state.products.filter(p=>
    (state.activeCat==='all'||String(p.category_id)===state.activeCat)&&
    (!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q))
  );
  const cards=list.map(p=>{
    const own=state.owned.get(p.id);
    const label=actionLabel(p);
    const disabled=!own&&['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    return `<article class="card" onclick="M4X.product('${p.id}')">
      <div class="cover" style="background-image:url('${esc(p.cover_url||'')}')">
        <span class="pill">${esc(p.categories?.name||'Sản phẩm')}</span>
        ${own?'<span class="pill right">✓ Đã sở hữu</span>':(p.sale_status==='new'?'<span class="pill right">MỚI</span>':'')}
      </div>
      <div class="cardbody">
        <div class="name">${esc(p.name)}</div>
        <div class="row">
          <div><div class="price">${money(p.price)}</div><div class="stock">${p.stock_mode==='limited'?'Còn '+available(p):statusText(p.sale_status)}</div></div>
          <button class="btn" ${disabled?'disabled':''} onclick="event.stopPropagation();M4X.action('${p.id}')">${label}</button>
        </div>
      </div>
    </article>`;
  }).join('');
  $('view').innerHTML=`
    <section class="hero">
      <h1>Theme đẹp.<br>Tool chất. M4X.</h1>
      <p class="muted">Kho sản phẩm số của M4X — mua một lần, cập nhật và tải lại ngay trong tài khoản.</p>
    </section>
    <input id="storeSearch" class="search" placeholder="Tìm theme, tool, preset..." value="${esc(state.query)}">
    <div class="cats">${cats}</div>
    <section class="grid">${cards||'<div class="muted">Chưa có sản phẩm.</div>'}</section>
    <div class="toolbar" style="margin-top:24px">
      <button class="btn ghost" onclick="M4X.policy('terms')">Điều khoản</button>
      <button class="btn ghost" onclick="M4X.policy('refund')">Hoàn tiền</button>
      <button class="btn ghost" onclick="M4X.policy('safety')">Lưu ý tool/trick</button>
    </div>`;
  $('storeSearch').oninput=e=>{state.query=e.target.value;renderStore()};
  document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.activeCat=b.dataset.cat;renderStore()});
}
function galleryHtml(p){
  const arr=Array.isArray(p.gallery)?p.gallery:[];
  return arr.length?`<div class="gallery">${arr.map(u=>`<img src="${esc(u)}" loading="lazy">`).join('')}</div>`:'';
}
function product(id){
  const p=state.products.find(x=>x.id===id); if(!p)return;
  const o=state.owned.get(id), label=actionLabel(p);
  const canBuy=!o&&!['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
  const risk=p.risk_note?`<div class="notice"><b>Lưu ý trước khi dùng</b><br>${esc(p.risk_note)}</div>`:'';
  openModal(`
    <h2>${esc(p.name)}</h2>
    ${galleryHtml(p)}
    <div class="meta">
      <div><span class="muted">Phiên bản</span><br><b>${esc(p.version_name||'1.0')}</b></div>
      <div><span class="muted">Tương thích</span><br><b>${esc(p.compatibility||'Xem mô tả')}</b></div>
      <div><span class="muted">Dung lượng</span><br><b>${esc(p.file_size_label||'—')}</b></div>
      <div><span class="muted">Đã bán</span><br><b>${Number(p.sold_count||0)}</b></div>
    </div>
    <p>${esc(p.description||'')}</p>
    ${p.changelog?`<div class="item"><b>Cập nhật mới nhất</b><div class="muted">${esc(p.changelog)}</div></div>`:''}
    ${risk}
    ${p.video_url?`<button class="btn ghost" onclick="location.href='${esc(p.video_url)}'">Xem video demo</button> `:''}
    <div class="big" style="margin:14px 0">${money(p.price)}</div>
    ${o?`
      <div class="ok" style="font-size:20px;font-weight:900;margin-bottom:10px">✓ Bạn đã sở hữu</div>
      ${p.delivery_type==='download'?`<button class="btn" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">Tải bản mới nhất</button>`:'<div class="muted">Sản phẩm đã được ghi nhận vào tài khoản.</div>'}
    `:state.me?`
      <p>Số dư: <b>${money(state.profile?.balance||0)}</b></p>
      <button class="btn" ${canBuy?'':'disabled'} onclick="M4X.buy('${p.id}')">${label==='Mua'?'Mua bằng số dư':label}</button>
      <button class="btn ghost" onclick="M4X.topup()">Nạp tiền</button>
    `:`<button class="btn" onclick="M4X.auth('login')">Đăng nhập để mua</button>`}
    <div id="dlmsg" class="muted" style="margin-top:10px"></div>
  `);
}
async function action(id){
  const p=state.products.find(x=>x.id===id),o=state.owned.get(id);if(!p)return;
  if(o&&p.delivery_type==='download')return download(o.order_code,o.access_token);
  product(id);
}
function auth(mode='login'){
  openModal(`
    <h2>${mode==='register'?'Tạo tài khoản':'Đăng nhập'}</h2>
    ${mode==='register'?'<input id="authName" class="input" placeholder="Tên hiển thị">':''}
    <input id="authEmail" class="input" type="email" placeholder="Email">
    <input id="authPass" class="input" type="password" placeholder="Mật khẩu">
    <div class="toolbar">
      <button id="authSubmit" class="btn" onclick="M4X.${mode==='register'?'register':'login'}()">${mode==='register'?'Đăng ký':'Đăng nhập'}</button>
      <button class="btn ghost" onclick="M4X.auth('${mode==='register'?'login':'register'}')">${mode==='register'?'Đã có tài khoản':'Tạo tài khoản'}</button>
    </div>
    ${mode==='login'?'<button class="btn ghost" onclick="M4X.forgot()">Quên mật khẩu</button>':''}
    <div id="authMsg" class="muted" style="margin-top:10px"></div>
  `)
}
function loginGuard(){
  const now=Date.now(),until=Number(localStorage.getItem('m4x_login_lock')||0);
  if(until>now)return Math.ceil((until-now)/1000);
  return 0;
}
async function login(){
  const lock=loginGuard(); if(lock){$('authMsg').textContent=`Thử lại sau ${lock}s`;return}
  $('authSubmit').disabled=true;
  const {error}=await sb.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPass').value});
  $('authSubmit').disabled=false;
  if(error){
    let fails=Number(localStorage.getItem('m4x_login_fails')||0)+1;
    localStorage.setItem('m4x_login_fails',String(fails));
    if(fails>=5){localStorage.setItem('m4x_login_lock',String(Date.now()+60_000));localStorage.setItem('m4x_login_fails','0')}
    $('authMsg').textContent=error.message;return;
  }
  localStorage.setItem('m4x_login_fails','0');
  await bootstrap();closeModal();setView('account');
}
async function register(){
  const {error}=await sb.auth.signUp({
    email:$('authEmail').value.trim(),password:$('authPass').value,
    options:{data:{display_name:$('authName').value.trim()}}
  });
  $('authMsg').textContent=error?error.message:'Đăng ký thành công. Nếu yêu cầu xác nhận email, hãy mở email để xác nhận.';
}
async function forgot(){
  const email=$('authEmail')?.value.trim()||prompt('Email tài khoản:')||'';
  if(!email)return;
  const {error}=await sb.auth.resetPasswordForEmail(email);
  $('authMsg').textContent=error?error.message:'Đã gửi email khôi phục mật khẩu.';
}
async function logout(){
  await sb.auth.signOut();state.me=null;state.profile=null;state.owned.clear();state.notifications=[];closeModal();await bootstrap();setView('store');
}
async function buy(id){
  const {data,error}=await sb.rpc('wallet_purchase',{p_product_id:id,p_quantity:1});
  if(error){
    const msg=String(error.message||'');
    if(msg.toLowerCase().includes('đã mua')){await loadOwned();renderView();return product(id)}
    openModal(`<h2>Không thể mua</h2><p class="badtxt">${esc(msg)}</p><button class="btn" onclick="M4X.topup()">Nạp tiền</button>`);return;
  }
  await Promise.all([loadAuth(),loadOwned(),loadNotifications()]);
  renderView();
  openModal(`<h2 class="ok">✓ Mua thành công</h2><p>${esc(data.product_name)}</p><div class="big">${money(data.amount)}</div><p>Số dư còn lại: <b>${money(data.balance_after)}</b></p>${data.delivery_type==='download'?`<button class="btn" onclick="M4X.download('${esc(data.order_code)}','${esc(data.access_token)}')">Tải sản phẩm</button>`:''}<div id="dlmsg" class="muted"></div>`);
}
function topup(){
  if(!state.me)return auth('login');
  openModal(`
    <h2>Nạp tiền</h2>
    <p class="muted">Số dư chỉ dùng để mua sản phẩm trong M4X STORE.</p>
    <div class="toolbar">
      <button class="btn ghost" onclick="M4X.makeTopup(20000)">20K</button>
      <button class="btn ghost" onclick="M4X.makeTopup(50000)">50K</button>
      <button class="btn ghost" onclick="M4X.makeTopup(100000)">100K</button>
      <button class="btn ghost" onclick="M4X.makeTopup(200000)">200K</button>
    </div>
    <input id="topupAmount" class="input" type="number" min="10000" max="5000000" step="1000" placeholder="Hoặc nhập số tiền">
    <button class="btn" onclick="M4X.makeTopup(Number($('topupAmount').value))">Tạo QR</button>
    <div id="topupMsg" class="muted"></div>
  `);
}
async function makeTopup(amount){
  if(!amount||amount<10000){$('topupMsg').textContent='Tối thiểu 10.000đ';return}
  const {data,error}=await sb.rpc('create_wallet_topup',{p_amount:amount});
  if(error){$('topupMsg').textContent=error.message;return}
  const desc=`SEVQR ${data.topup_code}`;
  const qr=`https://vietqr.app/img?acc=${encodeURIComponent(C.BANK.account)}&bank=${encodeURIComponent(C.BANK.name)}&amount=${data.amount}&des=${encodeURIComponent(desc)}&template=compact&showinfo=true&fullacc=true&holder=${encodeURIComponent(C.BANK.holder)}&store=${encodeURIComponent(C.BANK.store)}`;
  openModal(`<h2>Nạp ${money(data.amount)}</h2><img src="${qr}" style="width:min(360px,100%);display:block;margin:12px auto;border-radius:20px;background:#fff"><div class="item" style="text-align:center"><b>${esc(desc)}</b><div class="muted">${esc(C.BANK.name)} · ${esc(C.BANK.account)}</div></div><p id="payState" class="muted" style="text-align:center">Đang chờ ngân hàng xác nhận...</p>`);
  state.poll=setInterval(async()=>{
    const {data:t}=await sb.from('topups').select('status').eq('topup_code',data.topup_code).single();
    if(t?.status==='paid'){
      clearInterval(state.poll);state.poll=null;$('payState').innerHTML='<span class="ok">✓ Nạp thành công</span>';
      await Promise.all([loadAuth(),loadNotifications()]);setTimeout(()=>{closeModal();setView('account')},900)
    }else if(['review','expired','cancelled'].includes(t?.status)){
      $('payState').innerHTML=`<span class="badtxt">${t.status==='review'?'Cần Admin kiểm tra':'Yêu cầu đã hết hiệu lực'}</span>`;
    }
  },3000);
}
async function download(code,token){
  try{
    const session=(await sb.auth.getSession()).data.session;
    if(!session)throw new Error('Bạn cần đăng nhập lại');
    const r=await fetch(`${C.SUPABASE_URL}/functions/v1/create-download-link`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':C.SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({order_code:code,access_token:token})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Không tạo được link tải');
    location.href=d.url;
  }catch(e){
    const box=$('dlmsg');if(box)box.textContent=e.message;
    else openModal(`<h2>Không thể tải</h2><p class="badtxt">${esc(e.message)}</p>`);
  }
}
function renderLibrary(){
  if(!state.me){
    $('view').innerHTML=`<div class="sectionTitle">Thư viện của tôi</div><div class="item"><p class="muted">Đăng nhập để xem sản phẩm đã mua.</p><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button></div>`;return;
  }
  const arr=[...state.owned.values()];
  $('view').innerHTML=`<div class="sectionTitle">Thư viện của tôi</div>
    <p class="muted">Sản phẩm đã mua được tải lại và nhận bản cập nhật miễn phí.</p>
    ${arr.map(o=>{
      const p=state.products.find(x=>x.id===o.product_id)||o.products||{};
      const latest=p.version_name||o.products?.version_name||'—';
      const bought=o.purchased_version||'—';
      return `<div class="item">
        <div class="row">
          <div><b>${esc(p.name||o.products?.name||'Sản phẩm')}</b><div class="muted">Mua ${dt(o.paid_at)}</div></div>
          ${p.delivery_type==='download'||o.products?.delivery_type==='download'?`<button class="btn" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">Tải</button>`:''}
        </div>
        <div class="meta"><div><span class="muted">Lúc mua</span><br>${esc(bought)}</div><div><span class="muted">Mới nhất</span><br><b>${esc(latest)}</b></div></div>
        ${(p.changelog||o.products?.changelog)?`<div class="muted">${esc(p.changelog||o.products?.changelog)}</div>`:''}
      </div>`;
    }).join('')||'<div class="muted">Bạn chưa mua sản phẩm nào.</div>'}`;
}
async function renderNotifications(){
  if(!state.me){
    $('view').innerHTML=`<div class="sectionTitle">Thông báo</div><div class="item"><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button></div>`;return;
  }
  $('view').innerHTML=`<div class="sectionTitle">Thông báo</div>
    <button class="btn ghost" onclick="M4X.readAll()">Đánh dấu đã đọc</button>
    ${state.notifications.map(n=>`<div class="item" onclick="M4X.readNotif('${n.id}')">
      <div class="row"><b>${esc(n.title)}</b>${n.read?'':'<span class="badge">Mới</span>'}</div>
      <div>${esc(n.body||'')}</div><div class="muted">${dt(n.created_at)}</div>
    </div>`).join('')||'<div class="muted">Chưa có thông báo.</div>'}`;
}
async function readNotif(id){
  await sb.rpc('mark_notification_read',{p_notification_id:id});await loadNotifications();renderNotifications();
}
async function readAll(){
  await sb.rpc('mark_all_notifications_read');await loadNotifications();renderNotifications();
}
async function renderAccount(){
  if(!state.me){
    $('view').innerHTML=`<div class="sectionTitle">Tài khoản</div><div class="item"><button class="btn" onclick="M4X.auth('login')">Đăng nhập</button> <button class="btn ghost" onclick="M4X.auth('register')">Đăng ký</button></div>`;return;
  }
  const [{data:t},{data:top}]=await Promise.all([
    sb.from('wallet_transactions').select('*').order('created_at',{ascending:false}).limit(30),
    sb.from('topups').select('*').order('created_at',{ascending:false}).limit(20)
  ]);
  $('view').innerHTML=`
    <div class="sectionTitle">${esc(state.profile?.display_name||state.me.email)}</div>
    <div class="big">${money(state.profile?.balance||0)}</div><div class="muted">${esc(state.me.email)}</div>
    <div class="toolbar">
      <button class="btn" onclick="M4X.topup()">+ Nạp tiền</button>
      ${state.profile?.role==='admin'?'<button class="btn ghost" onclick="location.href=\'./admin.html\'">Quản trị</button>':''}
      <button class="btn ghost" onclick="M4X.editProfile()">Sửa tài khoản</button>
      <button class="btn ghost" onclick="M4X.checkUpdate(true)">Kiểm tra cập nhật</button>
      <button class="btn bad" onclick="M4X.logout()">Đăng xuất</button>
    </div>
    <div class="sectionTitle">Lịch sử số dư</div>
    ${(t||[]).map(x=>`<div class="item row"><div>${esc(x.description||x.type)}<div class="muted">${dt(x.created_at)}</div></div><b class="${x.amount>=0?'ok':'badtxt'}">${x.amount>=0?'+':''}${money(x.amount)}</b></div>`).join('')||'<div class="muted">Chưa có.</div>'}
    <div class="sectionTitle">Yêu cầu nạp</div>
    ${(top||[]).map(x=>`<div class="item row"><div><b>${esc(x.topup_code)}</b><div class="muted">${dt(x.created_at)}</div></div><div>${money(x.amount)} · ${esc(x.status)}</div></div>`).join('')||'<div class="muted">Chưa có.</div>'}
  `;
}
function editProfile(){
  openModal(`<h2>Sửa tài khoản</h2>
    <input id="newName" class="input" value="${esc(state.profile?.display_name||'')}" placeholder="Tên hiển thị">
    <button class="btn" onclick="M4X.saveName()">Lưu tên</button>
    <hr>
    <input id="newPass" class="input" type="password" placeholder="Mật khẩu mới (tối thiểu 6 ký tự)">
    <button class="btn ghost" onclick="M4X.changePass()">Đổi mật khẩu</button>
    <div id="profileMsg" class="muted"></div>`);
}
async function saveName(){
  const {data,error}=await sb.rpc('update_profile_name',{p_display_name:$('newName').value});
  $('profileMsg').textContent=error?error.message:'Đã đổi tên.';
  if(!error){await loadAuth();setTimeout(()=>{closeModal();setView('account')},500)}
}
async function changePass(){
  const v=$('newPass').value;if(v.length<6){$('profileMsg').textContent='Mật khẩu tối thiểu 6 ký tự';return}
  const {error}=await sb.auth.updateUser({password:v});$('profileMsg').textContent=error?error.message:'Đã đổi mật khẩu.';
}
function versionParts(v){return String(v||'0').replace(/^v/i,'').split('.').map(x=>Number(x.replace(/\D.*$/,''))||0)}
function newer(a,b){
  const A=versionParts(a),B=versionParts(b),n=Math.max(A.length,B.length);
  for(let i=0;i<n;i++){if((A[i]||0)>(B[i]||0))return true;if((A[i]||0)<(B[i]||0))return false}
  return false;
}
async function checkUpdate(force=false){
  try{
    const last=Number(localStorage.getItem('m4x_update_checked')||0);
    if(!force&&Date.now()-last<12*60*60*1000)return;
    localStorage.setItem('m4x_update_checked',String(Date.now()));
    const repo=C.GITHUB_REPO||'NgMingZan/M4X-STORE';
    const r=await fetch(`https://api.github.com/repos/${repo}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}});
    if(!r.ok){if(force)alert('Chưa có bản phát hành công khai.');return}
    const d=await r.json(),current=C.APP_VERSION_NAME||'1.0.0';
    if(newer(d.tag_name,current)){
      const asset=(d.assets||[]).find(a=>/\.apk$/i.test(a.name));
      $('updateText').textContent=`${current} → ${d.tag_name}`;
      $('updateBtn').onclick=()=>location.href=asset?.browser_download_url||d.html_url;
      $('updateBar').classList.add('show');
      if(force)alert(`Có bản mới ${d.tag_name}`);
    }else if(force)alert(`Bạn đang dùng bản mới nhất (${current}).`);
  }catch(e){if(force)alert('Không kiểm tra được cập nhật: '+e.message)}
}
function policy(type){
  const content={
    terms:['Điều khoản mua hàng','Sản phẩm số được cấp cho tài khoản đã thanh toán. Không chia sẻ link tải tạm thời hoặc tìm cách vượt giới hạn truy cập.'],
    refund:['Chính sách hoàn tiền','Admin có thể hoàn tiền về số dư M4X STORE khi sản phẩm lỗi hoặc giao nhầm. Số dư nội bộ không phải tài khoản ngân hàng và không dùng để chuyển giữa người dùng.'],
    safety:['Lưu ý tool / trick','Chỉ sử dụng tool, script hoặc trick trên thiết bị/tài khoản bạn có quyền kiểm soát. Đọc kỹ mô tả, khả năng tương thích và cảnh báo của từng sản phẩm trước khi dùng.']
  }[type];
  openModal(`<h2>${content[0]}</h2><p>${content[1]}</p>`);
}
Object.assign(window.M4X,{
  product,action,auth,login,register,forgot,logout,buy,topup,makeTopup,download,
  readNotif,readAll,editProfile,saveName,changePass,checkUpdate,policy
});
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('accountQuick').onclick=()=>setView('account');
bootstrap();
