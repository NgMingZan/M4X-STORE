// M4X STORE V21 — PAID LOCKSCREEN WORKER
// Only translates the nested Xiaomi/HyperOS `lockscreen` component inside .mtz.
// Modes: text | scan | full
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

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
const clip = (v: unknown, n = 3500) => String(v ?? "").trim().slice(0, n);

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
function internalAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const key = secretKey();
  return !!key && auth === `Bearer ${key}`;
}
async function tg(method: string, payload: Record<string, unknown> = {}) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.description || `Telegram ${method} lỗi ${r.status}`);
  return j.result;
}
async function telegramMultipart(method: string, form: FormData) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.description || `Telegram ${method} lỗi ${r.status}`);
  return j.result;
}
async function updateJob(jobId: string, patch: Record<string, unknown>) {
  try {
    await adminClient().from("m4x_theme_translation_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  } catch (_) {}
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function mimeFromName(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
function mimeMatchesPath(mime: string, name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return mime === "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return mime === "image/jpeg";
  if (n.endsWith(".webp")) return mime === "image/webp";
  return false;
}
async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, "0")).join("");
}
function decodeXml(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function encodeXmlAttr(s: string, quote: string) {
  let out = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  out = quote === '"' ? out.replace(/"/g, "&quot;") : out.replace(/'/g, "&apos;");
  return out;
}
function encodeXmlText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const XML_ATTR_RE = /(\b(?:text|summary|title|label|description|hint|message|content|subtitle|placeholder)\s*=\s*)(["'])([\s\S]*?)\2/gi;
const XML_NODE_RE = /<(title|description|summary|label|text|hint|message|content|subtitle)\b([^>]*)>([^<]{1,500})<\/\1>/gi;
const PROP_RE = /^([^#;\s][^=:\n]{0,100})(\s*[=:]\s*)(.*)$/gm;

function looksLikeCodeOrPath(s: string) {
  const t = s.trim();
  if (!t || t.length > 500) return true;
  if (/^(?:https?:\/\/|tg:\/\/|mailto:|content:\/\/|file:\/\/)/i.test(t)) return true;
  if (/^[#@]?\$?\{?[\w.:-]+\}?$/.test(t) && !/\s/.test(t) && t.length > 12) return true;
  if (/^[A-Fa-f0-9]{6,8}$/.test(t)) return true;
  if (/^#[A-Fa-f0-9]{3,8}$/.test(t)) return true;
  if (/^[\d\s:.,+\-/%]+$/.test(t)) return true;
  if (/[\\/][\w.-]+\.(?:png|jpe?g|webp|xml|js|json|ttf|otf|mp3|ogg|wav)$/i.test(t)) return true;
  if (/\.(?:png|jpe?g|webp|xml|js|json|ttf|otf|mp3|ogg|wav)$/i.test(t) && !/\s/.test(t)) return true;
  if (/^(?:true|false|null|none|auto|match_parent|wrap_content)$/i.test(t)) return true;
  return false;
}
function shouldTranslate(s: string) {
  const t = s.trim();
  if (looksLikeCodeOrPath(t)) return false;
  if (t.length < 2) return false;
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
function applyXmlTranslations(content: string, map: Map<string, string>) {
  let changed = 0;
  let out = content.replace(XML_ATTR_RE, (m, prefix, quote, raw) => {
    const src = decodeXml(String(raw));
    const vi = map.get(src);
    if (!vi || vi === src) return m;
    changed++;
    return `${prefix}${quote}${encodeXmlAttr(vi, quote)}${quote}`;
  });
  out = out.replace(XML_NODE_RE, (m, tag, attrs, raw) => {
    const src = decodeXml(String(raw));
    const vi = map.get(src);
    if (!vi || vi === src) return m;
    changed++;
    return `<${tag}${attrs}>${encodeXmlText(vi)}</${tag}>`;
  });
  return { content: out, changed };
}
function applyPropertyTranslations(content: string, map: Map<string, string>) {
  let changed = 0;
  const out = content.replace(PROP_RE, (m, key, sep, raw) => {
    const src = String(raw).trim();
    if (!propertyKeyLooksVisible(String(key))) return m;
    const vi = map.get(src);
    if (!vi || vi === src) return m;
    changed++;
    return `${key}${sep}${vi}`;
  });
  return { content: out, changed };
}
function parseJsonLoose(text: string) {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(clean); } catch (_) {}
  const a = clean.indexOf("[");
  const b = clean.lastIndexOf("]");
  if (a >= 0 && b > a) {
    try { return JSON.parse(clean.slice(a, b + 1)); } catch (_) {}
  }
  const oa = clean.indexOf("{");
  const ob = clean.lastIndexOf("}");
  if (oa >= 0 && ob > oa) {
    try { return JSON.parse(clean.slice(oa, ob + 1)); } catch (_) {}
  }
  return null;
}
function geminiText(j: any) {
  const parts: string[] = [];
  for (const c of j?.candidates || []) for (const p of c?.content?.parts || []) if (typeof p?.text === "string") parts.push(p.text);
  return parts.join("\n").trim();
}
function openAIText(j: any) {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();
  const parts: string[] = [];
  for (const item of j?.output || []) for (const c of item?.content || []) if (typeof c?.text === "string") parts.push(c.text);
  return parts.join("\n").trim();
}
function translationPrompt(items: { i: number; s: string }[]) {
  return `Bạn là bộ máy Việt hóa theme Xiaomi/HyperOS cho M4X THEME.\n\nHãy dịch các chuỗi giao diện sau sang tiếng Việt tự nhiên.\nQUY TẮC BẮT BUỘC:\n- Chỉ dịch nội dung người dùng nhìn thấy.\n- Chuỗi đã là tiếng Việt thì giữ nguyên.\n- Giữ nguyên placeholder/biến/ký hiệu như %s, %d, {0}, {name}, $var, #var, \\n, emoji.\n- Giữ nguyên tên thương hiệu/tên riêng: M4X, M4X THEME, M4X STORE, Xiaomi, MIUI, HyperOS, Android, Telegram, Google, YouTube, Spotify, Canva, CapCut, Netflix, ChatGPT.\n- Không tự thêm giải thích, không đổi số, không đổi đường dẫn.\n- Trả về DUY NHẤT JSON array theo dạng [{"i":0,"vi":"..."}].\n\nDỮ LIỆU:\n${JSON.stringify(items)}`;
}
async function translateGemini(items: { i: number; s: string }[]) {
  const key = env("GEMINI_API_KEY");
  if (!key) return null;
  const model = env("GEMINI_THEME_MODEL", "gemini-3.1-flash-lite");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: translationPrompt(items) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gemini dịch lỗi ${r.status}`);
  const parsed = parseJsonLoose(geminiText(j));
  if (!Array.isArray(parsed)) throw new Error("Gemini không trả JSON bản dịch hợp lệ.");
  return { rows: parsed, provider: "gemini", model };
}
async function translateOpenAI(items: { i: number; s: string }[]) {
  const key = env("OPENAI_API_KEY");
  if (!key) return null;
  const model = env("OPENAI_MODEL", "gpt-5.6-luna");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: translationPrompt(items), max_output_tokens: 4096 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI dịch lỗi ${r.status}`);
  const parsed = parseJsonLoose(openAIText(j));
  if (!Array.isArray(parsed)) throw new Error("OpenAI không trả JSON bản dịch hợp lệ.");
  return { rows: parsed, provider: "openai", model };
}
async function translateUniqueStrings(strings: string[]) {
  const sb = adminClient();
  const targetLang = "vi";
  const map = new Map<string, string>();
  let cacheHits = 0, aiTranslated = 0;
  const hashes = new Map<string, string>();
  for (const s of strings) hashes.set(s, await sha256Hex(`${targetLang}\u0000${s}`));

  const hashList = Array.from(hashes.values());
  for (let i = 0; i < hashList.length; i += 100) {
    const part = hashList.slice(i, i + 100);
    try {
      const { data } = await sb.from("m4x_theme_translation_memory").select("source_hash,source_text,translated_text").in("source_hash", part).eq("target_lang", targetLang);
      for (const row of data || []) {
        if (row?.source_text && row?.translated_text) {
          map.set(String(row.source_text), String(row.translated_text));
          cacheHits++;
        }
      }
    } catch (_) {}
  }

  const missing = strings.filter(s => !map.has(s));
  const charLimit = Math.max(2000, Number(env("M4X_THEME_BATCH_CHARS", "9000")) || 9000);
  const maxItems = Math.max(10, Number(env("M4X_THEME_BATCH_ITEMS", "55")) || 55);
  let cursor = 0;
  while (cursor < missing.length) {
    const batch: string[] = [];
    let chars = 0;
    while (cursor < missing.length && batch.length < maxItems) {
      const s = missing[cursor];
      if (batch.length && chars + s.length > charLimit) break;
      batch.push(s); chars += s.length; cursor++;
    }
    const indexed = batch.map((s, i) => ({ i, s }));
    let result: any = null;
    const errors: string[] = [];
    try { result = await translateGemini(indexed); } catch (e) { errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`); }
    if (!result) {
      try { result = await translateOpenAI(indexed); } catch (e) { errors.push(`OpenAI: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (!result) throw new Error(`Không có AI dịch khả dụng. ${errors.join(" | ")}`);

    const rowsByIndex = new Map<number, string>();
    for (const row of result.rows || []) {
      const idx = Number(row?.i);
      const vi = clip(row?.vi, 1000);
      if (Number.isInteger(idx) && idx >= 0 && idx < batch.length && vi) rowsByIndex.set(idx, vi);
    }
    const memoryRows: any[] = [];
    for (let i = 0; i < batch.length; i++) {
      const src = batch[i];
      const vi = rowsByIndex.get(i) || src;
      map.set(src, vi);
      if (vi !== src) aiTranslated++;
      memoryRows.push({
        source_hash: hashes.get(src), source_text: src, target_lang: targetLang,
        translated_text: vi, provider: result.provider, model: result.model,
        updated_at: new Date().toISOString(),
      });
    }
    try { await sb.from("m4x_theme_translation_memory").upsert(memoryRows, { onConflict: "source_hash,target_lang" }); } catch (_) {}
  }
  return { map, cacheHits, aiTranslated };
}

async function getTelegramFile(fileId: string) {
  const info = await tg("getFile", { file_id: fileId });
  const path = String(info?.file_path || "");
  if (!path) throw new Error("Telegram không trả file_path cho MTZ.");
  const token = env("TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!r.ok) throw new Error(`Không tải được MTZ từ Telegram (${r.status}).`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return bytes;
}

async function inspectImage(bytes: Uint8Array, mime: string) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("Thiếu GEMINI_API_KEY để quét chữ trong ảnh.");
  const model = env("GEMINI_THEME_VISION_MODEL", "gemini-3.1-flash-lite");
  const prompt = `Phân tích ảnh asset của theme Xiaomi/HyperOS. Chỉ quan tâm chữ hiển thị trực tiếp trong ảnh. Trả DUY NHẤT JSON object: {"has_text":boolean,"has_non_vietnamese_text":boolean,"texts":[{"src":"chữ gốc","vi":"bản dịch tiếng Việt"}]}. Không coi số giờ, phần trăm pin, logo thương hiệu hoặc ký hiệu đơn lẻ là nội dung cần dịch. Nếu chữ đã là tiếng Việt thì has_non_vietnamese_text=false.`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: bytesToBase64(bytes) } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 700, responseMimeType: "application/json" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gemini Vision lỗi ${r.status}`);
  const parsed = parseJsonLoose(geminiText(j));
  if (!parsed || Array.isArray(parsed)) return { has_text: false, has_non_vietnamese_text: false, texts: [] };
  return {
    has_text: !!parsed.has_text,
    has_non_vietnamese_text: !!parsed.has_non_vietnamese_text,
    texts: Array.isArray(parsed.texts) ? parsed.texts.slice(0, 20) : [],
  };
}
function extractInteractionImage(j: any): { bytes: Uint8Array; mime: string } | null {
  const direct = j?.output_image || j?.outputImage;
  if (direct?.data) return { bytes: base64ToBytes(String(direct.data)), mime: String(direct.mime_type || direct.mimeType || "image/png") };
  for (const step of j?.steps || []) {
    for (const b of step?.content || []) {
      if (b?.type === "image" && b?.data) return { bytes: base64ToBytes(String(b.data)), mime: String(b.mime_type || b.mimeType || "image/png") };
    }
  }
  return null;
}
async function editImageToVietnamese(bytes: Uint8Array, mime: string, scan: any) {
  if (env("M4X_THEME_IMAGE_EDIT_ENABLED", "false").toLowerCase() !== "true") {
    throw new Error("Chế độ sửa ảnh đang khóa. Thêm Secret M4X_THEME_IMAGE_EDIT_ENABLED=true để bật.");
  }
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("Thiếu GEMINI_API_KEY.");
  const model = env("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-lite-image");
  const pairs = (scan?.texts || []).map((x: any) => `${clip(x?.src, 120)} -> ${clip(x?.vi, 160)}`).filter(Boolean).join("\n");
  const prompt = `Đây là một ảnh asset thuộc theme Xiaomi/HyperOS mà người dùng có quyền chỉnh sửa. Hãy CHỈ thay các chữ không phải tiếng Việt thành tiếng Việt, giữ nguyên toàn bộ bố cục, hình nền, biểu tượng, màu sắc, font style, kích thước, vị trí, hiệu ứng, độ trong suốt và tỷ lệ ảnh. Không thêm hoặc xóa chi tiết khác. Không đổi logo/tên thương hiệu. Không dịch số giờ, phần trăm pin hoặc ký hiệu. Nếu có thể hãy dùng đúng các cặp sau:\n${pairs || "Dịch chữ giao diện sang tiếng Việt tự nhiên."}\nƯu tiên giữ ảnh giống bản gốc tối đa.`;
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ type: "text", text: prompt }, { type: "image", mime_type: mime, data: bytesToBase64(bytes) }],
      response_format: { type: "image" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gemini Image lỗi ${r.status}`);
  const out = extractInteractionImage(j);
  if (!out?.bytes?.length) throw new Error("Gemini Image không trả ảnh đã sửa.");
  return { ...out, model };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function outputName(source: string) {
  const base = source.replace(/\.mtz$/i, "").replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 80) || "M4X_THEME";
  return `${base}_M4X_VietHoa.mtz`;
}

async function sha256FileBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function updatePaidJob(jobId: string, patch: Record<string, unknown>) {
  const { error } = await adminClient().from("m4x_theme_paid_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw error;
}
async function ownerNotify(text: string) {
  const owner = env("TELEGRAM_OWNER_ID").trim();
  if (!owner || !env("TELEGRAM_BOT_TOKEN")) return;
  try { await tg("sendMessage", { chat_id: owner, text: clip(text, 3500) }); } catch (_) {}
}


async function continuePaidJob(jobId: string) {
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = secretKey();
  if (!base || !key) throw new Error("Thiếu cấu hình tự chạy tiếp worker.");
  const task = fetch(`${base}/functions/v1/m4x-theme-paid-worker`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(e => console.error("V22 continue worker failed", e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task); else await task;
}

async function queuePaidJob(jobId: string, patch: Record<string, unknown>) {
  await updatePaidJob(jobId, { ...patch, status: "queued" });
  await continuePaidJob(jobId);
}

async function inspectImageBatch(items: Array<{ index: number; bytes: Uint8Array; mime: string }>) {
  if (!items.length) return [];
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("Thiếu GEMINI_API_KEY để quét chữ trong ảnh.");
  const model = env("GEMINI_THEME_VISION_MODEL", "gemini-3.1-flash-lite");
  const prompt = `Kiểm tra nhiều ảnh chỉ thuộc LOCKSCREEN của theme Xiaomi/HyperOS.
Mỗi ảnh có IMAGE_INDEX riêng.
Chỉ phát hiện chữ hiển thị trực tiếp.
Bỏ qua số giờ, phần trăm pin, logo thương hiệu và ký hiệu đơn lẻ.
Nếu ảnh không có chữ hoặc chữ đã là tiếng Việt thì has_non_vietnamese_text=false.
Trả DUY NHẤT JSON array:
{"index":number,"has_text":boolean,"has_non_vietnamese_text":boolean,"texts":[{"src":"chữ gốc","vi":"bản dịch tiếng Việt"}]}.
Phải trả đủ INDEX đã gửi.`;

  const parts: any[] = [{ text: prompt }];
  for (const item of items) {
    parts.push({ text: `IMAGE_INDEX=${item.index}` });
    parts.push({ inlineData: { mimeType: item.mime, data: bytesToBase64(item.bytes) } });
  }

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: "application/json" },
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gemini Vision batch lỗi ${r.status}`);
  const parsed = parseJsonLoose(geminiText(j));
  if (!Array.isArray(parsed)) throw new Error("Gemini batch không trả JSON array.");

  const byIndex = new Map<number, any>();
  for (const x of parsed) {
    const idx = Number(x?.index);
    if (!Number.isFinite(idx)) continue;
    byIndex.set(idx, {
      has_text: !!x?.has_text,
      has_non_vietnamese_text: !!x?.has_non_vietnamese_text,
      texts: Array.isArray(x?.texts) ? x.texts.slice(0, 20) : [],
    });
  }

  return items.map(item => ({
    index: item.index,
    scan: byIndex.get(item.index) || { has_text: false, has_non_vietnamese_text: false, texts: [] },
  }));
}

async function processPaidJob(jobId: string) {
  const sb = adminClient();
  const { data: job, error: loadError } = await sb.from("m4x_theme_paid_jobs").select("*").eq("id", jobId).maybeSingle();
  if (loadError) throw loadError;
  if (!job) throw new Error("Không tìm thấy job V22.");

  const rawMode = String(job.mode || "full").toLowerCase();
  const mode = ["text", "scan", "full"].includes(rawMode) ? rawMode : "full";
  const oldStats = (job.stats && typeof job.stats === "object") ? job.stats : {};
  const stats: any = {
    mode,
    phase: oldStats.phase || "init",
    files: Number(oldStats.files || 0),
    text_files: Number(oldStats.text_files || 0),
    unique_strings: Number(oldStats.unique_strings || 0),
    replacements: Number(oldStats.replacements || 0),
    cache_hits: Number(oldStats.cache_hits || 0),
    ai_translated: Number(oldStats.ai_translated || 0),
    images_scanned: Number(oldStats.images_scanned || 0),
    images_with_text: Number(oldStats.images_with_text || 0),
    images_edited: Number(oldStats.images_edited || 0),
    images_skipped: Number(oldStats.images_skipped || 0),
    image_names: Array.isArray(oldStats.image_names) ? oldStats.image_names : [],
    foreign_images: Array.isArray(oldStats.foreign_images) ? oldStats.foreign_images : [],
    scan_cursor: Number(oldStats.scan_cursor || 0),
    edit_cursor: Number(oldStats.edit_cursor || 0),
    warnings: Array.isArray(oldStats.warnings) ? oldStats.warnings : [],
  };
  const workPath = `work/${job.id}/lockscreen.zip`;

  try {
    if (stats.phase === "init") {
      await updatePaidJob(jobId,{progress:5,stage:"Đang mở MTZ và component lockscreen",stats});
      const dl=await sb.storage.from("theme-translation-private").download(String(job.source_path));
      if(dl.error||!dl.data)throw new Error(`Không tải được file nguồn: ${dl.error?.message||"unknown"}`);
      const input=new Uint8Array(await dl.data.arrayBuffer());
      if((await sha256FileBytes(input))!==String(job.source_sha256))throw new Error("Hash file nguồn không khớp báo giá.");

      let outerZip:JSZip;
      try{outerZip=await JSZip.loadAsync(input)}catch(_){throw new Error("MTZ/ZIP nguồn bị lỗi.")}
      const outerEntries=Object.values(outerZip.files).filter((f:any)=>!f.dir) as any[];
      const lockscreenEntry=outerEntries.find((e:any)=>String(e.name)===String(job.lockscreen_entry))
        ||outerEntries.find((e:any)=>/(?:^|\/)lockscreen(?:\.zip)?$/i.test(String(e.name)))
        ||outerEntries.find((e:any)=>/(?:^|\/)lockscreen[^/]*$/i.test(String(e.name)));
      if(!lockscreenEntry)throw new Error("Không tìm thấy component lockscreen.");

      const lockscreenBytes=await lockscreenEntry.async("uint8array");
      const maxMb=Math.max(1,Number(env("M4X_THEME_MAX_MB","60"))||60);
      if(lockscreenBytes.length>maxMb*1024*1024)throw new Error(`Lockscreen vượt ${maxMb}MB.`);

      let zip:JSZip;
      try{zip=await JSZip.loadAsync(lockscreenBytes)}catch(_){throw new Error("Component lockscreen không phải ZIP hợp lệ.")}
      const entries=Object.values(zip.files).filter((f:any)=>!f.dir) as any[];
      stats.files=entries.length;

      await updatePaidJob(jobId,{progress:12,stage:"Đang tìm văn bản XML/config trong lockscreen",stats});
      const textEntries=entries.filter((e:any)=>{
        const n=String(e.name||"");
        return /\.(?:xml|properties|ini|conf|cfg|txt)$/i.test(n)
          ||/(?:^|\/)(?:manifest|config|settings?|strings?)(?:\.[^/]*)?$/i.test(n);
      });
      stats.text_files=textEntries.length;

      const originals=new Map<string,string>();
      const unique=new Set<string>();
      for(const e of textEntries){
        let content="";
        try{content=await e.async("string")}catch(_){continue}
        originals.set(e.name,content);
        if(/\.xml$/i.test(e.name))collectStringsFromXml(content,unique);
        else collectStringsFromProperties(content,unique);
      }
      stats.unique_strings=unique.size;

      await updatePaidJob(jobId,{progress:20,stage:`Đang AI dịch ${stats.unique_strings} chuỗi văn bản`,stats});
      const translated=await translateUniqueStrings(Array.from(unique));
      stats.cache_hits=translated.cacheHits;
      stats.ai_translated=translated.aiTranslated;

      for(const e of textEntries){
        const content=originals.get(e.name);
        if(content==null)continue;
        const result=/\.xml$/i.test(e.name)?applyXmlTranslations(content,translated.map):applyPropertyTranslations(content,translated.map);
        if(result.changed){zip.file(e.name,result.content);stats.replacements+=result.changed}
      }

      stats.image_names=entries.filter((e:any)=>/\.(?:png|jpe?g|webp)$/i.test(String(e.name||""))).map((e:any)=>String(e.name)).slice(0,1000);
      stats.scan_cursor=0;stats.edit_cursor=0;stats.foreign_images=[];stats.images_scanned=0;stats.images_with_text=0;stats.images_edited=0;

      const workBytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
      const up=await sb.storage.from("theme-translation-private").upload(workPath,workBytes,{contentType:"application/zip",upsert:true});
      if(up.error)throw new Error(`Không lưu được lockscreen tạm: ${up.error.message}`);

      stats.phase=mode==="text"?"final":"scan";
      await queuePaidJob(jobId,{progress:mode==="text"?90:35,stage:mode==="text"?"Đã dịch văn bản · chuẩn bị đóng gói":`Đã dịch văn bản · chuẩn bị quét ${stats.image_names.length} ảnh trong lockscreen`,stats});
      return;
    }

    if(stats.phase==="scan"){
      const names=stats.image_names.slice(0,1000),cursor=Math.max(0,stats.scan_cursor);
      if(cursor>=names.length){
        stats.phase=mode==="scan"?"final":"edit";stats.edit_cursor=0;
        await queuePaidJob(jobId,{progress:mode==="scan"?90:68,stage:mode==="scan"?"Đã quét ảnh · chuẩn bị đóng gói":`Phát hiện ${stats.foreign_images.length} ảnh có chữ ngoại ngữ`,stats});
        return;
      }

      const dl=await sb.storage.from("theme-translation-private").download(workPath);
      if(dl.error||!dl.data)throw new Error("Không tải được lockscreen tạm để quét ảnh.");
      const zip=await JSZip.loadAsync(new Uint8Array(await dl.data.arrayBuffer()));
      const chunkNames=names.slice(cursor,cursor+60);
      const imageMaxBytes=Math.max(256*1024,(Number(env("M4X_THEME_IMAGE_INPUT_MAX_MB","3.5"))||3.5)*1024*1024);

      const prepared=await mapLimit(chunkNames,4,async(name:string,localIndex:number)=>{
        const entry=zip.file(name);
        if(!entry)return{index:cursor+localIndex,name,bytes:null,mime:mimeFromName(name),skip:"Không tìm thấy ảnh"};
        try{
          const bytes=await entry.async("uint8array");
          if(bytes.length>imageMaxBytes)return{index:cursor+localIndex,name,bytes,mime:mimeFromName(name),skip:"Ảnh quá lớn để quét"};
          return{index:cursor+localIndex,name,bytes,mime:mimeFromName(name),skip:""};
        }catch(e){
          return{index:cursor+localIndex,name,bytes:null,mime:mimeFromName(name),skip:clip(e instanceof Error?e.message:String(e),200)};
        }
      });

      const ready=prepared.filter((x:any)=>x.bytes&&!x.skip);
      const batches:any[][]=[];let batch:any[]=[];let batchBytes=0;
      for(const item of ready){
        const size=Number(item.bytes?.length||0);
        if(batch.length&&(batch.length>=6||batchBytes+size>5*1024*1024)){batches.push(batch);batch=[];batchBytes=0}
        batch.push(item);batchBytes+=size;
      }
      if(batch.length)batches.push(batch);

      const scanMap=new Map<number,any>();
      const groups=await mapLimit(batches,2,async(items:any[])=>{
        try{return await inspectImageBatch(items.map(x=>({index:x.index,bytes:x.bytes,mime:x.mime})))}
        catch(_){return await mapLimit(items,2,async(x:any)=>({index:x.index,scan:await inspectImage(x.bytes,x.mime)}))}
      });
      for(const group of groups)for(const item of group)scanMap.set(Number(item.index),item.scan);

      const foreignMap=new Map(stats.foreign_images.map((x:any)=>[String(x.name),x]));
      for(const item of prepared){
        if(item.skip){stats.images_skipped++;continue}
        const scan=scanMap.get(Number(item.index));
        if(!scan)continue;
        stats.images_scanned++;
        if(scan.has_non_vietnamese_text)foreignMap.set(String(item.name),{name:String(item.name),texts:Array.isArray(scan.texts)?scan.texts.slice(0,20):[]});
      }

      stats.foreign_images=Array.from(foreignMap.values());
      stats.images_with_text=stats.foreign_images.length;
      stats.scan_cursor=cursor+chunkNames.length;
      const progress=Math.min(66,36+Math.round((stats.scan_cursor/Math.max(1,names.length))*30));

      await queuePaidJob(jobId,{progress,stage:`🔎 Đã quét ${Math.min(stats.scan_cursor,names.length)}/${names.length} ảnh · phát hiện ${stats.images_with_text} ảnh có chữ ngoại ngữ`,stats});
      return;
    }

    if(stats.phase==="edit"){
      const foreign=stats.foreign_images,cursor=Math.max(0,stats.edit_cursor);
      if(cursor>=foreign.length){
        stats.phase="final";
        await queuePaidJob(jobId,{progress:92,stage:"Đã Việt hóa ảnh có chữ ngoại ngữ · chuẩn bị đóng gói",stats});
        return;
      }

      if(env("M4X_THEME_IMAGE_EDIT_ENABLED","false").toLowerCase()!=="true")throw new Error("M4X_THEME_IMAGE_EDIT_ENABLED chưa bật.");

      const dl=await sb.storage.from("theme-translation-private").download(workPath);
      if(dl.error||!dl.data)throw new Error("Không tải được lockscreen tạm để sửa ảnh.");
      const zip=await JSZip.loadAsync(new Uint8Array(await dl.data.arrayBuffer()));
      const chunk=foreign.slice(cursor,cursor+4);

      const edited=await mapLimit(chunk,2,async(info:any)=>{
        try{
          const entry=zip.file(String(info.name));
          if(!entry)throw new Error("Không tìm thấy ảnh trong lockscreen.");
          const bytes=await entry.async("uint8array");
          const srcMime=mimeFromName(String(info.name));
          const out=await editImageToVietnamese(bytes,srcMime,{texts:info.texts||[]});
          if(!mimeMatchesPath(out.mime,String(info.name)))throw new Error(`AI trả ${out.mime}, khác định dạng ảnh gốc.`);
          return{ok:true,name:String(info.name),bytes:out.bytes};
        }catch(e){return{ok:false,name:String(info.name),error:clip(e instanceof Error?e.message:String(e),240)}}
      });

      for(const item of edited){
        if(item.ok){zip.file(item.name,item.bytes);stats.images_edited++}
        else{stats.images_skipped++;stats.warnings.push(`${item.name}: ${item.error}`)}
      }

      stats.edit_cursor=cursor+chunk.length;
      const workBytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
      const up=await sb.storage.from("theme-translation-private").upload(workPath,workBytes,{contentType:"application/zip",upsert:true});
      if(up.error)throw new Error(`Không lưu được lockscreen đang sửa: ${up.error.message}`);

      const progress=Math.min(91,69+Math.round((stats.edit_cursor/Math.max(1,foreign.length))*22));
      await queuePaidJob(jobId,{progress,stage:`🖼 Đã sửa ${Math.min(stats.edit_cursor,foreign.length)}/${foreign.length} ảnh có chữ ngoại ngữ`,stats});
      return;
    }

    if(stats.phase==="final"){
      await updatePaidJob(jobId,{progress:94,stage:"Đang đóng gói lại MTZ",stats});
      const [srcDl,workDl]=await Promise.all([
        sb.storage.from("theme-translation-private").download(String(job.source_path)),
        sb.storage.from("theme-translation-private").download(workPath)
      ]);
      if(srcDl.error||!srcDl.data)throw new Error("Không tải được MTZ nguồn để đóng gói.");
      if(workDl.error||!workDl.data)throw new Error("Không tải được lockscreen đã Việt hóa.");

      const outerZip=await JSZip.loadAsync(new Uint8Array(await srcDl.data.arrayBuffer()));
      const rebuiltLockscreen=new Uint8Array(await workDl.data.arrayBuffer());
      const outerEntries=Object.values(outerZip.files).filter((f:any)=>!f.dir) as any[];
      const lockscreenEntry=outerEntries.find((e:any)=>String(e.name)===String(job.lockscreen_entry))
        ||outerEntries.find((e:any)=>/(?:^|\/)lockscreen(?:\.zip)?$/i.test(String(e.name)))
        ||outerEntries.find((e:any)=>/(?:^|\/)lockscreen[^/]*$/i.test(String(e.name)));
      if(!lockscreenEntry)throw new Error("Không tìm thấy lockscreen khi đóng gói.");

      outerZip.file(String(lockscreenEntry.name),rebuiltLockscreen);
      outerZip.file("M4X_TRANSLATION_REPORT.json",JSON.stringify({
        app:"M4X AI THEME V22",source:job.source_file_name,order_code:job.order_code,created_at:new Date().toISOString(),
        policy:{scope:"lockscreen_only",translate_text:true,scan_images:true,edit_only_non_vietnamese_text_images:true},stats
      },null,2));

      const output=await outerZip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
      const outName=outputName(String(job.source_file_name));
      const resultPath=`result/${job.id}/${outName}`;
      if(job.result_path)await sb.storage.from("theme-translation-private").remove([String(job.result_path)]).catch(()=>{});
      const up=await sb.storage.from("theme-translation-private").upload(resultPath,output,{contentType:"application/octet-stream",upsert:true});
      if(up.error)throw new Error(`Không lưu được file kết quả: ${up.error.message}`);

      stats.phase="done";
      await updatePaidJob(jobId,{status:"done",progress:100,stage:"Hoàn tất · sẵn sàng tải",stats,result_path:resultPath,result_file_name:outName,error:null,finished_at:new Date().toISOString()});
      await sb.storage.from("theme-translation-private").remove([workPath]).catch(()=>{});
      await ownerNotify(`✅ V22 ĐÃ DỊCH XONG\n\nĐơn: ${job.order_code}\nFile: ${job.source_file_name}\nText thay: ${stats.replacements}\nẢnh quét: ${stats.images_scanned}\nẢnh có chữ ngoại ngữ: ${stats.images_with_text}\nẢnh sửa: ${stats.images_edited}`);
      return;
    }

    throw new Error(`Phase V22 không hợp lệ: ${stats.phase}`);
  }catch(e){
    const message=clip(e instanceof Error?e.message:String(e),1800);
    stats.warnings.push(message);
    await updatePaidJob(jobId,{status:"failed",stage:"Dịch thất bại",error:message,stats,finished_at:new Date().toISOString()}).catch(()=>{});
    await ownerNotify(`❌ V22 DỊCH THẤT BẠI\n\nĐơn: ${job.order_code}\nFile: ${job.source_file_name}\nLỗi: ${message}`);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!internalAuthorized(req)) return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = clip(body?.job_id, 80);
    if (!jobId) throw new Error("Thiếu job_id.");
    const sb = adminClient();
    const { data: claimed, error } = await sb.rpc("m4x_claim_theme_paid_job", { p_job_id: jobId });
    if (error) throw error;
    if (!claimed) return json({ ok: true, claimed: false, message: "Job đã được worker khác nhận hoặc không ở trạng thái queued." });
    await processPaidJob(jobId);
    return json({ ok: true, claimed: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: clip(e instanceof Error ? e.message : String(e), 1800) }, 500);
  }
});
