import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors})
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405,headers:cors})

  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace(/^Bearer\s+/i,'').trim()
    if (!token) return Response.json({error:'Bạn chưa đăng nhập'},{status:401,headers:cors})

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(url,serviceKey,{auth:{persistSession:false}})
    const {data:userData,error:userError} = await sb.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) return Response.json({error:'Phiên đăng nhập không hợp lệ'},{status:401,headers:cors})

    const {order_code,access_token} = await req.json()
    if (!order_code || !access_token) {
      return Response.json({error:'Thiếu thông tin đơn hàng'},{status:400,headers:cors})
    }

    const {data:profile} = await sb.from('profiles').select('role').eq('id',user.id).maybeSingle()
    const isAdmin = profile?.role === 'admin'

    const {data:o,error} = await sb
      .from('orders')
      .select('id,user_id,product_id,status,access_token,products(file_path,delivery_type,name)')
      .eq('order_code',order_code)
      .single()

    if (error || !o) return Response.json({error:'Không tìm thấy đơn'},{status:404,headers:cors})
    if (!isAdmin && o.user_id !== user.id) return Response.json({error:'Bạn không sở hữu đơn hàng này'},{status:403,headers:cors})
    if (o.access_token !== access_token) return Response.json({error:'Mã tải không hợp lệ'},{status:403,headers:cors})
    if (o.status !== 'paid') return Response.json({error:'Đơn không ở trạng thái đã thanh toán'},{status:403,headers:cors})

    const since = new Date(Date.now()-60_000).toISOString()
    const {count} = await sb.from('download_logs')
      .select('*',{count:'exact',head:true})
      .eq('user_id',user.id)
      .gte('created_at',since)

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    const ua = req.headers.get('user-agent') || ''

    if ((count || 0) >= 10) {
      await sb.from('security_events').insert({
        user_id:user.id,
        event_type:'download_rate_limit',
        detail:`Quá 10 lượt tải/phút - ${order_code}`,
        ip
      })
      return Response.json({error:'Bạn tải quá nhanh. Hãy thử lại sau 1 phút.'},{status:429,headers:cors})
    }

    const p = Array.isArray(o.products) ? o.products[0] : o.products
    if (p?.delivery_type !== 'download' || !p?.file_path) {
      return Response.json({error:'Sản phẩm này chưa có file tải'},{status:400,headers:cors})
    }

    const expires = 120
    const {data,error:signError} = await sb.storage
      .from('products-private')
      .createSignedUrl(p.file_path,expires,{download:true})

    if (signError || !data?.signedUrl) throw signError || new Error('Không tạo được signed URL')

    await sb.from('download_logs').insert({
      user_id:user.id,
      order_id:o.id,
      product_id:o.product_id,
      ip,
      user_agent:ua
    })

    return Response.json({
      url:data.signedUrl,
      expires_in:expires,
      file_name:p.name
    },{
      headers:{...cors,'Cache-Control':'no-store'}
    })
  } catch (e) {
    console.error(e)
    return Response.json({error:e?.message || 'Lỗi tạo link tải'},{status:500,headers:cors})
  }
})
