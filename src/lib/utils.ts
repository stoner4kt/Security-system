import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKmh(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v)} km/h`;
}

export function formatAccuracy(m: number | null | undefined): string {
  if (m == null) return "—";
  return `±${Math.round(m)} m`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function toLatLng(p: { lat?: number; lon?: number } | null | undefined) {
  if (!p) return null;
  return { lat: Number(p.lat), lng: Number(p.lon) };
}

/** Determine live status from last ping time + movement. */
export function vehicleStatus(info: {
  last_location?: unknown;
  last_ping_at?: string | null;
  last_speed_kmh?: number | null;
}): "moving" | "idle" | "offline" {
  if (!info.last_location) return "offline";
  const age = info.last_ping_at ? Date.now() - new Date(info.last_ping_at).getTime() : Infinity;
  if (age > 5 * 60_000) return "offline";
  if (Number(info.last_speed_kmh) > 3) return "moving";
  return "idle";
}