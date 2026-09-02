import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  try{
    const {product_id,quantity=1,customer_contact=null}=await req.json()
    if(!product_id) throw new Error('Thiếu product_id')
    const url=Deno.env.get('SUPABASE_URL')!
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb=createClient(url,key,{auth:{persistSession:false}})
    const {data,error}=await sb.rpc('create_pending_order',{p_product_id:product_id,p_quantity:Number(quantity),p_contact:customer_contact})
    if(error) throw error
    return Response.json(data,{headers:{...cors,'Cache-Control':'no-store'}})
  }catch(e){return Response.json({error:e.message||'Không tạo được đơn'},{status:400,headers:cors})}
})
