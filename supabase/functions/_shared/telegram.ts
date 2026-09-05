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
