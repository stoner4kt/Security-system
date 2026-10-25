"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRealtimeVehicles } from "@/lib/hooks/use-real-time-vehicles";
import { getSupabase } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/supabase/types";

const STATUS_BADGE: Record<string, "outline" | "success" | "secondary" | "warning" | "danger"> = {
  available: "success",
  assigned: "warning",
  on_duty: "success",
  maintenance: "outline",
  offline: "danger",
};

export default function VehiclesPage() {
  const router = useRouter();
  const { user, guard } = useAuth();
  const { vehicles, loading, updateVehicle } = useRealtimeVehicles();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  // Staff-only page.
  const isStaff = guard?.role === "admin" || guard?.role === "dispatcher";
  useEffect(() => {
    if (!loading && guard && !isStaff) router.replace("/dashboard");
  }, [loading, guard, isStaff, router]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? vehicles.filter((v) =>
          `${v.registration} ${v.make} ${v.model} ${v.color ?? ""}`.toLowerCase().includes(q),
        )
      : vehicles;
  }, [vehicles, query]);

  async function refreshAfterSave() {
    const { data } = await getSupabase().from("vehicles").select("*");
    if (data) {
      for (const v of data as Vehicle[]) updateVehicle(v as never);
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 lg:px-0 lg:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-white">
              <Truck className="h-5 w-5" /> Vehicle Registry
            </h1>
            <p className="text-sm text-slate-400">
              {vehicles.length} vehicles in the fleet · live status maintained by GPS pings
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-44 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            />
            {isStaff && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add vehicle
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((v) => (
              <Card key={v.id} className="overflow-hidden">
                {v.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.photo_url} alt={v.registration} className="h-28 w-full object-cover" />
                )}
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{v.registration}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.make} {v.model} {v.year ?? ""}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[v.status] ?? "outline"}>{v.status}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <dt>Colour</dt>
                    <dd className="text-foreground">{v.color ?? "—"}</dd>
                    <dt>Fuel</dt>
                    <dd className="text-foreground">{v.fuel_type ?? "—"}</dd>
                    <dt>Odometer</dt>
                    <dd className="text-foreground">
                      {v.odometer_km != null ? `${Math.round(v.odometer_km)} km` : "—"}
                    </dd>
                    <dt>Speed</dt>
                    <dd className="text-foreground">
                      {Math.round(Number(v.last_speed_kmh) || 0)} km/h
                    </dd>
                  </dl>
                  {isStaff && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => {
                        setEditing(v as Vehicle);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {list.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No vehicles {query ? `matching "${query}"` : "yet"}.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          Signed in as {user?.email} · role: {guard?.role}
        </p>
      </div>

      <VehicleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        onSaved={refreshAfterSave}
      />
    </DashboardShell>
  );
}