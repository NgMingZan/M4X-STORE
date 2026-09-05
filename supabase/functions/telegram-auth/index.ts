import { adminClient, corsHeaders, env, isTelegramAdmin, json, miniAppUrl, channelUrl, botUsername, validateInitData } from "../_shared/telegram.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok:false, error:"Method not allowed" }, 405);
  try {
    const body = await req.json();
    const { user } = await validateInitData(String(body?.initData || ""));
    const sb = adminClient();
    await sb.from("telegram_users").upsert({
      telegram_user_id:String(user.id), username:user.username || null, first_name:user.first_name || null,
      last_name:user.last_name || null, language_code:user.language_code || null, photo_url:user.photo_url || null,
      allows_write_to_pm:!!user.allows_write_to_pm, last_seen_at:new Date().toISOString()
    }, { onConflict:"telegram_user_id" });
    const isAdmin = await isTelegramAdmin(user.id);
    const { data: release } = await sb.from("store_app_release").select("version,build").eq("id","main").maybeSingle();
    return json({ ok:true, user, is_admin:isAdmin, bot_username:botUsername(), miniapp_url:miniAppUrl(), channel_url:channelUrl(), release:release || null });
  } catch (e) { return json({ ok:false, error:e instanceof Error ? e.message : String(e) }, 401); }
});
