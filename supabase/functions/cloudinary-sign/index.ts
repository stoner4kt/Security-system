// ============================================================================
// cloudinary-sign
//
// Returns a signed Cloudinary upload payload (signature + timestamp) so the
// browser can upload photos securely to Cloudinary without exposing the
// API secret. For production we recommend signing uploads like this.
//
// Request:  POST { folder?: string }   (folder defaults to "sentinel-fleet")
// Response: { signature, timestamp, api_key, cloud_name, folder }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { isAuthorized } from "../_shared/auth.ts";

export async function handler(req: Request): Promise<Response> {
  const pre = handlePreflight(req);
  if (pre) return pre;

  if (!(await isAuthorized(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !apiSecret) {
    return json({ error: "not_configured" }, 500);
  }

  let folder = "sentinel-fleet";
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.folder === "string" && body.folder.length > 0) {
      folder = body.folder;
    }
  } catch {
    // no body — use default folder
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary v1 signing: params sorted & serialized as name=value&name2=value2
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = forgeHmacSha1(toSign, apiSecret);

  return json({ cloud_name: cloudName, api_key: apiKey, folder, timestamp, signature });
}

async function forgeHmacSha1(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(handler);