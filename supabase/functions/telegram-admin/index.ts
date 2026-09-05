import { adminClient, audit, botUsername, channelUrl, corsHeaders, directMiniAppLink, env, isTelegramAdmin, json, miniAppUrl, telegramApi, validateInitData } from "../_shared/telegram.ts";

const actions = new Set(["none","search","community","account","topup","url"]);
const text = (v:unknown,n=1200) => String(v ?? "").trim().slice(0,n);
const url = (v:unknown) => { const s=text(v,2000); if(!s)return null; try { const u=new URL(s); return /^https?:$/.test(u.protocol)?u.href:null; } catch { return null; } };
const iso = (v:unknown) => { if(!v)return null; const d=new Date(String(v)); return isNaN(d.getTime())?null:d.toISOString(); };
const hm = (v:unknown,fallback:string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):fallback;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (req.method !== "POST") return json({ok:false,error:"Method not allowed"},405);
  try {
    const body=await req.json(), initData=String(body?.initData||""), action=String(body?.action||""), p=body?.payload||{};
    const { user }=await validateInitData(initData);
    if(!await isTelegramAdmin(user.id)) return json({ok:false,error:"Không có quyền Admin Telegram."},403);
    const sb=adminClient();

    if(action==="bootstrap"){
      const [{data:hero},{data:release},{data:channelAuto}] = await Promise.all([
        sb.from("store_hero_settings").select("*").eq("id","main").maybeSingle(),
        sb.from("store_app_release").select("*").eq("id","main").maybeSingle(),
        sb.from("telegram_channel_settings").select("*").eq("id","main").maybeSingle()
      ]);
      return json({ok:true,is_admin:true,user,hero:hero||{enabled:false},release:release||null,channel_automation:channelAuto||null,bot_username:botUsername(),miniapp_url:miniAppUrl(),channel_url:channelUrl()});
    }

    if(action==="save_hero"){
      const primary=actions.has(String(p.primary_action))?String(p.primary_action):"none";
      const secondary=actions.has(String(p.secondary_action))?String(p.secondary_action):"none";
      const starts=iso(p.starts_at), ends=iso(p.ends_at);
      if(starts&&ends&&new Date(ends)<=new Date(starts)) throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
      const row={id:"main",enabled:!!p.enabled,variant:["custom","promo"].includes(String(p.variant))?String(p.variant):"custom",eyebrow:text(p.eyebrow,180)||null,title:text(p.title,260)||null,accent_text:text(p.accent_text,120)||null,description:text(p.description,1800)||null,primary_button_text:text(p.primary_button_text,120)||null,primary_action:primary,primary_url:primary==="url"?url(p.primary_url):null,secondary_button_text:text(p.secondary_button_text,120)||null,secondary_action:secondary,secondary_url:secondary==="url"?url(p.secondary_url):null,image_url:url(p.image_url),starts_at:starts,ends_at:ends,show_countdown:!!p.show_countdown,auto_restore:p.auto_restore!==false,updated_at:new Date().toISOString()};
      const {data,error}=await sb.from("store_hero_settings").upsert(row,{onConflict:"id"}).select("*").single(); if(error)throw error;
      await audit(user.id,"save_hero",{variant:row.variant,enabled:row.enabled});
      return json({ok:true,hero:data});
    }

    if(action==="restore_hero"){
      const {data,error}=await sb.from("store_hero_settings").update({enabled:false,updated_at:new Date().toISOString()}).eq("id","main").select("*").single(); if(error)throw error;
      await audit(user.id,"restore_hero"); return json({ok:true,hero:data});
    }

    if(action==="save_release"){
      const {data:cur}=await sb.from("store_app_release").select("*").eq("id","main").maybeSingle();
      const build=Math.max(1,Math.floor(Number(p.build||cur?.build||1900)));
      const row={id:"main",version:text(p.version,40)||String(cur?.version||"19.0.0"),build,message:text(p.message,1000)||"M4X Store đã có bản cập nhật mới.",mandatory:!!p.mandatory,auto_reload:!!p.auto_reload,force_reload_token:p.bump_token?crypto.randomUUID():String(cur?.force_reload_token||crypto.randomUUID()),updated_at:new Date().toISOString()};
      const {data,error}=await sb.from("store_app_release").upsert(row,{onConflict:"id"}).select("*").single(); if(error)throw error;
      await audit(user.id,"save_release",{build:row.build,version:row.version,bump:!!p.bump_token}); return json({ok:true,release:data});
    }

    if(action==="save_channel_automation"){
      const row={
        id:"main",enabled:p.enabled!==false,timezone:"Asia/Ho_Chi_Minh",daily_enabled:p.daily_enabled!==false,
        daily_time_1:hm(p.daily_time_1,"08:00"),daily_time_2:hm(p.daily_time_2,"20:00"),
        new_product_enabled:p.new_product_enabled!==false,hero_enabled:p.hero_enabled!==false,
        online_update_enabled:p.online_update_enabled!==false,repost_enabled:!!p.repost_enabled,
        repost_days:Math.max(1,Math.min(30,Math.floor(Number(p.repost_days||3)))),updated_at:new Date().toISOString()
      };
      const {data,error}=await sb.from("telegram_channel_settings").upsert(row,{onConflict:"id"}).select("*").single(); if(error)throw error;
      await audit(user.id,"save_channel_automation",row);
      return json({ok:true,channel_automation:data});
    }

    if(action==="channel_automation_status"){
      const [{data:cfg},{count:pending},{count:failed},{data:lastPost}] = await Promise.all([
        sb.from("telegram_channel_settings").select("*").eq("id","main").maybeSingle(),
        sb.from("telegram_channel_queue").select("*",{count:"exact",head:true}).eq("status","pending"),
        sb.from("telegram_channel_queue").select("*",{count:"exact",head:true}).eq("status","failed"),
        sb.from("telegram_channel_posts").select("event_type,posted_at,telegram_message_id").order("posted_at",{ascending:false}).limit(1).maybeSingle()
      ]);
      return json({ok:true,config:cfg,pending:pending||0,failed:failed||0,last_post:lastPost||null});
    }

    if(action==="bot_status"){
      const webhook=await telegramApi("getWebhookInfo"); return json({ok:true,webhook});
    }

    if(action==="publish_channel"){
      const chatId=env("TELEGRAM_CHANNEL_ID"); if(!chatId)throw new Error("Chưa đặt TELEGRAM_CHANNEL_ID trong Supabase Secrets.");
      const result=await telegramApi("sendMessage",{chat_id:chatId,text:"🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\nMở cửa hàng trực tiếp trong Telegram.",reply_markup:{inline_keyboard:[[{text:"🚀 MỞ M4X STORE",url:directMiniAppLink("channel")}]]}});
      try{await sb.from("telegram_channel_posts").insert({event_type:"manual_store",dedupe_key:`manual:${result?.message_id||crypto.randomUUID()}`,telegram_message_id:Number(result?.message_id||0)||null,payload:{source:"telegram-admin"}});}catch(_){ }
      await audit(user.id,"publish_channel",{chat_id:chatId,message_id:result?.message_id}); return json({ok:true,message:"Đã đăng nút M4X Store lên Channel.",result});
    }

    return json({ok:false,error:"Action không hợp lệ."},400);
  } catch(e){ return json({ok:false,error:e instanceof Error?e.message:String(e)},400); }
});
