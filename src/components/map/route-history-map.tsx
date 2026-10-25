"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RoutePoint } from "@/lib/hooks/use-route-history";

const OSM_TILES = {
  version: 8,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

interface RouteHistoryMapProps {
  points: RoutePoint[];
  height?: string;
}

export function RouteHistoryMap({ points, height = "60vh" }: RouteHistoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_TILES as unknown as maplibregl.StyleSpecification,
      center: [26.5376, 64.2251],
      zoom: 12,
    });
    map.on("load", () => setReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const lineCoords = useMemo(
    () => points.filter((p) => isFinite(p.lat) && isFinite(p.lon)).map((p) => [p.lon, p.lat]),
    [points],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear previous trail sources/layers.
    for (const id of ["route-line", "route-start", "route-end", "route-pts"]) {
      if (map.getSource(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }

    if (lineCoords.length === 0) {
      map.easeTo({ center: [26.5376, 64.2251], zoom: 12 });
      return;
    }

    map.addSource("route-line", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: lineCoords },
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1d4ed8",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });

    map.addSource("route-pts", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiPoint",
          coordinates: lineCoords,
        },
      },
    });
    map.addLayer({
      id: "route-pts",
      type: "circle",
      source: "route-pts",
      paint: {
        "circle-radius": ["coalesce", ["get", "acc"], 2],
        "circle-color": "#2563eb70",
        "circle-stroke-color": "#1d4ed8",
        "circle-stroke-width": 1,
      },
    });

    const start = lineCoords[0];
    const end = lineCoords[lineCoords.length - 1];
    map.addSource("route-start", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: start },
      },
    });
    map.addLayer({
      id: "route-start",
      type: "circle",
      source: "route-start",
      paint: {
        "circle-radius": 8,
        "circle-color": "#16a34a",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
    map.addSource("route-end", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: end },
      },
    });
    map.addLayer({
      id: "route-end",
      type: "circle",
      source: "route-end",
      paint: {
        "circle-radius": 8,
        "circle-color": "#dc2626",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });

    const b = new maplibregl.LngLatBounds();
    lineCoords.forEach((c) => b.extend(c as [number, number]));
    map.fitBounds(b, { padding: 80, maxZoom: 17 });
  }, [lineCoords, ready]);

  return (
    <div style={{ height, width: "100%", overflow: "hidden", borderRadius: 12 }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}