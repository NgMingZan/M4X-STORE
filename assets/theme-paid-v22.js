(()=>{
'use strict';
const $=s=>document.querySelector(s),C=window.M4X_CONFIG||{};
const base=String(C.SUPABASE_URL||'').replace(/\/$/,'');
const key=String(C.SUPABASE_ANON_KEY||C.SUPABASE_PUBLISHABLE_KEY||'');
const endpoint=base?`${base}/functions/v1/m4x-theme-service`:'';
const sb=(base&&key&&window.supabase)?window.supabase.createClient(base,key):null;
const state={file:null,quote:null,poll:null,timer:null};
const money=n=>`${Math.round(Number(n||0)).toLocaleString('vi-VN')}đ`;
const num=n=>Number(n||0).toLocaleString('vi-VN');
const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const show=s=>$(s)?.classList.remove('hidden');
const hide=s=>$(s)?.classList.add('hidden');

function note(msg,type='warn'){const el=$('#analyzeMsg');el.className=`m22-note ${type}`;el.textContent=msg;show('#analyzeMsg')}
async function api(body){if(!endpoint)throw new Error('Thiếu cấu hình Supabase.');const r=await fetch(endpoint,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||`HTTP ${r.status}`);return j}

function tierRows(rows,unit){let prev=0;return(rows||[]).map((x,i)=>{const max=Number(x.max),fee=Number(x.fee||0),range=i===0?`≤ ${num(max)}${unit}`:`>${num(prev)}–${num(max)}${unit}`;prev=max;return`<tr><td>${range}</td><td>${fee?'+'+money(fee):'Đã gồm'}</td></tr>`}).join('')}

async function loadPricing(){
  try{
    const j=await api({action:'pricing'}),p=j.pricing;
    $('#serviceState').textContent=p?.enabled?'Đang hoạt động':'Tạm đóng';
    $('#serviceState').classList.toggle('off',!p?.enabled);
    $('#pricingBox').innerHTML=`<div class="m22-limit">MTZ ≤ <b>${num(p.max_mtz_mb)}MB</b> · Lockscreen ≤ <b>${num(p.max_lockscreen_mb)}MB</b> · ≤ <b>${num(p.max_images)} ảnh</b></div><h3>Dung lượng lockscreen</h3><table><tbody>${tierRows(p.size_tiers,'MB')}</tbody></table><h3>Số ảnh cần quét trong lockscreen</h3><table><tbody>${tierRows(p.image_tiers,' ảnh')}</tbody></table><h3>Văn bản XML/config</h3><table><tbody>${tierRows(p.text_tiers,' ký tự')}</tbody></table>`;
  }catch(e){
    $('#serviceState').textContent='Lỗi kết nối';$('#serviceState').classList.add('off');
    $('#pricingBox').innerHTML=`<div class="m22-note err">${esc(e.message)}</div>`;
  }
}

function setFile(file){
  if(file&&!/\.mtz$/i.test(String(file.name||''))){state.file=null;$('#analyzeBtn').disabled=true;$('#fileInfo').textContent='Chỉ nhận file .mtz';note('Chỉ hỗ trợ file .mtz','err');return}
  state.file=file||null;$('#analyzeBtn').disabled=!state.file;$('#fileInfo').textContent=file?`${file.name} • ${(file.size/1048576).toFixed(2)} MB`:'Chưa chọn file';
}

async function uploadAndQuote(){
  if(!state.file||!sb)return;
  const btn=$('#analyzeBtn');btn.disabled=true;
  try{
    btn.textContent='🔐 ĐANG TẠO PHIÊN UPLOAD…';note('Đang chuẩn bị upload an toàn…');
    const prep=await api({action:'prepare_upload',file_name:state.file.name,file_size:state.file.size,mode:'full'});
    btn.textContent=`⬆️ ĐANG UPLOAD ${(state.file.size/1048576).toFixed(1)}MB…`;note('Đang tải MTZ trực tiếp lên Supabase Storage…');
    const {error}=await sb.storage.from(prep.upload.bucket||'theme-translation-private').uploadToSignedUrl(prep.upload.path,prep.upload.token,state.file,{contentType:'application/octet-stream'});
    if(error)throw new Error('Upload Storage lỗi: '+error.message);
    btn.textContent='🔍 ĐANG PHÂN TÍCH LOCKSCREEN…';note('Upload xong. Đang mở riêng component lockscreen và tính giá…');
    const j=await api({action:'quote_uploaded',source_path:prep.upload.path,file_name:state.file.name,file_size:state.file.size,mode:'full',contact:$('#contact').value.trim()});
    state.quote=j;
    localStorage.setItem('m4x_theme_v22',JSON.stringify({order_code:j.order.order_code,access_token:j.order.access_token,expires_at:j.order.expires_at}));
    renderQuote(j);note('✅ Phân tích lockscreen thành công.','ok');startPoll();
  }catch(e){note(e?.message||String(e),'err')}
  finally{btn.disabled=!state.file;btn.textContent='🔍 PHÂN TÍCH LOCKSCREEN & BÁO GIÁ'}
}

function renderQuote(j){
  const q=j.quote,o=j.order,b=j.bank;
  $('#qMtz').textContent=`${q.mtz_mb} MB`;$('#qSize').textContent=`${q.lockscreen_mb} MB`;$('#qImages').textContent=num(q.images);$('#qText').textContent=num(q.text_chars);
  $('#qBase').textContent=money(q.base_price);$('#qSizeFee').textContent=q.size_fee?'+'+money(q.size_fee):'0đ';$('#qImageFee').textContent=q.image_fee?'+'+money(q.image_fee):'0đ';$('#qTextFee').textContent=q.text_fee?'+'+money(q.text_fee):'0đ';$('#qTotal').textContent=money(q.amount);$('#qTotal2').textContent=money(q.amount);
  $('#payAmount').textContent=money(o.amount);$('#transferContent').textContent=b.transfer_content;$('#bankAccount').textContent=b.account_number;$('#bankNameLine').textContent=`${b.bank_code} • ${b.account_name||'M4X STORE'}`;$('#qrImg').src=b.qr_url;
  show('#quoteCard');show('#paymentCard');show('#statusCard');countdown(o.expires_at);window.scrollTo({top:$('#quoteCard').offsetTop-12,behavior:'smooth'});
}

function countdown(expiresAt){clearInterval(state.timer);const tick=()=>{const ms=new Date(expiresAt).getTime()-Date.now();if(ms<=0){$('#expireText').textContent='Hết hạn';clearInterval(state.timer);return}const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);$('#expireText').textContent=`Còn ${m}:${String(s).padStart(2,'0')}`};tick();state.timer=setInterval(tick,1000)}
function saved(){try{return JSON.parse(localStorage.getItem('m4x_theme_v22')||'null')}catch{return null}}
async function pollOnce(){const s=saved();if(!s?.order_code||!s?.access_token)return;try{const j=await api({action:'status',order_code:s.order_code,access_token:s.access_token});show('#statusCard');renderStatus(j);if(j.job?.status==='done'||j.job?.status==='expired')stopPoll()}catch(e){console.warn(e)}}
function startPoll(){stopPoll();pollOnce();state.poll=setInterval(pollOnce,4000)}
function stopPoll(){if(state.poll)clearInterval(state.poll);state.poll=null}
function statusLabel(st){return({waiting_payment:'Chờ thanh toán',pending:'Chờ thanh toán',queued:'Đang xếp hàng',running:'AI đang xử lý',done:'Hoàn tất',failed:'Thất bại',expired:'Hết hạn',review:'Chờ kiểm tra',paid:'Đã thanh toán'})[st]||st||'Đang chờ'}

function renderStatus(j){
  const job=j.job||{},order=j.order||{},st=job.status||order.status||'pending',stats=job.stats||{},progress=Math.max(0,Math.min(100,Number(job.progress||0)));
  $('#statusTitle').textContent=statusLabel(st);$('#progressBar').style.width=`${progress}%`;$('#statusStage').textContent=job.stage||statusLabel(st);
  $('#stStrings').textContent=num(stats.unique_strings||0);$('#stReplace').textContent=num(stats.replacements||0);$('#stScanned').textContent=num(stats.images_scanned||0);$('#stForeign').textContent=num(stats.images_with_text||0);$('#stEdited').textContent=num(stats.images_edited||0);
  hide('#downloadBtn');hide('#retryBtn');hide('#statusNote');
  if(st==='done'&&j.download_url){$('#downloadBtn').href=j.download_url;show('#downloadBtn');$('#statusNote').className='m22-note ok';$('#statusNote').textContent='✅ Văn bản và các ảnh có chữ ngoại ngữ trong lockscreen đã được xử lý.';show('#statusNote')}
  else if(st==='failed'){$('#statusNote').className='m22-note err';$('#statusNote').textContent='❌ '+(job.error||'Xử lý thất bại.');show('#statusNote');show('#retryBtn')}
  else if(st==='waiting_payment'||order.status==='pending'){$('#statusNote').className='m22-note warn';$('#statusNote').textContent='Đang chờ SePay xác nhận thanh toán…';show('#statusNote')}
}

async function retry(){const s=saved();if(!s)return;const btn=$('#retryBtn');btn.disabled=true;try{await api({action:'retry',order_code:s.order_code,access_token:s.access_token});startPoll()}catch(e){alert(e.message)}finally{btn.disabled=false}}
function reset(){stopPoll();clearInterval(state.timer);localStorage.removeItem('m4x_theme_v22');state.file=null;state.quote=null;$('#themeFile').value='';$('#fileInfo').textContent='Chưa chọn file';$('#analyzeBtn').disabled=true;hide('#quoteCard');hide('#paymentCard');hide('#statusCard');hide('#analyzeMsg');window.scrollTo({top:0,behavior:'smooth'})}

function bind(){
  const file=$('#themeFile'),drop=$('#dropZone');
  file.addEventListener('change',()=>setFile(file.files?.[0]));
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f)setFile(f)});
  $('#analyzeBtn').addEventListener('click',uploadAndQuote);$('#retryBtn').addEventListener('click',retry);$('#newBtn').addEventListener('click',reset);
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const el=$('#'+b.dataset.copy);try{await navigator.clipboard.writeText(el.textContent.trim());const old=b.textContent;b.textContent='Đã chép';setTimeout(()=>b.textContent=old,900)}catch{}})
}

function init(){bind();loadPricing();const s=saved();if(s?.order_code&&s?.access_token){show('#statusCard');startPoll()}}
init();
})();
