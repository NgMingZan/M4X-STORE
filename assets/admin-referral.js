
/* M4X Admin Referral V17.1 — Fix "Đang tải..." forever */
(() => {
  let rows=[], settings=null, loading=false;

  function esc2(s){return typeof esc==='function'?esc(s):String(s??'')}

  function inject(){
    const tabs=document.querySelector('.tabs');
    const app=document.getElementById('adminApp');
    if(!tabs||!app)return;

    let b=tabs.querySelector('[data-tab="referrals"]');
    if(!b){
      b=document.createElement('button');
      b.type='button';
      b.className='tab';
      b.dataset.tab='referrals';
      b.innerHTML=`<svg viewBox="0 0 24 24"><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 13a3 3 0 1 0 0-6M2 21a6 6 0 0 1 12 0M14 17a5 5 0 0 1 8 4"/></svg><span>Referral</span>`;
      const support=tabs.querySelector('[data-tab="support"]');
      support?tabs.insertBefore(b,support):tabs.appendChild(b);
    }

    if(!document.getElementById('referrals')){
      const sec=document.createElement('section');
      sec.id='referrals';
      sec.className='panel';
      sec.innerHTML='<div class="sectionTitle">Referral · Mời bạn bè</div><div id="refAdminContent" class="muted">Chọn Referral để tải dữ liệu.</div>';
      const support=document.getElementById('support');
      support?app.insertBefore(sec,support):app.appendChild(sec);
    }
  }

  function activate(){
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='referrals'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id==='referrals'));
    document.querySelectorAll('.p15-bottom button').forEach(x=>x.classList.remove('active'));
  }

  async function load(){
    inject();
    activate();
    if(loading)return;
    loading=true;

    const box=document.getElementById('refAdminContent');
    if(!box){loading=false;return}
    box.innerHTML='<div class="muted">Đang tải Referral...</div>';

    try{
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Quá thời gian kết nối Referral')),12000));
      const request=Promise.all([
        sb.from('referral_settings').select('*').eq('id',1).single(),
        sb.from('referrals').select('*').order('created_at',{ascending:false}).limit(300)
      ]);

      const [s,r]=await Promise.race([request,timeout]);

      if(s.error||r.error){
        const msg=s.error?.message||r.error?.message||'Không tải được Referral';
        const missing=/relation .* does not exist|could not find the table|schema cache/i.test(msg);
        box.innerHTML=`<div class="item">
          <b class="badtxt">${missing?'Referral backend chưa được cài trong Supabase.':'Không tải được Referral.'}</b>
          <div class="muted" style="margin-top:7px;font-size:9px">${esc2(msg)}</div>
          ${missing?'<div class="muted" style="margin-top:7px;font-size:9px">Hãy chạy file supabase/v17/M4X_REFERRAL_V17.sql trong Supabase SQL Editor.</div>':''}
          <button class="btn ghost" style="margin-top:10px" onclick="M4XAdminReferral.load()">Thử lại</button>
        </div>`;
        return;
      }

      settings=s.data;
      rows=r.data||[];
      render();
    }catch(e){
      box.innerHTML=`<div class="item">
        <b class="badtxt">Referral tải thất bại.</b>
        <div class="muted" style="margin-top:7px;font-size:9px">${esc2(e.message||String(e))}</div>
        <button class="btn ghost" style="margin-top:10px" onclick="M4XAdminReferral.load()">Thử lại</button>
      </div>`;
    }finally{
      loading=false;
    }
  }

  function render(){
    const box=document.getElementById('refAdminContent');
    if(!box||!settings)return;

    const rewarded=rows.filter(x=>x.status==='rewarded');
    const review=rows.filter(x=>x.status==='review');
    const paid=rewarded.reduce((a,x)=>a+Number(x.reward_amount||0),0);

    box.innerHTML=`
      <div class="ref-admin-summary">
        <div class="ref-admin-stat"><small>Tổng lượt giới thiệu</small><b>${rows.length}</b></div>
        <div class="ref-admin-stat"><small>Thành công</small><b>${rewarded.length}</b></div>
        <div class="ref-admin-stat"><small>Chờ duyệt</small><b>${review.length}</b></div>
        <div class="ref-admin-stat"><small>Đã trả thưởng</small><b>${money(paid)}</b></div>
      </div>

      <div class="ref-admin-grid">
        <section class="ref-admin-card">
          <h3>Cấu hình chương trình</h3>
          <div class="ref-config">
            <div><label>Trạng thái</label><select id="refActive" class="select">
              <option value="1" ${settings.active?'selected':''}>Đang bật</option>
              <option value="0" ${!settings.active?'selected':''}>Tạm dừng</option>
            </select></div>

            <div><label>Thưởng / người</label><input id="refReward" class="input" type="number" value="${Number(settings.reward_amount||5000)}"></div>
            <div><label>Đơn tối thiểu</label><input id="refMin" class="input" type="number" value="${Number(settings.min_purchase_amount||50000)}"></div>
            <div><label>Tài khoản mới (giờ)</label><input id="refHours" class="input" type="number" value="${Number(settings.signup_window_hours||168)}"></div>
            <div><label>Thưởng tối đa/referrer/ngày</label><input id="refDaily" class="input" type="number" value="${Number(settings.max_rewards_per_referrer_per_day||20)}"></div>
          </div>

          <button class="btn p15-primary" style="width:100%;margin-top:10px" onclick="M4XAdminReferral.save()">Lưu cấu hình</button>
          <div class="muted" style="font-size:8px;margin-top:7px">Mặc định: 5.000đ · đơn từ 50.000đ · tài khoản mới trong 7 ngày.</div>
        </section>

        <section class="ref-admin-card">
          <h3>Referral gần đây</h3>
          ${rows.map(x=>{
            const inviter=typeof userName==='function'?userName(x.referrer_id):x.referrer_id;
            const buyer=typeof userName==='function'?userName(x.referred_user_id):x.referred_user_id;
            return `<div class="ref-admin-row">
              <div>
                <b>${esc2(inviter)} → ${esc2(buyer)}</b>
                <small>${esc2(x.code_used)} · ${dt(x.created_at)}${x.qualifying_amount!=null?' · đơn '+money(x.qualifying_amount):''}</small>
                <span class="ref-admin-status ${esc2(x.status)}">${esc2(x.status)}</span>
              </div>
              <div class="ref-admin-actions">
                ${x.status==='review'?`<button class="btn okbtn" onclick="M4XAdminReferral.approve('${x.id}')">Duyệt</button>`:''}
                ${['pending','review'].includes(x.status)?`<button class="btn bad" onclick="M4XAdminReferral.reject('${x.id}')">Từ chối</button>`:''}
              </div>
            </div>`;
          }).join('')||'<div class="muted">Chưa có Referral.</div>'}
        </section>
      </div>`;
  }

  async function save(){
    const {error}=await sb.rpc('admin_set_referral_settings',{
      p_active:document.getElementById('refActive').value==='1',
      p_reward_amount:Number(document.getElementById('refReward').value||0),
      p_min_purchase_amount:Number(document.getElementById('refMin').value||0),
      p_signup_window_hours:Number(document.getElementById('refHours').value||168),
      p_daily_limit:Number(document.getElementById('refDaily').value||20)
    });
    if(error)return alert(error.message);
    alert('Đã lưu cấu hình Referral.');
    load();
  }

  async function approve(id){
    if(!confirm('Duyệt và cộng tiền thưởng Referral vào ví?'))return;
    const {error}=await sb.rpc('admin_approve_referral',{p_referral_id:id});
    if(error)return alert(error.message);
    try{await Promise.all([loadUsers(),loadNotices()])}catch{}
    load();
  }

  async function reject(id){
    if(!confirm('Từ chối Referral này?'))return;
    const {error}=await sb.rpc('admin_reject_referral',{p_referral_id:id});
    if(error)return alert(error.message);
    load();
  }

  /* Critical fix:
     V15 rewrites tab.onclick after Referral injects.
     A delegated listener survives that rewrite and always loads Referral. */
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.tab[data-tab="referrals"]');
    if(!b)return;
    setTimeout(load,0);
  });

  window.M4XAdminReferral={load,save,approve,reject,show:load};

  setTimeout(inject,250);
  setTimeout(inject,900);
  setTimeout(inject,1800);
})();
