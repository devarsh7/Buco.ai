"use client";

import Image from "next/image";
import { MapPin, Star, ExternalLink, Heart } from "lucide-react";
import { Spot } from "@/types";
import clsx from "clsx";

interface SpotCardProps {
  spot: Spot;
  onBookmark?: (spot: Spot) => void;
}

export default function SpotCard({ spot, onBookmark }: SpotCardProps) {
  return (
    <div className="flex gap-3 p-3 border border-border rounded-xl cursor-pointer transition-all hover:border-amber hover:shadow-sm group">
      {/* Thumbnail */}
      <div className="w-[50px] h-[50px] rounded-lg bg-sand-light flex-shrink-0 overflow-hidden relative">
        {spot.image_url ? (
          <Image src={spot.image_url} alt={spot.name} fill className="object-cover" sizes="50px" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl">
            {spot.category === "restaurant" ? "🍽" : spot.category === "salon" ? "💅" : "☕"}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1 mb-[3px]">
          <span className="font-mono text-[12px] font-bold text-gray-900 truncate tracking-[0.03em]">{spot.name}</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {spot.happy_hour_now && (
              <span className="font-mono text-[8px] font-bold px-[6px] py-[2px] rounded-[3px] bg-amber-light text-amber-dark border border-amber/40 tracking-[0.08em] animate-pulse">
                🍸 happy hour now
              </span>
            )}
            {spot.buco_pick && (
              <span className="font-mono text-[8px] font-bold px-[6px] py-[2px] rounded-[3px] bg-teal-light text-teal border border-[#b0cfcd] tracking-[0.08em]">
                ✦ buco pick
              </span>
            )}
          </span>
        </div>
        <div className="font-mono text-[10px] text-gray-600 tracking-[0.02em] truncate mb-1">
          {spot.cuisine_tags?.slice(0, 2).join(" · ")}
          {spot.address && ` · ${spot.address.split(",")[0]}`}
        </div>
        {spot.happy_hour_label && !spot.happy_hour_now && (
          <div className="font-mono text-[9px] font-bold text-amber-dark tracking-[0.03em] truncate mb-1">
            ⏰ happy hour {spot.happy_hour_label}
          </div>
        )}
        <div className="flex items-center gap-3">
          {spot.is_open !== undefined && (
            <span className={clsx("font-mono text-[9px] font-bold tracking-[0.05em]", spot.is_open ? "text-teal" : "text-rust-mid")}>
              {spot.is_open ? "open" : "closed"}
            </span>
          )}
          {spot.rating && (
            <span className="flex items-center gap-[3px] font-mono text-[9px] font-bold text-gray-600">
              <Star size={9} className="fill-amber text-amber" />{Number(spot.rating).toFixed(1)}
            </span>
          )}
          {spot.distance_km != null && spot.distance_km > 0 && (
            <span className="flex items-center gap-[3px] font-mono text-[9px] text-gray-600">
              <MapPin size={9} />{Number(spot.distance_km).toFixed(1)} km
            </span>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col items-end justify-between flex-shrink-0">
        <span className="font-mono text-[13px] font-bold text-amber-dark">
          {spot.price_label || (spot.price_min ? `$${spot.price_min}` : "")}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {spot.website && (
            <a href={spot.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 text-gray-400 hover:text-teal transition-colors" title="Website">
              <ExternalLink size={13} />
            </a>
          )}
          {onBookmark && (
            <button
              onClick={(e) => { e.stopPropagation(); onBookmark(spot); }}
              className="p-1 text-gray-400 hover:text-rust hover:scale-110 transition-all"
              title="Save to Wishlist"
            >
              <Heart size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
