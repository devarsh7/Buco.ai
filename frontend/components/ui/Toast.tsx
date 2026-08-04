"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";

export default function Toast() {
  const toast = useBucoStore((s) => s.toast);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] bg-gray-900 text-white font-mono text-[11px] font-bold tracking-[0.04em] px-5 py-[11px] rounded-full shadow-xl"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
