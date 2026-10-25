"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBookings } from "@/lib/hooks/use-bookings";
import type { BookingShiftRow } from "@/lib/hooks/use-bookings";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: BookingShiftRow | null;
}

export function BookingFormDialog({ open, onClose, editing }: Props) {
  const { vehicles, guards, createShift, updateShift, deleteShift } = useBookings();
  const [vehicleId, setVehicleId] = useState("");
  const [guardId, setGuardId] = useState("");
  const [title, setTitle] = useState("Night patrol");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [odometerStart, setOdometerStart] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the dialog target changes.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVehicleId(editing.vehicle_id);
      setGuardId(editing.guard_id);
      setTitle(editing.shift_title);
      setStartsAt(toLocalInput(editing.starts_at));
      setEndsAt(editing.ends_at ? toLocalInput(editing.ends_at) : "");
      setOdometerStart(editing.odometer_start != null ? String(editing.odometer_start) : "");
      setNotes(editing.notes ?? "");
    } else {
      setVehicleId("");
      setGuardId("");
      setTitle("Night patrol");
      setStartsAt("");
      setEndsAt("");
      setOdometerStart("");
      setNotes("");
    }
    setError(null);
  }, [open, editing]);

  async function handleSave() {
    if (!vehicleId || !guardId || !startsAt) {
      setError("Vehicle, guard and start time are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const err = editing
      ? await updateShift(editing.id, {
          vehicle_id: vehicleId,
          guard_id: guardId,
          shift_title: title || "Patrol shift",
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          odometer_start: odometerStart ? Number(odometerStart) : null,
          notes: notes || null,
        })
      : await createShift({
          vehicle_id: vehicleId,
          guard_id: guardId,
          shift_title: title || "Patrol shift",
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          odometer_start: odometerStart ? Number(odometerStart) : null,
          notes: notes || null,
        });
    setSaving(false);
    if (err) setError(err.message);
    else onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm("Delete this shift permanently?")) return;
    setSaving(true);
    const err = await deleteShift(editing.id);
    setSaving(false);
    if (!err) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit shift" : "New shift booking"}</DialogTitle>
          <DialogDescription>
            Assign a vehicle to a guard for a patrol window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vehicle *</Label>
            <Select value={vehicleId || undefined} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration} — {v.make} {v.model} ({v.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Guard *</Label>
            <Select value={guardId || undefined} onValueChange={setGuardId}>
              <SelectTrigger>
                <SelectValue placeholder="Select guard" />
              </SelectTrigger>
              <SelectContent>
                {guards.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.full_name} {g.badge_number ? `(${g.badge_number})` : ""}
                    {g.is_on_duty ? " · on duty" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Shift title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start *</Label>
              <Input
                id="start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End</Label>
              <Input
                id="end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odo">Odometer start (km)</Label>
            <Input
              id="odo"
              type="number"
              min={0}
              placeholder="e.g. 128400"
              value={odometerStart}
              onChange={(e) => setOdometerStart(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Special instructions, gas card, route…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : editing ? "Save changes" : "Create shift"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}