"use client";

import { motion } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";

const SUGGESTIONS = [
  { emoji: "🍜", label: "ramen under $15",  query: "cheap ramen under $15 near me" },
  { emoji: "💅", label: "nails under $60",  query: "nail salon under $60 near downtown" },
  { emoji: "🍺", label: "happy hour now",   query: "happy hour spots near me right now" },
  { emoji: "🍛", label: "indian under $12", query: "best indian food under $12" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeScreen() {
  const { sendMessage, user } = useBucoStore();
  const name = user?.displayName ?? "friend";

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 pb-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
        animate={{ opacity: 0.85, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="font-serif text-[56px] italic text-rust leading-none mb-4 select-none"
      >
        B
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="font-serif text-[22px] text-gray-900 mb-2"
      >
        {greeting()}, {name}<span className="cursor" />
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.16 }}
        className="font-mono text-[10px] font-medium text-gray-600 tracking-[0.07em] leading-[1.9] mb-7"
      >
        your budget concierge is ready.<br />
        ask me anything — i&apos;ll find the treat.
      </motion.p>
      <div className="flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.query}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 + i * 0.06 }}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => sendMessage(s.query)}
            className="flex items-center gap-2 px-[14px] py-2 border border-border rounded-full font-mono text-[10px] font-bold text-gray-700 tracking-[0.04em] transition-colors hover:border-amber hover:text-amber-dark hover:bg-amber-light"
          >
            <span>{s.emoji}</span>
            {s.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
