/* M4X STORE V8 - Community + Cart + QR + Themes + Badges + Custom Orders */
(() => {
  const V8 = window.M4XV8 = window.M4XV8 || {};
  const BADGE_LABELS = {
    early_user:'🌟 Early User',
    vip:'💎 VIP',
    top_buyer:'🏆 Top Buyer',
    beta_tester:'🧪 Beta Tester',
    contributor:'🤝 Contributor'
  };
  const THEME_LABELS = {dark:'Dark',amoled:'AMOLED',neon:'Neon',glass:'Liquid Glass'};
  const PUBLIC_STORE_URL = (C && C.PUBLIC_STORE_URL) || 'https://ngmingzan.github.io/M4X-STORE/';

  function v8Theme(){return localStorage.getItem('m4x_theme')||'dark'}
  function v8ApplyTheme(name){
    if(!THEME_LABELS[name])name='dark';
    document.documentElement.dataset.m4xTheme=name;
    localStorage.setItem('m4x_theme',name);
    document.querySelectorAll('[data-m4x-theme]').forEach(b=>b.classList.toggle('active',b.dataset.m4xTheme===name));
  }
  v8ApplyTheme(v8Theme());

  function v8BadgeHtml(list=[]){
    return list.map(x=>`<span class="accountBadge badge-${esc(x.badge)}">${esc(BADGE_LABELS[x.badge]||x.badge)}</span>`).join('');
  }

  function v8AvatarUrl(path){
    if(!path)return '';
    try{return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl||''}catch{return ''}
  }

  async function v8MyProfile(){
    if(!state.me)return null;
    const {data}=await sb.from('community_profiles').select('*').eq('user_id',state.me.id).maybeSingle();
    return data||null;
  }

  async function v8MyBadges(){
    if(!state.me)return [];
    const {data}=await sb.from('account_badges').select('badge,created_at').eq('user_id',state.me.id).order('created_at');
    return data||[];
  }

  function v8CartIds(){
    try{return [...new Set(JSON.parse(localStorage.getItem('m4x_cart')||'[]'))].filter(Boolean)}catch{return []}
  }
  function v8SaveCart(ids){localStorage.setItem('m4x_cart',JSON.stringify([...new Set(ids)]));v8UpdateCartBadge()}
  function v8CartProducts(){
    const ids=new Set(v8CartIds());
    return state.products.filter(p=>ids.has(p.id));
  }
  function v8UpdateCartBadge(){
    const n=v8CartIds().length;
    const b=document.getElementById('m4xCartQuick');
    if(b)b.innerHTML=`🛒 ${n?`<span class="badge">${n}</span>`:''}`;
  }
  function v8AddCart(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    if(p.delivery_type==='download'&&state.owned.has(id)){alert('File này bạn đã sở hữu. Hãy tải lại trong Thư viện.');return}
    if(['coming_soon','out_of_stock','discontinued'].includes(p.sale_status)){alert('Sản phẩm hiện chưa thể mua.');return}
    const ids=v8CartIds();
    if(!ids.includes(id))ids.push(id);
    v8SaveCart(ids);
    alert('Đã thêm vào giỏ hàng');
  }
  function v8RemoveCart(id){v8SaveCart(v8CartIds().filter(x=>x!==id));v8Cart()}
  function v8ClearCart(){v8SaveCart([]);v8Cart()}

  function v8Cart(){
    const items=v8CartProducts();
    const total=items.reduce((a,p)=>a+Number(p.price||0),0);
    openModal(`<h2>🛒 Giỏ hàng</h2>
      ${items.map(p=>`<div class="item cartItem"><div class="row"><div><b>${esc(p.name)}</b><div class="muted">${esc(p.categories?.name||p.delivery_type||'Sản phẩm')}</div></div><b>${money(p.price)}</b></div><button class="btn ghost" onclick="M4X.v8RemoveCart('${p.id}')">Bỏ khỏi giỏ</button></div>`).join('')||'<div class="muted">Giỏ hàng đang trống.</div>'}
      ${items.length?`<div class="invoiceTotal"><span>Tổng cộng</span><b>${money(total)}</b></div><div class="toolbar"><button class="btn" onclick="M4X.v8CheckoutCart()">Thanh toán ${items.length} sản phẩm</button><button class="btn ghost" onclick="M4X.v8ClearCart()">Xóa giỏ</button></div>`:''}`);
  }

  async function v8CheckoutCart(){
    if(!state.me)return auth('login');
    const ids=v8CartIds();
    if(!ids.length)return;
    const {data,error}=await sb.rpc('wallet_cart_purchase',{p_product_ids:ids});
    if(error){alert(error.message);return}
    v8SaveCart([]);
    await Promise.all([loadAuth(),loadOwned(),loadNotifications(),loadProducts()]);
    const orders=Array.isArray(data?.orders)?data.orders:[];
    openModal(`<h2 class="ok">✓ Thanh toán thành công</h2><p>Mã nhóm: <b>${esc(data.batch_code||'')}</b></p><div class="big">${money(data.amount)}</div><p>Số dư còn lại: <b>${money(data.balance_after)}</b></p>${orders.map(o=>`<div class="item"><div class="row"><b>${esc(o.product_name)}</b><span>${money(o.amount)}</span></div>${o.delivery_type==='download'?`<button class="btn" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">Tải</button>`:''}</div>`).join('')}`);
  }

  function v8ProductShareUrl(id){
    try{const u=new URL(PUBLIC_STORE_URL);u.searchParams.set('product',id);return u.toString()}catch{return PUBLIC_STORE_URL+'?product='+encodeURIComponent(id)}
  }
  let v8QrPromise=null;
  function v8LoadQr(){
    if(window.QRCode)return Promise.resolve();
    if(v8QrPromise)return v8QrPromise;
    v8QrPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được thư viện QR'));
      document.head.appendChild(s);
    });
    return v8QrPromise;
  }
  async function v8ShareProduct(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    const url=v8ProductShareUrl(id);
    openModal(`<h2>QR Share</h2><p><b>${esc(p.name)}</b></p><div id="m4xQrBox" class="qrBox"></div><div class="toolbar"><button class="btn" onclick="M4X.v8NativeShare('${id}')">Chia sẻ</button><button class="btn ghost" onclick="M4X.v8ShareTelegram('${id}')">Telegram</button><button class="btn ghost" onclick="M4X.v8ShareFacebook('${id}')">Facebook</button></div><div class="item"><span class="muted">Link</span><br><small>${esc(url)}</small></div>`);
    try{
      await v8LoadQr();
      const box=$('m4xQrBox');box.innerHTML='';
      new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
    }catch(e){$('m4xQrBox').innerHTML=`<div class="badtxt">${esc(e.message)}</div>`}
  }
  async function v8NativeShare(id){
    const p=state.products.find(x=>x.id===id);if(!p)return;
    const url=v8ProductShareUrl(id);
    if(navigator.share){try{await navigator.share({title:p.name,text:`Xem ${p.name} trên M4X STORE`,url});return}catch{}}
    try{await navigator.clipboard.writeText(url);alert('Đã sao chép link sản phẩm')}catch{prompt('Sao chép link:',url)}
  }
  function v8ShareTelegram(id){const p=state.products.find(x=>x.id===id);const url=v8ProductShareUrl(id);location.href=`tg://msg_url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p?.name||'M4X STORE')}`}
  function v8ShareFacebook(id){const url=v8ProductShareUrl(id);location.href=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}

  async function v8ChangeAvatar(){
    const file=$('m4xAvatarInput')?.files?.[0];if(!file)return alert('Chọn ảnh từ album trước.');
    if(file.size>5*1024*1024)return alert('Avatar tối đa 5 MB.');
    if(!String(file.type||'').startsWith('image/'))return alert('Chỉ được chọn file ảnh.');
    const current=await v8MyProfile();
    const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase()||'jpg';
    const path=`${state.me.id}/avatar-${Date.now()}.${ext}`;
    const {error}=await sb.storage.from('avatars').upload(path,file,{upsert:false});
    if(error)return alert(error.message);
    const {error:pe}=await sb.rpc('set_my_avatar',{p_avatar_path:path});
    if(pe){await sb.storage.from('avatars').remove([path]);return alert(pe.message)}
    if(current?.avatar_path)await sb.storage.from('avatars').remove([current.avatar_path]).catch(()=>{});
    alert('Đã đổi ảnh đại diện.');
    await renderAccount();
  }

  async function v8AccountBlock(){
    if(!state.me)return '';
    const [cp,badges]=await Promise.all([v8MyProfile(),v8MyBadges()]);
    const avatar=v8AvatarUrl(cp?.avatar_path);
    return `<div class="sectionTitle">Cá nhân hóa & Cộng đồng</div>
      <div class="item profileV8">
        <div class="profileHead"><div class="avatar avatarBig">${avatar?`<img src="${esc(avatar)}">`:'<span>👤</span>'}</div><div><b>${esc(cp?.display_name||state.profile?.display_name||'Thành viên M4X')}</b><div class="badgeRow">${v8BadgeHtml(badges)}</div></div></div>
        <label>Ảnh đại diện từ album</label><input id="m4xAvatarInput" class="input" type="file" accept="image/*"><button class="btn ghost" onclick="M4X.v8ChangeAvatar()">Đổi avatar</button>
      </div>
      <div class="item"><b>🌙 Chế độ giao diện</b><div class="themePicker">${Object.entries(THEME_LABELS).map(([k,v])=>`<button class="themeChoice ${v8Theme()===k?'active':''}" data-m4x-theme="${k}" onclick="M4X.v8SetTheme('${k}')">${v}</button>`).join('')}</div></div>
      <div class="grid2 v8Actions"><button class="btn ghost" onclick="M4X.v8Cart()">🛒 Giỏ hàng</button><button class="btn ghost" onclick="M4X.v8CustomRequests()">🧩 Đặt hàng theo yêu cầu</button><button class="btn ghost" onclick="M4X.v8OpenCommunity()">💬 Community Chat</button></div>`;
  }

  function v8SetTheme(name){v8ApplyTheme(name)}

  const v8OldRenderAccount = renderAccount;
  renderAccount = async function(){
    await v8OldRenderAccount();
    if(!state.me)return;
    const block=document.createElement('div');
    block.id='m4xV8Account';
    block.innerHTML=await v8AccountBlock();
    const sections=$('view').querySelectorAll('.sectionTitle');
    if(sections[1])$('view').insertBefore(block,sections[1]); else $('view').appendChild(block);
  };

  const v8OldProduct = product;
  product = function(id){
    v8OldProduct(id);
    const p=state.products.find(x=>x.id===id);if(!p)return;
    const host=$('modalContent');if(!host)return;
    const actions=document.createElement('div');
    actions.className='toolbar v8ProductTools';
    const canCart=!(p.delivery_type==='download'&&state.owned.has(id))&&!['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    actions.innerHTML=`${canCart?`<button class="btn ghost" onclick="M4X.v8AddCart('${id}')">+ Giỏ hàng</button>`:''}<button class="btn ghost" onclick="M4X.v8ShareProduct('${id}')">▦ QR Share</button>`;
    host.appendChild(actions);
  };

  async function v8CustomRequests(){
    if(!state.me)return auth('login');
    const {data,error}=await sb.from('custom_requests').select('*').eq('user_id',state.me.id).order('updated_at',{ascending:false});
    if(error)return alert(error.message);
    openModal(`<h2>🧩 Đặt hàng theo yêu cầu</h2><p class="muted">Cần Theme / Tool / AI / dịch vụ riêng? Gửi yêu cầu, Admin sẽ báo giá trong app.</p><button class="btn" onclick="M4X.v8NewCustomRequest()">+ Gửi yêu cầu mới</button>${(data||[]).map(r=>`<div class="item customReq"><div class="row"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.request_code)} · ${esc(r.request_type)}</div></div><span class="statusTag ${esc(r.status)}">${esc(v8RequestStatus(r.status))}</span></div><p>${esc(r.description)}</p>${r.budget!=null?`<div class="muted">Ngân sách dự kiến: ${money(r.budget)}</div>`:''}${r.quote_amount!=null?`<div class="quoteBox"><span>Admin báo giá</span><b>${money(r.quote_amount)}</b></div>`:''}${r.admin_note?`<div class="notice">${esc(r.admin_note)}</div>`:''}<div class="toolbar">${r.status==='quoted'?`<button class="btn" onclick="M4X.v8AcceptCustom('${r.id}')">Thanh toán báo giá</button>`:''}${['requested','quoted'].includes(r.status)?`<button class="btn ghost" onclick="M4X.v8CancelCustom('${r.id}')">Hủy yêu cầu</button>`:''}${r.order_id?`<button class="btn ghost" onclick="M4X.orderHistory()">Xem đơn hàng</button>`:''}</div></div>`).join('')||'<div class="muted">Bạn chưa có yêu cầu nào.</div>'}`);
  }
  function v8RequestStatus(s){return ({requested:'Đã gửi',quoted:'Đã báo giá',accepted:'Đã thanh toán',rejected:'Từ chối',cancelled:'Đã hủy',completed:'Hoàn thành'})[s]||s}
  function v8NewCustomRequest(){
    openModal(`<h2>Gửi yêu cầu mới</h2><label>Loại yêu cầu</label><select id="v8ReqType" class="select"><option value="theme">Theme</option><option value="tool">Tool</option><option value="ai">AI</option><option value="service">Dịch vụ</option><option value="other">Khác</option></select><label>Tiêu đề</label><input id="v8ReqTitle" class="input" placeholder="Ví dụ: Cần theme HyperOS theo mẫu"><label>Mô tả chi tiết</label><textarea id="v8ReqDesc" class="textarea" placeholder="Mô tả rõ yêu cầu, thiết bị, phiên bản..."></textarea><label>Ngân sách dự kiến (không bắt buộc)</label><input id="v8ReqBudget" class="input" type="number" min="0" step="1000" placeholder="Ví dụ 100000"><button class="btn" onclick="M4X.v8SubmitCustom()">Gửi cho Admin</button><div id="v8ReqMsg" class="muted"></div>`);
  }
  async function v8SubmitCustom(){
    const {data,error}=await sb.rpc('create_custom_request',{p_request_type:$('v8ReqType').value,p_title:$('v8ReqTitle').value.trim(),p_description:$('v8ReqDesc').value.trim(),p_budget:$('v8ReqBudget').value?Number($('v8ReqBudget').value):null});
    if(error){$('v8ReqMsg').textContent=error.message;return}
    alert('Đã gửi yêu cầu '+data.request_code);v8CustomRequests();
  }
  async function v8AcceptCustom(id){
    if(!confirm('Thanh toán báo giá bằng số dư M4X STORE?'))return;
    const {data,error}=await sb.rpc('accept_custom_quote',{p_request_id:id});
    if(error)return alert(error.message);
    await Promise.all([loadAuth(),loadNotifications()]);
    alert(`Đã thanh toán ${money(data.amount)} · Mã đơn ${data.order_code}`);v8CustomRequests();
  }
  async function v8CancelCustom(id){
    if(!confirm('Hủy yêu cầu này?'))return;
    const {error}=await sb.rpc('cancel_custom_request',{p_request_id:id});
    if(error)return alert(error.message);v8CustomRequests();
  }

  async function v8ChatImageUrl(path){
    if(!path)return '';
    const {data,error}=await sb.storage.from('community-images').createSignedUrl(path,600);
    return error?'':(data?.signedUrl||'');
  }

  async function v8CommunityData(){
    const {data:msgs,error}=await sb.from('chat_messages').select('*').order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const messages=(msgs||[]).reverse();
    const ids=[...new Set(messages.map(x=>x.user_id).filter(Boolean))];
    const [pRes,bRes,mRes,sRes,ownModRes]=await Promise.all([
      ids.length?sb.from('community_profiles').select('*').in('user_id',ids):Promise.resolve({data:[]}),
      ids.length?sb.from('account_badges').select('user_id,badge').in('user_id',ids):Promise.resolve({data:[]}),
      sb.from('community_moderators').select('user_id'),
      sb.from('community_settings').select('*').eq('id',1).maybeSingle(),
      state.me?sb.rpc('is_chat_moderator'):Promise.resolve({data:false})
    ]);
    const profiles=new Map((pRes.data||[]).map(x=>[x.user_id,x]));
    const badges=new Map();
    for(const b of bRes.data||[]){if(!badges.has(b.user_id))badges.set(b.user_id,[]);badges.get(b.user_id).push(b)}
    const mods=new Set((mRes.data||[]).map(x=>x.user_id));
    const imagePairs=await Promise.all(messages.filter(x=>x.image_path&&!x.deleted_at).map(async x=>[x.id,await v8ChatImageUrl(x.image_path)]));
    return {messages,profiles,badges,mods,settings:sRes.data||null,isMod:!!ownModRes.data,images:new Map(imagePairs)};
  }

  function v8EnsureChatRealtime(){
    if(state.v8ChatChannel||!state.me)return;
    state.v8ChatChannel=sb.channel('m4x-community-v8')
      .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},()=>{if(state.view==='community')v8RenderCommunity(false)})
      .on('postgres_changes',{event:'*',schema:'public',table:'community_settings'},()=>{if(state.view==='community')v8RenderCommunity(false)})
      .subscribe();
  }

  async function v8RenderCommunity(showLoading=true){
    if(!state.me){$('view').innerHTML='<div class="sectionTitle">💬 Community Chat</div><div class="item"><p class="muted">Đăng nhập để tham gia phòng chat chung M4X.</p><button class="btn" onclick="M4X.auth(\'login\')">Đăng nhập</button></div>';return}
    if(showLoading)$('view').innerHTML='<div class="sectionTitle">💬 Community Chat</div><div class="muted">Đang tải phòng chat...</div>';
    try{
      const d=await v8CommunityData();v8EnsureChatRealtime();
      const byId=new Map(d.messages.map(x=>[x.id,x]));
      const pinned=d.settings?.pinned_message_id?byId.get(d.settings.pinned_message_id):null;
      const reply=state.v8ReplyTo?byId.get(state.v8ReplyTo):null;
      $('view').innerHTML=`<div class="communityWrap"><div class="communityHeader"><div><div class="sectionTitle">💬 Community M4X</div><div class="muted">1 phòng chung · chat realtime</div></div><button class="btn ghost" onclick="M4X.v8GoAccount()">Avatar</button></div>${pinned?`<div class="pinnedChat">📌 <b>${esc(d.profiles.get(pinned.user_id)?.display_name||'Thành viên')}</b>: ${esc(pinned.message||'Ảnh')}</div>`:''}<div id="m4xChatList" class="chatList">${d.messages.map(m=>v8MessageHtml(m,d,byId)).join('')||'<div class="muted">Chưa có tin nhắn. Hãy là người đầu tiên!</div>'}</div>${reply?`<div class="replyComposer">↩ Đang trả lời: ${esc(reply.message||'Ảnh')} <button onclick="M4X.v8CancelReply()">×</button></div>`:''}<div class="chatComposer"><input id="v8ChatImage" type="file" accept="image/*" hidden><button class="chatIconBtn" onclick="document.getElementById('v8ChatImage').click()">＋</button><textarea id="v8ChatText" rows="1" placeholder="Nhập tin nhắn..."></textarea><button class="btn" onclick="M4X.v8SendChat()">➤</button></div></div>`;
      setTimeout(()=>{const el=$('m4xChatList');if(el)el.scrollTop=el.scrollHeight},20);
    }catch(e){$('view').innerHTML=`<div class="sectionTitle">Community Chat</div><div class="badtxt">${esc(e.message)}</div>`}
  }

  function v8MessageHtml(m,d,byId){
    if(m.deleted_at)return `<div class="chatDeleted">Tin nhắn đã bị xóa · ${dt(m.created_at)}</div>`;
    const p=d.profiles.get(m.user_id)||{};
    const avatar=v8AvatarUrl(p.avatar_path);
    const isAdmin=p.role==='admin';const isMod=d.mods.has(m.user_id);
    const badges=d.badges.get(m.user_id)||[];
    const rep=m.reply_to?byId.get(m.reply_to):null;
    const mine=m.user_id===state.me.id;
    return `<div class="chatMessage ${mine?'mine':''}"><div class="avatar">${avatar?`<img src="${esc(avatar)}">`:'<span>👤</span>'}</div><div class="chatBubble"><div class="chatName"><b>${esc(p.display_name||'Thành viên')}</b>${isAdmin?'<span class="miniRole adminRole">ADMIN</span>':isMod?'<span class="miniRole modRole">MOD</span>':''}<span class="badgeRow miniBadges">${v8BadgeHtml(badges)}</span></div>${rep?`<div class="quotedMsg">↩ ${esc(rep.message||'Ảnh')}</div>`:''}${m.message?`<div class="chatText">${esc(m.message)}</div>`:''}${d.images.get(m.id)?`<img class="chatImage" src="${esc(d.images.get(m.id))}">`:''}<div class="chatMeta">${dt(m.created_at)}</div><div class="chatTools"><button onclick="M4X.v8ReplyChat('${m.id}')">Trả lời</button>${mine||d.isMod?`<button onclick="M4X.v8DeleteChat('${m.id}')">Xóa</button>`:''}${!mine?`<button onclick="M4X.v8ReportChat('${m.id}')">Báo cáo</button>`:''}${d.isMod&&!mine?`<button onclick="M4X.v8ModerateUser('${m.user_id}')">Quản lý</button><button onclick="M4X.v8PinChat('${m.id}')">Ghim</button>`:''}</div></div></div>`;
  }

  async function v8SendChat(){
    const text=($('v8ChatText')?.value||'').trim();
    const file=$('v8ChatImage')?.files?.[0];
    if(!text&&!file)return;
    let path=null;
    if(file){
      if(file.size>5*1024*1024)return alert('Ảnh chat tối đa 5 MB.');
      if(!String(file.type||'').startsWith('image/'))return alert('Chỉ được gửi ảnh.');
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      path=`${state.me.id}/${Date.now()}-${safe}`;
      const {error}=await sb.storage.from('community-images').upload(path,file,{upsert:false});
      if(error)return alert(error.message);
    }
    const {error}=await sb.rpc('send_community_message',{p_message:text||null,p_image_path:path,p_reply_to:state.v8ReplyTo||null});
    if(error){if(path)await sb.storage.from('community-images').remove([path]).catch(()=>{});return alert(error.message)}
    state.v8ReplyTo=null;await v8RenderCommunity(false);
  }
  function v8ReplyChat(id){state.v8ReplyTo=id;v8RenderCommunity(false)}
  function v8CancelReply(){state.v8ReplyTo=null;v8RenderCommunity(false)}
  async function v8DeleteChat(id){if(!confirm('Xóa tin nhắn này?'))return;const {error}=await sb.rpc('delete_community_message',{p_message_id:id});if(error)alert(error.message);else v8RenderCommunity(false)}
  async function v8ReportChat(id){const reason=prompt('Lý do báo cáo tin nhắn:','Spam / nội dung không phù hợp');if(reason===null)return;const {error}=await sb.rpc('report_community_message',{p_message_id:id,p_reason:reason});alert(error?error.message:'Đã gửi báo cáo cho MOD/Admin.')}
  async function v8PinChat(id){const {error}=await sb.rpc('pin_community_message',{p_message_id:id});if(error)alert(error.message);else v8RenderCommunity(false)}
  async function v8ModerateUser(uid){
    const a=prompt('Chọn thao tác: mute1 / mute24 / unmute / ban / unban','mute1');if(!a)return;
    const map={mute1:'mute_1h',mute24:'mute_24h',unmute:'unmute',ban:'ban',unban:'unban'};if(!map[a])return alert('Thao tác không hợp lệ');
    const reason=['mute1','mute24','ban'].includes(a)?(prompt('Lý do:','Vi phạm quy định Community')||'Vi phạm quy định Community'):null;
    const {error}=await sb.rpc('moderate_community_user',{p_user_id:uid,p_action:map[a],p_reason:reason});alert(error?error.message:'Đã cập nhật quyền chat.')
  }
  function v8OpenCommunity(){closeModal();setView('community')}
  function v8GoAccount(){setView('account')}

  const v8OldRenderView=renderView;
  renderView=function(){
    if(state.view==='community')return v8RenderCommunity();
    return v8OldRenderView();
  };

  function v8InjectUi(){
    const top=document.querySelector('.top');
    if(top&&!document.getElementById('m4xCartQuick')){
      const b=document.createElement('button');b.id='m4xCartQuick';b.className='btn ghost cartQuick';b.onclick=v8Cart;
      top.insertBefore(b,$('accountQuick'));v8UpdateCartBadge();
    }
    const nav=document.querySelector('.bottomnav');
    if(nav&&!nav.querySelector('[data-view="community"]')){
      const b=document.createElement('button');b.className='navbtn';b.dataset.view='community';b.textContent='Cộng đồng';b.onclick=()=>setView('community');nav.insertBefore(b,nav.querySelector('[data-view="notifications"]'));
    }
  }

  function v8OpenSharedProduct(){
    const id=new URLSearchParams(location.search).get('product');if(!id)return;
    let tries=0;const t=setInterval(()=>{tries++;if(state.products?.some(x=>x.id===id)){clearInterval(t);setView('store');product(id)}else if(tries>30)clearInterval(t)},200);
  }

  Object.assign(M4X,{
    v8SetTheme,v8AddCart,v8RemoveCart,v8ClearCart,v8Cart,v8CheckoutCart,
    v8ShareProduct,v8NativeShare,v8ShareTelegram,v8ShareFacebook,v8ChangeAvatar,
    v8CustomRequests,v8NewCustomRequest,v8SubmitCustom,v8AcceptCustom,v8CancelCustom,
    v8OpenCommunity,v8GoAccount,v8SendChat,v8ReplyChat,v8CancelReply,v8DeleteChat,
    v8ReportChat,v8PinChat,v8ModerateUser
  });
  M4X.product=product;

  v8InjectUi();
  v8OpenSharedProduct();
})();
