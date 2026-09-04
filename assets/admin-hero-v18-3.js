/* =========================================================
   M4X ADMIN V18.3 — HERO / BANNER MANAGER
   ========================================================= */
(() => {
  let row=null,loading=false;
  const q=id=>document.getElementById(id);
  const safe=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const client=()=>{try{return typeof sb!=='undefined'?sb:window.sb}catch{return window.sb}};
  const appRoot=()=>q('adminApp')||q('admin')||document.querySelector('.app');
  const toLocal=iso=>{if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)};
  const toIso=v=>{if(!v)return null;const d=new Date(v);return isNaN(d)?null:d.toISOString()};
  const opt=(v,label,current)=>`<option value="${v}" ${String(current)===v?'selected':''}>${label}</option>`;

  function inject(){
    const tabs=document.querySelector('.tabs'),app=appRoot();if(!tabs||!app)return;
    let b=tabs.querySelector('[data-tab="hero"]');
    if(!b){b=document.createElement('button');b.type='button';b.className='tab';b.dataset.tab='hero';b.innerHTML='<span>Hero / Banner</span>';const ref=tabs.querySelector('[data-tab="referrals"]')||tabs.querySelector('[data-tab="support"]');ref?tabs.insertBefore(b,ref):tabs.appendChild(b)}
    if(!q('hero')){const sec=document.createElement('section');sec.id='hero';sec.className='panel';sec.innerHTML='<div class="sectionTitle">Hero / Banner trang chủ</div><div id="m4xHeroAdminContent" class="muted">Chọn Hero / Banner để tải cấu hình.</div>';const ref=q('referrals')||q('support');ref?app.insertBefore(sec,ref):app.appendChild(sec)}
  }

  function activate(){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='hero'));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id==='hero'));document.querySelectorAll('.p15-bottom button').forEach(x=>x.classList.remove('active'))}

  function missing(msg){const box=q('m4xHeroAdminContent');if(box)box.innerHTML=`<div class="hero-admin-card"><b class="badtxt">Chưa cài Hero Manager trong Supabase.</b><p class="muted">${safe(msg||'Không tìm thấy store_hero_settings')}</p><p class="muted">Chạy file <b>supabase/v18_3/M4X_HERO_MANAGER_V18_3.sql</b> trong Supabase SQL Editor rồi bấm Thử lại.</p><button class="btn ghost" onclick="M4XAdminHeroV183.load()">Thử lại</button></div>`}

  async function load(){
    inject();activate();if(loading)return;loading=true;
    const box=q('m4xHeroAdminContent');if(box)box.innerHTML='<div class="muted">Đang tải cấu hình Hero...</div>';
    try{const c=client();if(!c)throw new Error('Không tìm thấy kết nối Supabase');const {data,error}=await c.from('store_hero_settings').select('*').eq('id','main').maybeSingle();if(error){missing(error.message);return}row=data||{enabled:false,variant:'custom'};render()}catch(e){missing(e.message||String(e))}finally{loading=false}
  }

  function render(){
    const box=q('m4xHeroAdminContent');if(!box||!row)return;
    box.innerHTML=`<div class="hero-admin-layout">
      <section class="hero-admin-card">
        <div class="hero-admin-head"><div><h3>Nội dung Hero</h3><p class="muted">Sửa xong bấm Lưu. Store tự nhận thay đổi, không cần deploy lại.</p></div><span class="hero-live-dot">LIVE</span></div>
        <div class="hero-admin-grid two"><label>Trạng thái<select id="heroEnabled" class="select">${opt('1','Bật Hero tùy chỉnh',row.enabled?'1':'0')}${opt('0','Dùng Hero mặc định',row.enabled?'1':'0')}</select></label><label>Kiểu hiển thị<select id="heroVariant" class="select">${opt('promo','Khuyến mãi',row.variant)}${opt('custom','Banner tùy chỉnh',row.variant)}</select></label></div>
        <label>Nhãn nhỏ<input id="heroEyebrow" class="input" value="${safe(row.eyebrow||'')}" placeholder="⚡ FLASH SALE · M4X STORE"></label>
        <div class="hero-admin-grid two"><label>Tiêu đề chính<input id="heroTitle" class="input" value="${safe(row.title||'')}" placeholder="Nạp tiền nhận ngay"></label><label>Chữ nổi bật<input id="heroAccent" class="input" value="${safe(row.accent_text||'')}" placeholder="+30%"></label></div>
        <label>Mô tả<textarea id="heroDescription" class="textarea" placeholder="Nội dung giới thiệu...">${safe(row.description||'')}</textarea></label>
        <div class="hero-admin-grid two"><label>Nút chính<input id="heroPrimaryText" class="input" value="${safe(row.primary_button_text||'')}" placeholder="Nạp ngay"></label><label>Chức năng nút chính<select id="heroPrimaryAction" class="select">${opt('topup','Mở nạp tiền',row.primary_action)}${opt('search','Focus tìm kiếm',row.primary_action)}${opt('community','Mở Community',row.primary_action)}${opt('account','Mở tài khoản',row.primary_action)}${opt('url','Mở link',row.primary_action)}${opt('none','Không làm gì',row.primary_action)}</select></label></div>
        <label>Link nút chính<input id="heroPrimaryUrl" class="input" value="${safe(row.primary_url||'')}" placeholder="https://..."></label>
        <div class="hero-admin-grid two"><label>Nút phụ<input id="heroSecondaryText" class="input" value="${safe(row.secondary_button_text||'')}" placeholder="Có thể để trống"></label><label>Chức năng nút phụ<select id="heroSecondaryAction" class="select">${opt('none','Không dùng',row.secondary_action)}${opt('community','Mở Community',row.secondary_action)}${opt('search','Focus tìm kiếm',row.secondary_action)}${opt('account','Mở tài khoản',row.secondary_action)}${opt('topup','Mở nạp tiền',row.secondary_action)}${opt('url','Mở link',row.secondary_action)}</select></label></div>
        <label>Link nút phụ<input id="heroSecondaryUrl" class="input" value="${safe(row.secondary_url||'')}" placeholder="https://..."></label>
      </section>
      <section class="hero-admin-card">
        <h3>Ảnh & thời gian</h3>
        <div class="hero-image-preview" id="heroImagePreview">${row.image_url?`<img src="${safe(row.image_url)}" alt="Hero preview">`:'<span>Chưa có ảnh · Banner dùng nền mặc định</span>'}</div>
        <label>Upload ảnh mới<input id="heroImageFile" class="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <label>Hoặc URL ảnh<input id="heroImageUrl" class="input" value="${safe(row.image_url||'')}" placeholder="https://..."></label>
        <button type="button" class="btn ghost" onclick="M4XAdminHeroV183.clearImage()">Bỏ ảnh</button>
        <div class="hero-admin-grid two" style="margin-top:12px"><label>Bắt đầu<input id="heroStart" class="input" type="datetime-local" value="${safe(toLocal(row.starts_at))}"></label><label>Kết thúc<input id="heroEnd" class="input" type="datetime-local" value="${safe(toLocal(row.ends_at))}"></label></div>
        <div class="hero-admin-grid two"><label>Đếm ngược<select id="heroCountdown" class="select">${opt('1','Hiện đếm ngược',row.show_countdown?'1':'0')}${opt('0','Ẩn đếm ngược',row.show_countdown?'1':'0')}</select></label><label>Khi hết hạn<select id="heroAutoRestore" class="select">${opt('1','Tự về Hero mặc định',row.auto_restore?'1':'0')}${opt('0','Giữ banner',row.auto_restore?'1':'0')}</select></label></div>
        <div class="hero-admin-actions"><button class="btn p15-primary" onclick="M4XAdminHeroV183.save()">Lưu & áp dụng</button><button class="btn ghost" onclick="M4XAdminHeroV183.useDefault()">Dùng Hero mặc định</button></div>
        <div id="heroSaveMsg" class="muted"></div>
      </section></div>`;
    q('heroImageFile')?.addEventListener('change',previewFile);q('heroImageUrl')?.addEventListener('input',previewUrl);
  }

  function previewUrl(){const box=q('heroImagePreview'),u=q('heroImageUrl')?.value.trim();if(!box)return;box.innerHTML=u?`<img src="${safe(u)}" alt="Hero preview">`:'<span>Chưa có ảnh · Banner dùng nền mặc định</span>'}
  function previewFile(){const f=q('heroImageFile')?.files?.[0],box=q('heroImagePreview');if(!f||!box)return;box.innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Hero preview">`}
  function clearImage(){if(q('heroImageUrl'))q('heroImageUrl').value='';if(q('heroImageFile'))q('heroImageFile').value='';previewUrl()}

  async function uploadIfNeeded(){
    const f=q('heroImageFile')?.files?.[0];if(!f)return q('heroImageUrl')?.value.trim()||null;
    if(f.size>6*1024*1024)throw new Error('Ảnh tối đa 6 MB');
    const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path=`hero/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${ext}`;
    const c=client(),{error}=await c.storage.from('store-hero').upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});if(error)throw error;
    return c.storage.from('store-hero').getPublicUrl(path).data?.publicUrl||null;
  }

  async function save(){
    const msg=q('heroSaveMsg');if(msg)msg.textContent='Đang lưu...';
    try{
      const image=await uploadIfNeeded();
      const args={p_enabled:q('heroEnabled').value==='1',p_variant:q('heroVariant').value,p_eyebrow:q('heroEyebrow').value.trim()||null,p_title:q('heroTitle').value.trim()||null,p_accent_text:q('heroAccent').value.trim()||null,p_description:q('heroDescription').value.trim()||null,p_primary_button_text:q('heroPrimaryText').value.trim()||null,p_primary_action:q('heroPrimaryAction').value,p_primary_url:q('heroPrimaryUrl').value.trim()||null,p_secondary_button_text:q('heroSecondaryText').value.trim()||null,p_secondary_action:q('heroSecondaryAction').value,p_secondary_url:q('heroSecondaryUrl').value.trim()||null,p_image_url:image,p_starts_at:toIso(q('heroStart').value),p_ends_at:toIso(q('heroEnd').value),p_show_countdown:q('heroCountdown').value==='1',p_auto_restore:q('heroAutoRestore').value==='1'};
      const {data,error}=await client().rpc('admin_set_store_hero',args);if(error)throw error;row=Array.isArray(data)?data[0]:data||row;if(msg)msg.textContent='✅ Đã lưu. Store sẽ cập nhật trong vài giây.';setTimeout(load,700)
    }catch(e){if(msg)msg.textContent='❌ '+(e.message||String(e))}
  }

  async function useDefault(){if(!confirm('Quay về Hero “Sản phẩm số được chọn lọc.”?'))return;if(q('heroEnabled'))q('heroEnabled').value='0';await save()}
  document.addEventListener('click',ev=>{const b=ev.target.closest?.('.tab[data-tab="hero"]');if(b)setTimeout(load,0)});
  window.M4XAdminHeroV183={load,save,useDefault,clearImage};
  setTimeout(inject,250);setTimeout(inject,900);setTimeout(inject,1800);
})();
