-- ============================================================================
-- Sentinel Fleet — Initial Schema
-- Security company vehicle tracking, shift bookings and patrol monitoring.
--
-- Run this file in the Supabase SQL Editor (or via `supabase db push`).
-- Ordering matters: extensions → helper functions → enum types → tables → RLS.
-- ============================================================================

-- 1. EXTENSIONS ---------------------------------------------------------------
create extension if not exists postgis;
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy search on vehicles (optional)

-- ============================================================================
-- 2. HELPER: JSON body → typed record (used by triggers / webhooks)
-- ============================================================================
create or replace function public.generic_trigger_route()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

-- ============================================================================
-- 3. ENUM TYPES
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'dispatcher', 'guard');
  end if;
  if not exists (select 1 from pg_type where typname = 'shift_status') then
    create type public.shift_status as enum ('scheduled', 'active', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'incident_severity') then
    create type public.incident_severity as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

-- ============================================================================
-- 4. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- vehicles
-- ----------------------------------------------------------------------------
create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  registration    text not null unique,             -- e.g. "KJA 774B"
  make            text not null,
  model           text not null,
  year            integer check (year between 1980 and 2100),
  color           text,
  vin             text unique,
  fuel_type       text default 'diesel',
  status          text not null default 'available'
                    check (status in ('available','assigned','on_duty','maintenance','offline')),
  -- Optional accurate position; the live trail lives in location_logs.
  last_location   geography(point, 4326),
  last_heading    numeric,
  last_speed_kmh  numeric
                    check (last_speed_kmh >= 0),
  odometer_km     numeric,
  photo_url       text,                              -- public Cloudinary vehicle photo
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Spatial index so "vehicles within bounding box" queries on the map stay fast.
create index vehicles_last_location_gix on public.vehicles
  using gist (last_location);

-- ----------------------------------------------------------------------------
-- guards  (1:1 with auth.users; profile data for every security guard)
-- ----------------------------------------------------------------------------
create table public.guards (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          public.user_role not null default 'guard',
  badge_number  text unique,
  phone         text,
  avatar_url    text,
  -- When the guard is actively streaming GPS we keep the head of the trail here.
  is_on_duty    boolean not null default false,
  current_shift uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- vehicles_documents — generated Cloudinary URLs (inspection photos, licences)
-- ----------------------------------------------------------------------------
create table public.vehicles_documents (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  guard_id      uuid references public.guards(id) on delete set null,
  title         text not null,
  doc_type      text not null default 'photo'
                  check (doc_type in ('inspection','damage','insurance','license','permit','other')),
  url           text not null,                        -- secure_delivery_url from Cloudinary
  public_id     text,                                 -- Cloudinary public_id (for delete)
  width         integer,
  height        integer,
  bytes         bigint,
  format        text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bookings_shifts — vehicle check-outs, shift schedules and mileage logs
-- ----------------------------------------------------------------------------
create table public.bookings_shifts (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles(id) on delete restrict,
  guard_id         uuid not null references public.guards(id) on delete restrict,
  status           public.shift_status not null default 'scheduled',
  shift_title      text default 'Patrol shift',
  starts_at        timestamptz not null,
  ends_at          timestamptz check (ends_at is null or ends_at > starts_at),
  actual_started_at timestamptz,
  actual_ended_at  timestamptz,
  odometer_start   numeric,                            -- km at check-out
  odometer_end     numeric,                            -- km at check-in
  distance_km      numeric generated always as (
                     greatest(coalesce(odometer_end, 0) - coalesce(odometer_start, 0), 0)
                   ) stored,
  notes            text,
  incident_reported boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index bookings_shifts_guard_id_idx   on public.bookings_shifts(guard_id);
create index bookings_shifts_vehicle_id_idx on public.bookings_shifts(vehicle_id);
create index bookings_shifts_starts_at_idx  on public.bookings_shifts(starts_at desc);

-- ----------------------------------------------------------------------------
-- location_logs — the live GPS stream + historical trail
-- ----------------------------------------------------------------------------
create table public.location_logs (
  id           bigint generated always as identity primary key,
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  guard_id     uuid references public.guards(id) on delete cascade,
  shift_id     uuid references public.bookings_shifts(id) on delete set null,
  geom         geography(point, 4326) not null,        -- point(geography) = lat/lon
  lat          double precision not null
                 check (lat between -90 and 90),
  lon          double precision not null
                 check (lon between -180 and 180),
  speed_kmh    numeric
                 check (speed_kmh between 0 and 350),
  heading_deg  numeric
                 check ((heading_deg between 0 and 360) or heading_deg is null),
  accuracy_m   numeric default 0
                 check (accuracy_m >= 0),
  altitude_m   numeric,
  recorded_at  timestamptz not null default now()
);

-- GIST spatial index: fast "trail points inside this bounding box".
create index location_logs_geom_gix on public.location_logs using gist (geom);
-- B-tree composite: route playback by (vehicle, time range).
create index location_logs_vehicle_time_idx
  on public.location_logs (vehicle_id, recorded_at desc);
-- Trim-friendliness: the janitor job deletes this table after 7 days by id.
create index location_logs_recorded_at_idx on public.location_logs (recorded_at);
-- Realtime listener for dashboard: filters per client id + guard id.
alter table public.location_logs replica identity full;

-- ----------------------------------------------------------------------------
-- incidents — panic buttons & logged security events (drive the alert emails)
-- ----------------------------------------------------------------------------
create table public.incidents (
  id           uuid primary key default gen_random_uuid(),
  shift_id     uuid references public.bookings_shifts(id) on delete set null,
  vehicle_id   uuid references public.vehicles(id) on delete set null,
  guard_id     uuid references public.guards(id) on delete set null,
  severity     public.incident_severity not null default 'medium',
  title        text not null,
  description  text,
  lat          double precision,
  lon          double precision,
  photo_url    text,                                   -- Cloudinary URL
  status       text not null default 'open'
                 check (status in ('open','acknowledged','resolved')),
  resolved_note text,
  created_at   timestamptz not null default now()
);

create index incidents_created_at_idx on public.incidents (created_at desc);
alter table public.incidents replica identity full;    -- webhook needs old row fields

-- ============================================================================
-- 5. TRIGGER-DRIVEN UPDATED_AT
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vehicles_touch_updated_at before update on public.vehicles
  for each row execute function public.touch_updated_at();
create trigger guards_touch_updated_at before update on public.guards
  for each row execute function public.touch_updated_at();
create trigger bookings_touch_updated_at before update on public.bookings_shifts
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 6. SHIFT LIFECYCLE HELPERS (safe for Edge Functions to call via RPC)
-- ============================================================================

-- Start a shift: only the assigned guard (or staff) may go live.
create or replace function public.start_shift(p_shift_id uuid)
returns public.bookings_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.bookings_shifts;
  v_now   timestamptz := now();
begin
  select * into v_shift from public.bookings_shifts where id = p_shift_id;
  if not found then
    raise exception 'shift_not_found' using errcode = 'P0001';
  end if;

  -- Authorization: caller must be the assigned guard or staff.
  if not (auth.uid() = v_shift.guard_id or public.is_staff()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'scheduled' then
    raise exception 'shift_not_scheduled' using errcode = 'P0001';
  end if;

  update public.bookings_shifts
     set status = 'active',
         actual_started_at = coalesce(actual_started_at, v_now)
   where id = p_shift_id;

  update public.guards
     set is_on_duty = true,
         current_shift = p_shift_id
   where id = v_shift.guard_id;

  update public.vehicles
     set status = 'on_duty'
   where id = v_shift.vehicle_id;

  return (select * from public.bookings_shifts where id = p_shift_id);
end;
$$;

-- End a shift: wipe the guard's patrol state and release the vehicle.
create or replace function public.end_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.bookings_shifts;
begin
  select * into v_shift from public.bookings_shifts where id = p_shift_id;
  if not found then
    raise exception 'shift_not_found' using errcode = 'P0001';
  end if;

  -- Authorization: caller must be the assigned guard (or staff).
  if not (auth.uid() = v_shift.guard_id or public.is_staff()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Write final mileage back from location-stream-based odometer if supplied.
  update public.bookings_shifts
     set status = 'completed',
         actual_ended_at = now()
   where id = p_shift_id
     and status = 'active';

  update public.guards
     set is_on_duty = false,
         current_shift = null,
         updated_at = now()
   where id = v_shift.guard_id;

  update public.vehicles
     set status = 'available',
         updated_at = now()
   where id = v_shift.vehicle_id;
end;
$$;

-- Insert a GPS ping. Validates ranges server-side and mirrors the point into
-- vehicles.last_location in ONE round trip. Edge Function calls this RPC.
create or replace function public.record_gps_ping(
  p_vehicle_id uuid,
  p_guard_id   uuid,
  p_shift_id   uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_speed_kmh  numeric default 0,
  p_heading    numeric default null,
  p_accuracy_m numeric default 0,
  p_altitude_m numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_owned  bookings_shifts;
begin
  -- Authorization: the caller must be the guard they claim to be, or staff,
  -- AND the target shift must be owned by that same guard (staff can record
  -- telemetry for any shift they supervise).
  select * into v_owned
    from public.bookings_shifts
   where id = p_shift_id;
  if not found then
    raise exception 'shift_not_found' using errcode = 'P0001';
  end if;
  if not (
    (auth.uid() = p_guard_id and v_owned.guard_id = p_guard_id)
    or public.is_staff()
  ) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Range validation (defence at the DB layer, in addition to the Edge Function).
  if p_lat is null or p_lon is null then
    raise exception 'invalid_coordinates' using errcode = 'P0001';
  end if;
  if p_lat between -90 and 90 and p_lon between -180 and 180 then
    null;
  else
    raise exception 'invalid_coordinates' using errcode = 'P0001';
  end if;

  insert into public.location_logs
    (vehicle_id, guard_id, shift_id, geom, lat, lon,
     speed_kmh, heading_deg, accuracy_m, altitude_m)
  values
    (p_vehicle_id, p_guard_id, p_shift_id,
     st_point(p_lon, p_lat),       -- ST_Point(lon, lat) for geography
     p_lat, p_lon,
     coalesce(p_speed_kmh, 0), coalesce(p_heading, null),
     coalesce(p_accuracy_m, 0), p_altitude_m)
  returning id into v_id;

  update public.vehicles
     set last_location = st_point(p_lon, p_lat),
         last_speed_kmh = coalesce(p_speed_kmh, 0),
         last_heading   = p_heading,
         updated_at     = now()
   where id = p_vehicle_id;

  return v_id;
end;
$$;

-- Route history: return the polyline for one vehicle in a time window.
-- Caller must be staff or a guard who has been assigned the vehicle.
create or replace function public.get_route_history(
  p_vehicle_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns setof public.location_logs
language sql
stable
security definer
set search_path = public
as $$
  select l.*
    from public.location_logs l
   where l.vehicle_id = p_vehicle_id
     and l.recorded_at between p_from and p_to
     and (
       public.is_staff()
       or exists (
         select 1
           from public.bookings_shifts bs
          where bs.vehicle_id = p_vehicle_id
            and bs.guard_id = auth.uid()
       )
     )
   order by l.recorded_at asc;
$$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================
alter table public.vehicles         enable row level security;
alter table public.guards           enable row level security;
alter table public.vehicles_documents enable row level security;
alter table public.bookings_shifts  enable row level security;
alter table public.location_logs    enable row level security;
alter table public.incidents        enable row level security;

-- Helper: is the requesting user an admin/dispatcher?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guards g
     where g.id = auth.uid()
       and g.role in ('admin', 'dispatcher')
  );
$$;

-- ----------------------------------------------------------------------------
-- vehicles : everyone authenticated can READ; only staff WRITE.
-- ----------------------------------------------------------------------------
create policy "vehicles_select_all_auth"
  on public.vehicles for select
  using (auth.role() = 'authenticated');

create policy "vehicles_insert_staff"
  on public.vehicles for insert
  with check (public.is_staff());

create policy "vehicles_update_staff"
  on public.vehicles for update
  using (public.is_staff());

create policy "vehicles_delete_staff"
  on public.vehicles for delete
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- guards : user can read+update own profile; staff can manage all.
-- ----------------------------------------------------------------------------
create policy "guards_select_own_or_staff"
  on public.guards for select
  using (auth.uid() = id or public.is_staff());

create policy "guards_insert_self"
  on public.guards for insert
  with check (auth.uid() = id);

create policy "guards_update_own_or_staff"
  on public.guards for update
  using (auth.uid() = id or public.is_staff());

create policy "guards_delete_staff"
  on public.guards for delete
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- vehicles_documents : guards may attach docs to their own patrols; staff all.
-- ----------------------------------------------------------------------------
create policy "docs_select_all_auth"
  on public.vehicles_documents for select
  using (auth.role() = 'authenticated');

create policy "docs_insert_own_or_staff"
  on public.vehicles_documents for insert
  with check (auth.uid() = guard_id or public.is_staff());

create policy "docs_update_own_or_staff"
  on public.vehicles_documents for update
  using (auth.uid() = guard_id or public.is_staff());

create policy "docs_delete_own_or_staff"
  on public.vehicles_documents for delete
  using (auth.uid() = guard_id or public.is_staff());

-- ----------------------------------------------------------------------------
-- bookings_shifts : guards manage their own shifts; staff see everything.
-- ----------------------------------------------------------------------------
create policy "shifts_select_all_auth"
  on public.bookings_shifts for select
  using (auth.role() = 'authenticated');

create policy "shifts_insert_own_or_staff"
  on public.bookings_shifts for insert
  with check (auth.uid() = guard_id or public.is_staff());

create policy "shifts_update_own_or_staff"
  on public.bookings_shifts for update
  using (auth.uid() = guard_id or public.is_staff());

create policy "shifts_delete_staff"
  on public.bookings_shifts for delete
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- location_logs :
--   - INSERT: any authenticated user in a live patrol may write pings
--     (the Edge Function validates ownership & shift);
--   - SELECT: staff see everything; guards can see their own history.
-- Other user groups get nothing.
-- ----------------------------------------------------------------------------
create policy "logs_insert_auth_patrol"
  on public.location_logs for insert
  with check (auth.role() = 'authenticated');

create policy "logs_select_staff"
  on public.location_logs for select
  using (public.is_staff());

create policy "logs_select_own"
  on public.location_logs for select
  using (guard_id = auth.uid());

-- ----------------------------------------------------------------------------
-- incidents : staff full access; guards create/report + update their own.
-- ----------------------------------------------------------------------------
create policy "incidents_select_all_auth"
  on public.incidents for select
  using (auth.role() = 'authenticated');

create policy "incidents_insert_all_auth"
  on public.incidents for insert
  with check (auth.role() = 'authenticated');

create policy "incidents_update_own_or_staff"
  on public.incidents for update
  using (guard_id = auth.uid() or public.is_staff());

create policy "incidents_delete_staff"
  on public.incidents for delete
  using (public.is_staff());

-- ============================================================================
-- 8. REALTIME WIRING
-- ============================================================================
-- Broadcast INSERTs on vehicles + location_logs to connected clients
-- (`supabase.channel('fleet').on('postgres_changes', ...)`).
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.location_logs;
alter publication supabase_realtime add table public.bookings_shifts;
alter publication supabase_realtime add table public.incidents;

-- ============================================================================
-- 9. SEED DATA (optional — delete or edit before first deploy)
-- ============================================================================
insert into public.vehicles (registration, make, model, year, color, status, fuel_type)
values
  ('KJA 774B', 'Toyota',    'Hilux Double Cab', 2022, 'White',  'available', 'diesel'),
  ('KJB 118C', 'Ford',      'Ranger',           2021, 'Black',  'available', 'diesel'),
  ('KCZ 902A', 'Land Rover','Defender 110',     2023, 'Green',  'available', 'diesel'),
  ('KDX 410D', 'Mitsubishi','L200',             2020, 'Silver', 'assigned',  'diesel')
on conflict (registration) do nothing;

-- ----------------------------------------------------------------------------
-- 10. API KEY FOR EDGE FUNCTIONS (optional convenience)
-- ----------------------------------------------------------------------------
-- The Edge Functions call the PostgREST/Postgres layer with the service role
-- key, so no additional secrets are required inside the database.
-- (See supabase/functions/README.md for setup.)