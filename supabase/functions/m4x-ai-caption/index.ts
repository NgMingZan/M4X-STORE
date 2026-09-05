import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const env = (name: string, fallback = "") => Deno.env.get(name) || fallback;
const text = (v: unknown, n = 4000) => String(v ?? "").trim().slice(0, n);
const money = (n: unknown) => new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + "đ";
const safeUrl = (v: unknown) => {
  try { const u = new URL(String(v || "")); return /^https?:$/.test(u.protocol) ? u.href : null; }
  catch { return null; }
};

function secretKey() {
  const plural = env("SUPABASE_SECRET_KEYS");
  if (plural) {
    try {
      const p = JSON.parse(plural);
      return p.default || Object.values(p)[0] as string;
    } catch (_) {}
  }
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}

function adminClient() {
  const url = env("SUPABASE_URL"), key = secretKey();
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY trên Edge Function.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Bạn chưa đăng nhập Admin.");
  const sb = adminClient();
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData?.user) throw new Error("Phiên đăng nhập Admin không hợp lệ hoặc đã hết hạn.");
  const { data: profile, error: profileError } = await sb.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || !["admin", "super_admin"].includes(String(profile.role || ""))) throw new Error("Bạn không có quyền Admin.");
  return { sb, user: userData.user };
}

function productFacts(p: any) {
  const available = p?.stock_mode === "limited"
    ? Math.max(0, Number(p.stock_limit || 0) - Number(p.sold_count || 0) - Number(p.reserved_count || 0))
    : null;
  return {
    name: text(p?.name, 220),
    category: text(p?.categories?.name, 120),
    price: Number(p?.price || 0),
    old_price: Number(p?.old_price || 0),
    description: text(p?.description, 1800),
    delivery_type: text(p?.delivery_type, 80),
    version_name: text(p?.version_name, 80),
    compatibility: text(p?.compatibility, 300),
    file_size_label: text(p?.file_size_label, 80),
    sale_status: text(p?.sale_status, 80),
    stock_mode: text(p?.stock_mode, 40),
    available,
  };
}

function fallbackCaption(p: any, tone: string, len: string, extra: string) {
  const f = productFacts(p);
  const icon = tone === "technical" ? "🧩" : tone === "premium" ? "💎" : tone === "friendly" ? "✨" : "🔥";
  const lines = [
    `${icon} ${f.name || "SẢN PHẨM M4X STORE"}`,
    "",
  ];
  if (f.description) lines.push(f.description.slice(0, len === "short" ? 220 : len === "long" ? 650 : 420));
  lines.push("", `💰 Giá: ${money(f.price)}`);
  if (f.old_price > f.price && f.old_price > 0) lines.push(`🏷 Giá cũ: ${money(f.old_price)}`);
  if (f.stock_mode === "limited" && f.available !== null) lines.push(`📦 Còn lại: ${f.available}`);
  if (f.version_name) lines.push(`🧩 Phiên bản: ${f.version_name}`);
  if (f.compatibility) lines.push(`📱 Tương thích: ${f.compatibility}`);
  if (extra) lines.push("", extra.slice(0, 300));
  lines.push("", "👉 Mở M4X STORE để xem chi tiết và đặt mua.");
  return lines.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").slice(0, 3500);
}

function outputText(j: any) {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();
  const parts: string[] = [];
  for (const item of j?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

async function generateWithOpenAI(p: any, tone: string, len: string, extra: string) {
  const key = env("OPENAI_API_KEY");
  if (!key) return null;
  const model = env("OPENAI_MODEL", "gpt-5.6-luna");
  const f = productFacts(p);
  const toneMap: Record<string, string> = {
    sale: "giọng bán hàng mạnh, hấp dẫn nhưng không giật tít sai sự thật",
    premium: "giọng cao cấp, tinh gọn, sang trọng, ít emoji",
    technical: "giọng kỹ thuật, rõ thông số, ưu tiên tính chính xác",
    friendly: "giọng thân thiện, dễ hiểu, tự nhiên như tư vấn khách hàng",
  };
  const lengthMap: Record<string, string> = {
    short: "250-450 ký tự",
    medium: "550-850 ký tự",
    long: "900-1300 ký tự",
  };
  const prompt = `Bạn là copywriter tiếng Việt cho M4X STORE. Hãy viết 1 caption Telegram hoàn chỉnh cho sản phẩm dưới đây.\n\nYÊU CẦU BẮT BUỘC:\n- Chỉ dùng dữ kiện được cung cấp. Không bịa rating, bảo hành, số người mua, ưu đãi, công dụng hay tồn kho.\n- Nếu old_price không cao hơn price thì không nói giảm giá.\n- Nếu stock_mode không phải limited thì không tự bịa số lượng còn lại.\n- Không dùng markdown phức tạp; văn bản phải đọc đẹp ngay trong Telegram.\n- Kết thúc bằng CTA mở M4X STORE.\n- Không nhắc rằng bạn là AI.\n- Phong cách: ${toneMap[tone] || toneMap.sale}.\n- Độ dài: ${lengthMap[len] || lengthMap.medium}.\n\nDỮ KIỆN SẢN PHẨM:\n${JSON.stringify(f, null, 2)}\n\nGhi chú thêm của Admin: ${extra || "Không có"}`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: len === "long" ? 650 : len === "short" ? 260 : 450 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI API lỗi ${r.status}`);
  const caption = outputText(j);
  if (!caption) throw new Error("AI không trả về caption.");
  return { caption: caption.slice(0, 3500), model };
}

async function telegramApi(method: string, payload: Record<string, unknown> = {}) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN trong Supabase Secrets.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || `Telegram ${method} lỗi`);
  return j.result;
}

function storeButton(productId?: string) {
  const bot = env("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
  const mini = env("TELEGRAM_MINIAPP_URL", "https://m4x-store.pages.dev").replace(/\/$/, "");
  const start = productId ? `product_${productId}` : "store";
  const url = bot ? `https://t.me/${bot}?startapp=${encodeURIComponent(start)}` : mini;
  return { inline_keyboard: [[{ text: "🚀 MỞ M4X STORE", url }]] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const { sb, user } = await requireAdmin(req);
    const body = await req.json();
    const action = text(body?.action, 40) || "generate";

    if (action === "generate") {
      const productId = text(body?.product_id, 80);
      const tone = ["sale", "premium", "technical", "friendly"].includes(String(body?.tone)) ? String(body.tone) : "sale";
      const len = ["short", "medium", "long"].includes(String(body?.length)) ? String(body.length) : "medium";
      const extra = text(body?.extra_instruction, 600);
      if (!productId) throw new Error("Hãy chọn sản phẩm.");
      const { data: product, error } = await sb.from("products").select("*,categories(name)").eq("id", productId).maybeSingle();
      if (error) throw error;
      if (!product) throw new Error("Không tìm thấy sản phẩm.");

      let provider = "template", model: string | null = null, caption = "";
      const ai = await generateWithOpenAI(product, tone, len, extra);
      if (ai) { provider = "openai"; model = ai.model; caption = ai.caption; }
      else caption = fallbackCaption(product, tone, len, extra);

      await sb.from("telegram_ai_caption_history").insert({
        admin_user_id: user.id, product_id: product.id, tone, caption_length: len,
        extra_instruction: extra || null, caption, provider, model,
      });
      return json({ ok: true, caption, provider, model, warning: provider === "template" ? "Chưa có OPENAI_API_KEY nên đang dùng mẫu thông minh dự phòng." : null });
    }

    if (action === "publish") {
      const caption = text(body?.caption, 3500);
      const productId = text(body?.product_id, 80);
      if (!caption) throw new Error("Caption đang trống.");
      const chatId = env("TELEGRAM_CHANNEL_ID");
      if (!chatId) throw new Error("Thiếu TELEGRAM_CHANNEL_ID trong Supabase Secrets.");
      let product: any = null;
      if (productId) {
        const { data } = await sb.from("products").select("id,name,cover_url").eq("id", productId).maybeSingle();
        product = data || null;
      }
      let result: any;
      const cover = safeUrl(product?.cover_url);
      if (cover && caption.length <= 1000) {
        try {
          result = await telegramApi("sendPhoto", { chat_id: chatId, photo: cover, caption, reply_markup: storeButton(product?.id) });
        } catch (_) {
          result = await telegramApi("sendMessage", { chat_id: chatId, text: caption, reply_markup: storeButton(product?.id), disable_web_page_preview: true });
        }
      } else {
        result = await telegramApi("sendMessage", { chat_id: chatId, text: caption, reply_markup: storeButton(product?.id), disable_web_page_preview: true });
      }
      try {
        await sb.from("telegram_channel_posts").insert({
          event_type: "ai_caption",
          dedupe_key: `ai-caption:${result?.message_id || crypto.randomUUID()}:${Date.now()}`,
          telegram_message_id: Number(result?.message_id || 0) || null,
          payload: { product_id: product?.id || null, admin_user_id: user.id },
        });
      } catch (_) {}
      return json({ ok: true, message: "Đã đăng caption AI lên Channel.", message_id: result?.message_id || null });
    }

    return json({ ok: false, error: "Action không hợp lệ." }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
