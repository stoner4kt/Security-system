"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Global singleton so hooks (realtime, auth) share one client + one socket.
let _client: ReturnType<typeof createClient> | null = null;
export function getSupabase() {
  if (!_client) _client = createClient();
  return _client;
}