"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/supabase/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Vehicle | null;
  onSaved: () => void;
}

export function VehicleFormDialog({ open, onClose, editing, onSaved }: Props) {
  const [form, setForm] = useState({
    registration: "",
    make: "",
    model: "",
    year: "",
    color: "",
    vin: "",
    fuel_type: "diesel",
    status: "available",
    odometer_km: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      registration: editing?.registration ?? "",
      make: editing?.make ?? "",
      model: editing?.model ?? "",
      year: editing?.year ? String(editing.year) : "",
      color: editing?.color ?? "",
      vin: editing?.vin ?? "",
      fuel_type: editing?.fuel_type ?? "diesel",
      status: editing?.status ?? "available",
      odometer_km: editing?.odometer_km ? String(editing.odometer_km) : "",
    });
    setError(null);
  }, [open, editing]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      registration: form.registration,
      make: form.make,
      model: form.model,
      year: form.year ? Number(form.year) : null,
      color: form.color || null,
      vin: form.vin || null,
      fuel_type: form.fuel_type,
      status: form.status,
      odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
    };
    const { error } = editing
      ? await getSupabase().from("vehicles").update(payload).eq("id", editing.id)
      : await getSupabase().from("vehicles").insert(payload);
    setSaving(false);
    if (error) setError(error.message);
    else {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          <DialogDescription>
            Registration records shown across the fleet map and bookings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registration *">
            <Input
              value={form.registration}
              onChange={(e) => setForm((f) => ({ ...f, registration: e.target.value.toUpperCase() }))}
              placeholder="KJA 774B"
            />
          </Field>
          <Field label="Make *">
            <Input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} placeholder="Toyota" />
          </Field>
          <Field label="Model *">
            <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="Hilux" />
          </Field>
          <Field label="Year">
            <Input
              type="number"
              min={1980}
              max={2100}
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              placeholder="2022"
            />
          </Field>
          <Field label="Colour">
            <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="White" />
          </Field>
          <Field label="Fuel type">
            <Input value={form.fuel_type} onChange={(e) => setForm((f) => ({ ...f, fuel_type: e.target.value }))} placeholder="diesel" />
          </Field>
          <Field label="Odometer (km)">
            <Input type="number" min={0} value={form.odometer_km} onChange={(e) => setForm((f) => ({ ...f, odometer_km: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="available">available</option>
              <option value="assigned">assigned</option>
              <option value="maintenance">maintenance</option>
              <option value="offline">offline</option>
            </select>
          </Field>
        </div>

        <Field label="VIN">
          <Input value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))} placeholder="1HGBH41JXMN109186" />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : editing ? "Save changes" : "Add vehicle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}