// ============================================================================
// Cloudflare Worker — edge utilities for Sentinel Fleet
//
// Serves a tiny "gateway" used by the statically-exported PWA *optionally*:
//   /api/health       → status check
//   /api/incidents    → serverless helper that can later proxy to Supabase
//
// The primary reasons to deploy a Worker alongside Pages:
//   1. Rate-limiting/geo-blocking for the sensitive /api/* routes.
//   2. Rewriting/wiring-up the Supabase functions for CORS from the app origin.
// ============================================================================

export interface Env {
  APP_NAME?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type, authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    switch (url.pathname) {
      case "/api/health":
        return json({ ok: true, app: env.APP_NAME ?? "sentinel-fleet", ts: Date.now() });

      case "/api/proxy/supabase-summary": {
        // Optional: proxy to the daily-shift-summary edge function so the anon
        // key stays server-side. Requires SUPABASE_URL + SUPABASE_ANON_KEY bound
        // as Worker secrets.
        if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
          return json({ error: "not_configured" }, 500);
        }
        const target = `${env.SUPABASE_URL}/functions/v1/daily-shift-summary`;
        const upstream = await fetch(target, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
          body: JSON.stringify({}),
        });
        return new Response(await upstream.text(), { status: upstream.status });
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}