"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { IncidentFormDialog } from "@/components/incidents/incident-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabase } from "@/lib/supabase/client";
import type { Incident } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";

const SEVERITY_BADGE: Record<string, "outline" | "warning" | "danger" | "secondary"> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  critical: "danger",
};

const STATUS_BADGE: Record<string, "outline" | "success" | "secondary" | "warning" | "danger"> = {
  open: "danger",
  investigating: "warning",
  resolved: "success",
  closed: "outline",
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setIncidents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabase();
    const ch = supabase
      .channel("incidents-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, () =>
        void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 lg:px-0 lg:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-white">
              <AlertOctagon className="h-5 w-5" /> Incidents
            </h1>
            <p className="text-sm text-slate-400">
              High/critical incidents alert the ops inbox immediately via Resend.
            </p>
          </div>
          <Button
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Report
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No incidents recorded. Keep it that way.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <Card key={inc.id}>
                <CardContent className="flex items-start gap-3 pt-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{inc.title}</p>
                      <Badge variant={SEVERITY_BADGE[inc.severity] ?? "outline"}>
                        {inc.severity}
                      </Badge>
                      <Badge variant={STATUS_BADGE[inc.status] ?? "outline"}>{inc.status}</Badge>
                    </div>
                    {inc.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{inc.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reported {formatDate(inc.created_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <IncidentFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => void load()}
      />
    </DashboardShell>
  );
}