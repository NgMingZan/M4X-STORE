from pathlib import Path
import re, sys

p = Path('index.html')
if not p.exists():
    sys.exit('ERROR: Không thấy index.html. Hãy chạy trong thư mục ~/M4X_STORE/M4X_STORE_V2')

s = p.read_text(encoding='utf-8')
orig = s

# 1) Slogan mới
old_hero = '<section class="hero"><h1>Digital goods.<br>Made by M4X.</h1><p class="muted">Đăng nhập, nạp số dư và mua sản phẩm ngay trong tài khoản M4X STORE.</p></section>'
new_hero = '<section class="hero"><h1>Theme đẹp.<br>Tool chất. M4X.</h1><p class="muted">Mua một lần, tải lại bất cứ lúc nào ngay trong tài khoản của bạn.</p></section>'
if old_hero in s:
    s = s.replace(old_hero, new_hero, 1)
else:
    print('WARN: Không tìm thấy slogan cũ, bỏ qua phần slogan.')

# 2) Thêm map sản phẩm đã sở hữu
s = s.replace(
    "const sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);let products=[],categories=[],active='all',me=null,profile=null,poll=null;",
    "const sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);let products=[],categories=[],active='all',me=null,profile=null,poll=null,owned=new Map();",
    1
)

# 3) Load quyền sở hữu cùng khi mở app
pat = re.compile(r"async function loadAuth\(\)\{.*?\}\nasync function load\(\)\{.*?\}\nfunction renderCats", re.S)
m = pat.search(s)
if not m:
    sys.exit('ERROR: Không tìm thấy khối loadAuth/load. Có thể index.html khác phiên bản patch hiện tại.')
load_block = '''async function loadAuth(){const {data:{user}}=await sb.auth.getUser();me=user||null;if(me){const {data}=await sb.from('profiles').select('id,display_name,balance,role').eq('id',me.id).single();profile=data||null;$('accountBtn').textContent=`${profile?.display_name||'Tài khoản'} · ${money(profile?.balance||0)}`}else{$('accountBtn').textContent='Đăng nhập';profile=null}}
async function loadOwned(){owned.clear();if(!me)return;const {data,error}=await sb.from('orders').select('product_id,order_code,access_token,paid_at,products(delivery_type)').eq('status','paid').eq('user_id',me.id).order('paid_at',{ascending:false});if(error){console.warn('loadOwned:',error.message);return}(data||[]).forEach(o=>{if(o.product_id&&!owned.has(o.product_id))owned.set(o.product_id,o)})}
async function load(){await loadAuth();const [{data:c},{data:p}]=await Promise.all([sb.from('categories').select('*').eq('active',true).order('sort_order'),sb.from('products').select('*,categories(name)').eq('active',true).order('created_at',{ascending:false}),loadOwned()]);categories=c||[];products=p||[];renderCats();render()}
function renderCats'''
s = s[:m.start()] + load_block + s[m.end():]

# 4) Card: nếu đã mua -> Tải / Đã mua
pat = re.compile(r"function render\(\)\{.*?\}\n\$\('search'\)\.oninput=render;", re.S)
m = pat.search(s)
if not m:
    sys.exit('ERROR: Không tìm thấy function render().')
render_block = '''function render(){const q=$('search').value.toLowerCase().trim(),list=products.filter(p=>(active==='all'||String(p.category_id)===active)&&(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q)));$('grid').innerHTML=list.map(p=>{const own=owned.get(p.id),canDownload=!!own&&p.delivery_type==='download',label=canDownload?'Tải':(own?'Đã mua':'Mua');return `<article class="card" onclick="product('${p.id}')"><div class="cover" style="background-image:url('${esc(p.cover_url||'')}')"><span class="pill">${esc(p.categories?.name||'Sản phẩm')}</span>${own?'<span class="pill" style="left:auto;right:10px;background:rgba(20,120,90,.82)">✓ Đã sở hữu</span>':''}</div><div class="body"><div class="name">${esc(p.name)}</div><div class="row"><div><div class="price">${money(p.price)}</div><div class="stock">${p.stock_mode==='limited'?'Còn '+av(p):'Không giới hạn'}</div></div><button class="btn" onclick="event.stopPropagation();ownedAction('${p.id}')">${label}</button></div></div></article>`}).join('')||'<div class="muted">Chưa có sản phẩm.</div>'}
async function ownedAction(id){const p=products.find(x=>x.id===id),o=owned.get(id);if(!p)return;if(o&&p.delivery_type==='download'){await getDownload(o.order_code,o.access_token);return}product(id)}
$('search').oninput=render;'''
s = s[:m.start()] + render_block + s[m.end():]

# 5) Modal sản phẩm: đã mua thì chỉ hiện tải, không còn nút mua
pat = re.compile(r"function product\(id\)\{.*?\}\nfunction authView", re.S)
m = pat.search(s)
if not m:
    sys.exit('ERROR: Không tìm thấy function product().')
product_block = '''function product(id){const p=products.find(x=>x.id===id);if(!p)return;const o=owned.get(id);if(o){openModal(`<h2>${esc(p.name)}</h2><p class="muted">${esc(p.description||'')}</p><div class="ok" style="font-size:20px;font-weight:900;margin:12px 0">✓ Bạn đã sở hữu sản phẩm này</div>${p.delivery_type==='download'?`<button class="btn" onclick="getDownload('${esc(o.order_code)}','${esc(o.access_token)}')">Tải sản phẩm</button>`:'<div class="muted">Sản phẩm đã được ghi nhận trong tài khoản của bạn.</div>'}<div id="dlmsg" class="muted" style="margin-top:10px"></div>`);return}openModal(`<h2>${esc(p.name)}</h2><p class="muted">${esc(p.description||'')}</p><div class="bigbalance">${money(p.price)}</div><p>${me?`Số dư của bạn: <b>${money(profile?.balance||0)}</b>`:'Đăng nhập để thanh toán bằng số dư.'}</p>${me?`<button class="btn" onclick="walletBuy('${p.id}')">Mua bằng số dư</button> <button class="btn ghost" onclick="openTopup()">Nạp tiền</button>`:`<button class="btn" onclick="authView('login')">Đăng nhập</button>`}`)}
function authView'''
s = s[:m.start()] + product_block + s[m.end():]

# 6) Login/logout cập nhật ngay trạng thái nút sản phẩm
s = re.sub(
    r"async function login\(\)\{.*?\}\nasync function logout\(\)\{.*?\}",
    "async function login(){const {error}=await sb.auth.signInWithPassword({email:$('em').value.trim(),password:$('pw').value});if(error){$('authmsg').textContent=error.message;return}await loadAuth();await loadOwned();render();closeModal();openAccount()}\nasync function logout(){await sb.auth.signOut();me=profile=null;owned.clear();closeModal();await loadAuth();render()}",
    s, count=1, flags=re.S
)

# 7) Sau khi mua thành công, đánh dấu sở hữu ngay trên card
pat = re.compile(r"async function walletBuy\(id\)\{.*?\}\nasync function getDownload", re.S)
m = pat.search(s)
if not m:
    sys.exit('ERROR: Không tìm thấy walletBuy/getDownload.')
wallet_block = '''async function walletBuy(id){const {data,error}=await sb.rpc('wallet_purchase',{p_product_id:id,p_quantity:1});if(error){const msg=String(error.message||'');if(msg.toLowerCase().includes('đã mua')){await loadOwned();render();openModal(`<h2>Đã sở hữu</h2><p class="muted">Bạn đã mua sản phẩm này. Hãy bấm Tải ở cửa hàng hoặc vào Tài khoản để tải lại.</p>`);return}openModal(`<h2>Không thể mua</h2><p class="bad">${esc(msg)}</p><button class="btn" onclick="openTopup()">Nạp tiền</button>`);return}await loadAuth();await loadOwned();render();openModal(`<h2 class="ok">✓ Mua thành công</h2><p>${esc(data.product_name)}</p><div class="bigbalance">${money(data.amount)}</div><p>Số dư còn lại: <b>${money(data.balance_after)}</b></p>${data.delivery_type==='download'?`<button class="btn" onclick="getDownload('${esc(data.order_code)}','${esc(data.access_token)}')">Tải sản phẩm</button>`:''}<div id="dlmsg" class="muted"></div>`)}
async function getDownload'''
s = s[:m.start()] + wallet_block + s[m.end():]

# 8) Download: lỗi thì hiện modal thay vì JS lỗi khi bấm trực tiếp từ card
pat = re.compile(r"async function getDownload\(code,token\)\{.*?\}\nload\(\);", re.S)
m = pat.search(s)
if not m:
    sys.exit('ERROR: Không tìm thấy getDownload().')
download_block = '''async function getDownload(code,token){try{const session=(await sb.auth.getSession()).data.session;const r=await fetch(`${C.SUPABASE_URL}/functions/v1/create-download-link`,{method:'POST',headers:{'Content-Type':'application/json','apikey':C.SUPABASE_ANON_KEY,'Authorization':'Bearer '+(session?.access_token||C.SUPABASE_ANON_KEY)},body:JSON.stringify({order_code:code,access_token:token})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Không tạo được link tải');location.href=d.url}catch(e){const box=$('dlmsg');if(box)box.textContent=e.message;else openModal(`<h2>Không thể tải</h2><p class="bad">${esc(e.message)}</p><p class="muted">Kiểm tra Edge Function create-download-link và file sản phẩm trong Storage.</p>`)}}
load();'''
s = s[:m.start()] + download_block + s[m.end():]

if s == orig:
    sys.exit('ERROR: Không có thay đổi nào được áp dụng.')

p.write_text(s, encoding='utf-8')
print('OK: Đã đổi slogan + nút Mua thành Tải khi đã sở hữu + cập nhật trạng thái ngay sau mua.')
print('Tiếp theo: git add index.html && git commit -m "Improve owned product UI" && git pull --rebase origin main && git push origin main')
