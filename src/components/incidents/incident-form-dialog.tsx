"use client";

import { useEffect, useState } from "react";
import { Siren, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/use-auth";
import { useBookings } from "@/lib/hooks/use-bookings";
import { getSupabase } from "@/lib/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function IncidentFormDialog({ open, onClose, onCreated }: Props) {
  const { user, guard } = useAuth();
  const { activeShifts } = useBookings();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [shiftId, setShiftId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setSeverity("medium");
      setShiftId("");
      setError(null);
    }
  }, [open]);

  async function handleCreate() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await getSupabase().from("incidents").insert({
      title,
      description: description || null,
      severity,
      status: "open",
      reported_by: user?.id ?? null,
      shift_id: shiftId || null,
      guard_id: guard?.id ?? user?.id ?? null,
    });
    setSaving(false);
    if (err) setError(err.message);
    else {
      onCreated();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-destructive" /> Report an incident
          </DialogTitle>
          <DialogDescription>
            High and critical incidents trigger an immediate email alert via Resend.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ititle">Title *</Label>
            <Input
              id="ititle"
              placeholder="e.g. Intruder sighted at east gate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Associated shift (optional)</Label>
            <Select value={shiftId || undefined} onValueChange={(v) => setShiftId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select active shift" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {activeShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.vehicle?.registration ?? "Shift"} · {s.guard?.full_name ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idesc">Description</Label>
            <Textarea
              id="idesc"
              rows={4}
              placeholder="What happened, where, people involved…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Report incident"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}