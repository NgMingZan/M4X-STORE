import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  try{
    const {order_code,access_token}=await req.json(); if(!order_code||!access_token) throw new Error('Thiếu thông tin đơn')
    const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
    const {data:o,error}=await sb.from('orders').select('status,access_token,products(file_path,delivery_type,name)').eq('order_code',order_code).single()
    if(error||!o||o.access_token!==access_token) return Response.json({error:'Không tìm thấy đơn'},{status:404,headers:cors})
    if(o.status!=='paid') return Response.json({error:'Đơn chưa thanh toán'},{status:403,headers:cors})
    const p=Array.isArray(o.products)?o.products[0]:o.products
    if(p?.delivery_type!=='download'||!p?.file_path) return Response.json({error:'Sản phẩm này không có file tải'},{status:400,headers:cors})
    const expires=600
    const {data,error:se}=await sb.storage.from('products-private').createSignedUrl(p.file_path,expires,{download:true})
    if(se) throw se
    return Response.json({url:data.signedUrl,expires_in:expires,file_name:p.name},{headers:{...cors,'Cache-Control':'no-store'}})
  }catch(e){return Response.json({error:e.message||'Lỗi tạo link tải'},{status:400,headers:cors})}
})
