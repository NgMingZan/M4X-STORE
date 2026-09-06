
const $=id=>document.getElementById(id);
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tabpanel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); $('tab-'+b.dataset.tab).classList.add('active');
});
const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function priceParts(sizeMb, imgs, chars){
  let base=10000,size=0,image=0,text=0;
  if(sizeMb>35) size=15000; else if(sizeMb>20) size=9000; else if(sizeMb>10) size=5000; else if(sizeMb>5) size=2000;
  if(imgs>750) image=20000; else if(imgs>500) image=15000; else if(imgs>300) image=10000; else if(imgs>150) image=6000; else if(imgs>50) image=3000;
  if(chars>500000) text=15000; else if(chars>200000) text=10000; else if(chars>100000) text=7000; else if(chars>50000) text=4000; else if(chars>20000) text=2000;
  return {base,size,image,text,total:base+size+image+text};
}
function calcThemePrice(){
  const p=priceParts(+$('sizeMb').value||0,+$('imgCount').value||0,+$('charCount').value||0);
  $('priceResult').innerHTML=`Cơ bản: ${money(p.base)}<br>Dung lượng: +${money(p.size)}<br>Ảnh: +${money(p.image)}<br>XML: +${money(p.text)}<hr><b>Tổng: ${money(p.total)}</b>`;
}
function countText(){
  const s=$('xmlText').value, chars=s.length, lines=s? s.split(/\r?\n/).length:0, words=(s.trim().match(/\S+/g)||[]).length;
  const p=priceParts(0,0,chars);
  $('textResult').innerHTML=`Ký tự: <b>${chars.toLocaleString()}</b><br>Dòng: ${lines.toLocaleString()}<br>Từ: ${words.toLocaleString()}<br>Phụ phí XML ước tính: <b>${money(p.text)}</b>`;
}
async function analyzeArchive(){
  const f=$('mtzFile').files[0]; if(!f)return $('mtzResult').textContent='Chọn file MTZ/ZIP trước.';
  $('mtzResult').textContent='Đang phân tích...';
  try{
    const z=await JSZip.loadAsync(f), names=Object.keys(z.files);
    const imgs=names.filter(n=>/\.(png|jpe?g|webp|gif)$/i.test(n)&&!z.files[n].dir);
    const xmls=names.filter(n=>/\.(xml|txt|json)$/i.test(n)&&!z.files[n].dir);
    let chars=0;
    for(const n of xmls.slice(0,250)){ try{ chars+=(await z.files[n].async('string')).length }catch(e){} }
    const mb=f.size/1024/1024,p=priceParts(mb,imgs.length,chars);
    $('mtzResult').innerHTML=`Dung lượng: <b>${mb.toFixed(2)} MB</b><br>Tổng file: ${names.length}<br>Ảnh: <b>${imgs.length}</b><br>XML/TXT/JSON: ${xmls.length}<br>Ký tự đã đọc: <b>${chars.toLocaleString()}</b>${xmls.length>250?'<br><span class="warn">Chỉ đọc 250 file text đầu để tránh treo máy.</span>':''}<hr>Giá ước tính: <b>${money(p.total)}</b>`;
  }catch(e){$('mtzResult').innerHTML='<span class="bad">Không đọc được archive: '+esc(e.message)+'</span>'}
}
function convertImage(){
  const f=$('imageFile').files[0]; if(!f)return $('imageResult').textContent='Chọn ảnh trước.';
  const img=new Image(), u=URL.createObjectURL(f);
  img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);c.toBlob(blob=>{
    const ext=$('imageFormat').value.split('/')[1].replace('jpeg','jpg'), dl=URL.createObjectURL(blob);
    $('imageResult').innerHTML=`${img.naturalWidth}×${img.naturalHeight}<br><a class="dl" download="m4x-converted.${ext}" href="${dl}">⬇ Tải ảnh ${ext.toUpperCase()}</a>`;
  },$('imageFormat').value,.92);URL.revokeObjectURL(u)};
  img.src=u;
}
function makeVietQR(){
  const bank=$('bankId').value.trim(),acc=$('accountNo').value.trim(); if(!bank||!acc)return $('vietqrResult').textContent='Cần BIN ngân hàng và số tài khoản.';
  const q=new URLSearchParams({amount:$('amount').value||'',addInfo:$('addInfo').value||'',accountName:$('accountName').value||''});
  const src=`https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(acc)}-compact2.png?${q}`;
  $('vietqrResult').innerHTML=`<img src="${src}" alt="VietQR"><br><a class="dl" href="${src}" target="_blank" rel="noopener">Mở QR</a>`;
}
function toggleQrType(){$('qrTextBox').classList.toggle('hidden',$('qrType').value==='wifi');$('wifiBox').classList.toggle('hidden',$('qrType').value!=='wifi')}
function makeQR(){
  let t=$('qrText').value.trim();
  if($('qrType').value==='wifi'){const sec=$('wifiSec').value,ssid=$('wifiSsid').value,p=$('wifiPass').value;t=`WIFI:T:${sec};S:${ssid};P:${p};;`}
  if(!t)return $('qrResult').textContent='Nhập nội dung trước.';
  const src='https://api.qrserver.com/v1/create-qr-code/?size=320x320&data='+encodeURIComponent(t);
  $('qrResult').innerHTML=`<img src="${src}" alt="QR"><br><a class="dl" href="${src}" target="_blank" rel="noopener">Mở QR</a>`;
}
function makeOrderCode(){
  const d=new Date(), s=d.toISOString().slice(2,10).replaceAll('-',''), r=Math.random().toString(36).slice(2,7).toUpperCase();
  $('orderResult').innerHTML=`<b>M4X${s}${r}</b>`;
}
async function checkM4X(){
  $('statusResult').textContent='Đang kiểm tra...';
  const targets=[['M4X STORE','/'],['M4X TOOLBOX',location.pathname]];
  let out=[];
  for(const [n,u] of targets){try{const r=await fetch(u,{method:'HEAD',cache:'no-store'});out.push(`${n}: <span class="${r.ok?'ok':'bad'}">${r.ok?'ONLINE':'LỖI '+r.status}</span>`)}catch(e){out.push(`${n}: <span class="bad">KHÔNG KẾT NỐI</span>`)}}
  $('statusResult').innerHTML=out.join('<br>');
}
function inspectUrl(){
  let v=$('checkUrl').value.trim(); if(!/^https?:\/\//i.test(v))v='https://'+v;
  try{const u=new URL(v);$('urlResult').innerHTML=`Protocol: ${esc(u.protocol)}<br>Host: <b>${esc(u.hostname)}</b><br>Port: ${esc(u.port||'mặc định')}<br>Path: ${esc(u.pathname)}<br>HTTPS: <span class="${u.protocol==='https:'?'ok':'warn'}">${u.protocol==='https:'?'Có':'Không'}</span>`}catch(e){$('urlResult').innerHTML='<span class="bad">Link không hợp lệ.</span>'}
}
async function getPublicIp(){try{const r=await fetch('https://api.ipify.org?format=json');const j=await r.json();$('ipResult').innerHTML=`IP: <b>${esc(j.ip)}</b>`}catch(e){$('ipResult').innerHTML='<span class="bad">Không lấy được IP.</span>'}}
function parseDomain(){let v=$('domainInput').value.trim();if(!/^https?:\/\//i.test(v))v='https://'+v;try{const u=new URL(v);$('domainResult').innerHTML=`Hostname: <b>${esc(u.hostname)}</b><br>Origin: ${esc(u.origin)}<br>Path: ${esc(u.pathname)}<br>Query: ${esc(u.search||'(không có)')}`}catch(e){$('domainResult').innerHTML='<span class="bad">Không hợp lệ.</span>'}}
function makeUuid(){$('uuidResult').innerHTML=`<b>${crypto.randomUUID()}</b>`}
function makeRandom(){const n=Math.min(128,Math.max(8,+$('randLen').value||32)),a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_',buf=new Uint32Array(n);crypto.getRandomValues(buf);$('randomResult').innerHTML='<b>'+Array.from(buf,x=>a[x%a.length]).join('')+'</b>'}
async function hashSha256(){const b=new TextEncoder().encode($('hashText').value),h=await crypto.subtle.digest('SHA-256',b);$('hashResult').innerHTML='<b>'+[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')+'</b>'}
