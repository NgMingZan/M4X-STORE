import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function secretKey() {
  const plural = env("SUPABASE_SECRET_KEYS");
  if (plural) {
    try { return JSON.parse(plural).default || Object.values(JSON.parse(plural))[0] as string; } catch (_) {}
  }
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}

export function adminClient() {
  const url = env("SUPABASE_URL");
  const key = secretKey();
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY trên Edge Function.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const enc = new TextEncoder();
async function hmac(key: Uint8Array, message: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message)));
}
function hex(bytes: Uint8Array) { return [...bytes].map(x => x.toString(16).padStart(2,"0")).join(""); }
function equalHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0; for (let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i); return out === 0;
}

export type TelegramUser = {
  id: number; first_name?: string; last_name?: string; username?: string;
  language_code?: string; photo_url?: string; allows_write_to_pm?: boolean;
};

export async function validateInitData(initData: string, maxAgeSeconds = 86400) {
  if (!initData) throw new Error("Thiếu Telegram initData.");
  const botToken = env("TELEGRAM_BOT_TOKEN");
  if (!botToken) throw new Error("Server chưa có TELEGRAM_BOT_TOKEN.");
  const p = new URLSearchParams(initData);
  const receivedHash = p.get("hash") || "";
  if (!receivedHash) throw new Error("initData không có hash.");
  p.delete("hash");
  const pairs = [...p.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`);
  const dataCheck = pairs.join("\n");
  const secret = await hmac(enc.encode("WebAppData"), botToken);
  const signature = await hmac(secret, dataCheck);
  if (!equalHex(hex(signature), receivedHash.toLowerCase())) throw new Error("Telegram initData không hợp lệ.");
  const authDate = Number(p.get("auth_date") || 0);
  if (!authDate || Math.abs(Math.floor(Date.now()/1000) - authDate) > maxAgeSeconds) throw new Error("Phiên Telegram đã quá hạn. Hãy đóng và mở lại Mini App.");
  let user: TelegramUser | null = null;
  try { user = JSON.parse(p.get("user") || "null"); } catch (_) {}
  if (!user?.id) throw new Error("Không tìm thấy Telegram user.");
  return { user, authDate, queryId: p.get("query_id") || "" };
}

export async function isTelegramAdmin(userId: number | string) {
  const owner = env("TELEGRAM_OWNER_ID").trim();
  if (owner && String(userId) === owner) return true;
  const sb = adminClient();
  const { data } = await sb.from("telegram_admins").select("active").eq("telegram_user_id", String(userId)).maybeSingle();
  return !!data?.active;
}

export function botUsername() { return env("TELEGRAM_BOT_USERNAME").replace(/^@/, ""); }
export function miniAppUrl() { return env("TELEGRAM_MINIAPP_URL", "https://m4x-store.pages.dev").replace(/\/$/, ""); }
export function channelUrl() { return env("TELEGRAM_CHANNEL_URL"); }
export function directMiniAppLink(startapp = "store") {
  const u = botUsername(); return u ? `https://t.me/${u}?startapp=${encodeURIComponent(startapp)}` : miniAppUrl();
}

export async function telegramApi(method: string, payload: Record<string, unknown> = {}) {
  const token = env("TELEGRAM_BOT_TOKEN"); if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || `Telegram ${method} lỗi`); return j.result;
}

export async function audit(userId: number | string, action: string, details: Record<string, unknown> = {}) {
  try { await adminClient().from("telegram_admin_audit").insert({ telegram_user_id:String(userId), action, details }); } catch (_) {}
}


// ===== telegram-channel-worker V19.2 + LIVE STOCK =====
type Settings = {
  enabled:boolean; timezone:string; daily_enabled:boolean; daily_time_1:string; daily_time_2:string;
  new_product_enabled:boolean; hero_enabled:boolean; online_update_enabled:boolean;
  repost_enabled:boolean; repost_days:number; worker_secret_hash:string|null;
  stock_enabled:boolean; stock_alert_enabled:boolean; stock_low_threshold:number; stock_message_id:number|null;
};

const workerEnc = new TextEncoder();
const fmtMoney = (n:unknown) => new Intl.NumberFormat('vi-VN').format(Number(n||0)) + 'đ';
const clip = (v:unknown,n:number) => String(v??'').trim().slice(0,n);
const escMd = (s:string) => s.replace(/([_*\[\]()~`>#+\-=|{}.!])/g,'\\$1');

async function sha256Hex(s:string){
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256',workerEnc.encode(s)));
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
  if(t==='stock_sync')return !!s.stock_enabled;
  if(t==='stock_alert')return !!s.stock_alert_enabled;
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


function availableStock(p:any){
  if(String(p?.stock_mode||'')!=='limited') return Infinity;
  return Math.max(0, Number(p?.stock_limit||0)-Number(p?.sold_count||0)-Number(p?.reserved_count||0));
}
function stockIcon(av:number){
  if(!Number.isFinite(av)) return '♾️';
  if(av<=0) return '🔴';
  if(av<=5) return '🟡';
  return '🟢';
}
async function buildStockText(sb:any,s:Settings){
  const {data,error}=await sb.from('products')
    .select('id,name,active,stock_mode,stock_limit,sold_count,reserved_count')
    .eq('active',true)
    .order('name',{ascending:true});
  if(error) throw error;
  const rows=data||[];
  const threshold=Math.max(1,Math.min(99,Number(s.stock_low_threshold||5)));
  const lines:string[]=['📦 TỒN KHO M4X STORE',''];
  let limited=0,out=0,low=0,unlimited=0;
  for(const p of rows){
    const av=availableStock(p);
    if(!Number.isFinite(av)) unlimited++; else { limited++; if(av<=0)out++; else if(av<=threshold)low++; }
    const qty=Number.isFinite(av)?(av<=0?'HẾT HÀNG':`còn ${av}`):'Không giới hạn';
    const icon=!Number.isFinite(av)?'♾️':av<=0?'🔴':av<=threshold?'🟡':'🟢';
    const line=`${icon} ${clip(p.name,90)} — ${qty}`;
    if((lines.join('\n').length + line.length + 120) > 3800){ lines.push(`… và còn ${Math.max(0,rows.length-(limited+unlimited))} sản phẩm khác.`); break; }
    lines.push(line);
  }
  if(rows.length===0) lines.push('Chưa có sản phẩm đang bán.');
  const stamp=new Intl.DateTimeFormat('vi-VN',{timeZone:s.timezone||'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric',hourCycle:'h23'}).format(new Date());
  lines.push('',`📊 ${rows.length} sản phẩm · 🟡 sắp hết ${low} · 🔴 hết ${out}`,`🕒 Cập nhật: ${stamp}`);
  return lines.join('\n');
}
async function syncStockMessage(sb:any,chatId:string,s:Settings){
  const text=await buildStockText(sb,s);
  const messageId=Number(s.stock_message_id||0);
  if(messageId){
    try{
      const result=await telegramApi('editMessageText',{chat_id:chatId,message_id:messageId,text,reply_markup:button('stock'),disable_web_page_preview:true});
      return result===true?{message_id:messageId}:result;
    }catch(e){
      const msg=String(e instanceof Error?e.message:e);
      if(/message is not modified/i.test(msg)) return {message_id:messageId};
      console.warn('stock edit failed; create new message',msg);
    }
  }
  const result=await telegramApi('sendMessage',{chat_id:chatId,text,reply_markup:button('stock'),disable_web_page_preview:true});
  const newId=Number(result?.message_id||0)||null;
  if(newId){
    await sb.from('telegram_channel_settings').update({stock_message_id:newId,updated_at:new Date().toISOString()}).eq('id','main');
    try{ await telegramApi('pinChatMessage',{chat_id:chatId,message_id:newId,disable_notification:true}); }catch(e){ console.warn('pin stock message skipped',e); }
  }
  return result;
}

async function renderAndSend(sb:any,chatId:string,row:any,s:Settings){
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
  if(row.event_type==='stock_sync'){
    return syncStockMessage(sb,chatId,s);
  }
  if(row.event_type==='stock_alert'){
    const av=Math.max(0,Number(p.available||0));
    const title=String(p.kind||'')==='out'?'🔴 HẾT HÀNG':'⚠️ SẢN PHẨM SẮP HẾT';
    const text=`${title}\n\n${clip(p.name,180)||'Sản phẩm'}\n📦 Còn lại: ${av}\n\nMở M4X Store để kiểm tra kho hiện tại.`;
    return sendText(chatId,text,'stock');
  }
  return sendText(chatId,'🛍 M4X STORE\n\nMở cửa hàng trực tiếp trong Telegram.','manual');
}

async function processQueue(sb:any,s:Settings){
  const chatId=env('TELEGRAM_CHANNEL_ID'); if(!chatId) throw new Error('Thiếu TELEGRAM_CHANNEL_ID');
  const {data:rows,error}=await sb.from('telegram_channel_queue').select('*').eq('status','pending').lte('available_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(12);
  if(error)throw error;
  let sent=0,skipped=0,failed=0;
  const list=rows||[];
  const stockRows=list.filter((x:any)=>x.event_type==='stock_sync');
  const latestStockId=stockRows.length?stockRows[stockRows.length-1].id:null;
  for(const row of list){
    if(row.event_type==='stock_sync' && latestStockId!==null && row.id!==latestStockId){
      await sb.from('telegram_channel_queue').update({status:'skipped',last_error:'Đã gộp vào lần đồng bộ tồn kho mới nhất',updated_at:new Date().toISOString()}).eq('id',row.id); skipped++; continue;
    }
    if(!s.enabled || !enabledFor(s,row.event_type)){
      await sb.from('telegram_channel_queue').update({status:'skipped',last_error:'Tắt trong cấu hình',updated_at:new Date().toISOString()}).eq('id',row.id); skipped++; continue;
    }
    try{
      const result=await renderAndSend(sb,chatId,row,s);
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
  return {sent,skipped,failed,total:list.length};
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
