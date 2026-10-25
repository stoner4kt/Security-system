"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { LocationLog } from "@/lib/supabase/types";

export interface RoutePoint {
  lat: number;
  lon: number;
  recorded_at: string;
  speed_kmh: number | null;
}

/** Fetch historical GPS trail for a vehicle in a date range. */
export function useRouteHistory(vehicleId?: string | null) {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchRoute = useCallback(async () => {
    if (!vehicleId) {
      setPoints([]);
      return;
    }
    setLoading(true);
    setFetched(true);
    const supabase = getSupabase();
    const from = new Date(`${fromDate}T00:00:00Z`).toISOString();
    const to = new Date(`${toDate}T23:59:59Z`).toISOString();

    // Try the DB function if it exists; fall back to a plain query.
    const { data, error } = await supabase.rpc("get_route_history", {
      p_vehicle_id: vehicleId,
      p_from: from,
      p_to: to,
    });

    if (!error && data) {
      setPoints(
        (data as LocationLog[]).map((r) => ({
          lat: r.lat,
          lon: r.lon,
          recorded_at: r.recorded_at,
          speed_kmh: r.speed_kmh,
        })),
      );
    } else {
      const { data: q, error: qErr } = await supabase
        .from("location_logs")
        .select("lat, lon, recorded_at, speed_kmh")
        .eq("vehicle_id", vehicleId)
        .gte("recorded_at", from)
        .lte("recorded_at", to)
        .order("recorded_at", { ascending: true });
      if (!qErr) {
        setPoints((q ?? []).map((r) => ({
          lat: r.lat,
          lon: r.lon,
          recorded_at: r.recorded_at,
          speed_kmh: r.speed_kmh,
        })));
      }
    }
    setLoading(false);
  }, [vehicleId, fromDate, toDate]);

  useEffect(() => {
    if (fetched) void fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, fromDate, toDate]);

  return { points, fromDate, toDate, setFromDate, setToDate, loading, fetchRoute };
}