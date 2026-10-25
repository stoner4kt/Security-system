// ============================================================================
// validate-location
//
// Receives a raw geolocation payload from the guard's browser
// (navigator.geolocation.watchPosition → client) and:
//   1. authenticates the caller (JWT),
//   2. enforces rate + distance sanity checks,
//   3. writes the ping via the `record_gps_ping` RPC (one round-trip),
//   4. returns the logged row id.
//
// This is called on a 15 s cadence per device — keep it cheap.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";

interface PingBody {
  vehicle_id: string;
  shift_id: string;
  lat: number;
  lon: number;
  speed_kmh?: number;
  heading_deg?: number | null;
  accuracy_m?: number;
  altitude_m?: number | null;
}

// Coordinates a pinging guard can be in (Kajaani, Finland depot — adjust!).
const LAT_MIN = -90, LAT_MAX = 90;
const LON_MIN = -180, LON_MAX = 180;
const MAX_SPEED_KMH = 260;   // guard rails: reject obviously corrupt readings
const HARD_TILT_DEG = 2.0;   // refuse pings that jump >2 km in 15 s from last known
const MIN_INTERVAL_MS = 5000; // at most 1 ping / 5 s per shift

function supabaseFor(token: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    token,
    { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export async function handler(req: Request): Promise<Response> {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  // 1. Authenticate the caller (any valid project JWT is acceptable here;
  //    the RPC level re-checks role membership against guards).
  const { data: user, error: authErr } = await serviceClient().auth.getUser(token);
  if (authErr || !user?.user?.id) {
    return json({ error: "unauthorized" }, 401);
  }
  const uid = user.user.id;
  // Bind the write path to the *caller's* token so `auth.uid()` resolves to the
  // real guard inside `record_gps_ping` (service role would set it to NULL).
  const supabase = supabaseFor(token);

  let body: PingBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // 2. Validate ranges (same rules as the DB trigger, but fail fast).
  const { vehicle_id, shift_id, lat, lon } = body;
  if (!vehicle_id || !shift_id || typeof lat !== "number" || typeof lon !== "number") {
    return json({ error: "missing_fields" }, 400);
  }
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
    return json({ error: "coordinates_out_of_range" }, 400);
  }
  const speed = body.speed_kmh ?? 0;
  if (speed < 0 || speed > MAX_SPEED_KMH) {
    return json({ error: "speed_out_of_range" }, 400);
  }

  const heading = body.heading_deg ?? null;
  if (heading !== null && (heading < 0 || heading > 360)) {
    return json({ error: "heading_out_of_range" }, 400);
  }

  // 3. Rate limit: one ping per shift per >5 s.
  const { data: last, error: lastErr } = await supabase
    .from("location_logs")
    .select("recorded_at, lat, lon")
    .eq("shift_id", shift_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastErr && last) {
    const since = Date.now() - new Date(last.recorded_at).getTime();
    if (since < MIN_INTERVAL_MS) {
      return json({ ok: true, cooldown_ms: MIN_INTERVAL_MS - since, throttled: true });
    }
    // 4. Hard tilt gate: >2 km jump between pings is almost certainly a
    //    bad fix, not a moving car (60 s buckle).
    const d = haversineKm(last.lat, last.lon, lat, lon);
    const dtH = Math.max(since / 3_600_000, 15 / 3_600_000); // seconds→h
    if (d / dtH > HARD_TILT_DEG * 36) { // km/h
      return json({ error: "location_jump_suspicious" }, 422);
    }
  }

  // 5. Persist via the DB RPC (validates ownership + updates vehicles row).
  const { data: logId, error: rpcErr } = await supabase.rpc("record_gps_ping", {
    p_vehicle_id: vehicle_id,
    p_guard_id: uid,
    p_shift_id: shift_id,
    p_lat: lat,
    p_lon: lon,
    p_speed_kmh: speed,
    p_heading: heading,
    p_accuracy_m: body.accuracy_m ?? 0,
    p_altitude_m: body.altitude_m ?? null,
  });

  if (rpcErr) {
    console.error("record_gps_ping failed", rpcErr);
    return json({ error: "write_failed", detail: rpcErr.message }, 500);
  }

  return json({ ok: true, log_id: logId });
}

// Great-circle distance in km (Haversine). Good enough for gate checks.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const toRad = (d: number) => (d * Math.PI) / 180;

Deno.serve(handler);