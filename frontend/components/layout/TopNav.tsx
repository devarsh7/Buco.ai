"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown, LogOut, Heart, Sparkles, MessageSquare, Star, Users, ListChecks, Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import { getSupabase } from "@/lib/supabase";
import FriendsModal from "@/components/friends/FriendsModal";

const VIEW_LABEL: Record<string, string> = {
  map: "map",
  wishlist: "wishlist",
  feed: "the feed",
  lists: "plans",
};

export default function TopNav({ onMenu }: { onMenu?: () => void }) {
  const { view, city, setCity, user, setAuthModal, showToast, wishlist, setView, points, loadPoints } = useBucoStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => { if (user) loadPoints(); }, [user, loadPoints]);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setMenuOpen(false);
    showToast("Signed out");
  };

  const changeCity = () => {
    const next = window.prompt("Which city should Buco search?", city);
    if (next?.trim()) setCity(next.trim());
  };

  return (
    <>
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-border bg-white/85 backdrop-blur-md z-30">
      {/* Left — brand + view */}
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenu} className="md:hidden p-1 -ml-1 text-gray-600 hover:text-rust" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-serif text-[24px] text-rust leading-none tracking-[0.01em] select-none"
        >
          B<em className="text-amber not-italic">u</em>co
        </motion.div>
        <div className="hidden sm:block h-5 w-px bg-border" />
        <AnimatePresence mode="wait">
          <motion.span
            key={view}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="hidden sm:flex items-center gap-[6px] font-mono text-[11px] font-bold text-gray-800 tracking-[0.08em]"
          >
            <Sparkles size={12} className="text-amber" />
            {VIEW_LABEL[view]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Right — city, wishlist, auth */}
      <div className="flex items-center gap-2">
        <button
          onClick={changeCity}
          className="hidden sm:flex items-center gap-[6px] font-mono text-[10px] font-bold text-gray-700 px-3 py-[6px] border border-border rounded-full tracking-[0.04em] hover:border-amber hover:text-amber transition-all"
          title="Change city"
        >
          <MapPin size={11} />
          {city}
        </button>

        {user && (
          <div
            className="hidden sm:flex items-center gap-[5px] font-mono text-[10px] font-bold px-3 py-[6px] border border-border rounded-full tracking-[0.04em]"
            style={{ color: "#a86d20" }}
            title="Your points"
          >
            <Star size={11} className="fill-amber text-amber" />
            {points}
          </div>
        )}

        <button
          onClick={() => (user ? setFriendsOpen(true) : setAuthModal(true))}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border text-gray-600 transition-all hover:text-[#2F6FB3]"
          style={{ borderColor: "#e2dfd6" }}
          title="Friends"
        >
          <Users size={14} />
        </button>

        <button
          onClick={() => (user ? setView("lists") : setAuthModal(true))}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border text-gray-600 transition-all hover:text-[#2F6FB3]"
          title="Plans"
        >
          <ListChecks size={14} className={view === "lists" ? "text-[#2F6FB3]" : ""} />
        </button>

        <button
          onClick={() => setView("feed")}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border text-gray-600 hover:border-teal hover:text-teal transition-all"
          title="The Feed"
        >
          <MessageSquare size={14} className={view === "feed" ? "text-teal" : ""} />
        </button>

        <button
          onClick={() => setView("wishlist")}
          className="relative flex items-center justify-center w-8 h-8 rounded-full border border-border text-gray-600 hover:border-rust hover:text-rust transition-all"
          title="Wishlist"
        >
          <Heart size={14} className={wishlist.length ? "fill-rust text-rust" : ""} />
          {wishlist.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-rust text-white font-mono text-[8px] font-bold flex items-center justify-center">
              {wishlist.length}
            </span>
          )}
        </button>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border hover:border-amber transition-all"
            >
              <span className="w-6 h-6 rounded-full bg-rust text-white font-serif text-[13px] flex items-center justify-center">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden md:block font-mono text-[10px] font-bold text-gray-800 max-w-[90px] truncate">
                {user.displayName}
              </span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-[calc(100%+6px)] w-48 rounded-xl border border-border bg-white shadow-lg py-1 z-50"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <div className="font-mono text-[10px] font-bold text-gray-900 truncate">{user.displayName}</div>
                    <div className="font-mono text-[9px] text-gray-500 truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-2 px-3 py-2 font-mono text-[10px] text-gray-700 hover:bg-rust-light hover:text-rust transition-colors"
                  >
                    <LogOut size={12} />
                    sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button
            onClick={() => setAuthModal(true)}
            className="font-mono text-[10px] font-bold text-white bg-rust px-4 py-[8px] rounded-full tracking-[0.06em] hover:bg-rust-dark transition-all hover:shadow-md"
          >
            sign in
          </button>
        )}
      </div>
    </header>
    {friendsOpen && <FriendsModal onClose={() => setFriendsOpen(false)} />}
    </>
  );
}
