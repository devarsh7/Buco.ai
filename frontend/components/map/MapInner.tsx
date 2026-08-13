"use client";

import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useBucoStore } from "@/store/useBucoStore";
import { fetchSpots, fetchUserMap, fetchFriendsMap, fetchTowers, MapPin as VisitedPin, FriendPin, Tower } from "@/lib/api";
import { haversineKm, walkMins, fallbackLocation } from "@/lib/geo";
import { Spot, UserLocation } from "@/types";
import { Heart } from "lucide-react";
import ChatPanel from "./ChatPanel";
import { houseIcon, friendIcon, towerIcon } from "./mapIcons";
import CheckInModal from "@/components/checkin/CheckInModal";
import RewardsModal from "@/components/rewards/RewardsModal";

const TORONTO: [number, number] = [43.6532, -79.3832];

// Remember the map's last center/zoom so switching views (which remounts the
// map) doesn't snap it back and zoom out every time.
const lastView: { center: [number, number]; zoom: number } = { center: TORONTO, zoom: 14 };
let centeredOnUserOnce = false;   // center on the user once per session, then remember position

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
  // Discovery + history spots are small Snap-style dots, so the map never looks
  // stuffed with big teardrops.
  if (kind === "database" || kind === "recommended") {
    const color = PIN_COLOR[kind];
    const size = highlighted ? 15 : 11;
    return L.divIcon({
      className: "buco-dot-wrap",
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2 - 2],
    });
  }
  // Chat answers (numbered) + saved places: a compact teardrop.
  const color = highlighted ? "#742e12" : PIN_COLOR[kind];
  const glyph = kind === "wishlist" ? "♥" : num != null ? String(num) : "●";
  const scale = highlighted ? 1.1 : 0.82;
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

function persistView(map: L.Map) {
  const c = map.getCenter();
  lastView.center = [c.lat, c.lng];
  lastView.zoom = map.getZoom();
}

function ZoomWatch({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => { onZoom(map.getZoom()); persistView(map); },
    moveend: () => persistView(map),
  });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

export default function MapInner() {
  const { sessions, activeSessionId, wishlist, addToWishlist, removeFromWishlist, user, city, userLocation, setUserLocation } =
    useBucoStore();

  const savedBookmark = (s: Spot) =>
    wishlist.find(
      (w) =>
        (w.spot.id && s.id && w.spot.id === s.id) ||
        `${w.spot.name}|${w.spot.address}`.toLowerCase() === `${s.name}|${s.address}`.toLowerCase()
    );
  const [dbSpots, setDbSpots] = useState<Spot[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [visited, setVisited] = useState<VisitedPin[]>([]);
  const [friendPins, setFriendPins] = useState<FriendPin[]>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [zoom, setZoom] = useState(13);
  const [ready, setReady] = useState(false);   // map pane positioned → safe to project markers
  const [checkInSpot, setCheckInSpot] = useState<Spot | null>(null);
  const [rewardsSpot, setRewardsSpot] = useState<Spot | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Area-momentum towers (public — no sign-in needed). Shown at city zoom.
  useEffect(() => { fetchTowers().then(setTowers); }, []);

  // The user's own verified visits → growing houses on the map.
  const loadVisited = useCallback(async () => {
    if (!user) { setVisited([]); return; }
    const m = await fetchUserMap(user.id);
    setVisited(m.visited);
  }, [user]);
  useEffect(() => { loadVisited(); }, [loadVisited]);

  // Friends' shared visits (cobalt).
  useEffect(() => {
    if (!user) { setFriendPins([]); return; }
    fetchFriendsMap(user.id).then(setFriendPins);
  }, [user]);

  // Ask for the user's real location once; fall back to the city centre.
  useEffect(() => {
    if (userLocation) return;
    if (!("geolocation" in navigator)) { setUserLocation(fallbackLocation()); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => setUserLocation(fallbackLocation()),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
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

  // First load of the session: drop the user at their own location (Google-style).
  useEffect(() => {
    if (userLocation && mapRef.current && !centeredOnUserOnce) {
      centeredOnUserOnce = true;
      mapRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
      persistView(mapRef.current);
    }
  }, [userLocation]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Latest answer's spots = numbered results.
  const results = useMemo<Spot[]>(() => {
    const msg = [...(activeSession?.messages ?? [])].reverse()
      .find((m) => m.role === "assistant" && m.spots?.length);
    return (msg?.spots ?? []).filter((s) => s.lat != null && s.lng != null).slice(0, 8);
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

  // Only recenter when there's an actual search answer — never auto-zoom on
  // load or when returning to the map (Google-Maps-style: it stays put).
  const bounds = useMemo<[number, number][] | null>(() => {
    if (results.length === 0) return null;
    const pts = results.map((s) => [Number(s.lat), Number(s.lng)] as [number, number]);
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts.length ? pts : null;
  }, [results, userLocation]);

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
    <div className="flex-1 relative min-w-0 min-h-0">
      <MapContainer center={lastView.center} zoom={lastView.zoom} className="absolute inset-0 z-0" scrollWheelZoom zoomControl={false} attributionControl={false} whenReady={() => setReady(true)}>
        <TileLayer
          attribution=""
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MapController bounds={bounds} registerMap={(m) => { mapRef.current = m; }} />
        <ZoomWatch onZoom={setZoom} />

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

        {pins
          .filter((spot) => !((spot.kind === "database" || spot.kind === "recommended") && zoom < 14))
          .map((spot) => (
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
                  {spot.buco_pick ? " · ✦ buco pick" : ""}
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
                  {(() => {
                    const saved = savedBookmark(spot);
                    return (
                      <button
                        onClick={() => (saved ? removeFromWishlist(saved.id) : addToWishlist(spot))}
                        title={saved ? "Remove from saved" : user ? "Save" : "Sign in to save"}
                        aria-label={saved ? "Remove from saved" : "Save"}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 6px" }}
                      >
                        <Heart size={16} fill={saved ? "#e11d48" : "none"} color={saved ? "#e11d48" : "#742e12"} />
                      </button>
                    );
                  })()}
                  <button onClick={() => setCheckInSpot(spot)}>✦ check in</button>
                  <button onClick={() => setRewardsSpot(spot)}>★ rewards</button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {ready && visited.map((h) =>
          h.lat != null && h.lng != null ? (
            <Marker
              key={`house-${h.spot_id}`}
              position={[Number(h.lat), Number(h.lng)]}
              icon={houseIcon(h.building_tier)}
              zIndexOffset={600}
            >
              <Popup>
                <div className="buco-popup">
                  <div className="buco-popup-name">{h.name}</div>
                  <div className="buco-popup-meta">
                    {h.building_label || "Visited"} · {h.visit_count} visit{h.visit_count === 1 ? "" : "s"}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null
        )}

        {ready && friendPins.map((f) =>
          f.lat != null && f.lng != null ? (
            <Marker
              key={`friend-${f.spot_id}`}
              position={[Number(f.lat), Number(f.lng)]}
              icon={friendIcon(f.friend_count)}
              zIndexOffset={450}
            >
              <Popup>
                <div className="buco-popup">
                  <div className="buco-popup-name">{f.name}</div>
                  <div className="buco-popup-meta">
                    visited by {f.friend_names.slice(0, 3).join(", ")}
                    {f.friend_count > 3 ? ` +${f.friend_count - 3} more` : ""}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null
        )}

        {/* Momentum towers — shown at city/neighbourhood zoom */}
        {ready && zoom <= 14 && towers.map((t) =>
          t.lat != null && t.lng != null ? (
            <Marker
              key={`tower-${t.geohash7}`}
              position={[Number(t.lat), Number(t.lng)]}
              icon={towerIcon(t.tier)}
              zIndexOffset={700}
            >
              <Popup>
                <div className="buco-popup">
                  <div className="buco-popup-name">🔥 Buzzing right now</div>
                  <div className="buco-popup-meta">
                    {t.visitor_count} recent visitor{t.visitor_count === 1 ? "" : "s"}
                    {t.spot_names.length ? ` · ${t.spot_names.slice(0, 3).join(", ")}` : ""}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null
        )}
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
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700 mb-1">
          <span className="w-[10px] h-[10px] rounded-full bg-teal inline-block" /> buco database
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700 mb-1">
          <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: "#1D6B4A" }} /> your visits ⌂
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700 mb-1">
          <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: "#2F6FB3" }} /> friends
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-gray-700">
          <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: "#E4531F" }} /> buzzing 🔥
        </div>
      </div>

      <CheckInModal
        spot={checkInSpot}
        onClose={() => setCheckInSpot(null)}
        onSuccess={() => loadVisited()}
      />
      <RewardsModal spot={rewardsSpot} onClose={() => setRewardsSpot(null)} />
    </div>
  );
}
