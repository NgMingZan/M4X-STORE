(() => {
  'use strict';
  const VERSION='19.5';
  let sb=null, overlay=null, busy=false, products=[];
  const $=id=>document.getElementById(id);
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0))+'đ';

  function cfg(){
    const c=window.M4X_CONFIG||window.M4XConfig||window.CONFIG||{};
    return {url:c.SUPABASE_URL||c.supabaseUrl||window.SUPABASE_URL||'',key:c.SUPABASE_ANON_KEY||c.SUPABASE_PUBLISHABLE_KEY||c.SUPABASE_KEY||c.supabaseAnonKey||window.SUPABASE_ANON_KEY||''};
  }
  async function client(){
    if(sb)return sb; const c=cfg();
    if(!c.url||!c.key)throw new Error('Không tìm thấy SUPABASE_URL / publishable key trong config.js');
    if(!window.supabase?.createClient)throw new Error('Trang Admin chưa tải Supabase JS');
    sb=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await sb.auth.getSession(); if(error)throw error; if(!data?.session)throw new Error('Bạn chưa đăng nhập Admin hoặc phiên đã hết hạn');
    return sb;
  }
  async function api(action,payload={}){
    const c=cfg(), cli=await client(), {data}=await cli.auth.getSession(); const token=data?.session?.access_token;
    if(!token)throw new Error('Phiên Admin đã hết hạn');
    const r=await fetch(`${c.url}/functions/v1/m4x-ai-caption`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':c.key},body:JSON.stringify({action,...payload})});
    const j=await r.json().catch(()=>({})); if(!r.ok||j.ok===false)throw new Error(j.error||`Edge Function lỗi ${r.status}`); return j;
  }
  function findSourceTile(){
    const nodes=[...document.querySelectorAll('button,a,[role="button"],div')];
    for(const leaf of nodes.filter(el=>norm(el.textContent)==='ứng dụng')){
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
    if(document.querySelector('.m4x-ai-caption-tile'))return true;
    const src=findSourceTile(); if(!src)return false;
    const tile=src.cloneNode(true); tile.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
    tile.removeAttribute('href');tile.removeAttribute('onclick');tile.removeAttribute('data-view');tile.removeAttribute('data-tab');
    tile.classList.add('m4x-ai-caption-tile');tile.setAttribute('role','button');tile.setAttribute('tabindex','0');
    tile.innerHTML='<div class="m4x-ai-tile-inner"><div class="m4x-ai-tile-icon">✨</div><div class="m4x-ai-tile-label">AI Viết bài</div><div class="m4x-ai-tile-badge">TELEGRAM CAPTION</div></div>';
    const open=e=>{e?.preventDefault?.();e?.stopPropagation?.();openPanel()}; tile.addEventListener('click',open,true);tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')open(e)});
    src.parentElement.appendChild(tile); return true;
  }
  function msg(t,ok=false,warn=false){const e=$('m4xAiMsg');if(e){e.textContent=t||'';e.className='m4x-ai-msg '+(ok?'ok':warn?'warn':'')}}
  function setBusy(v){busy=v;document.querySelectorAll('#m4xAiSheet button,#m4xAiSheet select,#m4xAiSheet input').forEach(el=>{if(!el.classList.contains('m4x-ai-close'))el.disabled=v})}

  function buildOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='m4xAiOverlay';overlay.innerHTML=`<div id="m4xAiSheet" role="dialog" aria-modal="true" aria-label="AI Caption Studio">
      <div class="m4x-ai-head"><div><h2>✨ AI Caption Studio</h2><small>M4X STORE · Telegram Sales Copy · V${VERSION}</small></div><button class="m4x-ai-close" id="m4xAiClose">×</button></div>
      <div class="m4x-ai-card"><h3>1. Chọn sản phẩm</h3><div class="m4x-ai-field"><label>SẢN PHẨM ĐANG BÁN</label><select id="m4xAiProduct" class="m4x-ai-input"><option>Đang tải...</option></select></div><div id="m4xAiProductInfo" class="m4x-ai-product-info"></div></div>
      <div class="m4x-ai-card"><h3>2. Phong cách bài viết</h3><div class="m4x-ai-grid2"><div class="m4x-ai-field"><label>GIỌNG</label><select id="m4xAiTone" class="m4x-ai-input"><option value="sale">🔥 Sale mạnh</option><option value="premium">💎 Premium</option><option value="technical">🧩 Kỹ thuật</option><option value="friendly">✨ Thân thiện</option></select></div><div class="m4x-ai-field"><label>ĐỘ DÀI</label><select id="m4xAiLength" class="m4x-ai-input"><option value="short">Ngắn</option><option value="medium" selected>Vừa</option><option value="long">Dài</option></select></div></div><div class="m4x-ai-field"><label>GHI CHÚ THÊM (TÙY CHỌN)</label><input id="m4xAiExtra" class="m4x-ai-input" placeholder="VD: nhấn mạnh giao ngay, đừng nhắc bảo hành..."></div><button class="m4x-ai-btn primary" id="m4xAiGenerate">✨ Viết caption</button></div>
      <div class="m4x-ai-card"><h3>3. Caption Telegram</h3><textarea id="m4xAiOutput" class="m4x-ai-output" placeholder="Caption AI sẽ xuất hiện ở đây. Bạn có thể sửa trước khi đăng."></textarea><div class="m4x-ai-meta" id="m4xAiMeta">Chưa tạo caption.</div><div class="m4x-ai-actions"><button class="m4x-ai-btn" id="m4xAiRewrite">🔄 Viết lại</button><button class="m4x-ai-btn" id="m4xAiCopy">📋 Sao chép</button><button class="m4x-ai-btn green" id="m4xAiPublish">📢 Đăng Channel</button></div><div id="m4xAiMsg" class="m4x-ai-msg"></div></div>
      <div class="m4x-ai-card m4x-ai-tip"><b>🤖 Bot quản trị bằng nút</b><span>Mở bot Telegram riêng của M4X và gửi <code>/admin</code> để dùng: Kho · Đơn · Sale · Hero · Thông báo · Tắt/Bật mua hàng.</span></div>
    </div>`;
    document.body.appendChild(overlay);
    $('m4xAiClose').onclick=closePanel;overlay.addEventListener('click',e=>{if(e.target===overlay)closePanel()});
    $('m4xAiGenerate').onclick=generate;$('m4xAiRewrite').onclick=generate;$('m4xAiCopy').onclick=copyCaption;$('m4xAiPublish').onclick=publish;
    $('m4xAiProduct').onchange=renderProductInfo;
    return overlay;
  }
  async function loadProducts(){
    const c=await client();const {data,error}=await c.from('products').select('id,name,price,old_price,stock_mode,stock_limit,sold_count,reserved_count,active').eq('active',true).order('created_at',{ascending:false});if(error)throw error;
    products=data||[];const sel=$('m4xAiProduct');sel.innerHTML=products.length?products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${money(p.price)}</option>`).join(''):'<option value="">Không có sản phẩm active</option>';renderProductInfo();
  }
  function renderProductInfo(){
    const p=products.find(x=>String(x.id)===$('m4xAiProduct')?.value);const el=$('m4xAiProductInfo');if(!el)return;if(!p){el.textContent='';return}
    const av=p.stock_mode==='limited'?Math.max(0,Number(p.stock_limit||0)-Number(p.sold_count||0)-Number(p.reserved_count||0)):null;
    el.innerHTML=`<b>${esc(p.name)}</b><span>${money(p.price)}${Number(p.old_price||0)>Number(p.price||0)?` · Giá cũ ${money(p.old_price)}`:''}${av!==null?` · Còn ${av}`:' · Không giới hạn'}</span>`;
  }
  async function generate(){
    if(busy)return;const product_id=$('m4xAiProduct').value;if(!product_id){msg('Hãy chọn sản phẩm.');return}setBusy(true);msg('AI đang viết caption...');
    try{const j=await api('generate',{product_id,tone:$('m4xAiTone').value,length:$('m4xAiLength').value,extra_instruction:$('m4xAiExtra').value.trim()});$('m4xAiOutput').value=j.caption||'';const providerLabel=j.provider==='gemini'?`Gemini · ${j.model||'model mặc định'}`:j.provider==='openai'?`OpenAI · ${j.model||'model mặc định'}`:'Mẫu dự phòng';$('m4xAiMeta').textContent=providerLabel;msg(j.warning||'✅ Đã tạo caption. Bạn có thể sửa trước khi đăng.',true,!!j.warning)}catch(e){msg('❌ '+(e?.message||e))}finally{setBusy(false)}
  }
  async function copyCaption(){const t=$('m4xAiOutput').value.trim();if(!t){msg('Caption đang trống.');return}try{await navigator.clipboard.writeText(t);msg('✅ Đã sao chép caption.',true)}catch(_){$('m4xAiOutput').select();document.execCommand('copy');msg('✅ Đã sao chép caption.',true)}}
  async function publish(){
    if(busy)return;const caption=$('m4xAiOutput').value.trim(),product_id=$('m4xAiProduct').value;if(!caption){msg('Caption đang trống.');return}if(!confirm('Đăng caption này lên Telegram Channel ngay?'))return;setBusy(true);msg('Đang đăng lên Channel...');
    try{const j=await api('publish',{product_id,caption});msg(`✅ Đã đăng Channel${j.message_id?' · Message #'+j.message_id:''}.`,true)}catch(e){msg('❌ '+(e?.message||e))}finally{setBusy(false)}
  }
  async function openPanel(){buildOverlay();overlay.classList.add('open');document.documentElement.classList.add('m4x-ai-lock');msg('');try{await loadProducts()}catch(e){msg('❌ '+(e?.message||e))}}
  function closePanel(){overlay?.classList.remove('open');document.documentElement.classList.remove('m4x-ai-lock')}
  function init(){ensureTile();buildOverlay();let timer=null;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(ensureTile,180)}).observe(document.body,{childList:true,subtree:true});window.M4XAICaption={open:openPanel,version:VERSION}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
