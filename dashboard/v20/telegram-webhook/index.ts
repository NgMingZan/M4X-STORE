// M4X Telegram Admin Bot V20 — Admin + AI Video + AI Theme Translator
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
    if (plural) {
        try {
            const p = JSON.parse(plural);
            return p.default || Object.values(p)[0] as string;
        }
        catch (_) { }
    }
    return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}
function adminClient() {
    const url = env("SUPABASE_URL"), key = secretKey();
    if (!url || !key)
        throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY.");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function tg(method: string, payload: Record<string, unknown> = {}) {
    const token = env("TELEGRAM_BOT_TOKEN");
    if (!token)
        throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j.ok)
        throw new Error(j.description || `Telegram ${method} lỗi`);
    return j.result;
}
async function isAdmin(userId: number | string) {
    const owner = env("TELEGRAM_OWNER_ID").trim();
    if (owner && String(userId) === owner)
        return true;
    const { data } = await adminClient().from("telegram_admins").select("active").eq("telegram_user_id", String(userId)).maybeSingle();
    return !!data?.active;
}
function botUsername() { return env("TELEGRAM_BOT_USERNAME").replace(/^@/, ""); }
function miniAppUrl() { return env("TELEGRAM_MINIAPP_URL", "https://m4x-store.pages.dev").replace(/\/$/, ""); }
function channelUrl() { return env("TELEGRAM_CHANNEL_URL"); }
function directStoreLink(start = "store") { const u = botUsername(); return u ? `https://t.me/${u}?startapp=${encodeURIComponent(start)}` : miniAppUrl(); }
async function audit(userId: number | string, action: string, details: Record<string, unknown> = {}) {
    try {
        await adminClient().from("telegram_admin_audit").insert({ telegram_user_id: String(userId), action, details });
    }
    catch (_) { }
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
            [{ text: "🌐 AI Dịch Theme", callback_data: "adm:theme" }, { text: "🎬 AI Video", callback_data: "adm:video" }],
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
    if (channelUrl())
        rows.push([{ text: "📢 KÊNH M4X", url: channelUrl() }]);
    return tg("sendMessage", { chat_id: chatId, text, reply_markup: { inline_keyboard: rows } });
}
async function answerCallback(id: string, text = "") { try {
    await tg("answerCallbackQuery", { callback_query_id: id, text: clip(text, 180) });
}
catch (_) { } }
async function setSession(userId: number | string, state: string, payload: any = {}) {
    await adminClient().from("telegram_admin_sessions").upsert({ telegram_user_id: String(userId), state, payload, updated_at: new Date().toISOString() }, { onConflict: "telegram_user_id" });
}
async function getSession(userId: number | string) {
    const { data } = await adminClient().from("telegram_admin_sessions").select("*").eq("telegram_user_id", String(userId)).maybeSingle();
    return data || null;
}
async function clearSession(userId: number | string) { try {
    await adminClient().from("telegram_admin_sessions").delete().eq("telegram_user_id", String(userId));
}
catch (_) { } }
function localDateParts() {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
    const o: any = {};
    for (const p of f.formatToParts(new Date()))
        if (p.type !== "literal")
            o[p.type] = p.value;
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
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86400000);
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
    const sb = adminClient();
    const { data: h } = await sb.from("store_hero_settings").select("*").eq("id", "main").maybeSingle();
    if (!h)
        return { text: "Chưa có cấu hình Hero.", markup: { inline_keyboard: [[{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
    if (kind === "sale") {
        const isPromo = String(h.variant || "") === "promo";
        const txt = `🔥 FLASH SALE\n\nTrạng thái: ${isPromo && h.enabled ? "🟢 Đang chạy" : "⚪ Chưa chạy"}\nTiêu đề: ${clip(h.title || h.accent_text || "-", 180)}\nKết thúc: ${h.ends_at ? new Date(h.ends_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "-"}`;
        return { text: txt, markup: { inline_keyboard: [[{ text: "📢 Đăng Sale", callback_data: "adm:sale_post" }, { text: "⛔ Tắt Sale", callback_data: "adm:sale_off" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
    }
    const txt = `✨ HERO M4X STORE\n\nTrạng thái: ${h.enabled ? "🟢 Bật" : "⚪ Tắt"}\nKiểu: ${clip(h.variant || "custom", 30)}\nTiêu đề: ${clip(h.title || h.accent_text || "-", 180)}`;
    return { text: txt, markup: { inline_keyboard: [[{ text: h.enabled ? "⏸ Tắt Hero" : "▶️ Bật Hero", callback_data: "adm:hero_toggle" }, { text: "📢 Đăng Hero", callback_data: "adm:hero_post" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } };
}
async function enqueueHero(source: string) {
    const sb = adminClient();
    const { data: h } = await sb.from("store_hero_settings").select("*").eq("id", "main").maybeSingle();
    if (!h)
        throw new Error("Chưa có Hero để đăng.");
    const { error } = await sb.from("telegram_channel_queue").insert({ event_type: "hero", dedupe_key: `${source}:${Date.now()}:${crypto.randomUUID()}`, payload: h, status: "pending", available_at: new Date().toISOString() });
    if (error)
        throw error;
}
async function enqueueSimple(eventType: string, source: string) {
    const { error } = await adminClient().from("telegram_channel_queue").insert({ event_type: eventType, dedupe_key: `${source}:${Date.now()}:${crypto.randomUUID()}`, payload: { source: "telegram-admin-bot" }, status: "pending", available_at: new Date().toISOString() });
    if (error)
        throw error;
}
async function processNotice(chatId: number | string, userId: number | string, raw: string) {
    const sb = adminClient();
    const parts = raw.split(/\n+/);
    let title = "Thông báo từ M4X", body = raw;
    if (parts.length > 1 && parts[0].trim().length <= 100) {
        title = parts.shift()!.trim() || title;
        body = parts.join("\n").trim();
    }
    body = clip(body, 2500);
    if (!body)
        throw new Error("Nội dung thông báo đang trống.");
    try {
        await sb.from("notifications").insert({ user_id: null, title: clip(title, 140), body, type: "system", reference: "telegram-admin-bot" });
    }
    catch (_) { }
    const channel = env("TELEGRAM_CHANNEL_ID");
    if (channel)
        await tg("sendMessage", { chat_id: channel, text: `📢 ${clip(title, 140)}\n\n${body}`, reply_markup: { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url: directStoreLink("notice") }]] }, disable_web_page_preview: true });
    await clearSession(userId);
    await audit(userId, "bot_publish_notice", { title });
    await tg("sendMessage", { chat_id: chatId, text: "✅ Đã phát thông báo lên M4X Store/Channel." });
    await sendAdminMenu(chatId);
}
const VIDEO_MODELS: Record<string, {
    label: string;
    duration: number;
    note: string;
}> = {
    "wan-fast": { label: "⚡ Wan Fast", duration: 5, note: "Nhanh, tiết kiệm Pollen; thường cố định 5 giây." },
    "seedance-2.0-fast": { label: "🎞 Seedance Fast", duration: 6, note: "Cân bằng tốc độ/chất lượng." },
    "veo": { label: "🎥 Veo", duration: 6, note: "Chất lượng cao hơn nhưng có thể tốn nhiều Pollen hơn." },
};
function videoModelInfo(model: string) { return VIDEO_MODELS[model] || VIDEO_MODELS["wan-fast"]; }
function videoPromptMenu() {
    return { inline_keyboard: [[{ text: "❌ Hủy", callback_data: "adm:home" }]] };
}
function videoModelMenu() {
    return { inline_keyboard: [
            [{ text: "⚡ Wan Fast", callback_data: "adm:video_model:wan-fast" }],
            [{ text: "🎞 Seedance Fast", callback_data: "adm:video_model:seedance-2.0-fast" }],
            [{ text: "🎥 Veo (Pollen)", callback_data: "adm:video_model:veo" }],
            [{ text: "↩️ Menu", callback_data: "adm:home" }],
        ] };
}
function videoRatioMenu() {
    return { inline_keyboard: [
            [{ text: "📱 9:16 TikTok", callback_data: "adm:video_ratio:9x16" }, { text: "🖥 16:9", callback_data: "adm:video_ratio:16x9" }],
            [{ text: "↩️ Menu", callback_data: "adm:home" }],
        ] };
}
function videoDurationMenu(model: string) {
    if (model === "wan-fast")
        return { inline_keyboard: [[{ text: "✅ 5 giây (cố định)", callback_data: "adm:video_duration:5" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] };
    return { inline_keyboard: [
            [{ text: "4 giây", callback_data: "adm:video_duration:4" }, { text: "6 giây", callback_data: "adm:video_duration:6" }, { text: "8 giây", callback_data: "adm:video_duration:8" }],
            [{ text: "↩️ Menu", callback_data: "adm:home" }],
        ] };
}
function videoConfirmMarkup(audio = false) {
    return { inline_keyboard: [
            [{ text: audio ? "🔊 Âm thanh: BẬT" : "🔇 Âm thanh: TẮT", callback_data: "adm:video_audio" }],
            [{ text: "🚀 TẠO VIDEO", callback_data: "adm:video_generate" }],
            [{ text: "🆕 Nhập prompt khác", callback_data: "adm:video" }, { text: "↩️ Menu", callback_data: "adm:home" }],
        ] };
}
function ratioFromCode(code: string) { return code === "9x16" ? "9:16" : "16:9"; }
function videoSummary(p: any) {
    const info = videoModelInfo(String(p?.model || "wan-fast"));
    return `🎬 M4X AI VIDEO\n\n🧠 Model: ${info.label}\n📐 Tỷ lệ: ${p?.aspectRatio || "9:16"}\n⏱ Thời lượng: ${Number(p?.duration || info.duration)} giây\n🔊 Âm thanh: ${p?.audio ? "Bật" : "Tắt"}\n\n📝 Prompt:\n${clip(p?.prompt, 900)}\n\n${info.note}`;
}
async function telegramMultipart(method: string, form: FormData) {
    const token = env("TELEGRAM_BOT_TOKEN");
    if (!token)
        throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok)
        throw new Error(j?.description || `Telegram ${method} lỗi ${r.status}`);
    return j.result;
}
async function generatePollinationsVideo(payload: any) {
    const key = env("POLLINATIONS_API_KEY");
    if (!key)
        throw new Error("Thiếu POLLINATIONS_API_KEY trong Supabase Edge Secrets.");
    const prompt = clip(payload?.prompt, 900);
    if (!prompt)
        throw new Error("Prompt video đang trống.");
    const model = String(payload?.model || env("POLLINATIONS_VIDEO_MODEL", "wan-fast"));
    const info = videoModelInfo(model);
    const duration = Math.max(1, Math.min(120, Number(payload?.duration || info.duration)));
    const aspectRatio = payload?.aspectRatio === "16:9" ? "16:9" : "9:16";
    const audio = !!payload?.audio;
    const qs = new URLSearchParams({
        model,
        duration: String(duration),
        aspectRatio,
        audio: String(audio),
        enhance: "true",
        safe: "true",
    });
    const base = env("POLLINATIONS_BASE_URL", "https://gen.pollinations.ai").replace(/\/$/, "");
    const controller = new AbortController();
    const timeoutMs = Math.max(30000, Number(env("M4X_VIDEO_TIMEOUT_MS", "240000")) || 240000);
    const timeout = setTimeout(() => controller.abort("video timeout"), timeoutMs);
    try {
        const r = await fetch(`${base}/video/${encodeURIComponent(prompt)}?${qs.toString()}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${key}`, "Accept": "video/mp4" },
            signal: controller.signal,
        });
        if (!r.ok) {
            let detail = "";
            try {
                detail = clip(await r.text(), 800);
            }
            catch (_) { }
            if (/pollen|balance|budget|credit/i.test(detail))
                throw new Error(`Không đủ Pollen hoặc key đã chạm giới hạn. ${detail}`.trim());
            throw new Error(`Pollinations lỗi ${r.status}${detail ? `: ${detail}` : ""}`);
        }
        const blob = await r.blob();
        if (!blob.size)
            throw new Error("Pollinations trả về video rỗng.");
        const maxMb = Math.max(5, Number(env("M4X_VIDEO_MAX_MB", "45")) || 45);
        if (blob.size > maxMb * 1024 * 1024)
            throw new Error(`Video ${(blob.size / 1024 / 1024).toFixed(1)}MB vượt giới hạn ${maxMb}MB đã đặt cho bot.`);
        return { blob, model, duration, aspectRatio, audio };
    }
    finally {
        clearTimeout(timeout);
    }
}
async function deliverGeneratedVideo(chatId: number | string, userId: number | string, payload: any) {
    try {
        const out = await generatePollinationsVideo(payload);
        const caption = `🎬 M4X AI VIDEO\n${videoModelInfo(out.model).label} · ${out.aspectRatio} · ${out.duration}s\n\n${clip(payload?.prompt, 650)}`;
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("video", out.blob, `M4X_AI_VIDEO_${Date.now()}.mp4`);
        form.append("caption", clip(caption, 950));
        form.append("supports_streaming", "true");
        form.append("reply_markup", JSON.stringify({ inline_keyboard: [
                [{ text: "📢 Đăng Channel", callback_data: "adm:video_publish" }],
                [{ text: "🔁 Tạo lại", callback_data: "adm:video_repeat" }, { text: "🆕 Video mới", callback_data: "adm:video" }],
                [{ text: "↩️ Menu", callback_data: "adm:home" }],
            ] }));
        const msg = await telegramMultipart("sendVideo", form);
        const fileId = msg?.video?.file_id || "";
        await setSession(userId, "video_done", { ...payload, model: out.model, duration: out.duration, aspectRatio: out.aspectRatio, audio: out.audio, telegram_file_id: fileId });
        await audit(userId, "bot_video_generated", { model: out.model, duration: out.duration, aspectRatio: out.aspectRatio, bytes: out.blob.size });
    }
    catch (e) {
        const message = clip(e instanceof Error ? e.message : String(e), 1200);
        await audit(userId, "bot_video_error", { error: message });
        await tg("sendMessage", { chat_id: chatId, text: `❌ Tạo video thất bại.\n\n${message}`, reply_markup: { inline_keyboard: [[{ text: "🔁 Thử lại", callback_data: "adm:video_repeat" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } });
    }
}
async function startVideoGeneration(chatId: number | string, userId: number | string, payload: any) {
    if (!env("POLLINATIONS_API_KEY"))
        throw new Error("Chưa cấu hình POLLINATIONS_API_KEY.");
    await setSession(userId, "video_generating", payload);
    await audit(userId, "bot_video_generate", { model: payload?.model, duration: payload?.duration, aspectRatio: payload?.aspectRatio });
    await tg("sendMessage", { chat_id: chatId, text: `⏳ Đang tạo AI Video...\n\n${videoModelInfo(String(payload?.model || "wan-fast")).label} · ${payload?.aspectRatio || "9:16"} · ${payload?.duration || 5}s\n\nBot sẽ tự gửi MP4 khi hoàn tất. Không cần bấm lại.` });
    const task = deliverGeneratedVideo(chatId, userId, payload);
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil)
        runtime.waitUntil(task);
    else
        await task;
}
async function openVideoPrompt(chatId: number | string, userId: number | string) {
    await setSession(userId, "await_video_prompt", {});
    await tg("sendMessage", { chat_id: chatId, text: "🎬 TẠO AI VIDEO\n\nGửi prompt mô tả video bạn muốn tạo.\n\nVí dụ:\nMột chiếc điện thoại cao cấp xoay chậm trong studio, ánh sáng xanh tím, phong cách quảng cáo công nghệ, camera dolly in, cinematic.\n\nGõ /cancel để hủy.", reply_markup: videoPromptMenu() });
}

function themeModeMenu() {
    return { inline_keyboard: [
            [{ text: "⚡ Chỉ văn bản", callback_data: "adm:theme_mode:text" }],
            [{ text: "🔎 Văn bản + quét chữ ảnh", callback_data: "adm:theme_mode:scan" }],
            [{ text: "🖼 FULL: Văn bản + sửa ảnh", callback_data: "adm:theme_mode:full" }],
            [{ text: "↩️ Menu", callback_data: "adm:home" }],
        ] };
}
function themeUploadMarkup() {
    return { inline_keyboard: [[{ text: "❌ Hủy", callback_data: "adm:home" }]] };
}
async function openThemeTranslator(chatId: number | string, userId: number | string) {
    await clearSession(userId);
    await tg("sendMessage", {
        chat_id: chatId,
        text: "🌐 AI DỊCH THEME — V20\n\nChọn chế độ Việt hóa:\n\n⚡ Chỉ văn bản: dịch XML/config, tiết kiệm AI nhất.\n🔎 Quét ảnh: dịch văn bản + AI kiểm tra ảnh nào có chữ.\n🖼 FULL: dịch văn bản và sửa chữ trực tiếp trên ảnh; có thể phát sinh phí API ảnh.\n\nM4X giữ nguyên ID, biến, path và expression theo bộ lọc an toàn.",
        reply_markup: themeModeMenu(),
    });
}
async function triggerThemeTranslator(payload: any) {
    const base = env("SUPABASE_URL").replace(/\/$/, "");
    const key = secretKey();
    if (!base || !key) throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY.");
    const r = await fetch(`${base}/functions/v1/m4x-theme-translator`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `m4x-theme-translator lỗi ${r.status}`);
    return j;
}
async function createThemeJob(userId: number | string, chatId: number | string, doc: any, mode: string) {
    const sb = adminClient();
    const { data, error } = await sb.from("m4x_theme_translation_jobs").insert({
        telegram_user_id: String(userId),
        chat_id: String(chatId),
        source_file_name: clip(doc?.file_name || "theme.mtz", 180),
        source_telegram_file_id: String(doc?.file_id || ""),
        mode,
        status: "queued",
        stats: {},
    }).select("id").single();
    if (error) throw new Error(`Chưa cài SQL V20 hoặc database lỗi: ${error.message}`);
    return String(data.id);
}
async function latestThemeJobText(userId: number | string) {
    const { data, error } = await adminClient().from("m4x_theme_translation_jobs")
        .select("id,source_file_name,mode,status,stats,error,created_at,started_at,finished_at")
        .eq("telegram_user_id", String(userId)).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return "🌐 Chưa có job dịch theme nào.";
    const icon = data.status === "done" ? "✅" : data.status === "failed" ? "❌" : data.status === "running" ? "⏳" : "🕒";
    const st: any = data.stats || {};
    return `${icon} AI DỊCH THEME\n\nFile: ${clip(data.source_file_name, 120)}\nMode: ${data.mode}\nTrạng thái: ${data.status}\n📄 Chuỗi: ${st.unique_strings ?? "-"}\n✍️ Đã thay: ${st.replacements ?? "-"}\n🖼 Đã sửa ảnh: ${st.images_edited ?? "-"}${data.error ? `\n\nLỗi: ${clip(data.error, 700)}` : ""}`;
}
async function handleThemeDocument(chatId: number | string, userId: number | string, doc: any, session: any) {
    const mode = String(session?.payload?.mode || "text");
    const name = String(doc?.file_name || "");
    if (!/\.mtz$/i.test(name)) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Hãy gửi đúng file theme có đuôi .mtz." });
        return;
    }
    const maxMb = Math.max(3, Number(env("M4X_THEME_MAX_MB", "18")) || 18);
    const size = Number(doc?.file_size || 0);
    if (size && size > maxMb * 1024 * 1024) {
        await tg("sendMessage", { chat_id: chatId, text: `❌ File ${(size / 1024 / 1024).toFixed(1)}MB vượt giới hạn ${maxMb}MB của V20.` });
        return;
    }
    if (mode === "full" && env("M4X_THEME_IMAGE_EDIT_ENABLED", "false").toLowerCase() !== "true") {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ FULL ảnh chưa được bật ở Supabase Secrets.\n\nThêm:\nM4X_THEME_IMAGE_EDIT_ENABLED=true\n\nHoặc chọn lại chế độ ⚡/🔎 bằng /translate." });
        return;
    }
    const jobId = await createThemeJob(userId, chatId, doc, mode);
    await setSession(userId, "theme_processing", { mode, job_id: jobId, file_name: name });
    await tg("sendMessage", { chat_id: chatId, text: `✅ Đã nhận ${name}\n\n⏳ Job ${jobId.slice(0, 8)} đang bắt đầu. Bot sẽ tự gửi file .mtz đã Việt hóa khi hoàn tất.\n\nDùng /themejob để xem trạng thái.` });
    await triggerThemeTranslator({
        job_id: jobId,
        chat_id: String(chatId),
        user_id: String(userId),
        file_id: String(doc?.file_id || ""),
        file_name: name,
        mode,
    });
    await audit(userId, "bot_theme_translate_start", { job_id: jobId, mode, file_name: name, file_size: size });
}

async function handleCallback(q: any) {
    const userId = q?.from?.id, chatId = q?.message?.chat?.id, data = String(q?.data || "");
    if (!userId || !chatId || !await isAdmin(userId)) {
        await answerCallback(q.id, "Không có quyền Admin");
        return;
    }
    try {
        if (data === "adm:home") {
            await answerCallback(q.id);
            await sendAdminMenu(chatId);
            return;
        }
        if (data === "adm:inventory") {
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: await inventoryText(), reply_markup: { inline_keyboard: [[{ text: "🔄 Cập nhật bài tồn kho", callback_data: "adm:stock_sync" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] } });
            return;
        }
        if (data === "adm:orders") {
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: await ordersText(), reply_markup: { inline_keyboard: [[{ text: "↩️ Menu", callback_data: "adm:home" }]] } });
            return;
        }
        if (data === "adm:sale" || data === "adm:hero") {
            await answerCallback(q.id);
            const info = await heroInfo(data.endsWith("sale") ? "sale" : "hero");
            await tg("sendMessage", { chat_id: chatId, text: info.text, reply_markup: info.markup });
            return;
        }
        if (data === "adm:sale_post") {
            await enqueueHero("bot-sale");
            await audit(userId, "bot_sale_post");
            await answerCallback(q.id, "Đã đưa Sale vào hàng đợi");
            await tg("sendMessage", { chat_id: chatId, text: "✅ Sale sẽ được đăng lên Channel trong khoảng 1 phút." });
            return;
        }
        if (data === "adm:sale_off") {
            const sb = adminClient();
            const { data: h } = await sb.from("store_hero_settings").select("variant").eq("id", "main").maybeSingle();
            if (String(h?.variant || "") === "promo")
                await sb.from("store_hero_settings").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", "main");
            await audit(userId, "bot_sale_off");
            await answerCallback(q.id, "Đã tắt Sale");
            await tg("sendMessage", { chat_id: chatId, text: "⛔ Đã tắt Flash Sale/Hero promo." });
            return;
        }
        if (data === "adm:hero_toggle") {
            const sb = adminClient();
            const { data: h } = await sb.from("store_hero_settings").select("enabled").eq("id", "main").maybeSingle();
            const next = !h?.enabled;
            await sb.from("store_hero_settings").update({ enabled: next, updated_at: new Date().toISOString() }).eq("id", "main");
            await audit(userId, "bot_hero_toggle", { enabled: next });
            await answerCallback(q.id, next ? "Đã bật Hero" : "Đã tắt Hero");
            await tg("sendMessage", { chat_id: chatId, text: next ? "✅ Hero đã bật." : "⏸ Hero đã tắt." });
            return;
        }
        if (data === "adm:hero_post") {
            await enqueueHero("bot-hero");
            await audit(userId, "bot_hero_post");
            await answerCallback(q.id, "Đã đưa Hero vào hàng đợi");
            return;
        }
        if (data === "adm:notice") {
            await setSession(userId, "await_notice");
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: "🔔 GỬI THÔNG BÁO\n\nHãy gửi tin nhắn tiếp theo theo dạng:\nTiêu đề\nNội dung thông báo\n\nHoặc chỉ gửi nội dung. Gõ /cancel để hủy." });
            return;
        }
        if (data === "adm:purchase") {
            const c = await storeControl();
            if (c.purchases_enabled === false) {
                await adminClient().from("m4x_store_control").update({ purchases_enabled: true, updated_by: String(userId), updated_at: new Date().toISOString() }).eq("id", "main");
                await audit(userId, "bot_purchase_unlock");
                await answerCallback(q.id, "Đã mở mua hàng");
                await sendAdminMenu(chatId, "✅ Đã BẬT lại mua hàng.");
            }
            else {
                await answerCallback(q.id);
                await tg("sendMessage", { chat_id: chatId, text: "⚠️ Xác nhận khóa toàn bộ đơn mua mới?", reply_markup: { inline_keyboard: [[{ text: "🚫 XÁC NHẬN KHÓA", callback_data: "adm:purchase_off_confirm" }], [{ text: "Hủy", callback_data: "adm:home" }]] } });
            }
            return;
        }
        if (data === "adm:purchase_off_confirm") {
            await adminClient().from("m4x_store_control").update({ purchases_enabled: false, purchase_lock_reason: "M4X STORE đang tạm khóa mua hàng. Vui lòng quay lại sau.", updated_by: String(userId), updated_at: new Date().toISOString() }).eq("id", "main");
            await audit(userId, "bot_purchase_lock");
            await answerCallback(q.id, "Đã khóa mua hàng");
            await sendAdminMenu(chatId, "🚫 Đã TẮT mua hàng. Mọi đơn mới sẽ bị chặn ở database.");
            return;
        }
        if (data === "adm:poststore") {
            await enqueueSimple("manual_store", "bot-store");
            await audit(userId, "bot_post_store");
            await answerCallback(q.id, "Đã đưa vào hàng đợi");
            await tg("sendMessage", { chat_id: chatId, text: "✅ Store sẽ được đăng lên Channel trong khoảng 1 phút." });
            return;
        }
        if (data === "adm:stock_sync") {
            await enqueueSimple("stock_sync", "bot-stock");
            await audit(userId, "bot_stock_sync");
            await answerCallback(q.id, "Đã yêu cầu cập nhật kho");
            await tg("sendMessage", { chat_id: chatId, text: "✅ Đã yêu cầu cập nhật tin tồn kho." });
            return;
        }
        if (data === "adm:theme") {
            await answerCallback(q.id);
            await openThemeTranslator(chatId, userId);
            return;
        }
        if (data.startsWith("adm:theme_mode:")) {
            const mode = data.slice("adm:theme_mode:".length);
            if (!["text", "scan", "full"].includes(mode)) throw new Error("Chế độ dịch theme không hợp lệ.");
            if (mode === "full") {
                await answerCallback(q.id);
                await tg("sendMessage", { chat_id: chatId, text: `⚠️ FULL ẢNH

AI sẽ sửa trực tiếp các ảnh có chữ. API tạo/chỉnh ảnh có thể tính phí theo từng ảnh.

V20 mặc định giới hạn số ảnh sửa để tránh phát sinh chi phí ngoài ý muốn.`, reply_markup: { inline_keyboard: [[{ text: "✅ Tôi hiểu — tiếp tục", callback_data: "adm:theme_full_confirm" }], [{ text: "↩️ Chọn chế độ khác", callback_data: "adm:theme" }]] } });
                return;
            }
            await setSession(userId, "await_theme_file", { mode });
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: `🌐 Gửi file .mtz cần Việt hóa ngay trong khung chat.

Chế độ: ${mode === "text" ? "⚡ Chỉ văn bản" : "🔎 Văn bản + quét chữ ảnh"}

Gõ /cancel để hủy.`, reply_markup: themeUploadMarkup() });
            return;
        }
        if (data === "adm:theme_full_confirm") {
            await setSession(userId, "await_theme_file", { mode: "full" });
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: `🖼 FULL MODE

Gửi file .mtz cần Việt hóa.

Lưu ý: Supabase Secret M4X_THEME_IMAGE_EDIT_ENABLED phải = true.
Gõ /cancel để hủy.`, reply_markup: themeUploadMarkup() });
            return;
        }
        if (data === "adm:video") {
            await answerCallback(q.id);
            await openVideoPrompt(chatId, userId);
            return;
        }
        if (data.startsWith("adm:video_model:")) {
            const model = data.slice("adm:video_model:".length);
            if (!VIDEO_MODELS[model])
                throw new Error("Model video không hợp lệ.");
            const s = await getSession(userId);
            const payload = { ...(s?.payload || {}), model };
            if (!payload.prompt)
                throw new Error("Hãy nhập prompt video trước.");
            await setSession(userId, "video_choose_ratio", payload);
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: `${videoModelInfo(model).label}\n\nChọn tỷ lệ video:`, reply_markup: videoRatioMenu() });
            return;
        }
        if (data.startsWith("adm:video_ratio:")) {
            const code = data.slice("adm:video_ratio:".length);
            const s = await getSession(userId);
            const payload = { ...(s?.payload || {}), aspectRatio: ratioFromCode(code) };
            if (!payload.prompt || !payload.model)
                throw new Error("Phiên tạo video đã hết. Hãy bắt đầu lại.");
            await setSession(userId, "video_choose_duration", payload);
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: `📐 ${payload.aspectRatio}\n\nChọn thời lượng:`, reply_markup: videoDurationMenu(payload.model) });
            return;
        }
        if (data.startsWith("adm:video_duration:")) {
            const duration = Number(data.slice("adm:video_duration:".length));
            const s = await getSession(userId);
            const payload = { ...(s?.payload || {}), duration: Number.isFinite(duration) ? duration : 5, audio: !!s?.payload?.audio };
            if (!payload.prompt || !payload.model || !payload.aspectRatio)
                throw new Error("Phiên tạo video đã hết. Hãy bắt đầu lại.");
            await setSession(userId, "video_confirm", payload);
            await answerCallback(q.id);
            await tg("sendMessage", { chat_id: chatId, text: videoSummary(payload), reply_markup: videoConfirmMarkup(payload.audio) });
            return;
        }
        if (data === "adm:video_audio") {
            const s = await getSession(userId);
            if (!s?.payload?.prompt)
                throw new Error("Phiên tạo video đã hết.");
            const payload = { ...s.payload, audio: !s.payload.audio };
            await setSession(userId, "video_confirm", payload);
            await answerCallback(q.id, payload.audio ? "Bật âm thanh" : "Tắt âm thanh");
            await tg("sendMessage", { chat_id: chatId, text: videoSummary(payload), reply_markup: videoConfirmMarkup(payload.audio) });
            return;
        }
        if (data === "adm:video_generate" || data === "adm:video_repeat") {
            const s = await getSession(userId);
            const payload = { ...(s?.payload || {}) };
            if (!payload.prompt || !payload.model)
                throw new Error("Chưa có cấu hình video để tạo.");
            await answerCallback(q.id, "Đang tạo video...");
            await startVideoGeneration(chatId, userId, payload);
            return;
        }
        if (data === "adm:video_publish") {
            const s = await getSession(userId);
            const p = s?.payload || {};
            const fileId = String(p.telegram_file_id || "");
            const channel = env("TELEGRAM_CHANNEL_ID");
            if (!channel)
                throw new Error("Thiếu TELEGRAM_CHANNEL_ID.");
            if (!fileId)
                throw new Error("Không tìm thấy file video Telegram để đăng lại.");
            await tg("sendVideo", { chat_id: channel, video: fileId, caption: clip(`🎬 M4X AI VIDEO\n\n${p.prompt || "Video mới từ M4X STORE"}`, 950), supports_streaming: true, reply_markup: { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url: directStoreLink("video") }]] } });
            await audit(userId, "bot_video_publish", { model: p.model, duration: p.duration, aspectRatio: p.aspectRatio });
            await answerCallback(q.id, "Đã đăng Channel");
            await tg("sendMessage", { chat_id: chatId, text: "✅ Đã đăng AI Video lên Channel." });
            return;
        }
        await answerCallback(q.id, "Tác vụ không hợp lệ");
    }
    catch (e) {
        await answerCallback(q.id, e instanceof Error ? e.message : String(e));
        await tg("sendMessage", { chat_id: chatId, text: `❌ ${clip(e instanceof Error ? e.message : String(e), 1000)}` });
    }
}
function webhookEndpoint() {
    const base = env("SUPABASE_URL").replace(/\/$/, "");
    if (!base)
        throw new Error("Thiếu SUPABASE_URL.");
    return `${base}/functions/v1/telegram-webhook`;
}
async function repairTelegramWebhook() {
    const token = env("TELEGRAM_BOT_TOKEN");
    if (!token)
        throw new Error("Thiếu TELEGRAM_BOT_TOKEN.");
    const payload: Record<string, unknown> = {
        url: webhookEndpoint(),
        allowed_updates: ["message", "edited_message", "callback_query", "channel_post", "edited_channel_post"],
        drop_pending_updates: false,
    };
    const secret = env("TELEGRAM_WEBHOOK_SECRET").trim();
    if (secret)
        payload.secret_token = secret;
    const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok)
        throw new Error(j?.description || `setWebhook lỗi ${r.status}`);
    return j;
}
Deno.serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST")
        return json({ ok: false, error: "Method not allowed" }, 405);
    const expected = env("TELEGRAM_WEBHOOK_SECRET");
    if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected)
        return json({ ok: false, error: "Webhook secret sai" }, 403);
    try {
        const u = await req.json();
        if (u.callback_query) {
            await handleCallback(u.callback_query);
            return json({ ok: true });
        }
        const m = u.message || u.edited_message || u.channel_post;
        if (!m)
            return json({ ok: true });
        const chat = m.chat || {}, from = m.from || {}, raw = String(m.text || "").trim(), cmd = (raw.split(/\s+/)[0] || "").split("@")[0].toLowerCase();
        if (cmd === "/id") {
            await tg("sendMessage", { chat_id: chat.id, text: `Telegram ID của bạn: ${from.id || chat.id}` });
            return json({ ok: true });
        }
        if (cmd === "/start" || cmd === "/app") {
            if (chat.type === "private")
                await sendPrivate(chat.id, "🛍 M4X STORE\n\nTheme • App • AI • Tool • Premium\nMở cửa hàng trực tiếp trong Telegram.");
            else
                await tg("sendMessage", { chat_id: chat.id, text: "🛍 M4X STORE", reply_markup: { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url: directStoreLink("chat") }]] } });
            return json({ ok: true });
        }
        const admin = from.id && await isAdmin(from.id);
        if (cmd === "/admin" || cmd === "/menu" || cmd === "/manage") {
            if (!admin || chat.type !== "private")
                return json({ ok: true });
            await clearSession(from.id);
            await sendAdminMenu(chat.id);
            return json({ ok: true });
        }
        if (cmd === "/cancel") {
            if (admin) {
                await clearSession(from.id);
                await tg("sendMessage", { chat_id: chat.id, text: "✅ Đã hủy thao tác." });
                await sendAdminMenu(chat.id);
            }
            return json({ ok: true });
        }
        if (cmd === "/fixwebhook") {
            if (!admin || chat.type !== "private")
                return json({ ok: true });
            await repairTelegramWebhook();
            const info = await tg("getWebhookInfo");
            await tg("sendMessage", { chat_id: chat.id, text: `✅ ĐÃ SỬA WEBHOOK TELEGRAM\n\nCallback button: BẬT\nWebhook: ${info.url || "-"}\nAllowed updates: ${(info.allowed_updates || []).join(", ") || "mặc định"}\n\nGõ /admin để lấy menu mới.` });
            return json({ ok: true });
        }
        if (cmd === "/status") {
            if (!admin)
                return json({ ok: true });
            const info = await tg("getWebhookInfo");
            const c = await storeControl();
            await tg("sendMessage", { chat_id: chat.id, text: `✅ M4X Bot online\nWebhook: ${info.url || "-"}\nAllowed: ${(info.allowed_updates || []).join(", ") || "mặc định"}\nPending: ${info.pending_update_count || 0}\nLast error: ${info.last_error_message || "không có"}\nMua hàng: ${c.purchases_enabled === false ? "KHÓA" : "MỞ"}\nBot: @${botUsername() || "-"}` });
            return json({ ok: true });
        }
        if (cmd === "/poststore") {
            if (!admin)
                return json({ ok: true });
            await enqueueSimple("manual_store", "cmd-store");
            await tg("sendMessage", { chat_id: chat.id, text: "✅ Đã đưa bài Store vào hàng đợi." });
            return json({ ok: true });
        }
        if (cmd === "/translate" || cmd === "/theme") {
            if (!admin || chat.type !== "private")
                return json({ ok: true });
            await openThemeTranslator(chat.id, from.id);
            return json({ ok: true });
        }
        if (cmd === "/themejob") {
            if (!admin || chat.type !== "private")
                return json({ ok: true });
            await tg("sendMessage", { chat_id: chat.id, text: await latestThemeJobText(from.id), reply_markup: { inline_keyboard: [[{ text: "🌐 Dịch theme mới", callback_data: "adm:theme" }, { text: "↩️ Menu", callback_data: "adm:home" }]] } });
            return json({ ok: true });
        }
        if (cmd === "/video") {
            if (!admin || chat.type !== "private")
                return json({ ok: true });
            await openVideoPrompt(chat.id, from.id);
            return json({ ok: true });
        }
        if (admin && chat.type === "private" && m.document) {
            const session = await getSession(from.id);
            if (session?.state === "await_theme_file") {
                await handleThemeDocument(chat.id, from.id, m.document, session);
                return json({ ok: true });
            }
        }
        if (admin && chat.type === "private" && raw) {
            const session = await getSession(from.id);
            if (session?.state === "await_theme_file") {
                await tg("sendMessage", { chat_id: chat.id, text: "📎 Hãy gửi file .mtz dưới dạng Document/Tệp, không gửi nội dung bằng chữ." });
                return json({ ok: true });
            }
            if (session?.state === "await_notice") {
                await processNotice(chat.id, from.id, raw);
                return json({ ok: true });
            }
            if (session?.state === "await_video_prompt") {
                const prompt = clip(raw, 900);
                if (prompt.length < 8) {
                    await tg("sendMessage", { chat_id: chat.id, text: "⚠️ Prompt hơi ngắn. Hãy mô tả video rõ hơn một chút." });
                    return json({ ok: true });
                }
                await setSession(from.id, "video_choose_model", { prompt });
                await tg("sendMessage", { chat_id: chat.id, text: `✅ Đã nhận prompt:\n\n${prompt}\n\nChọn model video:`, reply_markup: videoModelMenu() });
                return json({ ok: true });
            }
        }
        return json({ ok: true });
    }
    catch (e) {
        console.error(e);
        return json({ ok: true, error: e instanceof Error ? e.message : String(e) });
    }
});
