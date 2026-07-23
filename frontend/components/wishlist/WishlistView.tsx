"use client";

import { useEffect } from "react";
import { Heart, Trash2, MapPin, ExternalLink, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";

export default function WishlistView() {
  const { user, wishlist, wishlistLoading, loadWishlist, removeFromWishlist, setAuthModal, setView } =
    useBucoStore();

  useEffect(() => {
    if (user) loadWishlist();
  }, [user, loadWishlist]);

  // Signed out
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-8"
        >
          <Heart size={40} className="mx-auto mb-4 text-rust opacity-30" />
          <h2 className="font-serif text-[22px] text-gray-900 mb-2">Save your places over here</h2>
          <p className="font-mono text-[10px] text-gray-500 tracking-[0.06em] leading-[1.9] mb-6">
            sign in and every spot you ♥ lands in your wishlist —<br />
            synced across devices, pinned on your map.
          </p>
          <button
            onClick={() => setAuthModal(true)}
            className="font-mono text-[11px] font-bold text-white bg-rust px-6 py-[10px] rounded-full tracking-[0.06em] hover:bg-rust-dark transition-all hover:shadow-md"
          >
            sign in to start saving
          </button>
        </motion.div>
      </div>
    );
  }

  // Loading
  if (wishlistLoading && wishlist.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500">
          <Loader2 size={14} className="animate-spin text-rust" />
          loading your wishlist...
        </div>
      </div>
    );
  }

  // Empty
  if (wishlist.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center px-8"
        >
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          >
            <Heart size={40} className="mx-auto mb-4 text-rust opacity-30" />
          </motion.div>
          <h2 className="font-serif text-[22px] text-gray-900 mb-2">Save your places over here</h2>
          <p className="font-mono text-[10px] text-gray-500 tracking-[0.06em] leading-[1.9] mb-6">
            nothing saved yet. tap the ♥ on any spot buco finds<br />
            and it&apos;ll be waiting for you right here.
          </p>
          <button
            onClick={() => setView("map")}
            className="font-mono text-[11px] font-bold text-rust border border-rust px-6 py-[10px] rounded-full tracking-[0.06em] hover:bg-rust-light transition-all"
          >
            find something tasty
          </button>
        </motion.div>
      </div>
    );
  }

  // List
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-[680px] mx-auto px-6 py-8">
        <div className="flex items-baseline gap-3 mb-6">
          <h1 className="font-serif text-[26px] text-gray-900">Wishlist</h1>
          <span className="font-mono text-[10px] font-bold text-gray-500 tracking-[0.1em]">
            {wishlist.length} {wishlist.length === 1 ? "place" : "places"}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {wishlist.map((item, i) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="group flex gap-4 p-4 border border-border rounded-xl hover:border-amber hover:shadow-sm transition-all"
              >
                <div className="w-[54px] h-[54px] rounded-xl bg-sand-light flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl">
                  {item.spot.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.spot.image_url} alt={item.spot.name} className="w-full h-full object-cover" />
                  ) : item.spot.category === "salon" ? "💅" : item.spot.category === "cafe" ? "☕" : "🍽"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-[2px]">
                    <span className="font-mono text-[12px] font-bold text-gray-900 truncate">{item.spot.name}</span>
                    {item.spot.buco_pick && (
                      <span className="flex-shrink-0 font-mono text-[8px] px-[6px] py-[2px] rounded bg-teal-light text-teal border border-[#b0cfcd] tracking-[0.08em]">
                        ✦ buco pick
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[9px] text-gray-600 truncate mb-1">
                    <MapPin size={9} className="flex-shrink-0" />
                    {item.spot.address}
                    {item.spot.postal_code ? `, ${item.spot.postal_code}` : ""}
                  </div>
                  <span className="font-mono text-[11px] font-bold text-amber">{item.spot.price_label}</span>
                  {item.note && (
                    <p className="font-mono text-[9px] text-gray-500 italic mt-1 truncate">&ldquo;{item.note}&rdquo;</p>
                  )}
                </div>

                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  <button
                    onClick={() => removeFromWishlist(item.id)}
                    title="Remove from Wishlist"
                    className="p-[6px] rounded-lg text-gray-300 hover:text-rust hover:bg-rust-light transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                  {item.spot.website && (
                    <a
                      href={item.spot.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-[6px] rounded-lg text-gray-300 hover:text-teal transition-all"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <button
          onClick={() => setView("map")}
          className="mt-6 font-mono text-[10px] font-bold text-teal tracking-[0.06em] hover:underline"
        >
          see them all on the map →
        </button>
      </div>
    </div>
  );
}
