
const BASE=window.M4X_CONFIG||{};
let SAVED={};
try{SAVED=JSON.parse(localStorage.getItem('m4x_supabase_config')||'{}')}catch{}
const C={...BASE,SUPABASE_URL:SAVED.url||BASE.SUPABASE_URL||'',SUPABASE_ANON_KEY:SAVED.key||BASE.SUPABASE_ANON_KEY||''};

const sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);
window.ADM = window.ADM || {};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const money=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0))+'đ';
const dt=v=>v?new Date(v).toLocaleString('vi-VN'):'';
const slugify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const st={cats:[],products:[],orders:[],users:[],topups:[],notices:[],downloads:[],security:[]};
let booting=false;

function showLogin(message=''){
  $('adminApp').classList.add('hidden');
  $('adminLogin').classList.remove('hidden');
  $('adminLoginMsg').textContent=message;
}
function showAdmin(){
  $('adminLogin').classList.add('hidden');
  $('adminApp').classList.remove('hidden');
}
async function currentAdmin(){
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user)return {ok:false,user:null,message:'Chưa đăng nhập'};

  const {data,error}=await sb.from('profiles')
    .select('id,role,display_name,is_blocked,blocked_reason')
    .eq('id',user.id)
    .maybeSingle();

  if(error)return {ok:false,user,message:error.message};
  if(!data)return {ok:false,user,message:'Không tìm thấy hồ sơ tài khoản'};
  if(data.role!=='admin')return {ok:false,user,message:'Tài khoản này không có quyền Admin'};
  if(data.is_blocked)return {ok:false,user,message:'Tài khoản Admin đang bị khóa'};

  return {ok:true,user,profile:data};
}
async function login(){
  const email=$('adminEmail').value.trim();
  const password=$('adminPassword').value;
  const btn=$('adminLoginBtn');

  if(!email||!password){
    $('adminLoginMsg').textContent='Nhập email và mật khẩu Admin.';
    return;
  }

  btn.disabled=true;
  btn.textContent='Đang đăng nhập...';
  $('adminLoginMsg').textContent='';

  try{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;

    const check=await currentAdmin();
    if(!check.ok){
      $('adminLoginMsg').textContent=check.message;
      return;
    }

    await boot();
  }catch(e){
    $('adminLoginMsg').textContent=e?.message||'Đăng nhập thất bại';
  }finally{
    btn.disabled=false;
    btn.textContent='Đăng nhập';
  }
}
async function logout(){
  await sb.auth.signOut();
  showLogin('Đã đăng xuất.');
}
async function boot(){
  if(booting)return;
  booting=true;

  try{
    const check=await currentAdmin();
    if(!check.ok){
      showLogin(check.message==='Chưa đăng nhập'?'':check.message);
      return;
    }

    showAdmin();
    await refresh();
  }catch(e){
    showAdmin();
    const box=$('stats');
    if(box)box.innerHTML=`<div class="item badtxt">Admin load lỗi: ${esc(e?.message||e)}</div>`;
  }finally{
    booting=false;
  }
}
async function refresh(){
  await Promise.all([loadCats(),loadUsers(),loadProducts()]);
  await Promise.all([loadOrders(),loadTopups(),loadNotices(),loadSecurity()]);
  renderStats();
}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));
});

function toggleStock(){$('pStock').classList.toggle('hidden',$('pStockMode').value!=='limited')}

async function upload(bucket,file,path){
  const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:false});
  if(error)throw error;
  return path;
}

async function loadCats(){
  const {data,error}=await sb.from('categories').select('*').order('sort_order');
  if(error)throw error;
  st.cats=data||[];
  $('pCategory').innerHTML='<option value="">Không danh mục</option>'+
    st.cats.filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('catList').innerHTML=st.cats.map(c=>`
    <div class="item row">
      <div><b>${esc(c.icon||'')} ${esc(c.name)}</b><div class="muted">${esc(c.slug)}</div></div>
      <button type="button" class="btn bad" onclick="ADM.deleteCategory(${c.id})">Xóa</button>
    </div>`).join('')||'<div class="muted">Chưa có.</div>';
}
async function addCategory(){
  const name=$('catName').value.trim();
  if(!name)return;

  const {error}=await sb.from('categories').insert({
    name,
    icon:$('catIcon').value.trim(),
    slug:$('catSlug').value.trim()||slugify(name),
    description:$('catDesc').value.trim(),
    sort_order:0,
    active:true
  });

  $('catMsg').textContent=error?error.message:'Đã thêm.';
  if(!error){
    $('catName').value=$('catIcon').value=$('catSlug').value=$('catDesc').value='';
    await loadCats();
  }
}
async function deleteCategory(id){
  if(!confirm('Xóa danh mục?'))return;
  const {error}=await sb.from('categories').delete().eq('id',id);
  if(error)alert(error.message);else loadCats();
}

async function loadProducts(){
  const {data,error}=await sb.from('products')
    .select('*,categories(name)')
    .order('created_at',{ascending:false});
  if(error)throw error;
  st.products=data||[];
  renderProducts();
}
function renderProducts(){
  const q=($('productSearch')?.value||'').toLowerCase().trim();
  const arr=st.products.filter(p=>!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q));
  $('productList').innerHTML=arr.map(p=>`
    <div class="item">
      <div class="row">
        <div>
          <b>${esc(p.name)}</b>
          <div class="muted">${esc(p.categories?.name||'Không danh mục')} · ${money(p.price)} · v${esc(p.version_name||'1.0')} · ${esc(p.sale_status||'active')}</div>
        </div>
        <div class="toolbar">
          <button type="button" class="btn ghost" onclick="ADM.editProduct('${p.id}')">Sửa</button>
          <button type="button" class="btn ghost" onclick="ADM.toggleProduct('${p.id}',${!p.active})">${p.active?'Ẩn':'Hiện'}</button>
          <button type="button" class="btn bad" onclick="ADM.deleteProduct('${p.id}')">Xóa</button>
        </div>
      </div>
      <div class="muted">Đã bán ${p.sold_count||0}${p.stock_mode==='limited'?` · Kho ${p.stock_limit||0}`:' · Không giới hạn'}</div>
    </div>`).join('')||'<div class="muted">Chưa có sản phẩm.</div>';
}
function resetProductForm(){
  for(const id of ['pId','pName','pPrice','pCompatibility','pSize','pVideo','pDesc','pChangelog','pRisk'])$(id).value='';
  $('pCategory').value='';
  $('pStatus').value='active';
  $('pDelivery').value='download';
  $('pStockMode').value='unlimited';
  $('pStock').value='1';
  $('pVersion').value='1.0';
  $('pCover').value=$('pGallery').value=$('pFile').value='';
  $('pStock').classList.add('hidden');
  $('productFormTitle').textContent='Thêm sản phẩm';
  $('pMsg').textContent='';
}
function editProduct(id){
  const p=st.products.find(x=>x.id===id);
  if(!p)return;

  $('pId').value=p.id;
  $('pName').value=p.name||'';
  $('pCategory').value=p.category_id??'';
  $('pPrice').value=p.price||0;
  $('pStatus').value=p.sale_status||'active';
  $('pDelivery').value=p.delivery_type||'download';
  $('pStockMode').value=p.stock_mode||'unlimited';
  $('pStock').value=p.stock_limit||1;
  $('pVersion').value=p.version_name||'1.0';
  $('pCompatibility').value=p.compatibility||'';
  $('pSize').value=p.file_size_label||'';
  $('pVideo').value=p.video_url||'';
  $('pDesc').value=p.description||'';
  $('pChangelog').value=p.changelog||'';
  $('pRisk').value=p.risk_note||'';

  toggleStock();
  $('productFormTitle').textContent='Sửa sản phẩm';
  window.scrollTo({top:0,behavior:'smooth'});
}
async function saveProduct(){
  try{
    $('pMsg').textContent='Đang lưu...';

    const existing=st.products.find(x=>x.id===$('pId').value)||null;
    const id=existing?.id||crypto.randomUUID();
    const name=$('pName').value.trim();
    if(!name)throw new Error('Thiếu tên sản phẩm');

    let cover=existing?.cover_url||null;
    let gallery=Array.isArray(existing?.gallery)?existing.gallery:[];
    let filePath=existing?.file_path||null;

    if($('pCover').files[0]){
      const f=$('pCover').files[0];
      const path=`${id}/cover-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      await upload('product-images',f,path);
      cover=sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }

    if($('pGallery').files.length){
      gallery=[];
      for(const f of [...$('pGallery').files]){
        const path=`${id}/gallery-${Date.now()}-${crypto.randomUUID().slice(0,6)}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        await upload('product-images',f,path);
        gallery.push(sb.storage.from('product-images').getPublicUrl(path).data.publicUrl);
      }
    }

    const oldPrivate=existing?.file_path||null;

    if($('pFile').files[0]){
      const f=$('pFile').files[0];
      const path=`${id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      filePath=await upload('products-private',f,path);
    }

    const version=$('pVersion').value.trim()||'1.0';

    const payload={
      id,
      name,
      slug:existing?.slug||(slugify(name)+'-'+id.slice(0,6)),
      category_id:$('pCategory').value?Number($('pCategory').value):null,
      price:Number($('pPrice').value||0),
      sale_status:$('pStatus').value,
      delivery_type:$('pDelivery').value,
      stock_mode:$('pStockMode').value,
      stock_limit:$('pStockMode').value==='limited'?Number($('pStock').value||0):null,
      version_name:version,
      compatibility:$('pCompatibility').value.trim()||null,
      file_size_label:$('pSize').value.trim()||null,
      video_url:$('pVideo').value.trim()||null,
      description:$('pDesc').value.trim(),
      changelog:$('pChangelog').value.trim()||null,
      risk_note:$('pRisk').value.trim()||null,
      cover_url:cover,
      gallery,
      file_path:filePath,
      active:existing?.active??true,
      updated_at:new Date().toISOString()
    };

    const op=existing
      ?sb.from('products').update(payload).eq('id',id)
      :sb.from('products').insert(payload);

    const {error}=await op;
    if(error)throw error;

    if(existing&&existing.version_name!==version){
      const {error:ue}=await sb.rpc('admin_publish_product_update',{
        p_product_id:id,
        p_version_name:version,
        p_changelog:$('pChangelog').value.trim()
      });
      if(ue)throw ue;
    }else if(!existing&&$('pChangelog').value.trim()){
      const {error:pe}=await sb.from('product_updates').insert({
        product_id:id,
        version_name:version,
        changelog:$('pChangelog').value.trim()
      });
      if(pe)throw pe;
    }

    if(existing&&oldPrivate&&filePath!==oldPrivate){
      await sb.storage.from('products-private').remove([oldPrivate]);
    }

    $('pMsg').textContent=existing?'Đã cập nhật sản phẩm.':'Đã đăng sản phẩm.';
    resetProductForm();
    await Promise.all([loadProducts(),loadNotices()]);
    renderStats();
  }catch(e){
    $('pMsg').textContent=e?.message||String(e);
  }
}
async function toggleProduct(id,v){
  const {error}=await sb.from('products')
    .update({active:v,updated_at:new Date().toISOString()})
    .eq('id',id);

  if(error)alert(error.message);else loadProducts();
}
async function deleteProduct(id){
  if(!confirm('Xóa sản phẩm khỏi database? Thường nên chọn Ẩn/Ngừng bán nếu đã có đơn.'))return;
  const {error}=await sb.from('products').delete().eq('id',id);
  if(error)alert(error.message);else loadProducts();
}

async function loadUsers(){
  const {data,error}=await sb.from('profiles')
    .select('id,display_name,balance,role,is_blocked,blocked_reason,created_at')
    .order('created_at',{ascending:false});

  if(error)throw error;
  st.users=data||[];
  renderUsers();
}
function userName(id){
  return st.users.find(x=>x.id===id)?.display_name||id?.slice(0,8)||'—';
}
function renderUsers(){
  const q=($('userSearch')?.value||'').toLowerCase().trim();
  const arr=st.users.filter(u=>!q||`${u.display_name||''} ${u.id}`.toLowerCase().includes(q));

  $('userList').innerHTML=arr.map(u=>`
    <div class="item">
      <div class="row">
        <div>
          <b>${esc(u.display_name||u.id.slice(0,8))}</b>
          <div class="muted">${esc(u.role)} · ${esc(u.id)}</div>
          ${u.is_blocked?`<div class="badtxt">Đang khóa · ${esc(u.blocked_reason||'')}</div>`:''}
        </div>
        <div><b>${money(u.balance||0)}</b></div>
      </div>
      <div class="toolbar">
        <button type="button" class="btn ghost" onclick="ADM.adjustBalance('${u.id}')">Điều chỉnh số dư</button>
        <button type="button" class="btn ${u.is_blocked?'okbtn':'bad'}" onclick="ADM.setBlocked('${u.id}',${!u.is_blocked})">${u.is_blocked?'Mở khóa':'Khóa tài khoản'}</button>
      </div>
    </div>`).join('')||'<div class="muted">Không có user.</div>';
}
async function setBlocked(id,blocked){
  const reason=blocked
    ?(prompt('Lý do khóa tài khoản:','Phát hiện hoạt động bất thường')||'Phát hiện hoạt động bất thường')
    :null;

  const {error}=await sb.rpc('admin_set_user_blocked',{
    p_user_id:id,
    p_blocked:blocked,
    p_reason:reason
  });

  if(error)alert(error.message);else loadUsers();
}
async function adjustBalance(id){
  const delta=Number(prompt('Cộng/trừ số dư. Ví dụ 20000 hoặc -10000:'));
  if(!delta)return;

  const note=prompt('Lý do:','Điều chỉnh bởi Admin')||'Điều chỉnh bởi Admin';

  const {data,error}=await sb.rpc('admin_adjust_balance',{
    p_user_id:id,
    p_delta:delta,
    p_note:note
  });

  if(error)alert(error.message);
  else{
    alert('Số dư mới: '+money(data));
    loadUsers();
  }
}

async function loadOrders(){
  const {data,error}=await sb.from('orders')
    .select('*,products(name)')
    .order('created_at',{ascending:false})
    .limit(300);

  if(error)throw error;
  st.orders=data||[];
  renderOrders();
}
function renderOrders(){
  const q=($('orderSearch')?.value||'').toLowerCase().trim();
  const arr=st.orders.filter(o=>!q||`${o.order_code} ${o.products?.name||''} ${userName(o.user_id)}`.toLowerCase().includes(q));

  $('orderList').innerHTML=arr.map(o=>`
    <div class="item">
      <div class="row">
        <div>
          <b>${esc(o.order_code)}</b> · ${esc(o.products?.name||'Sản phẩm')}
          <div class="muted">${userName(o.user_id)} · ${dt(o.created_at)} · ${money(o.amount)}</div>
        </div>
        <b>${esc(o.status)}</b>
      </div>
      ${o.status==='paid'&&o.user_id?`<button type="button" class="btn bad" onclick="ADM.refund('${o.id}')">Hoàn về số dư</button>`:''}
      ${o.status==='refunded'?`<div class="muted">Hoàn ${dt(o.refunded_at)} · ${esc(o.refund_reason||'')}</div>`:''}
    </div>`).join('')||'<div class="muted">Không có đơn.</div>';
}
async function refund(id){
  if(!confirm('Hoàn toàn bộ giá trị đơn về số dư M4X STORE?'))return;

  const reason=prompt('Lý do hoàn tiền:','Sản phẩm lỗi / hỗ trợ khách')||'Hoàn tiền bởi Admin';

  const {data,error}=await sb.rpc('admin_refund_order',{
    p_order_id:id,
    p_reason:reason
  });

  if(error)alert(error.message);
  else{
    alert(`Đã hoàn ${money(data.refund_amount)}. Số dư mới ${money(data.balance_after)}`);
    await Promise.all([loadOrders(),loadUsers(),loadNotices()]);
    renderStats();
  }
}

async function loadTopups(){
  const {data,error}=await sb.from('topups')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(300);

  if(error)throw error;
  st.topups=data||[];
  renderTopups();
}
function renderTopups(){
  const q=($('topupSearch')?.value||'').toLowerCase().trim();
  const arr=st.topups.filter(t=>!q||`${t.topup_code} ${userName(t.user_id)}`.toLowerCase().includes(q));

  $('topupList').innerHTML=arr.map(t=>`
    <div class="item row">
      <div>
        <b>${esc(t.topup_code)}</b> · ${esc(userName(t.user_id))}
        <div class="muted">${dt(t.created_at)} · ${esc(t.bank_transaction_id||'')}</div>
      </div>
      <div><b>${money(t.amount)}</b><br>${esc(t.status)}</div>
    </div>`).join('')||'<div class="muted">Không có.</div>';
}

async function broadcast(){
  const title=$('nTitle').value.trim();
  const body=$('nBody').value.trim();
  if(!title)return;

  const {error}=await sb.from('notifications').insert({
    user_id:null,
    title,
    body,
    type:$('nType').value,
    reference:'ADMIN'
  });

  $('nMsg').textContent=error?error.message:'Đã gửi cho tất cả người dùng.';
  if(!error){
    $('nTitle').value=$('nBody').value='';
    loadNotices();
  }
}
async function loadNotices(){
  const {data,error}=await sb.from('notifications')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(100);

  if(error)throw error;
  st.notices=data||[];

  $('noticeList').innerHTML=st.notices.map(n=>`
    <div class="item">
      <b>${esc(n.title)}</b>
      <div>${esc(n.body||'')}</div>
      <div class="muted">${n.user_id?'Cá nhân: '+userName(n.user_id):'Tất cả'} · ${dt(n.created_at)}</div>
    </div>`).join('')||'<div class="muted">Chưa có.</div>';
}

async function loadSecurity(){
  const [{data:d,error:de},{data:s,error:se}]=await Promise.all([
    sb.from('download_logs').select('*').order('created_at',{ascending:false}).limit(100),
    sb.from('security_events').select('*').order('created_at',{ascending:false}).limit(100)
  ]);

  if(de)throw de;
  if(se)throw se;

  st.downloads=d||[];
  st.security=s||[];

  $('downloadList').innerHTML=st.downloads.map(x=>`
    <div class="item">
      <b>${esc(userName(x.user_id))}</b>
      <div class="muted">${dt(x.created_at)} · IP ${esc(x.ip||'—')} · product ${esc(x.product_id||'')}</div>
    </div>`).join('')||'<div class="muted">Chưa có log.</div>';

  $('securityList').innerHTML=st.security.map(x=>`
    <div class="item">
      <b>${esc(x.event_type)}</b>
      <div>${esc(x.detail||'')}</div>
      <div class="muted">${dt(x.created_at)} · ${esc(x.ip||'')}</div>
    </div>`).join('')||'<div class="muted">Chưa có sự kiện.</div>';
}
function renderStats(){
  const paid=st.orders.filter(o=>o.status==='paid');
  const now=new Date();

  const today=paid.filter(o=>
    new Date(o.paid_at||o.created_at).toDateString()===now.toDateString()
  );

  const month=paid.filter(o=>{
    const d=new Date(o.paid_at||o.created_at);
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });

  const rev=x=>x.reduce((a,o)=>a+Number(o.amount||0),0);
  const pending=st.topups.filter(t=>t.status==='pending'||t.status==='review').length;

  $('stats').innerHTML=`
    <div class="stat"><div class="muted">Sản phẩm</div><div class="num">${st.products.length}</div></div>
    <div class="stat"><div class="muted">Người dùng</div><div class="num">${st.users.length}</div></div>
    <div class="stat"><div class="muted">Doanh thu hôm nay</div><div class="num" style="font-size:20px">${money(rev(today))}</div></div>
    <div class="stat"><div class="muted">Doanh thu tháng</div><div class="num" style="font-size:20px">${money(rev(month))}</div></div>
    <div class="stat"><div class="muted">Đơn đã trả</div><div class="num">${paid.length}</div></div>
    <div class="stat"><div class="muted">Nạp chờ/review</div><div class="num">${pending}</div></div>`;

  const best=[...st.products].sort((a,b)=>(b.sold_count||0)-(a.sold_count||0))[0];
  $('bestSeller').innerHTML=best
    ?`<b>${esc(best.name)}</b> · ${best.sold_count||0} lượt · ${money(best.price)}`
    :'Chưa có dữ liệu.';
}

Object.assign(window.ADM,{
  login,logout,refresh,toggleStock,addCategory,deleteCategory,
  saveProduct,editProduct,resetProductForm,toggleProduct,deleteProduct,
  adjustBalance,setBlocked,refund,broadcast
});

for(const [id,fn] of [
  ['productSearch',renderProducts],
  ['userSearch',renderUsers],
  ['orderSearch',renderOrders],
  ['topupSearch',renderTopups]
]){
  const el=$(id);
  if(el)el.oninput=fn;
}

// Do not redirect anywhere after auth.
// If Store already has an Admin session, dashboard opens automatically.
(async()=>{
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(session)await boot();
    else showLogin('');
  }catch(e){
    showLogin(e?.message||'Không đọc được phiên đăng nhập');
  }
})();
