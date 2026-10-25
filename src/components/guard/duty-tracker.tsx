"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  Crosshair,
  Gauge,
  MapPin,
  Navigation,
  Play,
  Satellite,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/hooks/use-auth";
import { useGeolocationStream } from "@/lib/hooks/use-geolocation";
import { useBookings } from "@/lib/hooks/use-bookings";

interface Props {
  /** Pre-selected shift to start (from the bookings table). */
  preselectedShiftId?: string | null;
}

function fmtClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function DutyTracker({ preselectedShiftId }: Props) {
  const { user } = useAuth();
  const { shifts, vehicles, loading, startShift, endShift } = useBookings();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(
    preselectedShiftId ?? null,
  );

  const myShifts = useMemo(
    () => shifts.filter((s) => s.guard_id === user?.id),
    [shifts, user?.id],
  );
  const activeShift = useMemo(
    () => myShifts.find((s) => s.status === "active") ?? null,
    [myShifts],
  );
  const scheduled = useMemo(
    () => myShifts.filter((s) => s.status === "scheduled"),
    [myShifts],
  );
  const past = useMemo(
    () => myShifts.filter((s) => s.status === "completed" || s.status === "cancelled").slice(0, 5),
    [myShifts],
  );

  const chosen = scheduled.find((s) => s.id === selectedShiftId) ?? null;
  const vehicle = useMemo(() => {
    const shift = activeShift ?? chosen;
    if (!shift) return null;
    return vehicles.find((v) => v.id === shift.vehicle_id) ?? null;
  }, [activeShift, chosen, vehicles]);

  const streaming = activeShift != null;
  const gps = useGeolocationStream({
    vehicleId: vehicle?.id ?? "",
    shiftId: activeShift?.id ?? "",
    guardId: user?.id,
    enabled: streaming,
    intervalMs: 15_000,
  });

  const [startTs, setStartTs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!streaming) return;
    if (!startTs) setStartTs(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [streaming, startTs]);

  async function handleStart() {
    if (!chosen) return;
    const err = await startShift(chosen.id);
    if (!err) {
      setSelectedShiftId(null);
      setStartTs(Date.now());
      setNow(Date.now());
    }
  }

  async function handleEnd() {
    if (!activeShift) return;
    const err = await endShift(activeShift.id);
    if (!err) {
      gps.stopStreaming();
      setStartTs(null);
    }
  }

  const elapsedSec = startTs ? Math.floor((now - startTs) / 1000) : 0;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 pb-28 lg:max-w-xl">
      <header>
        <h1 className="text-xl font-bold">My Duty</h1>
        <p className="text-sm text-muted-foreground">
          Start a scheduled patrol to begin broadcasting your location.
        </p>
      </header>

      {streaming && activeShift && vehicle && (
        <Card className="overflow-hidden border-emerald-300/40 shadow-lg shadow-emerald-900/10">
          <div className="bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              Live patrol · broadcasting every 15 s
            </span>
          </div>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{vehicle.registration}</p>
                <p className="text-sm text-muted-foreground">
                  {vehicle.make} {vehicle.model} · {fmtClock(elapsedSec)} elapsed
                </p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <LiveMetric
                icon={Gauge}
                label="Speed"
                value={`${Math.round(gps.position?.speedKmh ?? 0)} km/h`}
              />
              <LiveMetric
                icon={MapPin}
                label="Accuracy"
                value={`±${Math.round(gps.position?.accuracyM ?? 0)} m`}
              />
              <LiveMetric
                icon={Navigation}
                label="Heading"
                value={gps.position?.headingDeg != null ? `${Math.round(gps.position.headingDeg)}°` : "—"}
              />
            </div>

            {gps.error && (
              <p className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {gps.error}
              </p>
            )}

            <div className="rounded-lg bg-muted p-3 font-mono text-sm">
              {gps.position ? (
                <p>
                  {gps.position.lat.toFixed(6)}, {gps.position.lon.toFixed(6)}
                </p>
              ) : (
                <p className="text-muted-foreground">Waiting for GPS fix…</p>
              )}
            </div>

            <Button variant="destructive" size="lg" className="w-full" onClick={handleEnd}>
              <Square className="h-4 w-4 fill-current" /> End Shift
            </Button>
          </CardContent>
        </Card>
      )}

      {!streaming && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Satellite className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Ready for duty</h2>
                <p className="text-sm text-muted-foreground">
                  Select a shift, then press Start to go live.
                </p>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading shifts…</p>
            ) : scheduled.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No scheduled shifts for you yet. Dispatchers assign them in the
                Bookings page.
              </div>
            ) : (
              <div className="space-y-1.5">
                {scheduled.map((s) => {
                  const v = vehicles.find((x) => x.id === s.vehicle_id);
                  const selected = selectedShiftId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedShiftId(s.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-accent bg-accent/5 ring-1 ring-accent"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Car className="h-5 w-5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {v ? `${v.registration} · ${v.make} ${v.model}` : s.shift_title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.starts_at).toLocaleString()}
                          {s.ends_at ? ` → ${new Date(s.ends_at).toLocaleTimeString()}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <Button
              variant="success"
              size="lg"
              className="w-full"
              disabled={!chosen}
              onClick={handleStart}
            >
              <Play className="h-4 w-4 fill-current" /> Start Shift
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Starting broadcasts your location every 15 s until you end the shift.
            </p>
          </CardContent>
        </Card>
      )}

      {!streaming && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex gap-3">
            <Crosshair className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">How location works</p>
              <p className="mt-1">
                Starting a shift prompts for location permission. We use{" "}
                <code className="rounded bg-muted px-1">watchPosition</code> for
                continuous tracking and persist one point every 15 seconds.
                Ending your shift stops broadcasts and saves battery.
              </p>
            </div>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Recent shifts</h3>
            {past.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{s.vehicle?.registration ?? s.shift_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.actual_started_at
                      ? new Date(s.actual_started_at).toLocaleString()
                      : new Date(s.starts_at).toLocaleDateString()}
                    {s.distance_km ? ` · ${Math.round(s.distance_km)} km` : ""}
                  </p>
                </div>
                <Badge variant={s.status === "completed" ? "success" : "outline"}>
                  {s.status}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LiveMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted p-2.5">
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
