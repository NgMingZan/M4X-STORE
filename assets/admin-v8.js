/* M4X STORE V8 - Admin extensions */
(() => {
  document.documentElement.dataset.m4xTheme=localStorage.getItem('m4x_theme')||'dark';
  const BADGE_LABELS={early_user:'🌟 Early User',vip:'💎 VIP',top_buyer:'🏆 Top Buyer',beta_tester:'🧪 Beta Tester',contributor:'🤝 Contributor'};
  st.v8Requests=[];st.v8Badges=[];st.v8Mods=[];st.v8Reports=[];st.v8Moderation=[];

  function v8AdminInject(){
    const tabs=document.querySelector('.tabs');
    if(tabs&&!tabs.querySelector('[data-tab="customorders"]')){
      const support=tabs.querySelector('[data-tab="support"]');
      const b1=document.createElement('button');b1.type='button';b1.className='tab';b1.dataset.tab='customorders';b1.textContent='Đặt riêng';
      const b2=document.createElement('button');b2.type='button';b2.className='tab';b2.dataset.tab='communityadmin';b2.textContent='Community';
      tabs.insertBefore(b1,support);tabs.insertBefore(b2,support);
      for(const b of [b1,b2])b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab))};
    }
    const app=$('adminApp');
    const support=$('support');
    if(app&&!$('customorders')){
      const sec=document.createElement('section');sec.id='customorders';sec.className='panel';sec.innerHTML='<div class="sectionTitle">Đặt hàng theo yêu cầu</div><input id="v8ReqSearch" class="search" placeholder="Tìm mã yêu cầu / tiêu đề / user..."><div id="v8AdminRequests"></div>';app.insertBefore(sec,support);
    }
    if(app&&!$('communityadmin')){
      const sec=document.createElement('section');sec.id='communityadmin';sec.className='panel';sec.innerHTML=`<div class="sectionTitle">Community Management</div><div class="toolbar"><button class="btn" onclick="ADM.v8SyncTopBuyers()">Đồng bộ Top Buyer</button><button class="btn ghost" onclick="location.href='./index.html'">Mở Community Chat</button></div><div class="sectionTitle">Huy hiệu & MOD</div><input id="v8CommunityUserSearch" class="search" placeholder="Tìm user..."><div id="v8CommunityUsers"></div><div class="sectionTitle">User bị mute / ban</div><div id="v8ModerationList"></div><div class="sectionTitle">Báo cáo tin nhắn</div><div id="v8ReportList"></div>`;app.insertBefore(sec,support);
    }
    $('v8ReqSearch')?.addEventListener('input',v8AdminRenderRequests);
    $('v8CommunityUserSearch')?.addEventListener('input',v8AdminRenderUsers);
  }

  const v8RequestStatus=s=>({requested:'Đã gửi',quoted:'Đã báo giá',accepted:'Đã thanh toán',rejected:'Từ chối',cancelled:'Đã hủy',completed:'Hoàn thành'})[s]||s;

  async function v8AdminLoadRequests(){
    const {data,error}=await sb.from('custom_requests').select('*').order('updated_at',{ascending:false}).limit(300);
    if(error){console.warn(error);return}st.v8Requests=data||[];v8AdminRenderRequests();
  }
  function v8AdminRenderRequests(){
    const box=$('v8AdminRequests');if(!box)return;
    const q=($('v8ReqSearch')?.value||'').toLowerCase().trim();
    const arr=st.v8Requests.filter(r=>!q||`${r.request_code} ${r.title} ${userName(r.user_id)} ${r.request_type}`.toLowerCase().includes(q));
    box.innerHTML=arr.map(r=>`<div class="item"><div class="row"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.request_code)} · ${esc(userName(r.user_id))} · ${esc(r.request_type)}</div></div><span class="statusTag ${esc(r.status)}">${esc(v8RequestStatus(r.status))}</span></div><p>${esc(r.description)}</p><div class="meta"><div><span class="muted">Ngân sách</span><br>${r.budget==null?'—':money(r.budget)}</div><div><span class="muted">Báo giá</span><br>${r.quote_amount==null?'—':money(r.quote_amount)}</div></div>${r.admin_note?`<div class="notice">${esc(r.admin_note)}</div>`:''}<div class="toolbar">${['requested','quoted','rejected'].includes(r.status)?`<button class="btn" onclick="ADM.v8QuoteRequest('${r.id}')">Báo giá</button>`:''}${r.status==='accepted'?`<button class="btn okbtn" onclick="ADM.v8SetRequestStatus('${r.id}','completed')">Hoàn thành</button>`:''}${['requested','quoted'].includes(r.status)?`<button class="btn bad" onclick="ADM.v8SetRequestStatus('${r.id}','rejected')">Từ chối</button>`:''}${r.order_id?`<button class="btn ghost" onclick="ADM.v8FindOrder('${r.order_id}')">Xem đơn</button>`:''}</div></div>`).join('')||'<div class="muted">Chưa có yêu cầu đặt riêng.</div>';
  }
  async function v8QuoteRequest(id){
    const r=st.v8Requests.find(x=>x.id===id);if(!r)return;
    const amount=Number(prompt('Giá báo cho khách:',String(r.quote_amount??r.budget??0)));if(!Number.isFinite(amount)||amount<0)return;
    const note=prompt('Ghi chú gửi khách:',r.admin_note||'M4X đã xem yêu cầu và gửi báo giá.')||'';
    const {error}=await sb.rpc('admin_quote_custom_request',{p_request_id:id,p_quote_amount:amount,p_admin_note:note});
    if(error)alert(error.message);else await Promise.all([v8AdminLoadRequests(),loadNotices()]);
  }
  async function v8SetRequestStatus(id,status){
    const {error}=await sb.rpc('admin_set_custom_request_status',{p_request_id:id,p_status:status});
    if(error)alert(error.message);else await Promise.all([v8AdminLoadRequests(),loadNotices()]);
  }
  function v8FindOrder(id){
    const input=$('orderSearch');const o=st.orders.find(x=>x.id===id);if(input){input.value=o?.order_code||id;renderOrders()}
    const tab=document.querySelector('[data-tab="orders"]');if(tab)tab.click();
  }

  async function v8AdminLoadCommunity(){
    const [b,m,r,mod]=await Promise.all([
      sb.from('account_badges').select('*'),
      sb.from('community_moderators').select('*'),
      sb.from('chat_reports').select('*').eq('status','open').order('created_at',{ascending:false}).limit(100),
      sb.from('community_moderation').select('*').order('updated_at',{ascending:false}).limit(200)
    ]);
    if(b.error)console.warn(b.error);if(m.error)console.warn(m.error);if(r.error)console.warn(r.error);if(mod.error)console.warn(mod.error);
    st.v8Badges=b.data||[];st.v8Mods=m.data||[];st.v8Reports=r.data||[];st.v8Moderation=mod.data||[];
    v8AdminRenderUsers();v8AdminRenderModeration();await v8AdminRenderReports();
  }

  function v8BadgesFor(uid){return st.v8Badges.filter(x=>x.user_id===uid).map(x=>x.badge)}
  function v8IsMod(uid){return st.v8Mods.some(x=>x.user_id===uid)}
  function v8BadgeHtml(uid){return v8BadgesFor(uid).map(b=>`<span class="accountBadge badge-${esc(b)}">${esc(BADGE_LABELS[b]||b)}</span>`).join('')}
  function v8AdminRenderUsers(){
    const box=$('v8CommunityUsers');if(!box)return;
    const q=($('v8CommunityUserSearch')?.value||'').toLowerCase().trim();
    const arr=st.users.filter(u=>!q||`${u.display_name||''} ${u.id}`.toLowerCase().includes(q));
    box.innerHTML=arr.map(u=>`<div class="item"><div class="row"><div><b>${esc(u.display_name||u.id.slice(0,8))}</b><div class="muted">${esc(u.id)}</div><div class="badgeRow">${v8BadgeHtml(u.id)}${u.role==='admin'?'<span class="miniRole adminRole">ADMIN</span>':v8IsMod(u.id)?'<span class="miniRole modRole">MOD</span>':''}</div></div><div class="toolbar"><button class="btn ghost" onclick="ADM.v8SetBadges('${u.id}')">Huy hiệu</button>${u.role!=='admin'?`<button class="btn ${v8IsMod(u.id)?'bad':'okbtn'}" onclick="ADM.v8ToggleMod('${u.id}',${!v8IsMod(u.id)})">${v8IsMod(u.id)?'Gỡ MOD':'Đặt MOD'}</button>`:''}</div></div></div>`).join('')||'<div class="muted">Không có user.</div>';
  }
  async function v8SetBadges(uid){
    const current=v8BadgesFor(uid);
    const value=prompt('Nhập huy hiệu, cách nhau dấu phẩy:\nearly_user, vip, top_buyer, beta_tester, contributor',current.join(', '));if(value===null)return;
    const badges=[...new Set(value.split(',').map(x=>x.trim()).filter(Boolean))];
    const {error}=await sb.rpc('admin_set_badges',{p_user_id:uid,p_badges:badges});
    if(error)alert(error.message);else v8AdminLoadCommunity();
  }
  async function v8ToggleMod(uid,on){
    const {error}=await sb.rpc('admin_set_community_moderator',{p_user_id:uid,p_enabled:on});
    if(error)alert(error.message);else v8AdminLoadCommunity();
  }
  async function v8SyncTopBuyers(){
    const n=Number(prompt('Bao nhiêu người nhận Top Buyer?','10')||10);
    const {data,error}=await sb.rpc('admin_sync_top_buyers',{p_limit:n});
    if(error)alert(error.message);else{alert('Đã cập nhật Top Buyer cho '+data+' tài khoản.');v8AdminLoadCommunity()}
  }

  function v8AdminRenderModeration(){
    const box=$('v8ModerationList');if(!box)return;
    const now=Date.now();const rows=st.v8Moderation.filter(x=>x.banned||(x.muted_until&&new Date(x.muted_until).getTime()>now));
    box.innerHTML=rows.map(x=>`<div class="item"><div class="row"><div><b>${esc(userName(x.user_id))}</b><div class="muted">${x.banned?'BANNED':'Muted đến '+dt(x.muted_until)} · ${esc(x.reason||'')}</div></div><div class="toolbar">${x.banned?`<button class="btn okbtn" onclick="ADM.v8Moderate('${x.user_id}','unban')">Gỡ ban</button>`:''}${x.muted_until?`<button class="btn okbtn" onclick="ADM.v8Moderate('${x.user_id}','unmute')">Gỡ mute</button>`:''}</div></div></div>`).join('')||'<div class="muted">Không có user đang bị hạn chế chat.</div>';
  }
  async function v8Moderate(uid,action){
    const {error}=await sb.rpc('moderate_community_user',{p_user_id:uid,p_action:action,p_reason:null});
    if(error)alert(error.message);else v8AdminLoadCommunity();
  }

  async function v8AdminRenderReports(){
    const box=$('v8ReportList');if(!box)return;
    if(!st.v8Reports.length){box.innerHTML='<div class="muted">Không có báo cáo mở.</div>';return}
    const ids=[...new Set(st.v8Reports.map(x=>x.message_id))];
    const {data:messages}=await sb.from('chat_messages').select('id,user_id,message,created_at,deleted_at').in('id',ids);
    const mm=new Map((messages||[]).map(x=>[x.id,x]));
    box.innerHTML=st.v8Reports.map(r=>{const m=mm.get(r.message_id)||{};return `<div class="item"><div><b>${esc(userName(m.user_id))}</b>: ${esc(m.deleted_at?'[Đã xóa]':m.message||'[Ảnh]')}</div><div class="muted">Người báo cáo: ${esc(userName(r.reporter_id))} · ${esc(r.reason||'Không ghi lý do')} · ${dt(r.created_at)}</div><div class="toolbar">${!m.deleted_at?`<button class="btn bad" onclick="ADM.v8DeleteReported('${r.message_id}','${r.id}')">Xóa tin</button>`:''}<button class="btn ghost" onclick="ADM.v8ResolveReport('${r.id}','dismissed')">Bỏ qua</button></div></div>`}).join('');
  }
  async function v8DeleteReported(messageId,reportId){
    const {error}=await sb.rpc('delete_community_message',{p_message_id:messageId});if(error)return alert(error.message);
    await v8ResolveReport(reportId,'resolved');
  }
  async function v8ResolveReport(reportId,status){
    // Direct UPDATE is intentionally not exposed by RLS; Admin resolves through SQL RPC added below if present.
    const {error}=await sb.rpc('admin_resolve_chat_report',{p_report_id:reportId,p_status:status});
    if(error)alert(error.message);else v8AdminLoadCommunity();
  }

  const oldRefresh=refresh;
  refresh=async function(){await oldRefresh();await Promise.all([v8AdminLoadRequests(),v8AdminLoadCommunity()])};
  ADM.refresh=refresh;

  Object.assign(ADM,{v8QuoteRequest,v8SetRequestStatus,v8FindOrder,v8SetBadges,v8ToggleMod,v8SyncTopBuyers,v8Moderate,v8DeleteReported,v8ResolveReport});
  v8AdminInject();
  setTimeout(()=>Promise.all([v8AdminLoadRequests(),v8AdminLoadCommunity()]).catch(console.warn),500);
})();
