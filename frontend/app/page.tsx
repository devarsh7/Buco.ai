"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "@/components/layout/Sidebar";
import TopNav from "@/components/layout/TopNav";
import MapView from "@/components/map/MapView";
import WishlistView from "@/components/wishlist/WishlistView";
import ReviewsFeed from "@/components/feed/ReviewsFeed";
import PlansView from "@/components/lists/PlansView";
import AuthModal from "@/components/auth/AuthModal";
import Toast from "@/components/ui/Toast";
import { useBucoStore } from "@/store/useBucoStore";

export default function Home() {
  const { view } = useBucoStore();

  // Wait for the persisted store to hydrate from localStorage so the
  // server-rendered HTML never mismatches saved sessions.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-screen bg-sand-light" />;

  return (
    <div className="h-screen flex overflow-hidden bg-sand-light">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav />
        <main className="flex-1 flex min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex-1 flex min-w-0 min-h-0"
            >
              {view === "map" && <MapView />}
              {view === "wishlist" && <WishlistView />}
              {view === "feed" && <ReviewsFeed />}
              {view === "lists" && <PlansView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AuthModal />
      <Toast />
    </div>
  );
}
