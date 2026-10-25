# Sentinel Fleet — Production Deployment Guide

This guide walks through deploying the full stack:

1. **Supabase** — database schema (PostGIS + RLS), Auth, Realtime, Edge Functions
2. **Cloudinary** — media storage (upload signing)
3. **Resend** — email delivery (incidents + daily summaries)
4. **Cloudflare Pages** — the Next.js PWA (static export)
5. **Cloudflare Worker** — optional edge gateway (`/api/*`)

Estimated time: ~45 minutes.

---

## 0. Prerequisites

| Tool | Why |
|---|---|
| `node >= 20` + npm | build the web app |
| [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase`) | push migrations, deploy functions |
| A Supabase project (free tier works) | DB + Auth + Realtime + Edge Functions |
| A Cloudinary account (free tier) | image hosting |
| A Resend account (free tier = 100 emails/day) | transactional email |
| A Cloudflare account | Pages + Workers |

## 1. Supabase project setup

### 1.1 Create the project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. Note the region closest to where your guards operate (this affects Realtime latency).
3. Open **Settings → API** and copy:
   - `Project URL`  → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Enable PostGIS
In the Dashboard: **Database → Extensions** → search `postgis` → **Enable**.

> Alternatively run `create extension if not exists postgis;` in SQL editor.
> The migration script *also* attempts this, but enabling from the dashboard
> guarantees the extension owns the correct schema privileges.

### 1.3 Push the schema
```bash
# log in to your project (one time)
supabase login

# link this repo to your cloud project
supabase link --project-ref <PROJECT_REF>   # e.g. abcdefghijklmnopqrst

# apply migrations (0001_initial_schema.sql, 0002_gps_janitor.sql)
supabase db push
```

This creates:
- `public.vehicles`, `public.guards`, `public.vehicles_documents`,
  `public.bookings_shifts`, `public.location_logs`, `public.incidents`
- the `postgis` extension + `GIST` indexes over `location` geometry columns
- the `start_shift` / `end_shift` RPC functions
- triggers for `updated_at` and the guard `is_on_duty` heartbeat
- full **Row Level Security** policies (see `0001_initial_schema.sql`)
- the `purge_stale_locations()` janitor (call it on a schedule, see 1.6)

### 1.4 Auth: roles & test users
1. **Supabase → Authentication → Providers** — keep *Email* enabled.
2. **SQL Editor** — create the two roles and a couple of users:

```sql
-- Role-switch is a security operation; run as postgres / service_role only.
insert into public.guards (id, full_name, role, badge_number)
values
  (auth.uid(), 'Ops Admin', 'admin', 'A-0001')
on conflict (id) do nothing;
```

Full user-creation flow:
- Register via the app (`/register`) — new users get `role = 'guard'` and a `guards` row automatically.
- To create an **admin/dispatcher**, register normally, then:
  ```sql
  update public.guards set role = 'admin' where auth.uid() = id and email = 'you@company.com';
  update auth.users set raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data,'{}'), '{role}', '"admin"'
  ) where id = auth.uid();   -- optional: keep metadata in sync
  ```
3. Set **Redirect URLs** (Authentication → URL Configuration):
   - Site URL: `https://<your-app>.pages.dev` (or `http://localhost:3000` for dev)
   - Add redirect: `https://<your-app>.pages.dev/**`

### 1.5 Realtime
Realtime is enabled by default on the project. The app subscribes to channel
`realtime:vehicles` (filtered `postgres_changes` on `vehicles`)
and `bookings-realtime`. No extra setup is required.

> For low-latency vehicle position streaming we recommend enabling *Supabase
> Realtime Postgres CDC* — it is available on the free tier with the new
> [Realtime pooler](https://supabase.com/docs/guides/realtime). If you see
> latency spikes, move the `location_logs` writes behind the `pg_cron` janitor
> (1.6) instead of per-row Postgres CDC.

### 1.6 Schedule the GPS janitor (optional)
`0002_gps_janitor.sql` defines `purge_stale_locations(
  max_age_hours int default 168, older_than_ms bigint default 900000)`
which (a) drops `location_logs` older than 7 days and (b) parks every vehicle
whose last ping is older than `older_than_ms` (15 min) — flipping it to
`offline` and clearing `last_guard_id`.

Enable `pg_cron` and schedule both steps:
```sql
select cron.schedule('fleet-purge-old-logs',
  '0 3 * * *',  -- 03:00 daily
  $$select purge_stale_locations(168, 900000)$$);
```

## 2. Deploy the Edge Functions

### 2.1 Secrets
```bash
# Edge functions read these from the function environment.
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set RESEND_FROM_EMAIL=no-reply@securefleet.example.com
supabase secrets set ADMIN_ALERT_EMAIL=ops@securefleet.example.com
supabase secrets set CLOUDINARY_CLOUD_NAME=your-cloud
supabase secrets set CLOUDINARY_API_KEY=123456789012345
supabase secrets set CLOUDINARY_API_SECRET=your_secret
supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24)
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the platform.

### 2.2 Deploy
```bash
supabase functions deploy validate-location
supabase functions deploy send-incident-alert
supabase functions deploy daily-shift-summary
supabase functions deploy cloudinary-sign
# or all at once:
supabase functions deploy --project-ref <PROJECT_REF>
```

### 2.3 Wire the incident webhook
1. **Database → Webhooks → Create a Hook** `incident-alert`:
   - Table: `incidents`, Event: **Insert**
   - HTTP method: POST
   - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/send-incident-alert`
   - Headers:
     - `Authorization`: `Bearer <SUPABASE_ANON_KEY>` (added automatically) — or use the `x-sentinel-secret` header equal to your `WEBHOOK_SECRET` for an extra layer.
2. Test by inserting a `high`/`critical` incident row in the SQL editor — you
   should get an email within a couple of seconds.

### 2.4 Schedule the daily summary
Options (pick one):

**a) pg_cron (recommended, no external infra)**
```sql
create extension if not exists pg_cron;   -- enable in dashboard first
select cron.schedule('hourly-summary-1800', '0 18 * * *', $$
  select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-shift-summary',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
    body := '{}'
  );$$);
```

**b) GitHub Actions cron** — see `workers/` → `.github/workflows/cron.yml`
example or trigger manually from the Reports page (UI button).

## 3. Cloudinary configuration

1. **Dashboard → Settings → Upload → Upload presets** → create **unsigned preset**
   - Name: `sentinel_fleet_unsigned`
   - *Signing mode: Unsigned*
   - Folder: `sentinel-fleet/photos` (optional)
2. For production uploads we sign each request via the `cloudinary-sign` edge
   function (keeps the API secret server-side). The app *falls back* to the
   unsigned preset if signing is unavailable, so configure the unsigned preset
   even in production.

Environment (see `.env.example`):
```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=sentinel_fleet_unsigned
```

> **Security note:** an unsigned preset allows *any* upload conforming to its
> rules. Use it only for photos; restrict the folder, max file size and format
> in the preset settings. The DB row that references the uploaded URL is still
> protected by RLS.

## 4. Resend configuration

1. Create a [Resend](https://resend.com) account.
2. Add & verify your **domain** (SPF/DKIM) so `from` sends reliably.
3. Create an **API key** → set as `RESEND_API_KEY` secret (section 2.1).
4. Create an **audience/contact** if you want an unsubscribe footer in the daily summary.

The functions already use allowed "from" format `<noreply@securefleet.example.com>`.

## 5. Cloudflare Pages — web app

### 5.1 Build locally (optional)
```bash
npm ci
npm run build        # static export → ./out
npx wrangler pages dev out   # preview locally
```

### 5.2 Deploy (Dashboard or CLI)
**Dashboard:**
1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the repo + branch `main`.
3. Build command: `npm run build`
4. Build output directory: `out`
5. Environment variables: copy the `NEXT_PUBLIC_*` values from `.env.example`.

**or CLI:**
```bash
npx wrangler login
npm run deploy:pages    # wrangler pages deploy out
```

Add the `NEXT_PUBLIC_*` env vars in **Settings → Variables and Secrets**:
| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | cloud name |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | preset name |
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.pages.dev` |

### 5.3 PWA
The app ships a `manifest.webmanifest` + maskable icons and is already an
installable standalone PWA once served over HTTPS (which Pages does by default).

## 6. Cloudflare Worker — edge gateway (optional)

The Worker (`src/worker.ts`) adds:
- `GET /api/health` — uptime probe
- `POST /api/proxy/supabase-summary` — server-side proxy to the daily-summary edge function

Deploy:
```bash
npm run deploy:workers   # wrangler deploy
```
Secrets it can read (set with `wrangler secret put SUPABASE_URL` etc.) are
optional — the Pages app talks to Supabase directly.

If you want **route protection** for the Worker, add it to `wrangler.jsonc`:
```jsonc
{
  "routes": [{ "pattern": "api.yourdomain.com/*", "custom_domain": true }]
}
```

## 7. Post-deploy smoke test

1. Open `https://<your-app>.pages.dev` → register a guard.
2. `Demo sign-in` uses `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` / `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD`
   if set (create that user + promote to admin first).
3. **Admin**: Bookbooks page → create a shift (vehicle + guard + start time).
4. **Guard**: Duty page → Start Shift → approve browser geolocation → watch
   the Live Fleet map update every ~15 s; End Shift to stop.
5. Reports page → “Send summary email now” → check your inbox.
6. Incident form → create a `critical` incident → check the ops inbox alert.

## 8. Operations runbook (important!)

- **Battery savings**: guards must use **End Shift**, not just close the tab.
  Closing the tab stops `watchPosition` (page lifecycle), but the `vehicles`
  row stays `on_duty` until the 15-min janitor marks it offline. End Shift
  explicitly marks `completed` and clears the vehicle.
- **RLS**: the anon key is public — every policy effectively means
  “any signed-in user can read the fleet”; add a `role` check to restrictive
  policies by extending `guard_role()` if you need finer control.
- **Edge function auth**: `send-incident-alert` accepts (a) any signed JWT and
  (b) requests carrying the `x-sentinel-secret: <WEBHOOK_SECRET>` header.
  Database Webhooks send the anon key; enable *additional* verification by
  using the secret header instead.
- **Cost control**: Realtime broadcasts every 15 s per guard ≈ 5,760 rows/day.
  With 20 guards ≈ 115k rows/24 h — trivial for Postgres, but keep the 7-day
  purge scheduled.
- **Maps**: uses OSM + CARTO tiles. No billing. Respect tile usage policy
  (self-host a tile server if you exceed generous fair-use limits).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` fails on `@supabase/ssr` | bump to `^0.12.7` (released after older pins) |
| Map blank, console 403 on tiles | blur/flaky over OSM tile limits during heavy dev; switch `tiles` to `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Realtime markers don’t update | check subscription logs; ensure `enable_realtime` via SSR client & channel name `realtime:vehicles` |
| Edge function 401 | missing `WEBHOOK_SECRET` or token invalid; test with `curl -H "Authorization: Bearer $SUPABASE_ANON_KEY"` |
| Email not delivered | Resend requires a verified domain; check function logs (Dashboard → Edge Functions → Invocations/Logs) |
| `location_logs` grows fast | run `select purge_stale_locations();` manually, then schedule via pg_cron |
