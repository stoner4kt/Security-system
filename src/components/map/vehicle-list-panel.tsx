"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { LiveVehicleView } from "@/lib/hooks/use-real-time-vehicles";
import { vehicleStatus, timeAgo } from "@/lib/utils";
import { STATUS_COLORS } from "./fleet-map";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  vehicles: LiveVehicleView[];
  onSelect?: (id: string) => void;
}

export function VehicleListPanel({ vehicles, onSelect }: Props) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? vehicles.filter((v) =>
          `${v.registration} ${v.make} ${v.model} ${(v as unknown as { guard_name?: string }).guard_name ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : vehicles;
    return [...list].sort((a, b) => {
      const sa = a.last_ping_at ? vehicleStatus(a) : "offline";
      const sb = b.last_ping_at ? vehicleStatus(b) : "offline";
      return sa.localeCompare(sb);
    });
  }, [vehicles, q]);

  const counts = useMemo(() => {
    let moving = 0, idle = 0, offline = 0;
    for (const v of vehicles) {
      const s = v.last_ping_at ? vehicleStatus(v) : "offline";
      if (s === "moving") moving++;
      else if (s === "idle") idle++;
      else offline++;
    }
    return { moving, idle, offline };
  }, [vehicles]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Dot className="bg-emerald-500" /> {counts.moving} moving
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <Dot className="bg-amber-500" /> {counts.idle} idle
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <Dot className="bg-rose-500" /> {counts.offline} offline
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search registration, guard…"
            className="border-white/10 bg-white/5 pl-8 text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="thin-scroll flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {rows.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">
            No vehicles match.
          </p>
        )}
        {rows.map((v) => {
          const status = v.last_ping_at ? vehicleStatus(v) : "offline";
          const c = STATUS_COLORS[status];
          const guard = (v as unknown as { guard_name?: string }).guard_name;
          return (
            <button
              key={v.id}
              onClick={() => onSelect?.(v.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: c,
                  boxShadow: status === "offline" ? undefined : `0 0 10px ${c}66`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {v.registration}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {v.make} {v.model}
                  {guard ? ` · ${guard}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: c }}>
                  {Math.round(Number(v.last_speed_kmh) || 0)} km/h
                </p>
                <p className="text-[10px] text-slate-500">{timeAgo(v.last_ping_at)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", className)} />;
}