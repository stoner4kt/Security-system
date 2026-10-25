// Lightweight row types for the Sentinel Fleet schema.
// For generated types: `supabase gen types typescript --project-id X > types.ts`

export type UserRole = "admin" | "dispatcher" | "guard";
export type ShiftStatus = "scheduled" | "active" | "completed" | "cancelled";
export type VehicleStatus = "available" | "assigned" | "on_duty" | "maintenance" | "offline";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  vin: string | null;
  fuel_type: string | null;
  status: string;
  last_location: unknown | null; // PostGIS geometry
  last_lat?: number | null;      // materialized by the API layer
  last_lon?: number | null;
  last_heading: number | null;
  last_speed_kmh: number | null;
  odometer_km: number | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Guard {
  id: string;
  full_name: string;
  role: UserRole;
  badge_number: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_on_duty: boolean;
  current_shift: string | null;
}

export interface BookingShift {
  id: string;
  vehicle_id: string;
  guard_id: string;
  status: ShiftStatus;
  shift_title: string;
  starts_at: string;
  ends_at: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_km: number | null;
  notes: string | null;
  incident_reported: boolean;
  created_at: string;
  updated_at: string;
  vehicle?: Pick<Vehicle, "id" | "registration" | "make" | "model"> | null;
  guard?: Pick<Guard, "id" | "full_name" | "badge_number"> | null;
}

export interface LocationLog {
  id: number | string;
  vehicle_id: string;
  guard_id: string | null;
  shift_id: string | null;
  geom: unknown;
  lat: number;
  lon: number;
  speed_kmh: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  recorded_at: string;
}

/** Live view model fed to the dashboard (materialized via API/edge fn). */
export interface LiveVehicle extends Vehicle {
  last_ping_at: string | null;
  live_status: "moving" | "idle" | "offline";
  guard: Guard | null;
  shift: BookingShift | null;
}

export interface Incident {
  id: string;
  shift_id: string | null;
  vehicle_id: string | null;
  guard_id: string | null;
  reported_by: string | null;
  severity: IncidentSeverity;
  title: string;
  description: string | null;
  lat: number | null;
  lon: number | null;
  photo_url: string | null;
  status: "open" | "acknowledged" | "resolved";
  resolved_note: string | null;
  created_at: string;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string | null;
  guard_id: string | null;
  title: string;
  doc_type: string;
  url: string;
  public_id: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  notes: string | null;
  created_at: string;
}