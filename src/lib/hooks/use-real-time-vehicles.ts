"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/supabase/types";

export interface LiveVehicleView extends Vehicle {
  last_ping_at: string | null;
}

/**
 * Fetch all vehicles, then subscribe to PostgreSQL Realtime on `vehicles`
 * and `location_logs` so markers update the instant a ping arrives.
 */
export function useRealtimeVehicles() {
  const [vehicles, setVehicles] = useState<LiveVehicleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const vehicleMap = useRef<Map<string, LiveVehicleView>>(new Map());

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    const channel = supabase
      .channel("fleet-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        (payload) => {
          if (!mounted) return;
          const map = vehicleMap.current;
          if (payload.eventType === "DELETE") {
            map.delete(payload.old?.id);
          } else {
            const v = payload.new as LiveVehicleView;
            const prev = map.get(v.id);
            if (prev) v.last_ping_at = prev.last_ping_at ?? null;
            else v.last_ping_at = null;
            map.set(v.id, v);
          }
          setVehicles(Array.from(map.values()));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "location_logs" },
        (payload) => {
          const log = payload.new as {
            vehicle_id: string;
            recorded_at: string;
            lat: number;
            lon: number;
            speed_kmh: number | null;
            heading_deg: number | null;
          };
          if (!mounted) return;
          const v = vehicleMap.current.get(log.vehicle_id);
          if (v) {
            v.last_location = [log.lon, log.lat];
            v.last_lat = log.lat;
            v.last_lon = log.lon;
            v.last_speed_kmh = log.speed_kmh;
            v.last_heading = log.heading_deg;
            v.last_ping_at = log.recorded_at;
            vehicleMap.current.set(v.id, { ...v });
            setVehicles(Array.from(vehicleMap.current.values()));
          }
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
      });

    (async () => {
      const { data, error } = await supabase.from("vehicles").select("*");
      if (!mounted) return;
      if (error) {
        setError(error.message);
      } else {
        const map = new Map<string, LiveVehicleView>();
        for (const v of (data ?? []) as LiveVehicleView[]) {
          v.last_ping_at = null;
          map.set(v.id, v);
        }
        vehicleMap.current = map;
        setVehicles(Array.from(map.values()));
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const updateVehicle = useCallback((v: LiveVehicleView) => {
    vehicleMap.current.set(v.id, v);
    setVehicles(Array.from(vehicleMap.current.values()));
  }, []);

  return { vehicles, loading, error, updateVehicle };
}