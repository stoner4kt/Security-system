# Sentinel Fleet — Security Patrol & Fleet Tracking Platform

Production-ready full-stack app for a security company to **track vehicles**,
**manage shift bookings**, and **monitor patrols in real time**.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Radix UI · Lucide |
| Backend | Supabase (PostgreSQL + PostGIS, Realtime, RLS, Auth) |
| Edge backend | Supabase Edge Functions (Deno) — email, location validation, upload signing |
| Media | Cloudinary (vehicle damage photos, licence documents) |
| Email | Resend (incident alerts + daily shift summaries) |
| Maps | MapLibre GL JS with OpenStreetMap / CARTO tiles (no Google billing) |
| Hosting | Cloudflare Pages (web app) + Cloudflare Worker (edge gateway) |

---

## Features

- **RBAC** — Admin / Dispatcher / Security Guard, enforced in Postgres via RLS
- **Guard PWA duty view** — one-tap Start Shift uses
  `navigator.geolocation.watchPosition` and streams lat/lon/speed/heading to
  Supabase every **15 s**; End Shift stops broadcasting to save battery
- **Admin live fleet map** — realtime vehicle markers (green= moving,
  yellow=idle, red= offline) via Supabase Realtime, with speed / guard / last
  ping popups
- **Bookings & shifts** — table + calendar, vehicle check-out, mileage logging
- **Route history playback** — pick a vehicle + date range and draw its GPS trail
- **Cloudinary uploads** — snap damage/licence photos, saved back to Supabase
- **Email automation** — edge functions send urgent incident alerts and the
  daily shift summary through Resend
- **PWA** — installable standalone app (manifest + icons included)

## Quick start

```bash
npm ci
cp .env.example .env.local   # fill in Supabase project + Cloudinary + Resend
npm run dev                  # http://localhost:3000
```

See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for the full production
guide (Supabase schema push, Edge Functions, Cloudinary/Resend setup,
Cloudflare Pages + Worker).

## Project layout

```
├── src/
│   ├── app/                 # App Router pages (login, register, duty, dashboard,
│   │   │                    #  bookings, uploads, vehicles, incidents, reports)
│   ├── components/
│   │   ├── ui/              # shadcn-style primitives (button, dialog, …)
│   │   ├── guard/           # duty tracker (GPS streaming UI)
│   │   ├── map/             # fleet map, vehicle list, route history/playback
│   │   ├── bookings/        # shift table/calendar + booking form
│   │   ├── uploads/         # Cloudinary uploader
│   │   ├── incidents/       # incident reports
│   │   └── layout/          # app shell, sidebar, top nav
│   ├── lib/
│   │   ├── supabase/        # typed clients (browser + server), RPC helpers
│   │   └── hooks/           # use-auth, use-geolocation, use-realtime-vehicles,
│   │                        #  use-bookings, use-route-history
│   └── worker.ts            # Cloudflare Worker (optional edge gateway)
├── supabase/
│   ├── migrations/          # 0001 initial schema (PostGIS+RLS), 0002 GPS janitor
│   ├── functions/           # validate-location, send-incident-alert,
│   │   │                    #  daily-shift-summary, cloudinary-sign
│   │   └── _shared/         # cors, auth, resend helpers
│   └── config.toml          # local CLI config
├── docs/DEPLOYMENT.md       # complete production deployment guide
├── .github/workflows/       # optional cron alternative for the daily summary
└── wrangler.{jsonc,pages.toml}
```

## Database schema

- `vehicles` — fleet registry + live telemetry columns (`last_location` geometry,
  `last_speed_kmh`, `last_heading`, `last_ping_at`, `last_guard_id`)
- `guards` — profiles bound 1:1 to `auth.users`, `role`, `badge_number`,
  `is_on_duty` heartbeat
- `bookings_shifts` — check-outs, schedules, mileage (`odometer_start/end`,
  `distance_km`), status transitions via `start_shift()` / `end_shift()` RPCs
- `location_logs` — 15-s GPS pings with `record_gps_ping()` + `get_route_history()`
- `vehicles_documents` — Cloudinary references (URL + public_id)
- `incidents` — patrol incident reports (webhook triggers the email alert)

All tables enable **RLS**; grant rules are in `0001_initial_schema.sql`.

## Edge functions

| Function | Purpose | Key secrets |
|---|---|---|
| `validate-location` | Validates + inserts a GPS ping (used by the 15-s stream) | — |
| `send-incident-alert` | Called by a DB webhook on `incidents` INSERT; emails ops | `RESEND_API_KEY`, `ADMIN_ALERT_EMAIL` |
| `daily-shift-summary` | Aggregates the day and emails a summary | `RESEND_API_KEY`, `ADMIN_ALERT_EMAIL` |
| `cloudinary-sign` | Signs Cloudinary uploads server-side | `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` |

`_shared/auth.ts` accepts either a valid user JWT or a request carrying
`x-sentinel-secret: <WEBHOOK_SECRET>` (used by database webhooks).

## Scripts

```bash
npm run dev           # Next.js dev server
npm run build         # static export to ./out (for Cloudflare Pages)
npm start             # serve the static export locally
npm run lint          # ESLint
npx tsc --noEmit      # type-check
npm run deploy:pages  # wrangler pages deploy out
npm run deploy:workers# wrangler deploy (gateway worker)
```

## Security notes

- The browser bundle carries only the Supabase **anon** key and the Cloudinary
  **cloud name** — never the service-role key or Cloudinary secret.
- Every mutation is gated by RLS policies (staff `admin`/`dispatcher` vs guard).
- Database webhooks use the shared `WEBHOOK_SECRET` header (not just the anon JWT).
- Location pings are written via the guarded `record_gps_ping()` RPC so guards
  can only record telemetry for vehicles they have been assigned.

## License

MIT — see `LICENSE`.