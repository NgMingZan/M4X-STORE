(() => {
  'use strict';
  const VERSION='19.3';
  let sb=null, overlay=null, observer=null, busy=false, lastData=null;
  const $=id=>document.getElementById(id);
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const bool=(v,d=false)=>v===undefined||v===null?d:!!v;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function cfg(){
    const c=window.M4X_CONFIG||window.M4XConfig||window.CONFIG||{};
    return {
      url:c.SUPABASE_URL||c.supabaseUrl||window.SUPABASE_URL||'',
      key:c.SUPABASE_ANON_KEY||c.SUPABASE_PUBLISHABLE_KEY||c.SUPABASE_KEY||c.supabaseAnonKey||window.SUPABASE_ANON_KEY||''
    };
  }
  async function client(){
    if(sb)return sb;
    const c=cfg();
    if(!c.url||!c.key)throw new Error('Không tìm thấy SUPABASE_URL / publishable key trong config.js');
    if(!window.supabase?.createClient)throw new Error('Trang Admin chưa tải Supabase JS');
    sb=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    if(!data?.session)throw new Error('Bạn chưa đăng nhập Admin hoặc phiên đăng nhập đã hết hạn');
    return sb;
  }
  function msg(t,ok=false){const e=$('m4xTgPortalMsg');if(e){e.textContent=t||'';e.style.color=ok?'#57e6a1':'#9eb6c8'}}
  function setBusy(v){busy=v;document.querySelectorAll('#m4xTgPortalSheet button').forEach(b=>{if(!b.classList.contains('m4x-tg-close'))b.disabled=v})}

  function findSourceTile(){
    const nodes=[...document.querySelectorAll('button,a,[role="button"],div')];
    const exact=nodes.filter(el=>norm(el.textContent)==='ứng dụng');
    for(const leaf of exact){
      let p=leaf;
      for(let i=0;i<5&&p;i++,p=p.parentElement){
        if(['BUTTON','A'].includes(p.tagName)||p.getAttribute('role')==='button'||p.onclick||/card|tile|quick|manage|menu|action/i.test(p.className||'')){
          if(p.parentElement&&p.parentElement.children.length>=2)return p;
        }
      }
      if(leaf.parentElement?.parentElement&&leaf.parentElement.parentElement.children.length>=2)return leaf.parentElement;
    }
    return null;
  }
  function ensureTile(){
    if(document.querySelector('.m4x-tg-channel-tile'))return true;
    const src=findSourceTile(); if(!src)return false;
    const tile=src.cloneNode(true);
    tile.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
    tile.removeAttribute('href'); tile.removeAttribute('onclick'); tile.removeAttribute('data-view'); tile.removeAttribute('data-tab');
    tile.classList.add('m4x-tg-channel-tile'); tile.setAttribute('role','button'); tile.setAttribute('tabindex','0');
    tile.innerHTML='<div class="m4x-tg-tile-inner"><div class="m4x-tg-tile-icon">🤖</div><div class="m4x-tg-tile-label">Telegram / Channel</div><div class="m4x-tg-tile-badge">AUTO · LIVE STOCK</div></div>';
    const open=e=>{e?.preventDefault?.();e?.stopPropagation?.();openPanel()};
    tile.addEventListener('click',open,true);tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){open(e)}});
    src.parentElement.appendChild(tile);
    return true;
  }

  function buildOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='m4xTgPortalOverlay';
    overlay.innerHTML=`<div id="m4xTgPortalSheet" role="dialog" aria-modal="true" aria-label="Telegram Channel">
      <div class="m4x-tg-head"><div class="m4x-tg-title"><div class="m4x-tg-logo">🤖</div><div><h2>Telegram / Channel</h2><small>M4X STORE · AUTO POST + LIVE STOCK · V${VERSION}</small></div></div><button class="m4x-tg-close" id="m4xTgClose">×</button></div>
      <div class="m4x-tg-statusbar">
        <div class="m4x-tg-stat" id="m4xTgCronStat"><b>-</b><span>Worker / Cron</span></div>
        <div class="m4x-tg-stat"><b id="m4xTgPending">-</b><span>Queue chờ</span></div>
        <div class="m4x-tg-stat"><b id="m4xTgFailed">-</b><span>Lỗi</span></div>
        <div class="m4x-tg-stat"><b id="m4xTgMessageId">-</b><span>Stock message</span></div>
      </div>
      <div class="m4x-tg-card"><h3>⚙️ Tự động đăng Channel</h3>
        ${toggleRow('m4xTgEnabled','Bật toàn bộ Channel Automation','Tắt mục này sẽ dừng xử lý các loại bài tự động.')}
        ${toggleRow('m4xTgDaily','Đăng Store theo giờ','Đăng bài Store mỗi ngày theo 2 mốc giờ bên dưới.')}
        <div class="m4x-tg-grid2" style="margin:10px 0"><div class="m4x-tg-field"><label>GIỜ 1</label><input id="m4xTgTime1" class="m4x-tg-input" type="time"></div><div class="m4x-tg-field"><label>GIỜ 2</label><input id="m4xTgTime2" class="m4x-tg-input" type="time"></div></div>
        ${toggleRow('m4xTgProduct','Sản phẩm mới','Tự đăng khi sản phẩm mới được bật bán.')}
        ${toggleRow('m4xTgHero','Flash Sale / Hero','Tự đăng khi Hero hoặc chương trình khuyến mãi thay đổi.')}
        ${toggleRow('m4xTgUpdate','Online Update','Tự đăng khi Admin phát bản cập nhật online.')}
        ${toggleRow('m4xTgRepost','Đăng lại Store sau X ngày','Dùng thêm nếu muốn nhắc lại Store ngoài lịch 08:00 / 20:00.')}
        <div class="m4x-tg-field" style="margin-top:10px"><label>SỐ NGÀY REPOST</label><input id="m4xTgRepostDays" class="m4x-tg-input" type="number" min="1" max="30" inputmode="numeric"></div>
      </div>
      <div class="m4x-tg-card"><h3>📦 Live Stock</h3>
        ${toggleRow('m4xTgStock','Tự cập nhật tin tồn kho','Bot sửa một tin tồn kho cố định thay vì spam bài mới.')}
        ${toggleRow('m4xTgStockAlert','Cảnh báo sắp hết / hết hàng','Phát cảnh báo riêng khi sản phẩm đi qua ngưỡng.')}
        <div class="m4x-tg-grid2" style="margin-top:10px"><div class="m4x-tg-field"><label>CẢNH BÁO KHI CÒN ≤</label><input id="m4xTgThreshold" class="m4x-tg-input" type="number" min="1" max="99" inputmode="numeric"></div><div class="m4x-tg-field"><label>TIN TỒN KHO</label><div class="m4x-tg-input m4x-tg-message-id" id="m4xTgStockInfo">#-</div></div></div>
        <div class="m4x-tg-grid2" style="margin-top:10px"><div class="m4x-tg-stat"><b id="m4xTgLow">-</b><span>Sắp hết</span></div><div class="m4x-tg-stat"><b id="m4xTgOut">-</b><span>Hết hàng</span></div></div>
      </div>
      <div class="m4x-tg-card"><h3>⚡ Tác vụ</h3><div class="m4x-tg-actions">
        <button class="m4x-tg-btn primary" id="m4xTgSave">Lưu cấu hình</button>
        <button class="m4x-tg-btn green" id="m4xTgStockNow">Cập nhật tồn kho ngay</button>
        <button class="m4x-tg-btn gold" id="m4xTgPostNow">Đăng Store ngay</button>
        <button class="m4x-tg-btn" id="m4xTgRefresh">Làm mới trạng thái</button>
        <button class="m4x-tg-btn" id="m4xTgRecreate">Tạo lại tin tồn kho</button>
        <button class="m4x-tg-btn danger" id="m4xTgRetry">Thử lại mục lỗi</button>
      </div><div id="m4xTgPortalMsg"></div></div>
    </div>`;
    document.body.appendChild(overlay);
    $('m4xTgClose').onclick=closePanel; overlay.addEventListener('click',e=>{if(e.target===overlay)closePanel()});
    $('m4xTgSave').onclick=saveSettings;$('m4xTgStockNow').onclick=()=>runAction('stock_sync');$('m4xTgPostNow').onclick=()=>runAction('manual_store');$('m4xTgRefresh').onclick=loadStatus;$('m4xTgRecreate').onclick=()=>runAction('recreate_stock_message');$('m4xTgRetry').onclick=()=>runAction('retry_failed');
    return overlay;
  }
  function toggleRow(id,title,sub){return `<div class="m4x-tg-row"><div class="m4x-tg-copy"><b>${esc(title)}</b><small>${esc(sub)}</small></div><label class="m4x-tg-switch"><input id="${id}" type="checkbox"><i></i></label></div>`}
  async function openPanel(){buildOverlay().classList.add('open');document.documentElement.style.overflow='hidden';await loadStatus()}
  function closePanel(){overlay?.classList.remove('open');document.documentElement.style.overflow=''}

  function fill(d){
    lastData=d||{};const s=d?.settings||{},q=d?.queue||{},w=d?.worker||{},inv=d?.inventory||{};
    $('m4xTgEnabled').checked=bool(s.enabled,true);$('m4xTgDaily').checked=bool(s.daily_enabled,true);$('m4xTgTime1').value=String(s.daily_time_1||'08:00').slice(0,5);$('m4xTgTime2').value=String(s.daily_time_2||'20:00').slice(0,5);
    $('m4xTgProduct').checked=bool(s.new_product_enabled,true);$('m4xTgHero').checked=bool(s.hero_enabled,true);$('m4xTgUpdate').checked=bool(s.online_update_enabled,true);$('m4xTgRepost').checked=bool(s.repost_enabled,false);$('m4xTgRepostDays').value=Number(s.repost_days||3);
    $('m4xTgStock').checked=bool(s.stock_enabled,true);$('m4xTgStockAlert').checked=bool(s.stock_alert_enabled,true);$('m4xTgThreshold').value=Number(s.stock_low_threshold||5);
    $('m4xTgPending').textContent=Number(q.pending||0);$('m4xTgFailed').textContent=Number(q.failed||0);$('m4xTgMessageId').textContent=s.stock_message_id?`#${s.stock_message_id}`:'Chưa có';$('m4xTgStockInfo').textContent=s.stock_message_id?`#${s.stock_message_id}`:'Chưa tạo';$('m4xTgLow').textContent=Number(inv.low_stock||0);$('m4xTgOut').textContent=Number(inv.out_stock||0);
    const cs=$('m4xTgCronStat');cs.querySelector('b').textContent=w.cron_active?'ONLINE':'OFF';cs.classList.toggle('ok',!!w.cron_active);cs.classList.toggle('bad',!w.cron_active);
  }
  async function loadStatus(){
    if(busy)return;setBusy(true);msg('Đang đọc trạng thái Channel...');
    try{const c=await client();const {data,error}=await c.rpc('m4x_admin_channel_get');if(error)throw error;fill(data);msg(`Đã đồng bộ trạng thái${data?.queue?.last_sent_at?' · gửi gần nhất '+new Date(data.queue.last_sent_at).toLocaleString('vi-VN'):''}`,true)}
    catch(e){msg('❌ '+(e?.message||e));console.error('[M4X TG V19.3]',e)}finally{setBusy(false)}
  }
  async function saveSettings(){
    if(busy)return;const payload={enabled:$('m4xTgEnabled').checked,daily_enabled:$('m4xTgDaily').checked,daily_time_1:$('m4xTgTime1').value||'08:00',daily_time_2:$('m4xTgTime2').value||'20:00',new_product_enabled:$('m4xTgProduct').checked,hero_enabled:$('m4xTgHero').checked,online_update_enabled:$('m4xTgUpdate').checked,repost_enabled:$('m4xTgRepost').checked,repost_days:Number($('m4xTgRepostDays').value||3),stock_enabled:$('m4xTgStock').checked,stock_alert_enabled:$('m4xTgStockAlert').checked,stock_low_threshold:Number($('m4xTgThreshold').value||5)};
    setBusy(true);msg('Đang lưu cấu hình...');try{const c=await client();const {error}=await c.rpc('m4x_admin_channel_save',{p_settings:payload});if(error)throw error;msg('✅ Đã lưu Telegram / Channel.',true);setBusy(false);await loadStatus();return}catch(e){msg('❌ '+(e?.message||e));console.error(e)}finally{setBusy(false)}
  }
  async function runAction(action){
    if(busy)return;setBusy(true);msg('Đang gửi yêu cầu...');try{const c=await client();const {data,error}=await c.rpc('m4x_admin_channel_action',{p_action:action});if(error)throw error;msg('✅ '+(data?.message||'Đã đưa vào hàng đợi.'),true);setBusy(false);setTimeout(loadStatus,900);return}catch(e){msg('❌ '+(e?.message||e));console.error(e)}finally{setBusy(false)}
  }

  function init(){ensureTile();buildOverlay();let timer=null;observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(ensureTile,180)});observer.observe(document.body,{childList:true,subtree:true});window.M4XTelegramChannel={open:openPanel,refresh:loadStatus,version:VERSION};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
