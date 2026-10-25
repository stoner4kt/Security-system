"use client";

import { useEffect, useState } from "react";
import { Route, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RouteHistoryMap } from "./route-history-map";
import { useRouteHistory } from "@/lib/hooks/use-route-history";
import type { LiveVehicleView } from "@/lib/hooks/use-real-time-vehicles";

interface Props {
  open: boolean;
  onClose: () => void;
  vehicleId: string | null;
  vehicles: LiveVehicleView[];
}

export function RoutePlaybackDialog({ open, onClose, vehicleId, vehicles }: Props) {
  const [selected, setSelected] = useState<string | null>(vehicleId);
  const history = useRouteHistory(open ? selected : null);

  useEffect(() => {
    if (open && vehicleId) setSelected(vehicleId);
  }, [open, vehicleId]);

  const vehiclesWithCoords = vehicles.filter(
    (v) => v.last_lat != null || v.last_location != null,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-accent" /> Route history playback
          </DialogTitle>
          <DialogDescription>
            Select a vehicle and date range, then hit Load to draw its recorded GPS trail.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          {/* Controls */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={selected ?? undefined} onValueChange={(v) => setSelected(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {(vehiclesWithCoords.length > 0 ? vehiclesWithCoords : vehicles).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.registration} — {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={history.fromDate}
                onChange={(e) => history.setFromDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={history.toDate}
                onChange={(e) => history.setToDate(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={() => history.fetchRoute()} disabled={history.loading}>
              {history.loading ? "Loading…" : "Load trail"}
            </Button>

            <p className="text-xs text-muted-foreground">
              {history.points.length.toLocaleString()} points recorded.
            </p>
          </div>

          {/* Map */}
          <div className="min-h-[300px]">
            <RouteHistoryMap points={history.points} height="52vh" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <RotateCcw className="h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}