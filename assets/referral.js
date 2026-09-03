
/* M4X STORE V17 — Referral */
(() => {
  const PENDING_KEY='m4x_pending_referral';

  function normalize(v){
    return String(v||'').trim().toUpperCase();
  }

  function captureLink(){
    try{
      const code=normalize(new URLSearchParams(location.search).get('ref'));
      if(/^M4X-[A-Z0-9]{6,12}$/.test(code)){
        localStorage.setItem(PENDING_KEY,code);
      }
    }catch{}
  }

  function shareUrl(code){
    try{
      const base=C.PUBLIC_STORE_URL||`${location.origin}${location.pathname}`;
      const u=new URL(base,location.href);
      u.search='';
      u.hash='';
      u.searchParams.set('ref',code);
      return u.toString();
    }catch{
      return `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;
    }
  }

  async function dashboard(){
    if(!state.me)throw new Error('Bạn chưa đăng nhập');
    const {data,error}=await sb.rpc('get_referral_dashboard');
    if(error)throw error;
    return data;
  }

  async function applyCode(code,quiet=false){
    code=normalize(code);
    if(!code)throw new Error('Nhập mã giới thiệu');
    const {data,error}=await sb.rpc('apply_referral_code',{p_code:code});
    if(error){
      if(!quiet)alert(error.message);
      throw error;
    }
    localStorage.removeItem(PENDING_KEY);
    if(!quiet){
      alert(data?.already_applied?'Mã giới thiệu đã được áp dụng trước đó.':'Đã áp dụng mã giới thiệu.');
    }
    return data;
  }

  async function autoApply(){
    const code=normalize(localStorage.getItem(PENDING_KEY));
    if(!code||!state.me)return;
    try{
      await applyCode(code,true);
      await loadNotifications();
    }catch(e){
      const msg=String(e?.message||'').toLowerCase();
      if(
        msg.includes('tài khoản mới')||
        msg.includes('đã mua')||
        msg.includes('chính mình')||
        msg.includes('đã gắn')||
        msg.includes('không tồn tại')
      ) localStorage.removeItem(PENDING_KEY);
    }
  }

  function renderCard(d){
    const link=shareUrl(d.code);
    const apply=d.has_referrer
      ?`<span class="m4x-ref-status">✓ Đã được giới thiệu bởi ${esc(d.referrer_name||'thành viên M4X')}</span>`
      :d.can_apply_code
        ?`<div class="m4x-ref-apply">
            <div class="m4x-ref-note" style="margin:0 0 7px">Bạn có mã của người giới thiệu? Nhập trước lần mua đầu tiên.</div>
            <div class="m4x-ref-apply-row">
              <input id="m4xReferralInput" class="input" placeholder="M4X-XXXXXX">
              <button class="btn" onclick="M4XReferral.applyInput()">Áp dụng</button>
            </div>
          </div>`
        :'';

    return `<section class="m4x-referral-card" id="m4xReferralCard">
      <div class="m4x-referral-head">
        <div><h3>Mời bạn bè · Nhận thưởng</h3><p>Chia sẻ mã của bạn. Khi người mới mua đơn từ ${money(d.min_purchase_amount)}, bạn nhận tiền vào ví M4X.</p></div>
        <span class="m4x-referral-reward">+${money(d.reward_amount)}</span>
      </div>
      <div class="m4x-ref-code">
        <div><small>MÃ GIỚI THIỆU CỦA BẠN</small><b>${esc(d.code)}</b></div>
        <button class="btn ghost" onclick="M4XReferral.copy('${esc(d.code)}')">Sao chép</button>
      </div>
      <div class="m4x-ref-stats">
        <div class="m4x-ref-stat"><small>Đã mời</small><b>${Number(d.invited_count||0)}</b></div>
        <div class="m4x-ref-stat"><small>Thành công</small><b>${Number(d.successful_count||0)}</b></div>
        <div class="m4x-ref-stat"><small>Đã nhận</small><b>${money(d.earned_amount||0)}</b></div>
      </div>
      <div class="m4x-ref-actions">
        <button class="btn" onclick="M4XReferral.share('${esc(link)}','${esc(d.code)}')">Chia sẻ link</button>
        <button class="btn ghost" onclick="M4XReferral.copy('${esc(link)}')">Copy link</button>
        ${Number(d.pending_count||0)+Number(d.review_count||0)>0?`<button class="btn ghost" disabled>${Number(d.pending_count||0)} chờ mua · ${Number(d.review_count||0)} chờ duyệt</button>`:''}
      </div>
      ${apply}
      <div class="m4x-ref-note">Mỗi tài khoản mới chỉ được gắn một người giới thiệu. Hệ thống chỉ trả thưởng một lần sau giao dịch đủ điều kiện.</div>
    </section>`;
  }

  async function injectAccount(){
    if(!state.me)return;
    const view=$('view');
    if(!view||view.querySelector('#m4xReferralCard'))return;
    try{
      const d=await dashboard();
      const holder=document.createElement('div');
      holder.innerHTML=renderCard(d);
      const firstTitle=view.querySelector('.sectionTitle');
      if(firstTitle){
        const next=firstTitle.nextElementSibling;
        if(next)next.insertAdjacentElement('afterend',holder.firstElementChild);
        else view.appendChild(holder.firstElementChild);
      }else view.prepend(holder.firstElementChild);
    }catch(e){
      console.warn('Referral dashboard:',e);
    }
  }

  async function openReferral(){
    if(!state.me)return M4X.auth('login');
    try{
      const d=await dashboard();
      openModal(`<h2>Mời bạn bè</h2>${renderCard(d)}`);
    }catch(e){
      openModal(`<h2>Referral</h2><p class="badtxt">${esc(e.message)}</p>`);
    }
  }

  function copy(v){
    const done=()=>alert('Đã sao chép.');
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(String(v)).then(done).catch(()=>fallback(v,done));
    }else fallback(v,done);
  }
  function fallback(v,done){
    const x=document.createElement('textarea');
    x.value=String(v);document.body.appendChild(x);x.select();
    document.execCommand('copy');x.remove();done();
  }

  async function share(url,code){
    const text=`Mời bạn vào M4X STORE. Mã giới thiệu: ${code}`;
    if(navigator.share){
      try{await navigator.share({title:'M4X STORE',text,url});return}catch{}
    }
    copy(url);
  }

  async function applyInput(){
    const el=$('m4xReferralInput');
    try{
      await applyCode(el?.value||'');
      closeModal();
      await Promise.all([loadAuth(),loadNotifications()]);
      setView('account');
    }catch{}
  }

  captureLink();

  // Wrap current Account renderer after V8 so Community + Referral coexist.
  try{
    const oldRenderAccount=renderAccount;
    renderAccount=async function(){
      await oldRenderAccount();
      await injectAccount();
    };
    window.renderAccount=renderAccount;
  }catch(e){console.warn(e)}

  Object.assign(window.M4X,{openReferral});
  window.M4XReferral={copy,share,applyInput,openReferral};

  try{
    sb.auth.onAuthStateChange(()=>setTimeout(autoApply,350));
  }catch{}
  setTimeout(autoApply,900);
})();
