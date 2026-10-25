# Supabase Edge Functions — Sentinel Fleet

Deno-based edge functions (run on Supabase Edge Runtime / Deno Deploy).

## Local development

```bash
supabase init
supabase start
supabase functions serve validate-location --env-file supabase/.env.local
```

## Deployment

```bash
supabase functions deploy validate-location
supabase functions deploy send-incident-alert
supabase functions deploy daily-shift-summary
supabase functions deploy cloudinary-sign

# Or push everything at once
supabase functions deploy --project-ref <PROJECT_REF>
```

## Secrets

Set each function's secrets in the Supabase dashboard
(Database → Edge Functions → [function] → Secrets) or:

```bash
supabase secrets set RESEND_API_KEY=... --env-file supabase/.env.local
```

| Variable | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | injected automatically by the platform |
| `SUPABASE_SERVICE_ROLE_KEY` | injected automatically when `verify_jwt` uses service role; set it explicitly as a secret for clarity |
| `RESEND_API_KEY` | send-incident-alert, daily-shift-summary |
| `RESEND_FROM_EMAIL` | send-incident-alert, daily-shift-summary |
| `ADMIN_ALERT_EMAIL` | send-incident-alert, daily-shift-summary |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | cloudinary-sign |

## Triggering via database webhooks

These functions are *callable* but the recommended wiring is Supabase
**Database Webhooks** (Database → Webhooks) so they run server-side:

| Webhook | Table | Events | Function |
|---|---|---|---|
| Incident alert | `incidents` | INSERT | `send-incident-alert` |
| Daily summary | (cron) | — | `daily-shift-summary` — schedule with pg_cron, a GitHub Action, or pg_net |

Webhook requests carry `Authorization: Bearer $SUPABASE_ANON_KEY` by default;
the functions below accept any valid JWT signed by the project (anon or
service role) because they do their own authorization internally.