// M4X STORE V21 — PUBLIC AI LOCKSCREEN PAID SERVICE
// Actions: pricing | quote (multipart) | status | retry
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const env = (name: string, fallback = "") => Deno.env.get(name) || fallback;
const clip = (v: unknown, n = 500) => String(v ?? "").trim().slice(0, n);

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
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL/SUPABASE_SECRET_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function safeName(name: string) {
  const cleaned = name.replace(/[\\/]+/g, "_").replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim();
  return (cleaned || "theme.mtz").slice(0, 120);
}
async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
function decodeXml(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const XML_ATTR_RE = /(\b(?:text|summary|title|label|description|hint|message|content|subtitle|placeholder)\s*=\s*)(["'])([\s\S]*?)\2/gi;
const XML_NODE_RE = /<(title|description|summary|label|text|hint|message|content|subtitle)\b([^>]*)>([^<]{1,500})<\/\1>/gi;
const PROP_RE = /^([^#;\s][^=:\n]{0,100})(\s*[=:]\s*)(.*)$/gm;
function looksLikeCodeOrPath(s: string) {
  const t = s.trim();
  if (!t || t.length > 500) return true;
  if (/^(?:https?:\/\/|tg:\/\/|mailto:|content:\/\/|file:\/\/)/i.test(t)) return true;
  if (/^[#@]?\$?\{?[\w.:-]+\}?$/.test(t) && !/\s/.test(t) && t.length > 12) return true;
  if (/^[A-Fa-f0-9]{6,8}$/.test(t) || /^#[A-Fa-f0-9]{3,8}$/.test(t)) return true;
  if (/^[\d\s:.,+\-/%]+$/.test(t)) return true;
  if (/\.(?:png|jpe?g|webp|xml|js|json|ttf|otf|mp3|ogg|wav)$/i.test(t) && !/\s/.test(t)) return true;
  if (/^(?:true|false|null|none|auto|match_parent|wrap_content)$/i.test(t)) return true;
  return false;
}
function shouldTranslate(s: string) {
  const t = s.trim();
  if (looksLikeCodeOrPath(t) || t.length < 2) return false;
  const letters = (t.match(/[A-Za-zÀ-ỹ\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return letters >= 2;
}
function propertyKeyLooksVisible(key: string) {
  return /(text|title|label|summary|desc|description|hint|message|content|subtitle|name|option|setting)/i.test(key);
}
function collectStringsFromXml(content: string, out: Set<string>) {
  content.replace(XML_ATTR_RE, (_m, _p, _q, raw) => {
    const s = decodeXml(String(raw));
    if (shouldTranslate(s)) out.add(s);
    return _m;
  });
  content.replace(XML_NODE_RE, (_m, _tag, _attrs, raw) => {
    const s = decodeXml(String(raw));
    if (shouldTranslate(s)) out.add(s);
    return _m;
  });
}
function collectStringsFromProperties(content: string, out: Set<string>) {
  content.replace(PROP_RE, (_m, key, _sep, raw) => {
    const s = String(raw).trim();
    if (propertyKeyLooksVisible(String(key)) && shouldTranslate(s)) out.add(s);
    return _m;
  });
}

function tierFee(value: number, tiers: any[], label: string) {
  const rows = Array.isArray(tiers) ? tiers
    .map(x => ({ max: Number(x?.max), fee: Number(x?.fee || 0) }))
    .filter(x => Number.isFinite(x.max) && Number.isFinite(x.fee))
    .sort((a, b) => a.max - b.max) : [];
  for (const row of rows) if (value <= row.max) return Math.max(0, Math.round(row.fee));
  throw new Error(`${label} vượt giới hạn bảng giá.`);
}
async function getPricing() {
  const sb = adminClient();
  const { data, error } = await sb.from("m4x_theme_paid_pricing").select("*").eq("id", "main").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Chưa cài bảng giá V21.");
  return data;
}
function publicPricing(p: any) {
  return {
    enabled: !!p.enabled,
    base_price: Number(p.base_price || 10000),
    max_lockscreen_mb: Number(p.max_lockscreen_mb || 18),
    max_images: Number(p.max_images || 20),
    max_mtz_mb: Number(p.max_mtz_mb || 50),
    quote_minutes: Number(p.quote_minutes || 30),
    size_tiers: p.size_tiers || [],
    image_tiers: p.image_tiers || [],
    text_tiers: p.text_tiers || [],
  };
}
function bankInfo(amount = 0, orderCode = "") {
  const bankCode = env("M4X_BANK_CODE", "ICB").trim() || "ICB";
  const account = env("M4X_BANK_ACCOUNT").trim();
  const accountName = env("M4X_BANK_ACCOUNT_NAME", "M4X STORE").trim();
  const transferContent = orderCode ? `SEVQR ${orderCode}` : "";
  const qr = account && amount > 0 && orderCode
    ? `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(account)}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`
    : "";
  return { bank_code: bankCode, account_number: account, account_name: accountName, transfer_content: transferContent, qr_url: qr };
}
async function triggerWorker(jobId: string) {
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = secretKey();
  if (!base || !key) throw new Error("Thiếu cấu hình gọi worker.");
  const task = fetch(`${base}/functions/v1/m4x-theme-paid-worker`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(e => console.error("V21 worker invoke failed", e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task); else await task;
}

async function quote(req: Request) {
  const pricing = await getPricing();
  if (!pricing.enabled) throw new Error("Dịch vụ AI Việt hóa đang tạm đóng.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Hãy chọn file .mtz.");
  const originalName = safeName(file.name || "theme.mtz");
  if (!/\.mtz$/i.test(originalName)) throw new Error("Chỉ hỗ trợ file .mtz.");
  const mtzBytes = new Uint8Array(await file.arrayBuffer());
  const maxMtzBytes = Number(pricing.max_mtz_mb || 50) * 1024 * 1024;
  if (!mtzBytes.length) throw new Error("File MTZ rỗng.");
  if (mtzBytes.length > maxMtzBytes) throw new Error(`MTZ ${(mtzBytes.length/1048576).toFixed(1)}MB vượt giới hạn ${pricing.max_mtz_mb}MB.`);

  let outer: JSZip;
  try { outer = await JSZip.loadAsync(mtzBytes); } catch (_) { throw new Error("File không phải MTZ/ZIP hợp lệ."); }
  const outerEntries = Object.values(outer.files).filter((f: any) => !f.dir) as any[];
  const lockEntry = outerEntries.find((e: any) => /(?:^|\/)lockscreen(?:\.zip)?$/i.test(String(e.name)))
    || outerEntries.find((e: any) => /(?:^|\/)lockscreen[^/]*$/i.test(String(e.name)));
  if (!lockEntry) throw new Error("Không tìm thấy component lockscreen trong MTZ.");
  const lockBytes = await lockEntry.async("uint8array");
  const lockMb = lockBytes.length / 1048576;
  if (lockMb > Number(pricing.max_lockscreen_mb || 18)) {
    throw new Error(`Lockscreen ${lockMb.toFixed(1)}MB vượt giới hạn ${pricing.max_lockscreen_mb}MB.`);
  }

  let lockZip: JSZip;
  try { lockZip = await JSZip.loadAsync(lockBytes); } catch (_) { throw new Error("Component lockscreen không phải ZIP hợp lệ."); }
  const entries = Object.values(lockZip.files).filter((f: any) => !f.dir) as any[];
  const imageEntries = entries.filter((e: any) => /\.(?:png|jpe?g|webp)$/i.test(String(e.name || "")));
  if (imageEntries.length > Number(pricing.max_images || 20)) {
    throw new Error(`Lockscreen có ${imageEntries.length} ảnh, vượt giới hạn ${pricing.max_images} ảnh.`);
  }
  const imageEditEnabled = env("M4X_THEME_IMAGE_EDIT_ENABLED", "false").toLowerCase() === "true";
  const requireImageEdit = env("M4X_THEME_PAID_REQUIRE_IMAGE_EDIT", "true").toLowerCase() !== "false";
  if (imageEntries.length > 0 && requireImageEdit && !imageEditEnabled) {
    throw new Error("Dịch vụ trả phí có xử lý ảnh nhưng M4X_THEME_IMAGE_EDIT_ENABLED chưa bật. Admin cần thêm secret = true trước khi nhận đơn.");
  }
  const textEntries = entries.filter((e: any) => {
    const n = String(e.name || "");
    return /\.(?:xml|properties|ini|conf|cfg|txt)$/i.test(n)
      || /(?:^|\/)(?:manifest|config|settings?|strings?)(?:\.[^/]*)?$/i.test(n);
  });
  const unique = new Set<string>();
  for (const e of textEntries) {
    let content = "";
    try { content = await e.async("string"); } catch (_) { continue; }
    if (/\.xml$/i.test(e.name)) collectStringsFromXml(content, unique);
    else collectStringsFromProperties(content, unique);
  }
  const textChars = Array.from(unique).reduce((n, s) => n + s.length, 0);
  const basePrice = Math.max(10000, Number(pricing.base_price || 10000));
  const sizeFee = tierFee(lockMb, pricing.size_tiers, "Dung lượng lockscreen");
  const imageFee = tierFee(imageEntries.length, pricing.image_tiers, "Số ảnh");
  const textFee = tierFee(textChars, pricing.text_tiers, "Lượng văn bản");
  const amount = Math.max(10000, basePrice + sizeFee + imageFee + textFee);
  const sourceHash = await sha256Bytes(mtzBytes);
  const sourcePath = `source/${crypto.randomUUID()}/${originalName}`;
  const sb = adminClient();
  const upload = await sb.storage.from("theme-translation-private").upload(sourcePath, mtzBytes, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (upload.error) throw new Error(`Không lưu được MTZ: ${upload.error.message}`);

  const contact = clip(form.get("contact"), 160);
  const { data: created, error: createError } = await sb.rpc("m4x_create_theme_paid_order", {
    p_source_file_name: originalName,
    p_source_path: sourcePath,
    p_source_sha256: sourceHash,
    p_source_mtz_bytes: mtzBytes.length,
    p_lockscreen_entry: String(lockEntry.name),
    p_lockscreen_bytes: lockBytes.length,
    p_image_count: imageEntries.length,
    p_text_file_count: textEntries.length,
    p_text_chars: textChars,
    p_base_price: basePrice,
    p_size_fee: sizeFee,
    p_image_fee: imageFee,
    p_text_fee: textFee,
    p_amount: amount,
    p_customer_contact: contact || null,
    p_quote_minutes: Number(pricing.quote_minutes || 30),
  });
  if (createError || !created?.order_code) {
    await sb.storage.from("theme-translation-private").remove([sourcePath]).catch(() => {});
    throw new Error(createError?.message || "Không tạo được đơn dịch theme.");
  }
  const bank = bankInfo(amount, String(created.order_code));
  if (!bank.account_number) {
    await sb.from("orders").update({ status: "cancelled" }).eq("id", created.order_id);
    throw new Error("Chưa cấu hình M4X_BANK_ACCOUNT trong Edge Function Secrets.");
  }
  return {
    ok: true,
    quote: {
      file_name: originalName,
      mtz_mb: Number((mtzBytes.length / 1048576).toFixed(2)),
      lockscreen_entry: String(lockEntry.name),
      lockscreen_mb: Number(lockMb.toFixed(2)),
      images: imageEntries.length,
      text_files: textEntries.length,
      text_chars: textChars,
      base_price: basePrice,
      size_fee: sizeFee,
      image_fee: imageFee,
      text_fee: textFee,
      amount,
    },
    order: {
      job_id: created.job_id,
      order_code: created.order_code,
      access_token: created.access_token,
      amount,
      expires_at: created.expires_at,
    },
    bank,
    image_edit_enabled: imageEditEnabled,
  };
}

async function status(body: any, allowRetry = false) {
  const code = clip(body?.order_code, 40).toUpperCase();
  const token = clip(body?.access_token, 200);
  if (!code || !token) throw new Error("Thiếu mã đơn hoặc access token.");
  const sb = adminClient();
  const { data: order, error: oe } = await sb.from("orders")
    .select("id,order_code,status,amount,expires_at,paid_at")
    .eq("order_code", code).eq("access_token", token).maybeSingle();
  if (oe) throw oe;
  if (!order) return { ok: false, error: "Không tìm thấy đơn." };
  let { data: job, error: je } = await sb.from("m4x_theme_paid_jobs").select("*").eq("order_id", order.id).maybeSingle();
  if (je) throw je;
  if (!job) return { ok: false, error: "Đơn này không phải dịch vụ AI Theme." };

  if (order.status === "paid" && (job.status === "waiting_payment" || (allowRetry && job.status === "failed"))) {
    const patch: any = {
      status: "queued", progress: Math.max(Number(job.progress || 0), 1), stage: "Đã thanh toán · xếp hàng dịch",
      paid_at: job.paid_at || order.paid_at || new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
    };
    if (allowRetry) { patch.started_at = null; patch.finished_at = null; }
    const { data: updated } = await sb.from("m4x_theme_paid_jobs").update(patch)
      .eq("id", job.id).eq("status", job.status).select("*").maybeSingle();
    if (updated) {
      job = updated;
      await triggerWorker(String(job.id));
    }
  }
  if (order.status === "expired" && job.status === "waiting_payment") {
    const { data: updated } = await sb.from("m4x_theme_paid_jobs")
      .update({ status: "expired", stage: "Báo giá đã hết hạn", updated_at: new Date().toISOString() })
      .eq("id", job.id).select("*").maybeSingle();
    if (updated) job = updated;
  }
  if (order.status === "review" && job.status === "waiting_payment") {
    const { data: updated } = await sb.from("m4x_theme_paid_jobs")
      .update({ status: "review", stage: "Thanh toán cần kiểm tra", updated_at: new Date().toISOString() })
      .eq("id", job.id).select("*").maybeSingle();
    if (updated) job = updated;
  }

  let downloadUrl = "";
  if (job.status === "done" && job.result_path) {
    const { data } = await sb.storage.from("theme-translation-private").createSignedUrl(String(job.result_path), 600, {
      download: job.result_file_name || "M4X_VietHoa.mtz",
    });
    downloadUrl = data?.signedUrl || "";
  }
  return {
    ok: true,
    order: { code: order.order_code, status: order.status, amount: Number(order.amount), expires_at: order.expires_at, paid_at: order.paid_at },
    job: {
      id: job.id, status: job.status, progress: Number(job.progress || 0), stage: job.stage || "",
      source_file_name: job.source_file_name, lockscreen_mb: Number(job.lockscreen_bytes || 0) / 1048576,
      images: Number(job.image_count || 0), text_chars: Number(job.text_chars || 0),
      amount: Number(job.amount || order.amount), result_file_name: job.result_file_name || null,
      error: job.error || null, stats: job.stats || {},
    },
    bank: bankInfo(Number(order.amount), order.order_code),
    download_url: downloadUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) return json(await quote(req));
    const body = await req.json().catch(() => ({}));
    const action = clip(body?.action || "status", 30).toLowerCase();
    if (action === "pricing") {
      const p = await getPricing();
      return json({ ok: true, pricing: publicPricing(p), image_edit_enabled: env("M4X_THEME_IMAGE_EDIT_ENABLED", "false").toLowerCase() === "true" });
    }
    if (action === "status") return json(await status(body, false));
    if (action === "retry") return json(await status(body, true));
    return json({ ok: false, error: "Action không hợp lệ" }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: clip(e instanceof Error ? e.message : String(e), 1600) }, 400);
  }
});
