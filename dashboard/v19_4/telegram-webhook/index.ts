import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
const env = (name: string, fallback = "") => Deno.env.get(name) || fallback;
const clip = (v: unknown, n = 3500) => String(v ?? "").trim().slice(0, n);
const money = (n: unknown) => new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + "đ";

function secretKey() {
  const plural = env("SUPABASE_SECRET_KEYS");
  if (plural) { try { const p = JSON.parse(plural); return p.default || Object.values(p)[0] as string; } catch (_) {} }
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}
function adminClient() {
  const url = env("SUPABASE_URL"), key = secretKey();
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function tg(method: string, payload: Record<string, unknown> = {}) {
  const token = env("TELEGRAM_BOT_TOKEN"); if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || `Telegram ${method} lỗi`); return j.result;
}
async function isAdmin(userId: number | string) {
  const owner = env("TELEGRAM_OWNER_ID").trim(); if (owner && String(userId) === owner) return true;
  const { data } = await adminClient().from("telegram_admins").select("active").eq("telegram_user_id", String(userId)).maybeSingle();
  return !!data?.active;
}
function botUsername() { return env("TELEGRAM_BOT_USERNAME").replace(/^@/, ""); }
function miniAppUrl() { return env("TELEGRAM_MINIAPP_URL", "https://m4x-store.pages.dev").replace(/\/$/, ""); }
function channelUrl() { return env("TELEGRAM_CHANNEL_URL"); }
function directStoreLink(start = "store") { const u = botUsername(); return u ? `https://t.me/${u}?startapp=${encodeURIComponent(start)}` : miniAppUrl(); }
async function audit(userId: number | string, action: string, details: Record<string, unknown> = {}) {
  try { await adminClient().from("telegram_admin_audit").insert({ telegram_user_id: String(userId), action, details }); } catch (_) {}
}

async function storeControl() {
  const sb = adminClient();
  const { data } = await sb.from("m4x_store_control").select("*").eq("id", "main").maybeSingle();
  return data || { purchases_enabled: true };
}
function adminMenu(enabled = true) {
  return { inline_keyboard: [
    [{ text: "📦 Kho", callback_data: "adm:inventory" }, { text: "🧾 Đơn", callback_data: "adm:orders" }],
    [{ text: "🔥 Sale", callback_data: "adm:sale" }, { text: "✨ Hero", callback_data: "adm:hero" }],
    [{ text: "🔔 Thông báo", callback_data: "adm:notice" }, { text: enabled ? "🚫 Tắt mua hàng" : "✅ Bật mua hàng", callback_data: "adm:purchase" }],
    [{ text: "🛍 Đăng Store", callback_data: "adm:poststore" }, { text: "🔄 Cập nhật kho", callback_data: "adm:stock_sync" }],
    [{ text: "⚙️ Mở Admin", web_app: { url: `${miniAppUrl()}/telegram-admin.html` } }],
  ] };
}
async function sendAdminMenu(chatId: number | string, note = "") {
  const c = await storeControl();
  const text = `🤖 M4X ADMIN BOT\n\n${note ? note + "\n\n" : ""}Chọn tác vụ bên dưới.\n🛒 Mua hàng: ${c.purchases_enabled === false ? "🔴 ĐANG KHÓA" : "🟢 ĐANG MỞ"}`;
  return tg("sendMessage", { chat_id: chatId, text, reply_markup: adminMenu(c.purchases_enabled !== false), disable_web_page_preview: true });
}
async function sendPrivate(chatId: number | string, text: string) {
  const rows: any[] = [[{ text: "🚀 MỞ M4X STORE", web_app: { url: miniAppUrl() } }]];
  if (channelUrl()) rows.push([{ text: "📢 KÊNH M4X", url: channelUrl() }]);
  return tg("sendMessage", { chat_id: chatId, text, reply_markup: { inline_keyboard: rows } });
}
async function answerCallback(id: string, text = "") { try { await tg("answerCallbackQuery", { callback_query_id: id, text: clip(text, 180) }); } catch (_) {} }
async function setSession(userId: number | string, state: string, payload: any = {}) {
  await adminClient().from("telegram_admin_sessions").upsert({ telegram_user_id: String(userId), state, payload, updated_at: new Date().toISOString() }, { onConflict: "telegram_user_id" });
}
async function getSession(userId: number | string) {
  const { data } = await adminClient().from("telegram_admin_sessions").select("*").eq("telegram_user_id", String(userId)).maybeSingle(); return data || null;
}
async function clearSession(userId: number | string) { try { await adminClient().from("telegram_admin_sessions").delete().eq("telegram_user_id", String(userId)); } catch (_) {} }

function localDateParts() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
  const o: any = {}; for (const p of f.formatToParts(new Date())) if (p.type !== "literal") o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}`;
}

async function inventoryText() {
  const sb = adminClient();
  const [{ data: settings }, { data: rows }] = await Promise.all([
    sb.from("telegram_channel_settings").select("stock_low_threshold").eq("id", "main").maybeSingle(),
    sb.from("products").select("name,stock_mode,stock_limit,sold_count,reserved_count,active").eq("active", true).order("name"),
  ]);
  const threshold = Math.max(1, Number(settings?.stock_low_threshold || 5));
  const limited = (rows || []).filter((p: any) => p.stock_mode === "limited").map((p: any) => ({ ...p, av: Math.max(0, Number(p.stock_limit || 0) - Number(p.sold_count || 0) - Number(p.reserved_count || 0)) }));
  const out = limited.filter((p: any) => p.av === 0), low = limited.filter((p: any) => p.av > 0 && p.av <= threshold);
  const interesting = [...out, ...low].slice(0, 12);
  const lines = interesting.map((p: any) => `${p.av === 0 ? "🔴" : "🟡"} ${clip(p.name, 80)} — ${p.av === 0 ? "HẾT" : `còn ${p.av}`}`);
  return `📦 KHO M4X STORE\n\nSản phẩm giới hạn: ${limited.length}\n🟡 Sắp hết (≤${threshold}): ${low.length}\n🔴 Hết hàng: ${out.length}${lines.length ? `\n\n${lines.join("\n")}` : "\n\n✅ Chưa có sản phẩm sắp hết."}`;
}

async function ordersText() {
  const sb = adminClient();
  const date = localDateParts();
  const start = new Date(`${date}T00:00:00+07:00`); const end = new Date(start.getTime() + 86400000);
  const [paidQ, pendingQ, reviewQ, recentQ] = await Promise.all([
    sb.from("orders").select("amount").eq("status", "paid").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    sb.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    sb.from("orders").select("*", { count: "exact", head: true }).eq("status", "review").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    sb.from("orders").select("order_code,status,amount,created_at,products(name)").order("created_at", { ascending: false }).limit(5),
  ]);
  const paid = paidQ.data || [], revenue = paid.reduce((a: number, x: any) => a + Number(x.amount || 0), 0);
  const recent = (recentQ.data || []).map((o: any) => `${o.status === "paid" ? "✅" : o.status === "pending" ? "⏳" : "•"} ${clip(o.order_code, 30)} · ${clip(o.products?.name || "Sản phẩm", 55)} · ${money(o.amount)}`);
  return `🧾 ĐƠN HÀNG HÔM NAY\n\n✅ Đã thanh toán: ${paid.length}\n⏳ Đang chờ: ${pendingQ.count || 0}\n⚠️ Review: ${reviewQ.count || 0}\n💰 Doanh thu: ${money(revenue)}\n\n5 đơn gần nhất:\n${recent.length ? recent.join("\n") : "Chưa có đơn."}`;
}

async function heroInfo(kind: "sale" | "hero") {
  const sb = adminClient(); const { data: h } = await sb.from("store_hero_settings").select("*").eq("id", "main").maybeSingle();
  if (!h) return { text: "Chưa có cấu hình Hero.", markup: { inline_keyboard: [[{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
  if (kind === "sale") {
    const isPromo = String(h.variant || "") === "promo";
    const txt = `🔥 FLASH SALE\n\nTrạng thái: ${isPromo && h.enabled ? "🟢 Đang chạy" : "⚪ Chưa chạy"}\nTiêu đề: ${clip(h.title || h.accent_text || "-", 180)}\nKết thúc: ${h.ends_at ? new Date(h.ends_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "-"}`;
    return { text: txt, markup: { inline_keyboard: [[{ text: "📢 Đăng Sale", callback_data: "adm:sale_post" }, { text: "⛔ Tắt Sale", callback_data: "adm:sale_off" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
  }
  const txt = `✨ HERO M4X STORE\n\nTrạng thái: ${h.enabled ? "🟢 Bật" : "⚪ Tắt"}\nKiểu: ${clip(h.variant || "custom", 30)}\nTiêu đề: ${clip(h.title || h.accent_text || "-", 180)}`;
  return { text: txt, markup: { inline_keyboard: [[{ text: h.enabled ? "⏸ Tắt Hero" : "▶️ Bật Hero", callback_data: "adm:hero_toggle" }, { text: "📢 Đăng Hero", callback_data: "adm:hero_post" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
}

async function enqueueHero(source: string) {
  const sb = adminClient(); const { data: h } = await sb.from("store_hero_settings").select("*").eq("id", "main").maybeSingle();
  if (!h) throw new Error("Chưa có Hero để đăng.");
  const { error } = await sb.from("telegram_channel_queue").insert({ event_type: "hero", dedupe_key: `${source}:${Date.now()}:${crypto.randomUUID()}`, payload: h, status: "pending", available_at: new Date().toISOString() });
  if (error) throw error;
}
async function enqueueSimple(eventType: string, source: string) {
  const { error } = await adminClient().from("telegram_channel_queue").insert({ event_type: eventType, dedupe_key: `${source}:${Date.now()}:${crypto.randomUUID()}`, payload: { source: "telegram-admin-bot" }, status: "pending", available_at: new Date().toISOString() });
  if (error) throw error;
}

async function processNotice(chatId: number | string, userId: number | string, raw: string) {
  const sb = adminClient();
  const parts = raw.split(/\n+/); let title = "Thông báo từ M4X", body = raw;
  if (parts.length > 1 && parts[0].trim().length <= 100) { title = parts.shift()!.trim() || title; body = parts.join("\n").trim(); }
  body = clip(body, 2500); if (!body) throw new Error("Nội dung thông báo đang trống.");
  try { await sb.from("notifications").insert({ user_id: null, title: clip(title, 140), body, type: "system", reference: "telegram-admin-bot" }); } catch (_) {}
  const channel = env("TELEGRAM_CHANNEL_ID");
  if (channel) await tg("sendMessage", { chat_id: channel, text: `📢 ${clip(title, 140)}\n\n${body}`, reply_markup: { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url: directStoreLink("notice") }]] }, disable_web_page_preview: true });
  await clearSession(userId); await audit(userId, "bot_publish_notice", { title });
  await tg("sendMessage", { chat_id: chatId, text: "✅ Đã phát thông báo lên M4X Store/Channel." });
  await sendAdminMenu(chatId);
}

async function handleCallback(q: any) {
  const userId = q?.from?.id, chatId = q?.message?.chat?.id, data = String(q?.data || "");
  if (!userId || !chatId || !await isAdmin(userId)) { await answerCallback(q.id, "Không có quyền Admin"); return; }
  try {
    if (data === "adm:home") { await answerCallback(q.id); await sendAdminMenu(chatId); return; }
    if (data === "adm:inventory") { await answerCallback(q.id); await tg("sendMessage", { chat_id: chatId, text: await inventoryText(), reply_markup: { inline_keyboard: [[{ text: "🔄 Cập nhật bài tồn kho", callback_data: "adm:stock_sync" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } }); return; }
    if (data === "adm:orders") { await answerCallback(q.id); await tg("sendMessage", { chat_id: chatId, text: await ordersText(), reply_markup: { inline_keyboard: [[{ text: "↩️ Menu", callback_data: "adm:home" }]] } }); return; }
    if (data === "adm:sale" || data === "adm:hero") { await answerCallback(q.id); const info = await heroInfo(data.endsWith("sale") ? "sale" : "hero"); await tg("sendMessage", { chat_id: chatId, text: info.text, reply_markup: info.markup }); return; }
    if (data === "adm:sale_post") { await enqueueHero("bot-sale"); await audit(userId, "bot_sale_post"); await answerCallback(q.id, "Đã đưa Sale vào hàng đợi"); await tg("sendMessage", { chat_id: chatId, text: "✅ Sale sẽ được đăng lên Channel trong khoảng 1 phút." }); return; }
    if (data === "adm:sale_off") { const sb = adminClient(); const { data: h } = await sb.from("store_hero_settings").select("variant").eq("id", "main").maybeSingle(); if (String(h?.variant || "") === "promo") await sb.from("store_hero_settings").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", "main"); await audit(userId, "bot_sale_off"); await answerCallback(q.id, "Đã tắt Sale"); await tg("sendMessage", { chat_id: chatId, text: "⛔ Đã tắt Flash Sale/Hero promo." }); return; }
    if (data === "adm:hero_toggle") { const sb = adminClient(); const { data: h } = await sb.from("store_hero_settings").select("enabled").eq("id", "main").maybeSingle(); const next = !h?.enabled; await sb.from("store_hero_settings").update({ enabled: next, updated_at: new Date().toISOString() }).eq("id", "main"); await audit(userId, "bot_hero_toggle", { enabled: next }); await answerCallback(q.id, next ? "Đã bật Hero" : "Đã tắt Hero"); await tg("sendMessage", { chat_id: chatId, text: next ? "✅ Hero đã bật." : "⏸ Hero đã tắt." }); return; }
    if (data === "adm:hero_post") { await enqueueHero("bot-hero"); await audit(userId, "bot_hero_post"); await answerCallback(q.id, "Đã đưa Hero vào hàng đợi"); return; }
    if (data === "adm:notice") { await setSession(userId, "await_notice"); await answerCallback(q.id); await tg("sendMessage", { chat_id: chatId, text: "🔔 GỬI THÔNG BÁO\n\nHãy gửi tin nhắn tiếp theo theo dạng:\nTiêu đề\nNội dung thông báo\n\nHoặc chỉ gửi nội dung. Gõ /cancel để hủy." }); return; }
    if (data === "adm:purchase") {
      const c = await storeControl();
      if (c.purchases_enabled === false) {
        await adminClient().from("m4x_store_control").update({ purchases_enabled: true, updated_by: String(userId), updated_at: new Date().toISOString() }).eq("id", "main");
        await audit(userId, "bot_purchase_unlock"); await answerCallback(q.id, "Đã mở mua hàng"); await sendAdminMenu(chatId, "✅ Đã BẬT lại mua hàng.");
      } else {
        await answerCallback(q.id); await tg("sendMessage", { chat_id: chatId, text: "⚠️ Xác nhận khóa toàn bộ đơn mua mới?", reply_markup: { inline_keyboard: [[{ text: "🚫 XÁC NHẬN KHÓA", callback_data: "adm:purchase_off_confirm" }], [{ text: "Hủy", callback_data: "adm:home" }]] } });
      }
      return;
    }
    if (data === "adm:purchase_off_confirm") {
      await adminClient().from("m4x_store_control").update({ purchases_enabled: false, purchase_lock_reason: "M4X STORE đang tạm khóa mua hàng. Vui lòng quay lại sau.", updated_by: String(userId), updated_at: new Date().toISOString() }).eq("id", "main");
      await audit(userId, "bot_purchase_lock"); await answerCallback(q.id, "Đã khóa mua hàng"); await sendAdminMenu(chatId, "🚫 Đã TẮT mua hàng. Mọi đơn mới sẽ bị chặn ở database."); return;
    }
    if (data === "adm:poststore") { await enqueueSimple("manual_store", "bot-store"); await audit(userId, "bot_post_store"); await answerCallback(q.id, "Đã đưa vào hàng đợi"); await tg("sendMessage", { chat_id: chatId, text: "✅ Store sẽ được đăng lên Channel trong khoảng 1 phút." }); return; }
    if (data === "adm:stock_sync") { await enqueueSimple("stock_sync", "bot-stock"); await audit(userId, "bot_stock_sync"); await answerCallback(q.id, "Đã yêu cầu cập nhật kho"); await tg("sendMessage", { chat_id: chatId, text: "✅ Đã yêu cầu cập nhật tin tồn kho." }); return; }
    await answerCallback(q.id, "Tác vụ không hợp lệ");
  } catch (e) {
    await answerCallback(q.id, e instanceof Error ? e.message : String(e));
    await tg("sendMessage", { chat_id: chatId, text: `❌ ${clip(e instanceof Error ? e.message : String(e), 1000)}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const expected = env("TELEGRAM_WEBHOOK_SECRET");
  if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected) return json({ ok: false, error: "Webhook secret sai" }, 403);
  try {
    const u = await req.json();
    if (u.callback_query) { await handleCallback(u.callback_query); return json({ ok: true }); }
    const m = u.message || u.edited_message || u.channel_post; if (!m) return json({ ok: true });
    const chat = m.chat || {}, from = m.from || {}, raw = String(m.text || "").trim(), cmd = (raw.split(/\s+/)[0] || "").split("@")[0].toLowerCase();

    if (cmd === "/id") { await tg("sendMessage", { chat_id: chat.id, text: `Telegram ID của bạn: ${from.id || chat.id}` }); return json({ ok: true }); }
    if (cmd === "/start" || cmd === "/app") {
      if (chat.type === "private") await sendPrivate(chat.id, "🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\nMở cửa hàng trực tiếp trong Telegram.");
      else await tg("sendMessage", { chat_id: chat.id, text: "🛍 M4X STORE", reply_markup: { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url: directStoreLink("chat") }]] } });
      return json({ ok: true });
    }

    const admin = from.id && await isAdmin(from.id);
    if (cmd === "/admin" || cmd === "/menu" || cmd === "/manage") {
      if (!admin || chat.type !== "private") return json({ ok: true });
      await clearSession(from.id); await sendAdminMenu(chat.id); return json({ ok: true });
    }
    if (cmd === "/cancel") {
      if (admin) { await clearSession(from.id); await tg("sendMessage", { chat_id: chat.id, text: "✅ Đã hủy thao tác." }); await sendAdminMenu(chat.id); }
      return json({ ok: true });
    }
    if (cmd === "/status") {
      if (!admin) return json({ ok: true }); const info = await tg("getWebhookInfo"); const c = await storeControl();
      await tg("sendMessage", { chat_id: chat.id, text: `✅ M4X Bot online\nWebhook: ${info.url || "-"}\nPending: ${info.pending_update_count || 0}\nMua hàng: ${c.purchases_enabled === false ? "KHÓA" : "MỞ"}\nBot: @${botUsername() || "-"}` }); return json({ ok: true });
    }
    if (cmd === "/poststore") {
      if (!admin) return json({ ok: true }); await enqueueSimple("manual_store", "cmd-store"); await tg("sendMessage", { chat_id: chat.id, text: "✅ Đã đưa bài Store vào hàng đợi." }); return json({ ok: true });
    }

    if (admin && chat.type === "private" && raw) {
      const session = await getSession(from.id);
      if (session?.state === "await_notice") { await processNotice(chat.id, from.id, raw); return json({ ok: true }); }
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e); return json({ ok: true, error: e instanceof Error ? e.message : String(e) });
  }
});
