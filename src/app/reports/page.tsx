"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/hooks/use-auth";
import { getSupabase } from "@/lib/supabase/client";

export default function ReportsPage() {
  const { guard } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isStaff = guard?.role === "admin" || guard?.role === "dispatcher";

  async function sendSummary() {
    setSending(true);
    setStatus(null);
    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/daily-shift-summary`;
    const session = await getSupabase().auth.getSession();
    try {
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setStatus(res.ok ? "Email queued to Resend ✓" : `Error: ${json?.error ?? res.status}`);
    } catch (e) {
      setStatus(`Request failed: ${(e as Error).message}`);
    }
    setSending(false);
  }

  if (!isStaff) {
    return (
      <DashboardShell>
        <p className="p-8 text-center text-slate-400">You need admin access for reports.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 lg:px-0 lg:py-0">
        <div>
          <h1 className="text-lg font-bold text-white">Reports & Email Automation</h1>
          <p className="text-sm text-slate-400">
            Trigger the daily shift summary edge function — delivered by Resend to the ops inbox.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-accent" /> Daily shift summary
            </CardTitle>
            <CardDescription>
              Shifts completed, total mileage, incidents today and vehicle health.
              Configured to run automatically at 18:00 via cron — this button is
              for a manual dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={sendSummary} disabled={sending}>
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send summary email now"}
            </Button>
            {status && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{status}</p>
            )}
            <p className="text-xs text-muted-foreground">
              The edge function aggregates today&apos;s data with the service-role key and
              sends via the <code className="rounded bg-muted px-1">RESEND_API_KEY</code> secret.
              See docs/DEPLOYMENT.md for scheduling.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}