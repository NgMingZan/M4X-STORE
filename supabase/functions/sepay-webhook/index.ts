import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function hex(bytes:ArrayBuffer){
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
function constantTime(a:string,b:string){
  if(a.length!==b.length)return false
  let x=0
  for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i)
  return x===0
}
async function verifyHmac(raw:string,timestamp:string,signature:string,secret:string){
  if(!timestamp||!signature||!secret)return false
  const ts=Number(timestamp)
  if(!Number.isFinite(ts)||Math.abs(Math.floor(Date.now()/1000)-ts)>300)return false
  const key=await crypto.subtle.importKey(
    'raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']
  )
  const mac=await crypto.subtle.sign(
    'HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)
  )
  return constantTime(`sha256=${hex(mac)}`,signature)
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST') return new Response('Method not allowed',{status:405})

    const raw=await req.text()
    const secret=Deno.env.get('SEPAY_WEBHOOK_SECRET')||''
    const sig=req.headers.get('X-SePay-Signature')||''
    const ts=req.headers.get('X-SePay-Timestamp')||''

    if(!await verifyHmac(raw,ts,sig,secret)){
      return Response.json({success:false,message:'Invalid signature'},{status:401})
    }

    const p=JSON.parse(raw)
    if(p.transferType!=='in') return Response.json({success:true,ignored:'not_incoming'})

    const expectedAccount=(Deno.env.get('M4X_BANK_ACCOUNT')||'').replace(/\s/g,'')
    const receivedAccount=String(p.accountNumber||'').replace(/\s/g,'')
    if(!expectedAccount||receivedAccount!==expectedAccount){
      return Response.json({success:true,ignored:'wrong_account'})
    }

    const transactionId=String(p.id||'')
    const amount=Number(p.transferAmount||0)
    if(!transactionId||!Number.isFinite(amount)||amount<=0){
      return Response.json({success:true,ignored:'invalid_payload'})
    }

    const source=`${p.code||''} ${p.content||''}`.toUpperCase()
    const topup=source.match(/\bNAP[A-Z0-9]{10}\b/)?.[0] || null
    const order=source.match(/\bM4X[A-F0-9]{10}\b/)?.[0] || null

    const sb=createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {auth:{persistSession:false}}
    )

    if(topup){
      const {data,error}=await sb.rpc('process_wallet_topup',{
        p_transaction_id:transactionId,
        p_topup_code:topup,
        p_amount:Math.round(amount),
        p_content:String(p.content||''),
        p_account:receivedAccount,
        p_raw:p
      })
      if(error)throw error
      return Response.json({success:true,type:'wallet_topup',code:topup,data})
    }

    if(order){
      const {data,error}=await sb.rpc('process_sepay_payment',{
        p_transaction_id:transactionId,
        p_order_code:order,
        p_amount:Math.round(amount),
        p_content:String(p.content||''),
        p_account:receivedAccount,
        p_raw:p
      })
      if(error)throw error
      return Response.json({success:true,type:'order_payment',code:order,data})
    }

    return Response.json({success:true,ignored:'no_m4x_code'})
  }catch(e){
    console.error(e)
    return Response.json({success:false,message:e?.message||'Server error'},{status:500})
  }
})
