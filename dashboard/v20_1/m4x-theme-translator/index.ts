// M4X STORE V20.1 — AI THEME TRANSLATOR (LOCKSCREEN ONLY)
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

async function processThemeJob(payload: any) {
  const jobId = String(payload?.job_id || "");
  const chatId = String(payload?.chat_id || "");
  const userId = String(payload?.user_id || "");
  const fileId = String(payload?.file_id || "");
  const fileName = clip(payload?.file_name || "theme.mtz", 120);
  const mode = ["text", "scan", "full"].includes(String(payload?.mode)) ? String(payload.mode) : "text";
  if (!jobId || !chatId || !userId || !fileId) throw new Error("Thiếu dữ liệu job dịch theme.");

  const stats: any = {
    mode, files: 0, text_files: 0, unique_strings: 0, replacements: 0,
    cache_hits: 0, ai_translated: 0, images_scanned: 0, images_with_text: 0,
    images_edited: 0, images_skipped: 0, warnings: [], image_texts: [],
  };
  try {
    await updateJob(jobId, { status: "running", started_at: new Date().toISOString(), stats });
    await tg("sendMessage", { chat_id: chatId, text: `🔒 AI DỊCH LOCKSCREEN — V20.1\n\n⏳ Đang tải MTZ và mở component lockscreen:\n${fileName}\n\nChế độ: ${mode === "text" ? "⚡ Văn bản" : mode === "scan" ? "🔎 Văn bản + quét ảnh" : "🖼 Full văn bản + ảnh"}` });

    const input = await getTelegramFile(fileId);
    const maxMb = Math.max(3, Number(env("M4X_THEME_MAX_MB", "18")) || 18);
    if (input.length > maxMb * 1024 * 1024) throw new Error(`MTZ ${(input.length / 1024 / 1024).toFixed(1)}MB vượt giới hạn ${maxMb}MB của V20.`);

    // Xiaomi MTZ stores the lock screen as a nested ZIP component usually named exactly `lockscreen`.
    // V20 scanned only the outer MTZ, which is why many themes showed 0 strings.
    let outerZip: JSZip;
    try { outerZip = await JSZip.loadAsync(input); } catch (_) { throw new Error("File không phải MTZ/ZIP hợp lệ hoặc archive bị lỗi."); }
    const outerEntries = Object.values(outerZip.files).filter((f: any) => !f.dir) as any[];
    stats.outer_files = outerEntries.length;

    const lockscreenEntry = outerEntries.find((e: any) => /(?:^|\/)lockscreen(?:\.zip)?$/i.test(String(e.name)))
      || outerEntries.find((e: any) => /(?:^|\/)lockscreen[^/]*$/i.test(String(e.name)));
    if (!lockscreenEntry) {
      throw new Error("Không tìm thấy component `lockscreen` bên trong MTZ. Theme này có thể dùng cấu trúc khác.");
    }
    stats.lockscreen_entry = String(lockscreenEntry.name);

    let lockscreenBytes: Uint8Array;
    try { lockscreenBytes = await lockscreenEntry.async("uint8array"); } catch (_) { throw new Error("Không đọc được component lockscreen trong MTZ."); }

    let zip: JSZip;
    try { zip = await JSZip.loadAsync(lockscreenBytes); } catch (_) {
      throw new Error("Đã thấy file lockscreen nhưng nó không phải archive ZIP hợp lệ. Không sửa để tránh làm hỏng theme.");
    }

    const entries = Object.values(zip.files).filter((f: any) => !f.dir) as any[];
    stats.files = entries.length;
    const maxFiles = Math.max(200, Number(env("M4X_THEME_MAX_FILES", "5000")) || 5000);
    if (entries.length > maxFiles) throw new Error(`Lockscreen có ${entries.length} file, vượt giới hạn an toàn ${maxFiles}.`);

    const textEntries = entries.filter((e: any) => {
      const n = String(e.name || "");
      return /\.(?:xml|properties|ini|conf|cfg|txt)$/i.test(n)
        || /(?:^|\/)(?:manifest|config|settings?|strings?)(?:\.[^/]*)?$/i.test(n);
    });
    stats.text_files = textEntries.length;
    const originals = new Map<string, string>();
    const unique = new Set<string>();
    for (const e of textEntries) {
      let content = "";
      try { content = await e.async("string"); } catch (_) { continue; }
      originals.set(e.name, content);
      if (/\.xml$/i.test(e.name)) collectStringsFromXml(content, unique);
      else collectStringsFromProperties(content, unique);
    }
    stats.unique_strings = unique.size;

    await tg("sendMessage", { chat_id: chatId, text: `📄 Đã quét ${stats.text_files} file văn bản\n🔤 ${stats.unique_strings} chuỗi cần kiểm tra\n\n🧠 Đang dịch và dùng cache để tiết kiệm token...` });
    const translated = await translateUniqueStrings(Array.from(unique));
    stats.cache_hits = translated.cacheHits;
    stats.ai_translated = translated.aiTranslated;

    for (const e of textEntries) {
      const content = originals.get(e.name);
      if (content == null) continue;
      const result = /\.xml$/i.test(e.name) ? applyXmlTranslations(content, translated.map) : applyPropertyTranslations(content, translated.map);
      if (result.changed) {
        zip.file(e.name, result.content);
        stats.replacements += result.changed;
      }
    }

    if (mode === "scan" || mode === "full") {
      const imageMaxBytes = Math.max(256 * 1024, (Number(env("M4X_THEME_IMAGE_INPUT_MAX_MB", "2.5")) || 2.5) * 1024 * 1024);
      const scanMax = Math.max(1, Number(env("M4X_THEME_IMAGE_SCAN_MAX", "20")) || 20);
      const imageEntries = entries
        .filter((e: any) => /\.(?:png|jpe?g|webp)$/i.test(e.name))
        .slice(0, scanMax);
      await tg("sendMessage", { chat_id: chatId, text: `🖼 Đang quét chữ trong ảnh (${imageEntries.length} ảnh tối đa)...` });

      const scanned = await mapLimit(imageEntries, 2, async (e: any) => {
        try {
          const bytes = await e.async("uint8array");
          if (bytes.length > imageMaxBytes) return { name: e.name, bytes, scan: null, skip: "Ảnh quá lớn để quét" };
          const scan = await inspectImage(bytes, mimeFromName(e.name));
          return { name: e.name, bytes, scan, skip: "" };
        } catch (err) {
          return { name: e.name, bytes: null, scan: null, skip: clip(err instanceof Error ? err.message : String(err), 220) };
        }
      });
      stats.images_scanned = scanned.filter((x: any) => x.scan).length;
      const foreign = scanned.filter((x: any) => x.scan?.has_non_vietnamese_text);
      stats.images_with_text = foreign.length;
      stats.image_texts = foreign.slice(0, 12).map((x: any) => ({ name: x.name, texts: x.scan?.texts || [] }));
      stats.images_skipped += scanned.filter((x: any) => x.skip).length;

      if (mode === "full" && foreign.length) {
        if (env("M4X_THEME_IMAGE_EDIT_ENABLED", "false").toLowerCase() !== "true") {
          stats.warnings.push("Phát hiện ảnh có chữ nhưng chưa sửa vì M4X_THEME_IMAGE_EDIT_ENABLED chưa bật.");
        } else {
          const editMax = Math.max(1, Number(env("M4X_THEME_IMAGE_EDIT_MAX", "4")) || 4);
          const toEdit = foreign.slice(0, editMax);
          await tg("sendMessage", { chat_id: chatId, text: `🎨 Phát hiện ${foreign.length} ảnh có chữ cần dịch.\nĐang sửa tối đa ${toEdit.length} ảnh theo giới hạn an toàn...` });
          for (const item of toEdit) {
            try {
              if (!item.bytes) continue;
              const srcMime = mimeFromName(item.name);
              const edited = await editImageToVietnamese(item.bytes, srcMime, item.scan);
              if (!mimeMatchesPath(edited.mime, item.name)) {
                stats.images_skipped++;
                stats.warnings.push(`${item.name}: AI trả ${edited.mime}, khác định dạng gốc nên giữ ảnh cũ.`);
                continue;
              }
              zip.file(item.name, edited.bytes);
              stats.images_edited++;
            } catch (err) {
              stats.images_skipped++;
              stats.warnings.push(`${item.name}: ${clip(err instanceof Error ? err.message : String(err), 180)}`);
            }
          }
          if (foreign.length > editMax) stats.warnings.push(`Còn ${foreign.length - editMax} ảnh có chữ chưa sửa do giới hạn M4X_THEME_IMAGE_EDIT_MAX=${editMax}.`);
        }
      }
    }

    const report = {
      app: "M4X AI THEME TRANSLATOR V20.1 — LOCKSCREEN ONLY",
      source: fileName,
      mode,
      created_at: new Date().toISOString(),
      stats,
      note: "V20.1 chỉ mở và Việt hóa component lockscreen; các component khác của MTZ được giữ nguyên. ID, biến, path và expression được giữ nguyên theo bộ lọc an toàn.",
    };

    // Rebuild ONLY the nested lockscreen component, then put it back into the original MTZ.
    const rebuiltLockscreen = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    outerZip.file(String(lockscreenEntry.name), rebuiltLockscreen);
    outerZip.file("M4X_TRANSLATION_REPORT.json", JSON.stringify(report, null, 2));

    await tg("sendMessage", { chat_id: chatId, text: "📦 Đang đóng gói lại lockscreen vào MTZ..." });
    const output = await outerZip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const outName = outputName(fileName);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("document", new Blob([output], { type: "application/octet-stream" }), outName);
    const summary = `✅ VIỆT HÓA LOCKSCREEN HOÀN TẤT\n\n🔒 ${stats.lockscreen_entry || "lockscreen"} · ${stats.files} file bên trong\n📄 ${stats.text_files} file text · ${stats.unique_strings} chuỗi\n✍️ ${stats.replacements} vị trí đã thay\n♻️ Cache: ${stats.cache_hits} · AI mới: ${stats.ai_translated}\n🖼 Quét: ${stats.images_scanned} · Có chữ cần dịch: ${stats.images_with_text} · Đã sửa: ${stats.images_edited}\n${stats.warnings.length ? `⚠️ ${stats.warnings.length} cảnh báo — xem M4X_TRANSLATION_REPORT.json trong MTZ` : "✅ Không có cảnh báo lớn"}`;
    form.append("caption", clip(summary, 950));
    await telegramMultipart("sendDocument", form);
    await updateJob(jobId, {
      status: "done", stats, result_file_name: outName,
      finished_at: new Date().toISOString(), error: null,
    });
    try { await adminClient().from("telegram_admin_sessions").delete().eq("telegram_user_id", userId); } catch (_) {}
    await tg("sendMessage", { chat_id: chatId, text: "🤖 Gõ /admin để quay lại menu quản trị.", reply_markup: { inline_keyboard: [[{ text: "🌐 Dịch theme khác", callback_data: "adm:theme" }, { text: "↩️ Menu", callback_data: "adm:home" }]] } });
  } catch (e) {
    const message = clip(e instanceof Error ? e.message : String(e), 1800);
    stats.warnings.push(message);
    await updateJob(jobId, { status: "failed", stats, error: message, finished_at: new Date().toISOString() });
    try { await adminClient().from("telegram_admin_sessions").delete().eq("telegram_user_id", userId); } catch (_) {}
    try {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `❌ DỊCH THEME THẤT BẠI\n\n${message}`,
        reply_markup: { inline_keyboard: [[{ text: "🔁 Thử theme khác", callback_data: "adm:theme" }], [{ text: "↩️ Menu", callback_data: "adm:home" }]] },
      });
    } catch (_) {}
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!internalAuthorized(req)) return json({ ok: false, error: "Unauthorized internal request" }, 403);
  try {
    const payload = await req.json();
    const task = processThemeJob(payload);
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(task); else await task;
    return json({ ok: true, accepted: true }, 202);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
