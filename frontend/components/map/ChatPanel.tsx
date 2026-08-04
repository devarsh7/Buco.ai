"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp, ChevronsLeft, MessageCircle, Heart, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import { distanceLabel } from "@/lib/geo";
import { Spot } from "@/types";
import clsx from "clsx";

const SUGGESTIONS = [
  { emoji: "🍜", label: "ramen under $15",  query: "cheap ramen under $15" },
  { emoji: "🍝", label: "pasta under $15",  query: "budget italian pasta under $15" },
  { emoji: "🍺", label: "happy hour now",   query: "any happy hour deals right now?" },
];

interface Props {
  results: Spot[];               // spots from the latest answer, in pin order
  onHoverResult: (i: number | null) => void;
  onFocusResult: (i: number) => void;
}

export default function ChatPanel({ results, onHoverResult, onFocusResult }: Props) {
  const { sessions, activeSessionId, sendMessage, isLoading, userLocation, user, addToWishlist, setAuthModal } =
    useBucoStore();
  const [input, setInput]         = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = sessions.find((s) => s.id === activeSessionId)?.messages ?? [];
  const lastSpotsMsgId = [...messages].reverse().find((m) => m.role === "assistant" && m.spots?.length)?.id;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // On phones, start collapsed so the map is the focus (tap "ask buco" to open).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setCollapsed(true);
  }, []);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput("");
    await sendMessage(msg);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="absolute top-3 left-3 bottom-3 z-[1050] w-[315px] flex flex-col bg-white/95 backdrop-blur-md border border-border rounded-2xl shadow-lg overflow-hidden max-md:top-auto max-md:left-2 max-md:right-2 max-md:bottom-2 max-md:w-auto max-md:h-[52vh]"
      >
        <div className="flex items-center gap-2 px-3 py-[9px] border-b border-border flex-shrink-0">
          <span className="w-[6px] h-[6px] rounded-full bg-teal" />
          <span className="font-mono text-[10px] font-bold text-gray-700 tracking-[0.1em]">buco concierge</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="font-serif text-[36px] italic text-rust opacity-70 mb-2 select-none">B</div>
          <p className="font-mono text-[11px] font-bold text-gray-700 mb-1">Sign in to chat with Buco</p>
          <p className="font-mono text-[9px] text-gray-500 leading-[1.9] mb-5">
            your searches and history are saved<br />to your account — private to you
          </p>
          <button
            onClick={() => setAuthModal(true)}
            className="font-mono text-[10px] font-bold text-white bg-rust px-6 py-[10px] rounded-full tracking-[0.06em] hover:bg-rust-dark transition-all hover:shadow-md"
          >
            sign in to start
          </button>
        </div>
      </motion.div>
    );
  }

  if (collapsed) {
    return (
      <motion.button
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => setCollapsed(false)}
        className="absolute top-3 left-3 z-[1050] flex items-center gap-2 bg-white/95 backdrop-blur border border-border rounded-full pl-3 pr-4 py-[9px] shadow-md font-mono text-[10px] font-bold text-rust hover:border-rust transition-all"
      >
        <MessageCircle size={14} />
        ask buco
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="absolute top-3 left-3 bottom-3 z-[1050] w-[315px] flex flex-col bg-white/95 backdrop-blur-md border border-border rounded-2xl shadow-lg overflow-hidden max-md:top-auto max-md:left-2 max-md:right-2 max-md:bottom-2 max-md:w-auto max-md:h-[52vh]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-[9px] border-b border-border flex-shrink-0">
        <span className="w-[6px] h-[6px] rounded-full bg-teal animate-pulse" />
        <span className="font-mono text-[10px] font-bold text-gray-700 tracking-[0.1em]">buco concierge</span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse"
          className="ml-auto p-1 text-gray-400 hover:text-rust transition-colors"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center mt-8 px-2">
            <div className="font-serif text-[34px] italic text-rust opacity-70 mb-2 select-none">B</div>
            <p className="font-mono text-[10px] font-bold text-gray-700 mb-1">ask buco — answers land on the map</p>
            <p className="font-mono text-[9px] text-gray-500 leading-[1.8] mb-4">pins, prices &amp; walking time included</p>
            <div className="flex flex-col gap-[6px] w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.query}
                  onClick={() => sendMessage(s.query)}
                  className="flex items-center gap-2 px-3 py-[7px] border border-border rounded-lg font-mono text-[10px] font-bold text-gray-600 hover:border-amber hover:text-amber-dark hover:bg-amber-light transition-all text-left"
                >
                  <span>{s.emoji}</span>{s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, mi) => {
          const isLast = mi === messages.length - 1;
          const streaming = isLast && isLoading && m.role === "assistant";
          const isCurrentResults = m.id === lastSpotsMsgId;
          return (
            <div key={m.id} className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              {(m.content || streaming) && (
                <div
                  className={clsx(
                    "max-w-[92%] px-3 py-2 rounded-xl font-mono text-[11px] leading-[1.65] whitespace-pre-wrap message-fade-in",
                    m.role === "user"
                      ? "bg-rust-light border border-[#e0c0b0] text-rust-dark rounded-br-[3px]"
                      : "bg-sand-light text-gray-900 rounded-bl-[3px]"
                  )}
                >
                  {m.content || (
                    <span className="flex gap-1 py-1"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span>
                  )}
                </div>
              )}

              {m.spots && m.spots.length > 0 && !isCurrentResults && (
                <button
                  onClick={() => setExpandedMsgId(expandedMsgId === m.id ? null : m.id)}
                  className="mt-1 font-mono text-[9px] font-bold text-teal tracking-[0.04em] hover:underline"
                >
                  {expandedMsgId === m.id ? "▾" : "▸"} {m.spots.length} spots from this answer
                </button>
              )}

              {m.spots && m.spots.length > 0 && (isCurrentResults || expandedMsgId === m.id) && (
                <div className="flex flex-col gap-[6px] mt-2 w-full">
                  <AnimatePresence initial={false}>
                    {m.spots.map((spot, i) => (
                      <motion.div
                        key={spot.id || `${spot.name}-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.2 }}
                        onMouseEnter={() => onHoverResult(i)}
                        onMouseLeave={() => onHoverResult(null)}
                        onClick={() => onFocusResult(i)}
                        className="group flex items-center gap-2 p-2 bg-white border border-border rounded-xl cursor-pointer hover:border-amber hover:shadow-sm transition-all"
                      >
                        <span className="w-[22px] h-[22px] rounded-full bg-amber-light text-amber-dark border border-amber/40 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] font-bold text-gray-900 truncate">{spot.name}</span>
                            {spot.happy_hour_now && <span className="text-[9px]">🍸</span>}
                          </div>
                          <div className="font-mono text-[9px] text-gray-600 truncate flex items-center gap-1">
                            <span className="font-bold text-amber-dark">{spot.price_label}</span>
                            {spot.buco_pick && <span className="flex items-center gap-[2px] text-teal">✦ pick</span>}
                          </div>
                          {(spot.lat != null) && (
                            <div className="font-mono text-[9px] text-teal font-bold flex items-center gap-1">
                              <MapPin size={8} />{distanceLabel(userLocation, spot) || spot.address?.split(",")[0]}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); addToWishlist(spot); }}
                          title="Save to Wishlist"
                          className="p-1 text-gray-300 hover:text-rust hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Heart size={13} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-border flex-shrink-0">
        <div className={clsx(
          "flex gap-2 items-end border rounded-xl px-3 py-2 transition-all bg-white",
          "border-border focus-within:border-amber",
          isLoading && "opacity-70"
        )}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="cheap pasta under $15..."
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none font-mono text-[11px] text-gray-900 placeholder:text-gray-400 resize-none leading-[1.5] py-0 max-h-[80px]"
          />
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="w-[26px] h-[26px] rounded-lg bg-rust flex items-center justify-center text-white flex-shrink-0 transition-all hover:bg-rust-dark hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
