import { botUsername, channelUrl, corsHeaders, directMiniAppLink, env, isTelegramAdmin, json, miniAppUrl, telegramApi } from "../_shared/telegram.ts";

async function sendPrivate(chatId:number|string,text:string){
  const rows:any[]=[[{text:"🚀 MỞ M4X STORE",web_app:{url:miniAppUrl()}}]];
  if(channelUrl()) rows.push([{text:"📢 KÊNH M4X",url:channelUrl()}]);
  return telegramApi("sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:rows}});
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  const expected=env("TELEGRAM_WEBHOOK_SECRET");
  if(expected && req.headers.get("x-telegram-bot-api-secret-token")!==expected)return json({ok:false,error:"Webhook secret sai"},403);
  try{
    const u=await req.json(); const m=u.message||u.channel_post; if(!m)return json({ok:true});
    const chat=m.chat||{}, from=m.from||{}, raw=String(m.text||"").trim(), cmd=(raw.split(/\s+/)[0]||"").split("@")[0].toLowerCase();
    if(cmd==="/id") { await telegramApi("sendMessage",{chat_id:chat.id,text:`Telegram ID của bạn: ${from.id||chat.id}`}); return json({ok:true}); }
    if(cmd==="/start"||cmd==="/app") { if(chat.type==="private")await sendPrivate(chat.id,"🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\nMở cửa hàng trực tiếp trong Telegram."); else await telegramApi("sendMessage",{chat_id:chat.id,text:"🛍 M4X STORE",reply_markup:{inline_keyboard:[[{text:"🚀 MỞ M4X STORE",url:directMiniAppLink("chat")}]]}}); return json({ok:true}); }
    if(cmd==="/status") { if(!from.id||!await isTelegramAdmin(from.id))return json({ok:true}); const info=await telegramApi("getWebhookInfo"); await telegramApi("sendMessage",{chat_id:chat.id,text:`✅ M4X Bot online\nWebhook: ${info.url||"-"}\nPending: ${info.pending_update_count||0}\nBot: @${botUsername()||"-"}`}); return json({ok:true}); }
    if(cmd==="/poststore") { if(!from.id||!await isTelegramAdmin(from.id))return json({ok:true}); const channel=env("TELEGRAM_CHANNEL_ID"); if(!channel)throw new Error("Thiếu TELEGRAM_CHANNEL_ID"); await telegramApi("sendMessage",{chat_id:channel,text:"🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\nMở ngay trong Telegram.",reply_markup:{inline_keyboard:[[{text:"🚀 MỞ M4X STORE",url:directMiniAppLink("channel")}]]}}); await telegramApi("sendMessage",{chat_id:chat.id,text:"✅ Đã đăng M4X Store lên Channel."}); return json({ok:true}); }
    return json({ok:true});
  }catch(e){console.error(e);return json({ok:true,error:e instanceof Error?e.message:String(e)})}
});
