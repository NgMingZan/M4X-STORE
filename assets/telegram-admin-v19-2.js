(() => {
  'use strict';
  const tg = window.Telegram?.WebApp;
  const $ = id => document.getElementById(id);
  const C = window.M4X_CONFIG || {};
  const base = String(C.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(C.SUPABASE_ANON_KEY || C.SUPABASE_PUBLISHABLE_KEY || '');
  const initData = tg?.initData || '';
  let boot = null;

  function fn(name){ return `${base}/functions/v1/${name}`; }
  function headers(json=true){ const h={}; if(json)h['Content-Type']='application/json'; if(key)h.apikey=key; return h; }
  function msg(id,text,ok=false){ const e=$(id); if(!e)return; e.textContent=text||''; e.style.color=ok?'#5ce4a3':'#8c9aae'; }
  const toLocal = iso => { if(!iso)return ''; const d=new Date(iso); if(isNaN(d))return ''; const x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,16); };
  const toIso = v => { if(!v)return null; const d=new Date(v); return isNaN(d)?null:d.toISOString(); };

  async function api(action,payload={}){
    const r=await fetch(fn('telegram-admin'),{method:'POST',headers:headers(true),body:JSON.stringify({initData,action,payload})});
    const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`); return j;
  }

  async function upload(file){
    const fd=new FormData(); fd.append('initData',initData); fd.append('file',file);
    const r=await fetch(fn('telegram-admin-upload'),{method:'POST',headers:headers(false),body:fd});
    const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`); return j.url;
  }

  function setFatal(text){ document.body.innerHTML=`<div class="fatal"><h2>Không thể mở Admin Telegram</h2><p>${String(text||'')}</p></div>`; }

  function tabs(){ document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')}); }

  function fillHero(h={}){
    $('hEnabled').checked=!!h.enabled; $('hVariant').value=h.variant||'custom'; $('hEyebrow').value=h.eyebrow||''; $('hTitle').value=h.title||''; $('hAccent').value=h.accent_text||''; $('hDesc').value=h.description||''; $('hImage').value=h.image_url||'';
    $('hPrimaryText').value=h.primary_button_text||''; $('hPrimaryAction').value=h.primary_action||'none'; $('hPrimaryUrl').value=h.primary_url||''; $('hSecondaryText').value=h.secondary_button_text||''; $('hSecondaryAction').value=h.secondary_action||'none'; $('hSecondaryUrl').value=h.secondary_url||'';
    $('hStart').value=toLocal(h.starts_at); $('hEnd').value=toLocal(h.ends_at); $('hCountdown').checked=!!h.show_countdown; $('hRestore').checked=h.auto_restore!==false; preview();
  }

  function heroPayload(){ return {enabled:$('hEnabled').checked,variant:$('hVariant').value,eyebrow:$('hEyebrow').value.trim(),title:$('hTitle').value.trim(),accent_text:$('hAccent').value.trim(),description:$('hDesc').value.trim(),image_url:$('hImage').value.trim(),primary_button_text:$('hPrimaryText').value.trim(),primary_action:$('hPrimaryAction').value,primary_url:$('hPrimaryUrl').value.trim(),secondary_button_text:$('hSecondaryText').value.trim(),secondary_action:$('hSecondaryAction').value,secondary_url:$('hSecondaryUrl').value.trim(),starts_at:toIso($('hStart').value),ends_at:toIso($('hEnd').value),show_countdown:$('hCountdown').checked,auto_restore:$('hRestore').checked}; }

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function preview(){const p=heroPayload();const box=$('heroPreview');box.style.backgroundImage=p.image_url?`url("${p.image_url.replace(/"/g,'%22')}")`:'';box.innerHTML=`<div class="copy"><small>${esc(p.eyebrow||'M4X STORE')}</small><h4>${esc(p.title||'Sản phẩm số')} <span>${esc(p.accent_text||'được chọn lọc.')}</span></h4><p>${esc(p.description||'Nội dung Hero sẽ hiển thị tại đây.')}</p></div>`;}

  function fillRelease(r={}){ $('rVersion').value=r.version||'19.0.0'; $('rBuild').value=Number(r.build||1900); $('rMessage').value=r.message||''; $('rMandatory').checked=!!r.mandatory; $('rAuto').checked=!!r.auto_reload; $('releaseInfo').textContent=`Token: ${r.force_reload_token||'-'} · cập nhật ${r.updated_at?new Date(r.updated_at).toLocaleString('vi-VN'):'-'}`; }

  function fillChannelAuto(c={}){
    $('cEnabled').checked=c.enabled!==false;
    $('cDaily').checked=c.daily_enabled!==false;
    $('cTime1').value=String(c.daily_time_1||'08:00').slice(0,5);
    $('cTime2').value=String(c.daily_time_2||'20:00').slice(0,5);
    $('cProduct').checked=c.new_product_enabled!==false;
    $('cHero').checked=c.hero_enabled!==false;
    $('cUpdate').checked=c.online_update_enabled!==false;
    $('cRepost').checked=!!c.repost_enabled;
    $('cRepostDays').value=Number(c.repost_days||3);
    $('cStock').checked=c.stock_enabled!==false;
    $('cStockAlert').checked=c.stock_alert_enabled!==false;
    $('cStockThreshold').value=Number(c.stock_low_threshold||5);
  }
  function channelPayload(){ return {
    enabled:$('cEnabled').checked,daily_enabled:$('cDaily').checked,daily_time_1:$('cTime1').value||'08:00',daily_time_2:$('cTime2').value||'20:00',
    new_product_enabled:$('cProduct').checked,hero_enabled:$('cHero').checked,online_update_enabled:$('cUpdate').checked,
    repost_enabled:$('cRepost').checked,repost_days:Number($('cRepostDays').value||3),
    stock_enabled:$('cStock').checked,stock_alert_enabled:$('cStockAlert').checked,stock_low_threshold:Number($('cStockThreshold').value||5)
  }; }

  async function load(){
    if(!tg||!initData)return setFatal('Hãy mở trang này từ nút 👑 Admin bên trong M4X Telegram Mini App.');
    if(!base)return setFatal('Thiếu SUPABASE_URL trong config.js.');
    try{tg.ready();tg.expand();tg.BackButton?.show();tg.BackButton&&(tg.BackButton.onClick(()=>history.length>1?history.back():location.replace('./index.html')));}catch(_){ }
    try{boot=await api('bootstrap'); if(!boot.is_admin)throw new Error('Tài khoản Telegram này không có quyền Admin.'); $('tgStatus').textContent=`● ${boot.user?.first_name||boot.user?.username||boot.user?.id}`;$('tgStatus').classList.add('ok');fillHero(boot.hero||{});fillRelease(boot.release||{});fillChannelAuto(boot.channel_automation||{});$('botUser').textContent=boot.bot_username?`@${boot.bot_username.replace(/^@/,'')}`:'Chưa cấu hình';$('miniUrl').textContent=boot.miniapp_url||'-';$('channelUrl').textContent=boot.channel_url||'-';tabs();wire();}
    catch(e){setFatal(e.message||e);}
  }

  function wire(){
    ['hEnabled','hVariant','hEyebrow','hTitle','hAccent','hDesc','hImage','hPrimaryText','hPrimaryAction','hPrimaryUrl','hSecondaryText','hSecondaryAction','hSecondaryUrl','hStart','hEnd','hCountdown','hRestore'].forEach(id=>$(id)?.addEventListener('input',preview));
    $('heroFile').onchange=async()=>{const f=$('heroFile').files?.[0];if(!f)return;msg('heroMsg','Đang tải ảnh...');try{const url=await upload(f);$('hImage').value=url;preview();msg('heroMsg','Đã tải ảnh lên Storage.',true);}catch(e){msg('heroMsg',e.message)}};
    $('saveHero').onclick=async()=>{msg('heroMsg','Đang lưu...');try{const j=await api('save_hero',heroPayload());fillHero(j.hero);msg('heroMsg','Đã lưu. Store sẽ đổi online trong vài giây.',true);try{tg.HapticFeedback?.notificationOccurred?.('success')}catch(_){}}catch(e){msg('heroMsg',e.message)}};
    $('defaultHero').onclick=async()=>{msg('heroMsg','Đang khôi phục Hero mặc định...');try{await api('restore_hero');$('hEnabled').checked=false;msg('heroMsg','Đã về Hero mặc định.',true);}catch(e){msg('heroMsg',e.message)}};
    $('saveRelease').onclick=async()=>{msg('releaseMsg','Đang lưu...');try{const j=await api('save_release',{version:$('rVersion').value.trim(),build:Number($('rBuild').value||1900),message:$('rMessage').value.trim(),mandatory:$('rMandatory').checked,auto_reload:$('rAuto').checked,bump_token:false});fillRelease(j.release);msg('releaseMsg','Đã lưu cấu hình update.',true);}catch(e){msg('releaseMsg',e.message)}};
    $('publishRelease').onclick=async()=>{msg('releaseMsg','Đang phát bản cập nhật...');try{const j=await api('save_release',{version:$('rVersion').value.trim(),build:Number($('rBuild').value||1900),message:$('rMessage').value.trim(),mandatory:$('rMandatory').checked,auto_reload:$('rAuto').checked,bump_token:true});fillRelease(j.release);msg('releaseMsg','Đã đổi update token. Người dùng đang mở app sẽ nhận thông báo.',true);}catch(e){msg('releaseMsg',e.message)}};
    $('botStatusBtn').onclick=async()=>{msg('botMsg','Đang kiểm tra webhook...');try{const j=await api('bot_status');msg('botMsg',`Webhook: ${j.webhook?.url||'chưa đặt'} · pending: ${j.webhook?.pending_update_count||0}`,true);}catch(e){msg('botMsg',e.message)}};
    $('postChannelBtn').onclick=async()=>{msg('botMsg','Đang đăng lên Channel...');try{const j=await api('publish_channel');msg('botMsg',j.message||'Đã đăng nút M4X Store lên Channel.',true);}catch(e){msg('botMsg',e.message)}};
    $('saveChannelAuto').onclick=async()=>{msg('channelAutoMsg','Đang lưu tự động đăng...');try{const j=await api('save_channel_automation',channelPayload());fillChannelAuto(j.channel_automation||{});msg('channelAutoMsg','Đã lưu. Cron chạy trên Supabase, không cần Termux.',true);}catch(e){msg('channelAutoMsg',e.message)}};
    $('channelAutoStatus').onclick=async()=>{msg('channelAutoMsg','Đang kiểm tra...');try{const j=await api('channel_automation_status');const last=j.last_post?.posted_at?new Date(j.last_post.posted_at).toLocaleString('vi-VN'):'chưa có';const stockId=j.config?.stock_message_id?` · tin kho #${j.config.stock_message_id}`:' · chưa tạo tin kho';msg('channelAutoMsg',`Queue chờ: ${j.pending||0} · lỗi: ${j.failed||0} · bài gần nhất: ${last}${stockId}`,true);}catch(e){msg('channelAutoMsg',e.message)}};
    $('refreshStockBtn').onclick=async()=>{msg('stockMsg','Đang yêu cầu cập nhật tồn kho...');try{const j=await api('refresh_stock_message');msg('stockMsg',j.message||'Đã đưa vào Queue.',true);}catch(e){msg('stockMsg',e.message)}};
  }

  load();
})();
