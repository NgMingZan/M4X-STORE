(()=>{
'use strict';
const $=s=>document.querySelector(s),C=window.M4X_CONFIG||{};
const base=String(C.SUPABASE_URL||'').replace(/\/$/,'');
const key=String(C.SUPABASE_ANON_KEY||C.SUPABASE_PUBLISHABLE_KEY||'');
const endpoint=base?`${base}/functions/v1/m4x-theme-service`:'';
const storageClient=window.supabase?.createClient?.(base,key);
const MODE={
 text:{label:'⚡ Chỉ văn bản',note:'Đã chọn: ⚡ Chỉ dịch XML/config. Ảnh giữ nguyên.'},
 scan:{label:'🔎 Văn bản + quét chữ ảnh',note:'Đã chọn: 🔎 Dịch text + quét ảnh. Ảnh giữ nguyên.'},
 full:{label:'🖼 FULL: Văn bản + sửa ảnh',note:'Đã chọn: 🖼 FULL — văn bản + sửa ảnh.'}
};
const state={file:null,quote:null,timer:null,poll:null,mode:'full'};
const money=n=>`${Math.round(Number(n||0)).toLocaleString('vi-VN')}đ`;
const fmt=n=>Number(n||0).toLocaleString('vi-VN');
const headers=()=>({apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'});
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function api(body){const r=await fetch(endpoint,{method:'POST',headers:headers(),body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||`HTTP ${r.status}`);return j}
function setMode(m){if(!MODE[m])m='full';state.mode=m;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));$('#modeNote').textContent=MODE[m].note}
function ranges(tiers,unit){let prev=0;return(tiers||[]).map((x,i)=>{const max=Number(x.max),label=i===0?`≤ ${fmt(max)}${unit}`:`>${fmt(prev)}–${fmt(max)}${unit}`;prev=max;return`<tr><td>${label}</td><td>${Number(x.fee||0)?'+'+money(x.fee):'Đã gồm'}</td></tr>`}).join('')}
function renderPricing(p){if(!p)return;$('#pricingBox').innerHTML=`<div class="v21-price" style="font-size:26px">Từ ${money(p.base_price)}</div><div class="v21-muted">Tối đa ${p.max_lockscreen_mb}MB lockscreen · ${p.max_images} ảnh</div><h4>Dung lượng</h4><table class="v21-table"><tbody>${ranges(p.size_tiers,'MB')}</tbody></table><h4>Việt hóa ảnh — chỉ FULL</h4><table class="v21-table"><tbody>${ranges(p.image_tiers,' ảnh')}</tbody></table><h4>Văn bản</h4><table class="v21-table"><tbody>${ranges(p.text_tiers,' ký tự')}</tbody></table>`}
async function loadPricing(){try{const j=await api({action:'pricing'});renderPricing(j.pricing);if(!j.image_edit_enabled)$('#pricingBox').insertAdjacentHTML('beforeend','<div class="v21-note warn">FULL ảnh hiện chưa sẵn sàng vì Admin chưa bật M4X_THEME_IMAGE_EDIT_ENABLED.</div>')}catch(e){$('#pricingBox').innerHTML=`<div class="v21-note err">${esc(e.message)}</div>`}}
function setMsg(msg,type='warn'){const el=$('#analyzeMsg');el.className=`v21-note ${type}`;el.textContent=msg;el.classList.remove('v21-hidden')}
function setFile(f){if(f&&!/\.mtz$/i.test(String(f.name||''))){state.file=null;$('#analyzeBtn').disabled=true;$('#fileInfo').textContent='Chưa chọn file';setMsg('Chỉ nhận file .mtz','err');return}state.file=f||null;$('#analyzeBtn').disabled=!state.file;$('#fileInfo').textContent=f?`${f.name} · ${(f.size/1048576).toFixed(2)} MB`:'Chưa chọn file'}
async function analyze(){
  if(!state.file)return;
  if(!storageClient){
    setMsg('Không khởi tạo được Supabase Storage. Hãy tải lại trang.','err');
    return;
  }

  const btn=$('#analyzeBtn');
  const contact=$('#contact').value.trim();
  btn.disabled=true;

  try{
    btn.textContent='🔐 Đang tạo phiên upload...';
    setMsg(`Đang chuẩn bị upload · ${MODE[state.mode].label}`,'warn');

    const prep=await api({
      action:'prepare_upload',
      file_name:state.file.name,
      file_size:state.file.size,
      mode:state.mode,
      contact
    });

    if(!prep?.upload?.path||!prep?.upload?.token){
      throw new Error('Không nhận được link upload Storage.');
    }

    btn.textContent=`⬆️ Đang tải ${(state.file.size/1048576).toFixed(1)}MB lên Storage...`;
    setMsg('Đang tải MTZ trực tiếp lên Supabase Storage...','warn');

    const {error:uploadError}=await storageClient.storage
      .from(prep.upload.bucket||'theme-translation-private')
      .uploadToSignedUrl(
        prep.upload.path,
        prep.upload.token,
        state.file,
        {contentType:'application/octet-stream'}
      );

    if(uploadError){
      throw new Error('Upload Storage lỗi: '+uploadError.message);
    }

    btn.textContent='🔍 Đang mở lockscreen & tính giá...';
    setMsg('Upload xong. Đang phân tích lockscreen và tính giá...','warn');

    const j=await api({
      action:'quote_uploaded',
      source_path:prep.upload.path,
      file_name:state.file.name,
      file_size:state.file.size,
      mode:state.mode,
      contact
    });

    state.quote=j;
    localStorage.setItem('m4x_theme_paid_v21',JSON.stringify({
      order_code:j.order.order_code,
      access_token:j.order.access_token,
      expires_at:j.order.expires_at,
      mode:j.quote?.mode||state.mode
    }));

    renderQuote(j);
    setMsg('✅ Upload + phân tích lockscreen thành công.','ok');
    startPoll();
  }catch(e){
    setMsg(e?.message||String(e),'err');
  }finally{
    btn.disabled=!state.file;
    btn.textContent='🔍 Gửi MTZ & báo giá';
  }
}
function renderQuote(j){const q=j.quote,o=j.order,b=j.bank;$('#quoteCard').classList.remove('v21-hidden');$('#paymentCard').classList.remove('v21-hidden');$('#statusCard').classList.remove('v21-hidden');$('#qMode').textContent=MODE[q.mode]?.label||q.mode||MODE[state.mode].label;$('#qSize').textContent=`${q.lockscreen_mb} MB`;$('#qImages').textContent=fmt(q.images);$('#qText').textContent=fmt(q.text_chars);$('#qBase').textContent=money(q.base_price);$('#qSizeFee').textContent=q.size_fee?'+'+money(q.size_fee):'0đ';$('#qImageFee').textContent=q.image_fee?'+'+money(q.image_fee):(q.mode==='full'?'0đ':'Không tính');$('#qTextFee').textContent=q.text_fee?'+'+money(q.text_fee):'0đ';$('#qTotal').textContent=money(q.amount);$('#payAmount').textContent=money(o.amount);$('#transferContent').textContent=b.transfer_content;$('#bankCode').textContent=b.bank_code;$('#bankAccount').textContent=b.account_number;$('#bankName').textContent=b.account_name||'';$('#qrImg').src=b.qr_url;state.quote=j;startCountdown(o.expires_at);setStatusUI({order:{status:'pending'},job:{status:'waiting_payment',progress:0,stage:'Chờ SePay xác nhận',mode:q.mode,stats:{mode:q.mode}}});window.scrollTo({top:$('#quoteCard').offsetTop-12,behavior:'smooth'})}
function startCountdown(expires){clearInterval(state.timer);const tick=()=>{const ms=new Date(expires).getTime()-Date.now(),el=$('#expireText');if(ms<=0){el.textContent='⏰ Báo giá đã hết hạn.';clearInterval(state.timer);return}const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000);el.textContent=`⏳ Giữ báo giá còn ${m}:${String(s).padStart(2,'0')}`};tick();state.timer=setInterval(tick,1000)}
async function saved(){try{return JSON.parse(localStorage.getItem('m4x_theme_paid_v21')||'null')}catch{return null}}
async function pollOnce(){const s=await saved();if(!s?.order_code||!s?.access_token)return;try{const j=await api({action:'status',order_code:s.order_code,access_token:s.access_token});$('#statusCard').classList.remove('v21-hidden');if(!state.quote&&j.bank){$('#paymentCard').classList.remove('v21-hidden');$('#payAmount').textContent=money(j.order.amount);$('#transferContent').textContent=j.bank.transfer_content;$('#bankCode').textContent=j.bank.bank_code;$('#bankAccount').textContent=j.bank.account_number;$('#bankName').textContent=j.bank.account_name||'';$('#qrImg').src=j.bank.qr_url;startCountdown(j.order.expires_at)}setStatusUI(j);if(j.job?.status==='done'||j.job?.status==='expired')stopPoll()}catch(e){console.warn(e)}}
function startPoll(){stopPoll();pollOnce();state.poll=setInterval(pollOnce,4000)}function stopPoll(){if(state.poll)clearInterval(state.poll);state.poll=null}
function statsHtml(st){if(!st)return'';const r=[];if(st.unique_strings!=null)r.push(`📄 Chuỗi: <b>${fmt(st.unique_strings)}</b>`);if(st.replacements!=null)r.push(`✍️ Đã thay: <b>${fmt(st.replacements)}</b>`);if(st.images_scanned!=null)r.push(`🔎 Ảnh quét: <b>${fmt(st.images_scanned)}</b>`);if(st.images_with_text!=null)r.push(`🖼 Có chữ: <b>${fmt(st.images_with_text)}</b>`);if(st.images_edited!=null)r.push(`✅ Ảnh sửa: <b>${fmt(st.images_edited)}</b>`);return r.join('<span>•</span>')}
function label(st){return({waiting_payment:'💳 Chờ thanh toán',pending:'💳 Chờ thanh toán',queued:'🧠 Đã thanh toán · đang xếp hàng',running:'⚙️ AI đang Việt hóa',done:'✅ Hoàn tất',failed:'❌ Dịch thất bại',expired:'⌛ Báo giá hết hạn',review:'⚠️ Chờ kiểm tra thanh toán',paid:'✅ Đã thanh toán'})[st]||`Trạng thái: ${st}`}
function setStatusUI(j){const o=j.order||{},job=j.job||{},st=job.status||o.status||'pending',p=Math.max(0,Math.min(100,Number(job.progress||0))),mode=job.mode||job.stats?.mode||state.quote?.quote?.mode||'full';$('#statusMode').textContent=MODE[mode]?.label||mode;$('#progressBar').style.width=`${p}%`;$('#statusStage').textContent=job.stage||label(st);const stats=$('#statusStats'),h=statsHtml(job.stats);stats.innerHTML=h;stats.classList.toggle('v21-hidden',!h);const dot=$('#statusDot');dot.className='v21-dot '+(['running','queued'].includes(st)?'run':st==='done'?'ok':['failed','expired','review'].includes(st)?'err':'');$('#statusTitle').textContent=label(st);const note=$('#statusNote'),dl=$('#downloadBtn'),retry=$('#retryBtn');note.classList.add('v21-hidden');dl.classList.add('v21-hidden');retry.classList.add('v21-hidden');if(st==='done'&&j.download_url){dl.href=j.download_url;dl.classList.remove('v21-hidden');note.className='v21-note ok';note.textContent='✅ Việt hóa lockscreen hoàn tất.';note.classList.remove('v21-hidden')}else if(st==='failed'){note.className='v21-note err';note.textContent='❌ '+(job.error||'Dịch thất bại.');note.classList.remove('v21-hidden');retry.classList.remove('v21-hidden')}else if(st==='review'){note.className='v21-note warn';note.textContent='⚠️ Giao dịch đang chờ Admin kiểm tra.';note.classList.remove('v21-hidden')}else if(st==='waiting_payment'||o.status==='pending'){note.className='v21-note warn';note.textContent='Đang chờ thanh toán. Hệ thống tự kiểm tra mỗi 4 giây.';note.classList.remove('v21-hidden')}}
async function retry(){const s=await saved();if(!s)return;const b=$('#retryBtn');b.disabled=true;b.textContent='⏳ Đang gửi lại...';try{const j=await api({action:'retry',order_code:s.order_code,access_token:s.access_token});setStatusUI(j);startPoll()}catch(e){alert(e.message)}finally{b.disabled=false;b.textContent='🔄 Thử dịch lại'}}
function reset(){stopPoll();clearInterval(state.timer);localStorage.removeItem('m4x_theme_paid_v21');state.quote=null;setFile(null);$('#themeFile').value='';['#quoteCard','#paymentCard','#statusCard'].forEach(x=>$(x).classList.add('v21-hidden'));$('#analyzeMsg').classList.add('v21-hidden');setMode('full');window.scrollTo({top:0,behavior:'smooth'})}
function bind(){document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));const fi=$('#themeFile'),dz=$('#dropZone');fi.addEventListener('change',()=>setFile(fi.files?.[0]));['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f)setFile(f)});$('#analyzeBtn').addEventListener('click',analyze);$('#retryBtn').addEventListener('click',retry);$('#newBtn').addEventListener('click',reset);document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const el=$('#'+b.dataset.copy);try{await navigator.clipboard.writeText(el.textContent.trim());const old=b.textContent;b.textContent='Đã chép';setTimeout(()=>b.textContent=old,1000)}catch{}})}
async function init(){try{window.Telegram?.WebApp?.ready?.();window.Telegram?.WebApp?.expand?.()}catch{}if(!base||!key)return;bind();setMode('full');loadPricing();const s=await saved();if(s?.mode)setMode(s.mode);if(s?.order_code&&s?.access_token){$('#statusCard').classList.remove('v21-hidden');startPoll()}}
init();
})();
