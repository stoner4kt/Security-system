"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { BookingShift, Vehicle, Guard } from "@/lib/supabase/types";

export interface BookingShiftRow extends BookingShift {
  vehicle: { id: string; registration: string; make: string; model: string } | null;
  guard: { id: string; full_name: string; badge_number: string | null } | null;
}

/** CRUD + realtime for bookings_shifts (shared by table & calendar views). */
export function useBookings() {
  const [shifts, setShifts] = useState<BookingShiftRow[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabase();
    const [s, v, g] = await Promise.all([
      supabase
        .from("bookings_shifts")
        .select("*, vehicle:vehicles(id, registration, make, model), guard:guards(id, full_name, badge_number)")
        .order("starts_at", { ascending: false })
        .limit(500),
      supabase.from("vehicles").select("*").order("registration"),
      supabase.from("guards").select("id, full_name, badge_number, role, is_on_duty").order("full_name"),
    ]);
    if (s.error) setError(s.error.message);
    else setShifts(s.data as unknown as BookingShiftRow[]);
    if (!v.error) setVehicles(v.data as Vehicle[]);
    if (!g.error) setGuards(g.data as Guard[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const supabase = getSupabase();
    const ch = supabase
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings_shifts" },
        () => void reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const createShift = useCallback(
    async (input: {
      vehicle_id: string;
      guard_id: string;
      starts_at: string;
      ends_at: string | null;
      shift_title?: string;
      odometer_start?: number | null;
      notes?: string | null;
    }) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("bookings_shifts").insert({
        vehicle_id: input.vehicle_id,
        guard_id: input.guard_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        shift_title: input.shift_title ?? "Patrol shift",
        odometer_start: input.odometer_start ?? null,
        notes: input.notes ?? null,
        status: "scheduled",
      });
      if (!error) void reload();
      return error;
    },
    [reload],
  );

  const updateShift = useCallback(
    async (id: string, patch: Partial<BookingShift>) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("bookings_shifts").update(patch).eq("id", id);
      if (!error) void reload();
      return error;
    },
    [reload],
  );

  const deleteShift = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("bookings_shifts").delete().eq("id", id);
      if (!error) void reload();
      return error;
    },
    [reload],
  );

  const startShift = useCallback(async (id: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc("start_shift", { p_shift_id: id });
    if (!error) void reload();
    return error;
  }, [reload]);

  const endShift = useCallback(async (id: string, odometerEnd?: number) => {
    const supabase = getSupabase();
    if (odometerEnd != null) {
      await supabase.from("bookings_shifts").update({ odometer_end: odometerEnd }).eq("id", id);
    }
    const { error } = await supabase.rpc("end_shift", { p_shift_id: id });
    if (!error) void reload();
    return error;
  }, [reload]);

  return {
    shifts,
    vehicles,
    guards,
    loading,
    error,
    reload,
    createShift,
    updateShift,
    deleteShift,
    startShift,
    endShift,
    activeShifts: shifts.filter((s) => s.status === "active"),
  };
}