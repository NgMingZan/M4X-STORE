import { adminClient, directMiniAppLink, env, json, telegramApi } from "../_shared/telegram.ts";

type Settings = {
  enabled:boolean; timezone:string; daily_enabled:boolean; daily_time_1:string; daily_time_2:string;
  new_product_enabled:boolean; hero_enabled:boolean; online_update_enabled:boolean;
  repost_enabled:boolean; repost_days:number; worker_secret_hash:string|null;
};

const enc = new TextEncoder();
const fmtMoney = (n:unknown) => new Intl.NumberFormat('vi-VN').format(Number(n||0)) + 'đ';
const clip = (v:unknown,n:number) => String(v??'').trim().slice(0,n);
const escMd = (s:string) => s.replace(/([_*\[\]()~`>#+\-=|{}.!])/g,'\\$1');

async function sha256Hex(s:string){
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function safeUrl(v:unknown){ try{ const u=new URL(String(v||'')); return /^https?:$/.test(u.protocol)?u.href:null; }catch{return null;} }
function timeHM(v:unknown){ const m=String(v||'').match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:'00:00'; }
function localParts(date:Date,tz:string){
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const o:any={}; for(const p of f.formatToParts(date)) if(p.type!=='literal')o[p.type]=p.value;
  return {date:`${o.year}-${o.month}-${o.day}`,hm:`${o.hour}:${o.minute}`,minute:Number(o.hour)*60+Number(o.minute)};
}
function hmMinutes(hm:string){ const [h,m]=hm.split(':').map(Number); return (h||0)*60+(m||0); }
function dueWithin(nowMin:number,target:string,windowMin=10){ const t=hmMinutes(target); return nowMin>=t && nowMin<=t+windowMin; }
function enabledFor(s:Settings,t:string){
  if(t==='new_product')return !!s.new_product_enabled;
  if(t==='hero')return !!s.hero_enabled;
  if(t==='online_update')return !!s.online_update_enabled;
  if(t==='daily_store')return !!s.daily_enabled;
  if(t==='repost_store')return !!s.repost_enabled;
  return true;
}

async function enqueue(sb:any,event_type:string,dedupe_key:string,payload:any={}){
  const {error}=await sb.from('telegram_channel_queue').insert({event_type,dedupe_key,payload,status:'pending',available_at:new Date().toISOString()});
  if(error && !String(error.code||'').includes('23505')){
    const msg=String(error.message||error); if(!/duplicate key/i.test(msg)) throw error;
  }
}

async function ensureScheduled(sb:any,s:Settings){
  if(!s.enabled)return;
  const now=new Date(), lp=localParts(now,s.timezone||'Asia/Ho_Chi_Minh');
  if(s.daily_enabled){
    for(const raw of [s.daily_time_1,s.daily_time_2]){
      const hm=timeHM(raw); if(dueWithin(lp.minute,hm,10)) await enqueue(sb,'daily_store',`daily:${lp.date}:${hm}`,{date:lp.date,time:hm});
    }
  }
  if(s.repost_enabled){
    const {data:last}=await sb.from('telegram_channel_posts').select('posted_at').in('event_type',['daily_store','repost_store','manual_store']).order('posted_at',{ascending:false}).limit(1).maybeSingle();
    const days=Math.max(1,Math.min(30,Number(s.repost_days||3)));
    const due=!last?.posted_at || Date.now()-new Date(last.posted_at).getTime()>=days*86400000;
    if(due) await enqueue(sb,'repost_store',`repost:${lp.date}`,{days});
  }
}

function button(start='channel'){ return {inline_keyboard:[[{text:'🚀 MỞ M4X STORE',url:directMiniAppLink(start)}]]}; }

async function sendText(chatId:string,text:string,start='channel'){
  return telegramApi('sendMessage',{chat_id:chatId,text,reply_markup:button(start),disable_web_page_preview:true});
}
async function sendPhotoOrText(chatId:string,image:string|null,caption:string,start='channel'){
  if(image){
    try{return await telegramApi('sendPhoto',{chat_id:chatId,photo:image,caption:clip(caption,1000),reply_markup:button(start)});}catch(e){console.warn('sendPhoto fallback',e);}
  }
  return sendText(chatId,clip(caption,3900),start);
}

async function renderAndSend(chatId:string,row:any){
  const p=row.payload||{};
  if(row.event_type==='daily_store'){
    return sendText(chatId,'🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\n✨ Mở Store để xem sản phẩm mới và ưu đãi hôm nay.','daily');
  }
  if(row.event_type==='repost_store'){
    return sendText(chatId,'📌 M4X STORE\n\nKho sản phẩm số của M4X vẫn đang mở 24/7.\nTheme • App • AI • Tool • Premium','repost');
  }
  if(row.event_type==='new_product'){
    const name=clip(p.name,180)||'Sản phẩm mới';
    const price=fmtMoney(p.price);
    const old=Number(p.old_price||0)>Number(p.price||0)?`\nGiá cũ: ${fmtMoney(p.old_price)}`:'';
    const desc=clip(p.description,520);
    const text=`🆕 SẢN PHẨM MỚI\n\n${name}\n💰 ${price}${old}${desc?`\n\n${desc}`:''}`;
    return sendPhotoOrText(chatId,safeUrl(p.cover_url),text,'new-product');
  }
  if(row.event_type==='hero'){
    const title=[clip(p.title,180),clip(p.accent_text,80)].filter(Boolean).join(' ');
    const end=p.ends_at?new Date(p.ends_at):null;
    const endText=end&&!isNaN(end.getTime())?`\n⏰ Kết thúc: ${end.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`:'';
    const text=`${p.variant==='promo'?'🔥':'✨'} ${clip(p.eyebrow,140)||'M4X STORE'}\n\n${title||'Ưu đãi mới'}${p.description?`\n\n${clip(p.description,650)}`:''}${endText}`;
    return sendPhotoOrText(chatId,safeUrl(p.image_url),text,'hero');
  }
  if(row.event_type==='online_update'){
    const text=`🚀 M4X STORE CÓ BẢN CẬP NHẬT MỚI\n\nPhiên bản: ${clip(p.version,40)||'-'} · Build ${Number(p.build||0)}\n\n${clip(p.message,900)||'Mở Store để cập nhật phiên bản mới nhất.'}${p.mandatory?'\n\n⚠️ Đây là bản cập nhật bắt buộc.':''}`;
    return sendText(chatId,text,'update');
  }
  return sendText(chatId,'🛍 M4X STORE\n\nMở cửa hàng trực tiếp trong Telegram.','manual');
}

async function processQueue(sb:any,s:Settings){
  const chatId=env('TELEGRAM_CHANNEL_ID'); if(!chatId) throw new Error('Thiếu TELEGRAM_CHANNEL_ID');
  const {data:rows,error}=await sb.from('telegram_channel_queue').select('*').eq('status','pending').lte('available_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(12);
  if(error)throw error;
  let sent=0,skipped=0,failed=0;
  for(const row of rows||[]){
    if(!s.enabled || !enabledFor(s,row.event_type)){
      await sb.from('telegram_channel_queue').update({status:'skipped',last_error:'Tắt trong cấu hình',updated_at:new Date().toISOString()}).eq('id',row.id); skipped++; continue;
    }
    try{
      const result=await renderAndSend(chatId,row);
      const now=new Date().toISOString();
      await sb.from('telegram_channel_posts').upsert({event_type:row.event_type,dedupe_key:row.dedupe_key,telegram_message_id:Number(result?.message_id||0)||null,payload:row.payload||{},posted_at:now},{onConflict:'dedupe_key'});
      await sb.from('telegram_channel_queue').update({status:'sent',sent_at:now,attempts:Number(row.attempts||0)+1,last_error:null,updated_at:now}).eq('id',row.id);
      sent++;
    }catch(e){
      const attempts=Number(row.attempts||0)+1, msg=clip(e instanceof Error?e.message:String(e),900), terminal=attempts>=3;
      await sb.from('telegram_channel_queue').update({status:terminal?'failed':'pending',attempts,last_error:msg,available_at:new Date(Date.now()+5*60000).toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id);
      failed++;
    }
  }
  return {sent,skipped,failed,total:(rows||[]).length};
}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  try{
    const sb=adminClient();
    const {data:s,error}=await sb.from('telegram_channel_settings').select('*').eq('id','main').single(); if(error)throw error;
    const settings=s as Settings;
    const incoming=req.headers.get('x-m4x-worker-secret')||'';
    if(settings.worker_secret_hash){
      const got=await sha256Hex(incoming); if(got!==settings.worker_secret_hash)return json({ok:false,error:'Worker secret sai'},403);
    }
    await ensureScheduled(sb,settings);
    const result=await processQueue(sb,settings);
    return json({ok:true,...result,at:new Date().toISOString()});
  }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}
});
