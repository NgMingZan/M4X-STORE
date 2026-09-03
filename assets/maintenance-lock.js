/* M4X STORE V11.3 — Maintenance Guard
   Normal users are blocked from purchase/top-up/download while relevant
   services are maintenance/outage. Admin role bypasses the guard.
*/
(() => {
  const STATUS_URL='./assets/system-status.json';
  const BLOCKED=new Set(['maintenance','outage']);
  let cache={at:0,data:null};
  const CACHE_MS=12000;

  const isAdmin=()=>String(state?.profile?.role||'').toLowerCase()==='admin';

  async function statusData(force=false){
    const now=Date.now();
    if(!force && cache.data && now-cache.at<CACHE_MS)return cache.data;
    try{
      const r=await fetch(`${STATUS_URL}?v=${now}`,{cache:'no-store'});
      if(!r.ok)throw new Error('status');
      const d=await r.json();
      cache={at:now,data:d};
      return d;
    }catch(e){
      // Fail open if the status file itself is unavailable.
      return cache.data||{services:{}};
    }
  }

  function blockedService(data,key){
    const store=String(data?.services?.store?.status||'operational').toLowerCase();
    const own=String(data?.services?.[key]?.status||'operational').toLowerCase();
    return BLOCKED.has(store)||BLOCKED.has(own);
  }

  function reason(data,key){
    const store=data?.services?.store;
    const own=data?.services?.[key];
    if(store && BLOCKED.has(String(store.status||'').toLowerCase()))
      return store.note||'M4X STORE đang bảo trì.';
    if(own && BLOCKED.has(String(own.status||'').toLowerCase()))
      return own.note||'Dịch vụ đang bảo trì.';
    return 'Dịch vụ đang bảo trì.';
  }

  function guardModal(title,msg){
    openModal(`
      <h2>🛠 ${esc(title)}</h2>
      <div class="notice">${esc(msg)}</div>
      <p class="muted">Tính năng này tạm khóa trong thời gian bảo trì. Bạn vẫn có thể xem sản phẩm và tài khoản.</p>
      <div class="toolbar">
        <button class="btn ghost" onclick="M4X.systemStatus&&M4X.systemStatus()">Xem trạng thái hệ thống</button>
        <button class="btn ghost" onclick="location.href='https://t.me/bengtayy'">Liên hệ CSKH</button>
      </div>
    `);
  }

  async function allow(key,title){
    if(isAdmin())return true;
    const d=await statusData(true);
    if(blockedService(d,key)){
      guardModal(title,reason(d,key));
      return false;
    }
    return true;
  }

  function wrapAsync(name,key,title){
    const original=M4X[name];
    if(typeof original!=='function'||original.__m4xMaintenanceWrapped)return;
    const wrapped=async function(...args){
      if(!(await allow(key,title)))return;
      return original.apply(this,args);
    };
    wrapped.__m4xMaintenanceWrapped=true;
    M4X[name]=wrapped;
  }

  function wrapAction(){
    const original=M4X.action;
    if(typeof original!=='function'||original.__m4xMaintenanceWrapped)return;
    const wrapped=async function(id,...rest){
      const p=state.products?.find(x=>x.id===id);
      const owned=p && state.owned?.get(id);
      if(owned && p?.delivery_type==='download'){
        if(!(await allow('downloads','Tải file đang bảo trì')))return;
      }
      return original.call(this,id,...rest);
    };
    wrapped.__m4xMaintenanceWrapped=true;
    M4X.action=wrapped;
  }

  function installWrappers(){
    wrapAsync('buy','payments','Mua hàng đang bảo trì');
    wrapAsync('topup','payments','Nạp tiền đang bảo trì');
    wrapAsync('makeTopup','payments','Nạp tiền đang bảo trì');
    wrapAsync('download','downloads','Tải file đang bảo trì');
    wrapAsync('v8CheckoutCart','payments','Thanh toán giỏ hàng đang bảo trì');
    wrapAsync('v8AcceptCustom','payments','Thanh toán đang bảo trì');
    wrapAction();
  }

  function ensureBar(){
    let bar=document.getElementById('m4xMaintenanceBar');
    if(bar)return bar;
    const top=document.querySelector('.top');
    if(!top)return null;
    bar=document.createElement('div');
    bar.id='m4xMaintenanceBar';
    top.insertAdjacentElement('afterend',bar);
    return bar;
  }

  async function refreshBar(force=false){
    const bar=ensureBar();
    if(!bar)return;
    const d=await statusData(force);
    const sv=d?.services||{};
    const locked=['store','payments','downloads'].filter(k=>
      BLOCKED.has(String(sv[k]?.status||'').toLowerCase())
    );
    const storeLocked=BLOCKED.has(String(sv.store?.status||'').toLowerCase());
    const anyLock=storeLocked||locked.length>0;

    if(!anyLock){
      bar.className='';
      bar.innerHTML='';
      return;
    }

    if(isAdmin()){
      bar.className='show admin';
      bar.innerHTML=`<div><b>ADMIN · Bảo trì đang bật</b><br>Bạn vẫn được phép mua, nạp và tải để kiểm tra hệ thống.</div>
        <button onclick="M4X.systemStatus&&M4X.systemStatus()">Trạng thái</button>`;
      return;
    }

    const labels=[];
    if(storeLocked)labels.push('Store');
    if(BLOCKED.has(String(sv.payments?.status||'').toLowerCase()))labels.push('Mua/Nạp');
    if(BLOCKED.has(String(sv.downloads?.status||'').toLowerCase()))labels.push('Tải file');

    bar.className='show';
    bar.innerHTML=`<div><b>🛠 Hệ thống đang bảo trì</b><br>Tạm khóa: ${esc([...new Set(labels)].join(' · ')||'một số chức năng')}.</div>
      <button onclick="M4X.systemStatus&&M4X.systemStatus()">Chi tiết</button>`;
  }

  // Re-install because V8/product scripts may replace M4X methods during startup.
  function boot(){
    installWrappers();
    refreshBar(true);
  }

  boot();
  setTimeout(boot,700);
  setTimeout(boot,1800);
  setInterval(()=>{
    installWrappers();
    refreshBar(false);
  },10000);

  // Public helper for testing/refreshing after admin changes status.
  M4X.refreshMaintenance=()=>{cache.at=0;return refreshBar(true)};
})();
