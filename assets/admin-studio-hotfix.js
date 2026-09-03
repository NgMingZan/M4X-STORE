/* M4X ADMIN V14.1 HOTFIX */
(() => {
  let hooked=false;
  let lastTabLabels='';

  function safeRelabelTabs(){
    if(typeof st==='undefined')return;
    const names={
      dashboard:'Tổng quan',
      products:`Sản phẩm (${st.products?.length||0})`,
      orders:`Đơn hàng (${st.orders?.length||0})`,
      notices:'Cấu hình VietQR',
      categories:'Danh mục',
      users:'Người dùng',
      topups:'Nạp tiền',
      codes:'Gift code',
      tasks:'Nhiệm vụ',
      support:'Hỗ trợ',
      security:'Bảo mật',
      appinfo:'Ứng dụng'
    };
    const sig=JSON.stringify(names);
    if(sig===lastTabLabels)return;
    lastTabLabels=sig;
    document.querySelectorAll('.tab').forEach(b=>{
      const v=names[b.dataset.tab];
      if(v && b.textContent!==v)b.textContent=v;
    });
  }

  function fixProductModal(){
    if(!window.ADMStudio)return;
    const products=document.getElementById('products');
    if(!products)return;

    const grid=products.querySelector('.grid2');
    if(!grid)return;

    let modal=document.querySelector('.adm-product-form-modal');
    let form=grid.querySelector(':scope > .item');

    if(!modal && form){
      modal=document.createElement('div');
      modal.className='adm-product-form-modal hidden';
      modal.innerHTML=`<div class="adm-form-shell">
        <button class="btn ghost" style="float:right" type="button" onclick="ADMStudio.closeProductForm()">×</button>
        <div class="adm-form-slot"></div>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.adm-form-slot').appendChild(form);
    } else if(modal && form && !modal.querySelector('.adm-form-slot > .item')){
      modal.querySelector('.adm-form-slot').appendChild(form);
    }

    const listWrap=document.getElementById('productList')?.parentElement;
    if(listWrap){
      listWrap.style.display='block';
      listWrap.style.width='100%';
    }
  }

  function replaceIcons(){
    document.querySelectorAll('.adm-icon-btn').forEach(btn=>{
      const title=(btn.getAttribute('title')||'').toLowerCase();
      if(title.includes('sửa'))btn.innerHTML='✎';
      if(title.includes('xóa'))btn.innerHTML='×';
    });
  }

  function safeHook(){
    try{
      safeRelabelTabs();
      fixProductModal();
      replaceIcons();

      if(!hooked){
        hooked=true;
        document.querySelectorAll('.tab').forEach(b=>{
          b.addEventListener('click',()=>{
            document.querySelectorAll('.adm-bottom button').forEach(x=>
              x.classList.toggle('active',x.dataset.admGo===b.dataset.tab)
            );
          });
        });
      }
    }catch(e){
      console.warn('M4X Admin V14.1 hotfix:',e);
    }
  }

  setTimeout(safeHook,150);
  setTimeout(safeHook,800);
  setInterval(safeHook,2500);
})();
