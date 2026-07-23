"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Leaflet touches `window`, so it must never render on the server.
const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-sand-light">
      <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500">
        <Loader2 size={14} className="animate-spin text-rust" />
        loading map...
      </div>
    </div>
  ),
});

export default function MapView() {
  return <MapInner />;
}
