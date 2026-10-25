"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LiveVehicleView } from "@/lib/hooks/use-real-time-vehicles";
import type { Vehicle } from "@/lib/supabase/types";
import { vehicleStatus, timeAgo } from "@/lib/utils";

export type MapPinStatus = "moving" | "idle" | "offline" | "available";

export const STATUS_COLORS: Record<MapPinStatus, string> = {
  moving: "#22c55e",   // green = moving
  idle: "#eab308",     // yellow = idle
  offline: "#ef4444",  // red = offline
  available: "#64748b" // slate = parked/unassigned
};

interface FleetMapProps {
  vehicles: LiveVehicleView[];
  vehiclesById?: Map<string, Vehicle>;
  className?: string;
  fitBoundsKey?: string; // bump to re-fit
}

const DEFAULT_CENTER: [number, number] = [26.5376, 64.2251]; // Kajaani, Finland depot
const DEFAULT_ZOOM = 13;
const OSM_TILES = {
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
        maxzoom: 19,
      },
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 512,
        attribution: "© OpenStreetMap contributors © CARTO",
        maxzoom: 20,
      },
    },
    layers: [
      { id: "osm", type: "raster", source: "osm" },
      { id: "carto", type: "raster", source: "carto" },
    ],
  } as unknown as maplibregl.StyleSpecification,
};

const statusColor = (v: LiveVehicleView): MapPinStatus =>
  v.last_ping_at ? vehicleStatus(v) : v.status === "available" ? "available" : "offline";

const markerSize = (v: LiveVehicleView): number => {
  if (!v.last_ping_at) return 26;
  return Math.min(46, Math.max(30, 26 + (Number(v.last_speed_kmh) || 0) / 10));
};

// CARTO/OSM don't include a vector keyed "name" — just label the registration.
function buildPopup(v: LiveVehicleView): maplibregl.Popup {
  const el = document.createElement("div");
  const status = statusColor(v);
  el.innerHTML = `
    <div style="min-width:200px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${STATUS_COLORS[status]}"></span>
        <strong>${v.registration ?? "Vehicle"}</strong>
        <span style="margin-left:auto;font-size:11px;color:#64748b;text-transform:capitalize">${status}</span>
      </div>
      <div style="font-size:12px;color:#334155">${v.make} ${v.model} ${v.color ?? ""}</div>
      <div style="font-size:12px;color:#334155">Speed <b>${Math.round(Number(v.last_speed_kmh) || 0)} km/h</b></div>
      <div style="font-size:12px;color:#334155">Last ping <b>${timeAgo(v.last_ping_at)}</b></div>
      <div style="font-size:12px;color:#334155">Guard: <b>${(v as unknown as { guard_name?: string }).guard_name ?? "—"}</b></div>
    </div>`;
  return new maplibregl.Popup({ offset: 22, closeButton: true }).setDOMContent(el);
}

function makeMarkerEl(v: LiveVehicleView): HTMLDivElement {
  const status = statusColor(v);
  const size = markerSize(v);
  const speed = Number(v.last_speed_kmh) || 0;
  const rotation = Number(v.last_heading) ?? 0;

  const el = document.createElement("div");
  el.style.cssText = `
    width: ${size}px; height: ${size}px; cursor: pointer;
    transform: translate(-50%, -50%); position: relative;
  `;

  // status glow
  const glow = document.createElement("span");
  glow.style.cssText = `
    position: absolute; inset: 0; border-radius: 50%;
    background: ${STATUS_COLORS[status]}; opacity: 0.25;
    animation: pulse-ring 1.6s cubic-bezier(0.4,0,0.6,1) infinite;
  `;

  const dot = document.createElement("div");
  dot.style.cssText = `
    position: absolute; left: 50%; top: 50%;
    width: ${fastRound(size * 0.56)}px; height: ${fastRound(size * 0.56)}px;
    transform: translate(-50%,-50%) rotate(${rotation}deg);
    border-radius: 50%; background: ${STATUS_COLORS[status]};
    border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,.35);
    display: flex; align-items: center; justify-content: center;
  `;

  // speed badge when moving
  if (status === "moving" && speed > 0) {
    const badge = document.createElement("span");
    badge.textContent = `${Math.round(speed)}`;
    badge.style.cssText = `
      position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
      background: #0f172a; color: white; font-size: 9px; font-weight: 700;
      padding: 1px 5px; border-radius: 999px; border: 1px solid white;
    `;
    dot.appendChild(badge);
  }

  el.appendChild(glow);
  el.appendChild(dot);
  return el;
}

function fastRound(n: number) {
  return n | 0;
}

export function FleetMap({ vehicles, className }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_TILES.style,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("load", () => setMapReady(true));
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Reconcile markers with the vehicle list.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    for (const v of vehicles) {
      const pos =
        v.last_lat != null && v.last_lon != null
          ? [v.last_lon, v.last_lat] as [number, number]
          : v.last_location
            ? (v.last_location as { coordinates?: [number, number] }).coordinates ?? null
            : null;
      if (!pos) continue;

      const existing = markersRef.current.get(v.id);
      const freshEl = makeMarkerEl(v);
      if (!existing) {
        const marker = new maplibregl.Marker({ element: freshEl, anchor: "center" })
          .setLngLat(pos)
          .setPopup(buildPopup(v))
          .addTo(map);
        markersRef.current.set(v.id, marker);
      } else {
        // Refresh visuals: swap the marker's DOM contents in place.
        const host = existing.getElement();
        host.replaceChildren(...Array.from(freshEl.children));
        host.style.transform = "translate(-50%, -50%)";
        host.style.width = freshEl.style.width;
        host.style.height = freshEl.style.height;
        existing.setLngLat(pos);
        existing.setPopup(buildPopup(v));
      }
    }
    // remove markers no longer present
    for (const [id, marker] of markersRef.current) {
      if (!vehicles.some((v) => v.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [vehicles, mapReady]);

  const geoBounds = useMemo(() => {
    const pts: [number, number][] = [];
    for (const v of vehicles) {
      if (v.last_lat != null && v.last_lon != null) pts.push([v.last_lon, v.last_lat]);
      else if (
        v.last_location &&
        (v.last_location as { coordinates?: [number, number] }).coordinates
      ) pts.push((v.last_location as { coordinates: [number, number] }).coordinates);
    }
    return pts;
  }, [vehicles]);

  // Fit to vehicles only when their *count* changes (not on every ping move),
  // so the viewport doesn't fight the guard panning around.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || geoBounds.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    geoBounds.forEach((p) => b.extend(p as [number, number]));
    map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, geoBounds.length]);

  return (
    <div className={className ?? "h-[60vh] w-full overflow-hidden rounded-xl lg:h-[calc(100vh-7rem)]"}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}