"use client";

import { useState } from "react";
import { Layers, PlayCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { FleetMap } from "@/components/map/fleet-map";
import { VehicleListPanel } from "@/components/map/vehicle-list-panel";
import { RoutePlaybackDialog } from "@/components/map/route-playback-dialog";
import { useRealtimeVehicles } from "@/lib/hooks/use-real-time-vehicles";

export default function DashboardPage() {
  const { vehicles, loading } = useRealtimeVehicles();
  const [routeVehicleId, setRouteVehicleId] = useState<string | null>(null);

  return (
    <DashboardShell>
      <div className="flex h-full flex-col gap-4 lg:h-[calc(100vh-3.5rem)] lg:flex-row lg:gap-0">
        {/* Map */}
        <div className="min-h-[50vh] flex-1 lg:min-h-0">
          <FleetMap vehicles={vehicles} />
        </div>

        {/* Side panel (overlay on desktop) */}
        <div className="pointer-events-none absolute inset-y-6 left-6 z-10 hidden w-72 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/55 backdrop-blur-lg lg:flex">
          <div className="pointer-events-auto flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Live Fleet</h2>
              <button
                onClick={() => setRouteVehicleId(
                  vehicles.find((v) => v.last_ping_at)?.id ?? vehicles[0]?.id ?? null,
                )}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                title="Play route history"
              >
                <PlayCircle className="h-3.5 w-3.5" /> Replay
              </button>
            </div>
            <VehicleListPanel vehicles={vehicles} />
          </div>
        </div>
      </div>

      {/* Mobile: fleet table below map */}
      <div className="mt-4 lg:hidden">
        <div className="rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur">
          <h2 className="px-1 pb-2 text-sm font-semibold text-white">
            <Layers className="mr-1 inline h-4 w-4" /> Live Fleet
          </h2>
          <VehicleListPanel vehicles={vehicles} />
        </div>
      </div>

      <RoutePlaybackDialog
        open={routeVehicleId !== null}
        onClose={() => setRouteVehicleId(null)}
        vehicleId={routeVehicleId}
        vehicles={vehicles}
      />

      {loading && vehicles.length === 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-xs text-white backdrop-blur">
          Connecting to Realtime…
        </div>
      )}
    </DashboardShell>
  );
}