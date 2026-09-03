/* M4X STORE V11.2 — Product Detail + System Status */
(() => {
  const STATUS_URL='./assets/system-status.json';

  function uniqueImages(p){
    const arr=[p.cover_url,...(Array.isArray(p.gallery)?p.gallery:[])].filter(Boolean);
    return [...new Set(arr)];
  }

  function setPreview(url,btn){
    const img=document.getElementById('m4xProductMainImage');
    if(img)img.src=url;
    document.querySelectorAll('.m4x-thumb').forEach(x=>x.classList.remove('active'));
    if(btn)btn.classList.add('active');
  }

  function enhancedProduct(id){
    const p=state.products.find(x=>x.id===id); if(!p)return;
    const o=state.owned.get(id);
    const label=actionLabel(p);
    const canBuy=!o&&!['coming_soon','out_of_stock','discontinued'].includes(p.sale_status);
    const canCart=canBuy && typeof M4X.v8AddCart==='function';
    const images=uniqueImages(p);
    const main=images[0]||'';
    const stock=p.stock_mode==='limited'?'Còn '+available(p):statusText(p.sale_status);
    const risk=p.risk_note?`<div class="notice"><b>Lưu ý trước khi dùng</b><br>${esc(p.risk_note)}</div>`:'';

    openModal(`
      <div class="m4x-product-detail">
        <div class="m4x-product-top">
          <div class="m4x-product-preview">
            ${main
              ?`<img id="m4xProductMainImage" class="m4x-preview-main" src="${esc(main)}" alt="${esc(p.name)}">`
              :`<div class="m4x-preview-empty">Chưa có ảnh preview</div>`}
            ${images.length>1?`<div class="m4x-thumbs">${images.map((u,i)=>`
              <button class="m4x-thumb ${i===0?'active':''}" onclick="M4X.setProductPreview('${esc(u)}',this)">
                <img src="${esc(u)}" loading="lazy" alt="Preview ${i+1}">
              </button>`).join('')}</div>`:''}
          </div>

          <aside class="m4x-product-buybox">
            <div class="m4x-product-cat">${esc(p.categories?.name||'Sản phẩm')}</div>
            <h2 class="m4x-product-title">${esc(p.name)}</h2>
            <div class="m4x-product-price">${money(p.price)}</div>
            <div class="m4x-product-stock">${esc(stock)} · Đã bán ${Number(p.sold_count||0)}</div>

            <div class="m4x-buy-actions">
              ${o && p.delivery_type==='download'
                ?`<button class="btn" onclick="M4X.download('${esc(o.order_code)}','${esc(o.access_token)}')">Tải bản mới nhất</button>`
                :state.me
                  ?`<button class="btn" ${canBuy?'':'disabled'} onclick="M4X.buy('${p.id}')">${label==='Mua'?'Mua ngay':label}</button>`
                  :`<button class="btn" onclick="M4X.auth('login')">Đăng nhập để mua</button>`}
              ${canCart?`<button class="btn ghost" onclick="M4X.v8AddCart('${p.id}')">Thêm vào giỏ hàng</button>`:''}
              ${!o&&state.me?`<button class="btn ghost" onclick="M4X.topup()">Nạp tiền · ${money(state.profile?.balance||0)}</button>`:''}
            </div>

            <div class="m4x-product-trust">
              <div>🔒 Thanh toán qua ví M4X</div>
              <div>↻ Tải lại trong tài khoản</div>
            </div>
          </aside>
        </div>

        <div class="m4x-product-body">
          <div class="m4x-specs">
            <div class="m4x-spec"><small>Tương thích</small><b>${esc(p.compatibility||'Xem mô tả')}</b></div>
            <div class="m4x-spec"><small>Phiên bản</small><b>${esc(p.version_name||'1.0')}</b></div>
            <div class="m4x-spec"><small>Dung lượng</small><b>${esc(p.file_size_label||'—')}</b></div>
            <div class="m4x-spec"><small>Trạng thái</small><b>${esc(stock)}</b></div>
          </div>

          <section class="m4x-detail-section">
            <h3>Mô tả</h3>
            <div class="m4x-product-summary">${esc(p.description||'Chưa có mô tả cho sản phẩm này.')}</div>
          </section>

          ${p.changelog?`<section class="m4x-detail-section">
            <h3>Có gì mới</h3>
            <div class="m4x-changelog">${esc(p.changelog)}</div>
          </section>`:''}

          ${risk}

          <div class="m4x-detail-tools">
            ${p.video_url?`<button class="btn ghost" onclick="location.href='${esc(p.video_url)}'">Xem video demo</button>`:''}
            ${typeof M4X.v8ShareProduct==='function'?`<button class="btn ghost" onclick="M4X.v8ShareProduct('${p.id}')">Chia sẻ / QR</button>`:''}
          </div>
          <div id="dlmsg" class="muted" style="margin-top:8px"></div>
        </div>
      </div>
    `);
  }

  const STATUS_META={
    store:{icon:'⌂',name:'M4X STORE'},
    downloads:{icon:'↓',name:'Tải file'},
    payments:{icon:'₫',name:'Thanh toán'},
    telegram:{icon:'✈',name:'Telegram CSKH'}
  };
  const LABELS={
    operational:'Hoạt động',
    maintenance:'Bảo trì',
    degraded:'Chập chờn',
    outage:'Gián đoạn',
    unknown:'Chưa xác định'
  };

  async function getStatus(){
    try{
      const r=await fetch(`${STATUS_URL}?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error('status');
      return await r.json();
    }catch{
      return {
        updated_at:null,
        message:'Không tải được dữ liệu trạng thái.',
        services:{
          store:{status:'unknown',note:'Không xác định'},
          downloads:{status:'unknown',note:'Không xác định'},
          payments:{status:'unknown',note:'Không xác định'},
          telegram:{status:'unknown',note:'Không xác định'}
        }
      };
    }
  }

  function overallInfo(services){
    const vals=Object.values(services||{}).map(x=>x?.status||'unknown');
    if(vals.some(x=>x==='outage'))return {cls:'bad',text:'Một số dịch vụ đang gián đoạn'};
    if(vals.some(x=>x==='maintenance'||x==='degraded'||x==='unknown'))return {cls:'warn',text:'Một số dịch vụ cần chú ý'};
    return {cls:'good',text:'Tất cả hệ thống hoạt động bình thường'};
  }

  async function renderStatus(){
    $('view').innerHTML=`<div class="m4x-status-page"><div class="muted">Đang tải trạng thái hệ thống...</div></div>`;
    const data=await getStatus();
    const services=data.services||{};
    const overall=overallInfo(services);
    const rows=Object.entries(STATUS_META).map(([key,meta])=>{
      const s=services[key]||{status:'unknown',note:'Chưa có dữ liệu'};
      const status=s.status||'unknown';
      return `<div class="m4x-status-card">
        <div class="m4x-status-icon">${meta.icon}</div>
        <div><b>${meta.name}</b><small>${esc(s.note||'')}</small></div>
        <span class="m4x-status-label ${esc(status)}">${esc(LABELS[status]||status)}</span>
      </div>`;
    }).join('');

    $('view').innerHTML=`
      <div class="m4x-status-page">
        <div class="m4x-status-top">
          <div><h1>Trạng thái hệ thống</h1><p>M4X cập nhật tình trạng Store và các dịch vụ quan trọng.</p></div>
          <button class="btn ghost" onclick="M4X.systemStatus()">Làm mới</button>
        </div>

        <div class="m4x-overall ${overall.cls}">
          <span class="m4x-status-dot ${overall.cls==='good'?'operational':overall.cls==='bad'?'outage':'maintenance'}"></span>
          <b>${overall.text}</b>
        </div>

        <div class="m4x-status-list">${rows}</div>

        <div class="m4x-status-note">
          ${data.message?`<b>${esc(data.message)}</b><br>`:''}
          Cập nhật: ${data.updated_at?esc(new Date(data.updated_at).toLocaleString('vi-VN')):'Chưa xác định'}.
          Trạng thái dịch vụ được M4X cập nhật, không phải phép đo uptime tự động.
        </div>

        <div class="m4x-status-actions">
          <button class="btn ghost" onclick="setView('store')">← Cửa hàng</button>
          <button class="btn ghost" onclick="location.href='https://t.me/bengtayy'">Telegram CSKH</button>
        </div>
      </div>`;
  }

  function showStatus(){
    closeModal();
    state.view='status';
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
    renderStatus();
  }

  // Keep status page working with the app's normal render cycle.
  const oldRenderView=renderView;
  renderView=function(){
    if(state.view==='status')return renderStatus();
    return oldRenderView();
  };

  // Replace the old product modal with the cleaner detail page.
  try{
    product=enhancedProduct;
    M4X.product=enhancedProduct;
  }catch(e){console.warn('M4X detail override:',e)}

  M4X.setProductPreview=setPreview;
  M4X.systemStatus=showStatus;

  // Add a compact status entry to the minimal home without making it busy.
  function injectStatusEntry(){
    const links=document.querySelector('.m4x-min-links');
    if(links&&!links.querySelector('.m4x-status-home')){
      const b=document.createElement('button');
      b.className='m4x-status-home';
      b.innerHTML='<b>Trạng thái hệ thống</b><small>Store · tải file · thanh toán · CSKH</small>';
      b.onclick=showStatus;
      links.appendChild(b);
    }
  }

  const view=$('view');
  if(view){
    const obs=new MutationObserver(()=>injectStatusEntry());
    obs.observe(view,{childList:true,subtree:true});
    injectStatusEntry();
  }
})();
