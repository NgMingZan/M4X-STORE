import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function ipOf(req: Request) {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const salt = Deno.env.get("M4X_FRAUD_SALT") || "";
    if (!url || !anon || !service) return j({ error: "Thiếu Supabase environment" }, 500);
    if (salt.length < 16) return j({ error: "Chưa cấu hình M4X_FRAUD_SALT" }, 500);

    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return j({ error: "Bạn chưa đăng nhập" }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return j({ error: "Phiên đăng nhập không hợp lệ" }, 401);

    const body = await req.json();
    const deviceId = String(body?.device_id || "").trim();
    if (deviceId.length < 8 || deviceId.length > 256) return j({ error: "Không xác định được thiết bị" }, 400);

    const deviceHash = await sha256(`${salt}:device:${deviceId}`);
    const ipHash = await sha256(`${salt}:ip:${ipOf(req)}`);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    let r;
    if (body?.kind === "checkin") {
      r = await admin.rpc("claim_checkin_secure", {
        p_user_id: ud.user.id,
        p_device_hash: deviceHash,
        p_ip_hash: ipHash,
      });
    } else {
      const taskId = String(body?.task_id || "");
      if (!taskId) return j({ error: "Thiếu task_id" }, 400);
      r = await admin.rpc("claim_reward_secure", {
        p_user_id: ud.user.id,
        p_task_id: taskId,
        p_completion_code: body?.completion_code == null ? null : String(body.completion_code),
        p_device_hash: deviceHash,
        p_ip_hash: ipHash,
      });
    }
    if (r.error) return j({ error: r.error.message }, 400);
    return j(r.data);
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
