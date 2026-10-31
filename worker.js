/**
 * BONE88 Social Manager — Cloudflare Worker
 * Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BONE88_API_KEY
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Content-Type": "application/json; charset=utf-8"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname === "/" || url.pathname === "/health") {
      if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
      return json({ ok: true, service: "BONE88 Telegram Worker", configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && env.BONE88_API_KEY) });
    }
    if (url.pathname !== "/telegram/send") return json({ ok: false, error: "Not found" }, 404);
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (!env.BONE88_API_KEY || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "Worker secrets are not configured" }, 503);
    }
    if (!constantTimeEqual(request.headers.get("X-API-Key") || "", env.BONE88_API_KEY)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    let payload;
    try {
      if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
        return json({ ok: false, error: "Content-Type must be application/json" }, 415);
      }
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }
    const message = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!message) return json({ ok: false, error: "Message text is required" }, 400);
    if (message.length > 4096) return json({ ok: false, error: "Telegram messages cannot exceed 4096 characters" }, 400);
    try {
      const telegramResponse = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message, disable_web_page_preview: true })
      });
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) {
        return json({ ok: false, error: result.description || "Telegram rejected the message" }, 502);
      }
      return json({ ok: true, message_id: result.result?.message_id ?? null, chat_id: result.result?.chat?.id ?? null });
    } catch {
      return json({ ok: false, error: "Could not reach Telegram API" }, 502);
    }
  }
};
