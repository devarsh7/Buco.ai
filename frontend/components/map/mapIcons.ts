import L from "leaflet";

// Palette from the living-map game plan.
export const HOUSE_COLORS = ["#6FB98F", "#2E8B5E", "#1D6B4A"]; // tier 1 · 2 · 3
export const WISHLIST_COLOR = "#EBA525";
export const DISCOVERY_COLOR = "#9A9186";
export const FRIEND_COLOR = "#2F6FB3";
export const TOWER_COLORS = ["#EBA525", "#E4531F", "#B5330C"]; // tier 1 · 2 · 3

/** A house that grows with your verified-visit tier (1 small → 3 landmark). */
export function houseIcon(tier: number): L.DivIcon {
  const t = Math.max(1, Math.min(3, tier || 1));
  const color = HOUSE_COLORS[t - 1];
  const size = [30, 36, 46][t - 1];
  const flag =
    t === 3
      ? `<g><line x1="33" y1="6" x2="33" y2="15" stroke="${color}" stroke-width="2"/>
         <path d="M33 6 h7 l-2 3 l2 3 h-7 z" fill="${color}"/></g>`
      : "";
  const chimney = t >= 2 ? `<rect x="28" y="10" width="4" height="7" rx="1" fill="${color}"/>` : "";
  return L.divIcon({
    className: "buco-house-wrap",
    html: `
      <div class="buco-house" style="width:${size}px;height:${size}px">
        <svg viewBox="0 0 44 44" width="${size}" height="${size}" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))">
          ${flag}${chimney}
          <path d="M22 8 L6 21 H10 V37 H34 V21 H38 Z" fill="${color}"/>
          <rect x="18" y="26" width="8" height="11" rx="1.2" fill="rgba(255,255,255,.85)"/>
        </svg>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 3],
    popupAnchor: [0, -size + 6],
  });
}

/** A friend's shared visit — cobalt, distinct from your own green houses. */
export function friendIcon(count = 1): L.DivIcon {
  const size = 30;
  const badge =
    count > 1
      ? `<circle cx="34" cy="10" r="8" fill="#16324f"/>
         <text x="34" y="13.5" text-anchor="middle" font-size="10" fill="#fff" font-family="sans-serif" font-weight="700">${count}</text>`
      : "";
  return L.divIcon({
    className: "buco-friend-wrap",
    html: `
      <div class="buco-friend" style="width:44px;height:44px">
        <svg viewBox="0 0 44 44" width="44" height="44" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))">
          <path d="M22 6 C15 6 10 11 10 18 C10 27 22 38 22 38 C22 38 34 27 34 18 C34 11 29 6 22 6 Z" fill="${FRIEND_COLOR}"/>
          <circle cx="22" cy="18" r="5" fill="rgba(255,255,255,.92)"/>
          ${badge}
        </svg>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [22, 38],
    popupAnchor: [0, -34],
  });
}

/** Area-momentum tower (Phase 3). Height + colour scale with heat tier. */
export function towerIcon(tier: number): L.DivIcon {
  const t = Math.max(1, Math.min(3, tier || 1));
  const color = TOWER_COLORS[t - 1];
  const h = [34, 48, 64][t - 1];
  const w = 22;
  return L.divIcon({
    className: "buco-tower-wrap",
    html: `
      <div class="buco-tower" style="width:${w}px;height:${h}px">
        <svg viewBox="0 0 22 ${h}" width="${w}" height="${h}" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))">
          <rect x="6" y="2" width="10" height="${h - 4}" rx="2" fill="${color}"/>
          <circle cx="11" cy="6" r="2.4" fill="rgba(255,255,255,.9)"/>
        </svg>
      </div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2],
    popupAnchor: [0, -h + 6],
  });
}
