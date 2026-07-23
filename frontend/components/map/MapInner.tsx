"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useBucoStore } from "@/store/useBucoStore";
import { fetchSpots } from "@/lib/api";
import { haversineKm, walkMins, fallbackLocation } from "@/lib/geo";
import { Spot, UserLocation } from "@/types";
import ChatPanel from "./ChatPanel";

const TORONTO: [number, number] = [43.6532, -79.3832];

type PinKind = "result" | "wishlist" | "recommended" | "database";

interface PinSpot extends Spot {
  kind: PinKind;
  resultIndex?: number;
}

const PIN_COLOR: Record<PinKind, string> = {
  result:      "#d28a2d",
  wishlist:    "#742e12",
  recommended: "#c4885e",
  database:    "#2f6c68",
};

function makePin(kind: PinKind, num?: number, highlighted = false) {
  const color = highlighted ? "#742e12" : PIN_COLOR[kind];
  const glyph = kind === "wishlist" ? "♥" : num != null ? String(num) : kind === "database" ? "✦" : "●";
  const scale = highlighted ? 1.25 : 1;
  return L.divIcon({
    className: "buco-pin-wrap",
    html: `
      <div class="buco-pin${kind === "result" ? " buco-pin-result" : ""}" style="--pin:${color};transform:scale(${scale});transform-origin:bottom center">
        <div class="buco-pin-head">${glyph}</div>
        <div class="buco-pin-tail"></div>
      </div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -36],
  });
}

const youIcon = L.divIcon({
  className: "buco-pin-wrap",
  html: `<div class="buco-you"><div class="buco-you-ring"></div><div class="buco-you-dot"></div></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapController({
  bounds,
  registerMap,
}: {
  bounds: [number, number][] | null;
  registerMap: (m: L.Map) => void;
}) {
  const map = useMap();
  useEffect(() => registerMap(map), [map, registerMap]);
  useEffect(() => {
    if (!bounds || bounds.length === 0) return;
    if (bounds.length === 1) {
      map.setView(bounds[0], 15, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(bounds), { padding: [56, 56], paddingTopLeft: [340, 56], maxZoom: 16, animate: true });
  }, [bounds, map]);
  return null;
}

export default function MapInner() {
  const { sessions, activeSessionId, wishlist, addToWishlist, user, city, userLocation, setUserLocation } =
    useBucoStore();
  const [dbSpots, setDbSpots] = useState<Spot[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Ask for the user's real location once; fall back to the city centre.
  useEffect(() => {
    if (userLocation) return;
    if (!("geolocation" in navigator)) { setUserLocation(fallbackLocation()); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => setUserLocation(fallbackLocation()),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, [userLocation, setUserLocation]);

  // Every curated place in the database for this city.
  useEffect(() => {
    const cityName = city.split(",")[0].trim();
    fetchSpots({ city: cityName, limit: 50 }).then((spots) =>
      setDbSpots(
        spots.map((s) => ({
          ...s,
          lat: s.lat != null ? Number(s.lat) : undefined,
          lng: s.lng != null ? Number(s.lng) : undefined,
          price_label:
            s.price_label ||
            (s.price_min != null
              ? `$${Math.round(Number(s.price_min))}–${Math.round(Number(s.price_max ?? s.price_min))}`
              : ""),
        }))
      )
    );
  }, [city]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Latest answer's spots = numbered results.
  const results = useMemo<Spot[]>(() => {
    const msg = [...(activeSession?.messages ?? [])].reverse()
      .find((m) => m.role === "assistant" && m.spots?.length);
    return (msg?.spots ?? []).filter((s) => s.lat != null && s.lng != null).slice(0, 6);
  }, [activeSession]);

  const pins = useMemo<PinSpot[]>(() => {
    const seen = new Map<string, PinSpot>();
    const keyOf = (s: Spot) => `${s.name}|${s.address}`.toLowerCase();

    results.forEach((s, i) => seen.set(keyOf(s), { ...s, kind: "result", resultIndex: i }));

    for (const w of wishlist) {
      if (w.spot.lat != null && w.spot.lng != null && !seen.has(keyOf(w.spot))) {
        seen.set(keyOf(w.spot), { ...w.spot, kind: "wishlist" });
      }
    }
    for (const session of sessions) {
      for (const msg of session.messages) {
        for (const spot of msg.spots ?? []) {
          if (spot.lat == null || spot.lng == null) continue;
          const k = keyOf(spot);
          if (!seen.has(k)) seen.set(k, { ...spot, kind: "recommended" });
        }
      }
    }
    for (const spot of dbSpots) {
      if (spot.lat == null || spot.lng == null) continue;
      const k = keyOf(spot);
      if (!seen.has(k)) seen.set(k, { ...spot, kind: "database" });
    }
    return Array.from(seen.values());
  }, [results, sessions, wishlist, dbSpots]);

  // Fit to results (+you) when there's an answer; otherwise fit everything.
  const bounds = useMemo<[number, number][] | null>(() => {
    const pts: [number, number][] =
      results.length > 0
        ? results.map((s) => [Number(s.lat), Number(s.lng)] as [number, number])
        : pins.map((s) => [Number(s.lat), Number(s.lng)] as [number, number]);
    if (results.length > 0 && userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts.length ? pts : null;
  }, [results, pins, userLocation]);

  const focusResult = (i: number) => {
    const s = results[i];
    if (s && mapRef.current) mapRef.current.flyTo([Number(s.lat), Number(s.lng)], 16, { duration: 0.6 });
  };

  const routeFor = (s: Spot): { path: [number, number][]; label: string } | null => {
    if (!userLocation || s.lat == null || s.lng == null) return null;
    const km = haversineKm(userLocation, { lat: Number(s.lat), lng: Number(s.lng) });
    return {
      path: [[userLocation.lat, userLocation.lng], [Number(s.lat), Number(s.lng)]],
      label: `${km.toFixed(1)} km · ~${walkMins(km)} min`,
    };
  };

  return (
    <div className="flex-1 relative min-w-0">
      <MapContainer center={TORONTO} zoom={13} className="absolute inset-0 z-0" scrollWheelZoom zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MapController bounds={bounds} registerMap={(m) => { mapRef.current = m; }} />

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={youIcon} zIndexOffset={500}>
            <Tooltip direction="bottom" offset={[0, 10]} className="buco-you-label">you</Tooltip>
          </Marker>
        )}

        {/* Distance lines to the current results */}
        {results.map((s, i) => {
          const route = routeFor(s);
          if (!route) return null;
          return (
            <Polyline
              key={`route-${i}`}
              positions={route.path}
              pathOptions={{
                color: hoverIdx === i ? "#742e12" : "#c4603a",
                weight: hoverIdx === i ? 3 : 2,
                dashArray: "7 6",
                opacity: hoverIdx === null || hoverIdx === i ? 0.85 : 0.25,
                className: "buco-route",
              }}
            >
              <Tooltip permanent direction="center" className="buco-route-label" opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.25}>
                {route.label}
              </Tooltip>
            </Polyline>
          );
        })}

        {pins.map((spot) => (
          <Marker
            key={`${spot.name}-${spot.lat}-${spot.lng}`}
            position={[Number(spot.lat), Number(spot.lng)]}
            icon={makePin(spot.kind, spot.resultIndex != null ? spot.resultIndex + 1 : undefined, spot.resultIndex != null && hoverIdx === spot.resultIndex)}
            zIndexOffset={spot.kind === "result" ? 400 : spot.kind === "wishlist" ? 300 : 0}
            eventHandlers={{
              mouseover: () => spot.resultIndex != null && setHoverIdx(spot.resultIndex),
              mouseout:  () => spot.resultIndex != null && setHoverIdx(null),
            }}
          >
            <Popup>
              <div className="buco-popup">
                <div className="buco-popup-name">{spot.name}{spot.buco_pick ? " ✦" : ""}</div>
                <div className="buco-popup-meta">
                  {spot.address}{spot.postal_code ? `, ${spot.postal_code}` : ""}
                </div>
                <div className="buco-popup-meta">
                  {spot.price_label || (spot.price_min ? `$${spot.price_min}–${spot.price_max}` : "")}
                  {spot.rating ? ` · ★ ${Number(spot.rating).toFixed(1)}` : ""}
                  {spot.cuisine_tags?.length ? ` · ${spot.cuisine_tags.slice(0, 2).join(", ")}` : ""}
                </div>
                {spot.happy_hour_label && (
                  <div className="buco-popup-meta" style={{ color: "#a86d20", fontWeight: 700 }}>
                    {spot.happy_hour_now ? "🍸 happy hour NOW " : "⏰ happy hour "}{spot.happy_hour_label}
                  </div>
                )}
                <div className="buco-popup-actions">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`} target="_blank" rel="noopener noreferrer">
                    directions ↗
                  </a>
                  {spot.kind !== "wishlist" && (
                    <button onClick={() => addToWishlist(spot)}>{user ? "♥ save" : "sign in to save"}</button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <ChatPanel results={results} onHoverResult={setHoverIdx} onFocusResult={focusResult} />

      {/* Legend — bottom right, clear of the panel */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur border border-border rounded-xl px-4 py-3 shadow-md">
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700 mb-1">
          <span className="w-[10px] h-[10px] rounded-full bg-amber inline-block" /> results
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700 mb-1">
          <span className="w-[10px] h-[10px] rounded-full bg-rust inline-block" /> wishlist ♥
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700">
          <span className="w-[10px] h-[10px] rounded-full bg-teal inline-block" /> buco database
        </div>
      </div>
    </div>
  );
}
