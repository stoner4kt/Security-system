"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export interface GeoPosition {
  lat: number;
  lon: number;
  speedKmh: number;
  headingDeg: number | null;
  accuracyM: number;
  altitudeM: number | null;
  timestamp: number;
}

interface Options {
  /** Streaming cadence in ms (default 15 000). */
  intervalMs?: number;
  vehicleId: string;
  shiftId: string;
  /** Falls back to the guard's own guard profile if not provided. */
  guardId?: string;
  /** Actually persist pings (used during dev/demo with a fake GPS). */
  enabled?: boolean;
}

/**
 * Guards' live GPS. Wraps navigator.geolocation.watchPosition and payloads
 * pings into the Supabase database every `intervalMs` using the
 * `record_gps_ping` RPC + the Edge Function validation path when available.
 *
 * Battery awareness: watchPosition is registered while streaming and cleared
 * immediately on End Shift.
 */
export function useGeolocationStream({
  intervalMs = 15_000,
  vehicleId,
  shiftId,
  guardId,
  enabled = true,
}: Options) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    typeof navigator !== "undefined" && "geolocation" in navigator,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosition = useRef<GeoPosition | null>(null);

  const flush = useCallback(
    async (pos: GeoPosition) => {
      if (!vehicleId || !shiftId) return;
      // Single round-trip to the DB-validated RPC (defence: range checks,
      // vehicle assignment, realtime broadcast all happen server-side).
      const { error: rpcErr } = await getSupabase().rpc("record_gps_ping", {
        p_vehicle_id: vehicleId,
        p_shift_id: shiftId,
        p_guard_id: guardId ?? null,
        p_lat: pos.lat,
        p_lon: pos.lon,
        p_speed_kmh: pos.speedKmh,
        p_heading: pos.headingDeg ?? null,
        p_accuracy_m: pos.accuracyM,
        p_altitude_m: pos.altitudeM ?? null,
      });

      if (rpcErr) {
        console.error("ping failed", rpcErr);
      }
    },
    [vehicleId, shiftId, guardId],
  );

  const onPosition: PositionCallback = useCallback(
    (p) => {
      const speed = p.coords.speed != null ? Math.max(0, p.coords.speed * 3.6) : 0;
      const pos: GeoPosition = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        speedKmh: speed,
        headingDeg: p.coords.heading,
        accuracyM: p.coords.accuracy ?? 0,
        altitudeM: p.coords.altitude,
        timestamp: p.timestamp,
      };
      setPosition(pos);
      lastPosition.current = pos;
    },
    [],
  );

  // Start streaming (battery-friendly: RPC only on the cadence tick).
  useEffect(() => {
    if (!enabled || !supported || !vehicleId || !shiftId) return;

    navigator.geolocation.getCurrentPosition(onPosition, (e) =>
      setError(e.message),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );

    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      (e) => setError(e.message),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
    setIsStreaming(true);

    timer.current = setInterval(() => {
      if (lastPosition.current) void flush(lastPosition.current);
    }, intervalMs);

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (timer.current) clearInterval(timer.current);
      watchId.current = null;
      timer.current = null;
      setIsStreaming(false);
    };
  }, [enabled, supported, vehicleId, shiftId, onPosition, flush, intervalMs]);

  const stopStreaming = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (timer.current) clearInterval(timer.current);
    watchId.current = null;
    timer.current = null;
    setIsStreaming(false);
    lastPosition.current = null;
  }, []);

  return { position, error, supported, isStreaming, stopStreaming };
}