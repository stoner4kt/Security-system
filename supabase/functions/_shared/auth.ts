// Shared helpers for the email/other edge functions.
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Build a service-role Supabase client. */
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Parse the bearer token from a request Authorization header. */
export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
}

/**
 * Authorize a request from either:
 *  1. a signed-in user (valid access token), or
 *  2. a trusted automation carrying the shared webhook secret
 *     (header `x-sentinel-secret` == `WEBHOOK_SECRET` env).
 * Supabase database webhooks use `Authorization: Bearer <anon key>`, which is
 * not a user JWT, so they must use the shared secret path. The daily cron
 * sends the service-role key, which `getUser` treats as a valid session.
 */
export async function isAuthorized(req: Request): Promise<boolean> {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-sentinel-secret") === secret) return true;

  const token = bearerToken(req);
  if (!token) return false;
  const { error } = await serviceClient().auth.getUser(token);
  return !error;
}