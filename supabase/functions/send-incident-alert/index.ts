// ============================================================================
// send-incident-alert
//
// Triggered by a Supabase Database Webhook on `incidents` (INSERT/UPDATE).
// Sends a security alert via Resend to the ops inbox. Non-critical incidents
// are summarized; high/critical ones ping immediately with severity labels.
//
// Payload arrives as:
//   { type: "INSERT", table: "incidents", record: {...}, old_record: {...}, ... }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { serviceClient, isAuthorized } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/resend.ts";

interface WebhookPayload {
  type: string;      // INSERT | UPDATE | DELETE
  table: string;
  schema?: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "#64748b",
  medium: "#eab308",
  high: "#f97316",
  critical: "#dc2626",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "CRITICAL",
};

export async function handler(req: Request): Promise<Response> {
  const pre = handlePreflight(req);
  if (pre) return pre;

  if (!(await isAuthorized(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const to = Deno.env.get("ADMIN_ALERT_EMAIL");
  if (!apiKey || !from || !to) {
    console.error("missing RESEND / ADMIN env vars");
    return json({ error: "not_configured" }, 500);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const rec = payload.record ?? {};
  const severity = String(rec.severity ?? "medium");
  const isUrgent = severity === "high" || severity === "critical";
  if (!isUrgent && payload.type !== "INSERT") {
    // Only blitz the inbox for urgent events on every mutation.
    return json({ ok: true, skipped: "non-urgent update" });
  }

  const supabase = serviceClient();

  // Enrich the incident with guard + vehicle + shift context.
  const guardId: string | null = (rec.guard_id as string) ?? null;
  const vehicleId: string | null = (rec.vehicle_id as string) ?? null;

  const [guardRes, vehicleRes] = await Promise.all([
    guardId ? supabase.from("guards").select("full_name, badge_number, phone").eq("id", guardId).single() : Promise.resolve({ data: null, error: null }),
    vehicleId ? supabase.from("vehicles").select("registration, make, model").eq("id", vehicleId).single() : Promise.resolve({ data: null, error: null }),
  ]);

  const guard = guardRes.data as { full_name?: string; badge_number?: string; phone?: string } | null;
  const vehicle = vehicleRes.data as { registration?: string; make?: string; model?: string } | null;

  const incidentLink = `${Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://your-app.pages.dev"}/dashboard?incident=${rec.id}`;
  const title = String(rec.title ?? "Security incident");
  const description = String(rec.description ?? "No description");
  const severityBadge = `<span style="background:${SEVERITY_COLORS[severity] ?? "#64748b"};color:#fff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600">${SEVERITY_LABEL[severity] ?? (severity as string)?.toUpperCase?.()}</span>`;

  const lat = rec.lat as number | null;
  const lon = rec.lon as number | null;
  const mapsLink = lat != null && lon != null
    ? `<a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}">View location (OSM)</a>`
    : "No coordinates provided";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:18px">🚨 Security Incident ${isUrgent ? "— Immediate attention" : ""}</h1>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>${severityBadge}&nbsp;&nbsp;<strong>${escapeHtml(title)}</strong></p>
        <p style="color:#475569">${escapeHtml(description)}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0" />
        <table style="font-size:14px;color:#334155">
          <tr><td style="padding:4px 12px 4px 0"><b>Reported at</b></td><td>${new Date(String(rec.created_at ?? Date.now())).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><b>Status</b></td><td>${String(rec.status ?? "open")}</td></tr>
          ${guard ? `<tr><td style="padding:4px 12px 4px 0"><b>Guard</b></td><td>${escapeHtml(guard.full_name ?? "")} ${guard.badge_number ? `(${guard.badge_number})` : ""}${guard.phone ? ` · ${guard.phone}` : ""}</td></tr>` : ""}
          ${vehicle ? `<tr><td style="padding:4px 12px 4px 0"><b>Vehicle</b></td><td>${escapeHtml(vehicle.make ?? "")} ${escapeHtml(vehicle.model ?? "")} — ${escapeHtml(vehicle.registration ?? "")}</td></tr>` : ""}
          <tr><td style="padding:4px 12px 4px 0"><b>Location</b></td><td>${mapsLink}</td></tr>
        </table>
        <p style="margin-top:22px">
          <a href="${incidentLink}" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open in dashboard →</a>
        </p>
      </div>
    </div>`;

  try {
    await sendEmail(
      {
        from,
        to,
        subject: `${isUrgent ? "🚨" : ""} ${SEVERITY_LABEL[severity] ?? "Incident"}: ${title}`,
        html,
      },
      apiKey,
    );
    return json({ ok: true, delivered: true });
  } catch (err) {
    console.error("resend failure", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

Deno.serve(handler);