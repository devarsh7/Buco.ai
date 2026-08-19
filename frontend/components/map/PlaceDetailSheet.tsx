"use client";

import { useEffect, useState } from "react";
import { X, Clock, Tag, Globe, Heart, MapPin, Camera, Gift } from "lucide-react";
import { useBucoStore } from "@/store/useBucoStore";
import { fetchVenue, VenuePublic } from "@/lib/api";
import { Spot } from "@/types";

export default function PlaceDetailSheet({
  spot, onClose, onCheckIn, onRewards,
}: {
  spot: Spot | null;
  onClose: () => void;
  onCheckIn: (s: Spot) => void;
  onRewards: (s: Spot) => void;
}) {
  const { user, wishlist, addToWishlist, removeFromWishlist } = useBucoStore();
  const [venue, setVenue] = useState<VenuePublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spot) return;
    setVenue(null);
    setLoading(true);
    fetchVenue(spot.id).then((v) => { setVenue(v); setLoading(false); });
  }, [spot]);

  if (!spot) return null;

  const saved = wishlist.find(
    (w) => (w.spot.id && spot.id && w.spot.id === spot.id) ||
      `${w.spot.name}|${w.spot.address}`.toLowerCase() === `${spot.name}|${spot.address}`.toLowerCase()
  );

  const hasContent = venue && (
    venue.happy_hour_note || venue.deal_comment ||
    (venue.menu_photos?.length || 0) > 0 || (venue.deal_photos?.length || 0) > 0
  );

  const Gallery = ({ title, photos }: { title: string; photos: string[] }) =>
    photos.length ? (
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-2">
          <Camera size={12} /> {title}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-28 w-28 object-cover rounded-xl border border-border flex-shrink-0" />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <div className="font-serif text-[20px] text-gray-900 leading-tight truncate">{spot.name}</div>
            <div className="flex items-center gap-1 font-mono text-[10px] text-gray-500 mt-0.5 truncate">
              <MapPin size={11} /> {spot.address}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {spot.price_label && (
            <div className="font-mono text-[12px] font-bold text-amber-dark">{spot.price_label}{spot.buco_pick ? " · ✦ buco pick" : ""}</div>
          )}

          {venue?.happy_hour_note && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "#faf3e3" }}>
              <Clock size={15} style={{ color: "#a86d20" }} className="mt-0.5 flex-shrink-0" />
              <div className="text-[13px]" style={{ color: "#7a5312" }}>{venue.happy_hour_note}</div>
            </div>
          )}

          {venue?.deal_comment && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "#f6ede9" }}>
              <Tag size={15} style={{ color: "#742e12" }} className="mt-0.5 flex-shrink-0" />
              <div className="text-[13px]" style={{ color: "#742e12" }}>{venue.deal_comment}</div>
            </div>
          )}

          {venue && <Gallery title="menu" photos={venue.menu_photos || []} />}
          {venue && <Gallery title="deals" photos={venue.deal_photos || []} />}

          {!loading && !hasContent && (
            <div className="text-[12px] text-gray-400">This spot hasn't added menu or deal details yet.</div>
          )}

          {venue?.website && (
            <a href={venue.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[13px] font-semibold text-teal">
              <Globe size={14} /> Visit website
            </a>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={() => (saved ? removeFromWishlist(saved.id) : addToWishlist(spot))}
            className="flex-1 py-2.5 rounded-full border border-border font-semibold text-[13px] flex items-center justify-center gap-1.5"
            title={saved ? "Remove from saved" : "Save"}
          >
            <Heart size={15} fill={saved ? "#e11d48" : "none"} color={saved ? "#e11d48" : "#742e12"} />
            {saved ? "Saved" : "Save"}
          </button>
          <button onClick={() => onRewards(spot)} className="flex-1 py-2.5 rounded-full border border-border font-semibold text-[13px] flex items-center justify-center gap-1.5">
            <Gift size={15} style={{ color: "#E4531F" }} /> Rewards
          </button>
          <button onClick={() => onCheckIn(spot)} className="flex-1 py-2.5 rounded-full font-semibold text-white text-[13px]" style={{ background: "#E4531F" }}>
            Check in
          </button>
        </div>
      </div>
    </div>
  );
}
