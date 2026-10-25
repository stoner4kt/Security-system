// ============================================================================
// daily-shift-summary
//
// Scheduled function (daily at 18:00 local ops time) that emails the admin a
// summary of the day: shifts started/completed, mileage, incidents, and an
// ops health snapshot.
//
// Scheduling options: pg_cron, Supabase scheduled functions (beta), or a
// Cloudflare Cron Trigger hitting the function URL with the anon key.
// See docs/DEPLOYMENT.md.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { serviceClient, isAuthorized } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/resend.ts";

export async function handler(req: Request): Promise<Response> {
  const pre = handlePreflight(req);
  if (pre) return pre;

  // Scheduled runs carry the service-role key; the Reports UI sends the user's
  // access token; both pass `isAuthorized`.
  if (!(await isAuthorized(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const to = Deno.env.get("ADMIN_ALERT_EMAIL");
  if (!apiKey || !from || !to) {
    return json({ error: "not_configured" }, 500);
  }

  const supabase = serviceClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);              // local midnight
  const end = new Date(start.getTime() + 86_400_000);

  try {
    const [shiftsRes, incidentsRes, vehiclesRes] = await Promise.all([
      supabase
        .from("bookings_shifts")
        .select("id, status, distance_km, guard_id, vehicle_id, starts_at, actual_started_at, actual_ended_at")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString()),
      supabase
        .from("incidents")
        .select("id, severity, status, created_at")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      supabase
        .from("vehicles")
        .select("id, registration, status"),
    ]);

    const shifts = shiftsRes.data ?? [];
    const incidents = incidentsRes.data ?? [];
    const vehicles = vehiclesRes.data ?? [];

    const active = shifts.filter((s) => s.status === "active").length;
    const completed = shifts.filter((s) => s.status === "completed").length;
    const scheduled = shifts.filter((s) => s.status === "scheduled").length;
    const totalKm = shifts.reduce((acc, s) => acc + (Number(s.distance_km) || 0), 0);
    const urgentIncidents = incidents.filter((i) =>
      i.severity === "high" || i.severity === "critical"
    );
    const openIncidents = incidents.filter((i) => i.status === "open");
    const vehiclesOnDuty = vehicles.filter((v) => v.status === "on_duty").length;
    const vehiclesMaintenance = vehicles.filter((v) => v.status === "maintenance").length;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:28px 32px;border-radius:12px 12px 0 0">
          <p style="margin:0;font-size:12px;opacity:.8">${start.toDateString()}</p>
          <h1 style="margin:6px 0 0;font-size:22px">Daily Shift Summary</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:28px 32px;border-radius:0 0 12px 12px">
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${statCard(shifts.length, "Total shifts", "#0f172a")}
            ${statCard(active, "Active now", "#1d4ed8")}
            ${statCard(completed, "Completed", "#16a34a")}
            ${statCard(totalKm + " km", "Mileage today", "#ca8a04")}
          </div>
          <h2 style="font-size:15px;margin:26px 0 10px">Vehicles</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:8px">Status</th><th style="text-align:right;padding:8px">Count</th>
            </tr>
            <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">On duty</td><td style="text-align:right;padding:8px">${vehiclesOnDuty}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Maintenance</td><td style="text-align:right;padding:8px">${vehiclesMaintenance}</td></tr>
            <tr><td style="padding:8px">Available</td><td style="text-align:right;padding:8px">${vehicles.length - vehiclesOnDuty - vehiclesMaintenance}</td></tr>
          </table>
          <h2 style="font-size:15px;margin:26px 0 10px">Incidents</h2>
          ${incidents.length === 0
            ? `<p style="color:#16a34a;font-size:14px">✓ No incidents reported today.</p>`
            : `<p style="font-size:14px">${openIncidents.length} open &nbsp;·&nbsp; ${incidents.length - openIncidents.length} resolved &nbsp;·&nbsp; <strong style="color:#dc2626">${urgentIncidents.length} urgent</strong></p>
               <ul style="font-size:14px;color:#334155">
                 ${incidents.slice(0, 10).map((i) =>
                   `<li>${String(i.severity).toUpperCase()} — ${String(i.status)} @ ${new Date(i.created_at).toLocaleTimeString()}</li>`).join("")}
               </ul>`}
          <p style="margin-top:26px;font-size:12px;color:#94a3b8">
            Generated by Sentinel Fleet · Supabase Edge Function · Resend
          </p>
        </div>
      </div>`;

    await sendEmail(
      {
        from,
        to,
        subject: `Daily Shift Summary — ${shifts.length} shifts, ${completed} completed, ${totalKm} km`,
        html,
      },
      apiKey,
    );
    return json({ ok: true, delivered: true });
  } catch (err) {
    console.error("summary failure", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

function statCard(value: string | number, label: string, color: string): string {
  return `
    <div style="flex:1;min-width:110px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px">
      <div style="font-size:22px;font-weight:700;color:${color}">${value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${label}</div>
    </div>`;
}

Deno.serve(handler);