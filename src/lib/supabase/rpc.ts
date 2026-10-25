"use client";

import { getSupabase } from "./client";

/**
 * Record a validated GPS ping (browser-side, batched every 15 s).
 * The guard id resolves from the signed-in session so `auth.uid()` inside the
 * `record_gps_ping` RPC matches the caller — the RPC enforces ownership.
 */
export async function recordGpsPing(input: {
  vehicle_id: string;
  shift_id: string;
  lat: number;
  lon: number;
  speed_kmh?: number;
  heading_deg?: number | null;
  accuracy_m?: number;
  altitude_m?: number | null;
}) {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("record_gps_ping", {
    p_vehicle_id: input.vehicle_id,
    p_guard_id: user?.id ?? null,
    p_shift_id: input.shift_id,
    p_lat: input.lat,
    p_lon: input.lon,
    p_speed_kmh: input.speed_kmh ?? 0,
    p_heading: input.heading_deg ?? null,
    p_accuracy_m: input.accuracy_m ?? 0,
    p_altitude_m: input.altitude_m ?? null,
  });
  return { data, error };
}