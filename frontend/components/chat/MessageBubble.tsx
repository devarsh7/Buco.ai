"use client";

import { motion } from "framer-motion";
import { Message } from "@/types";
import SpotCard from "./SpotCard";
import { useBucoStore } from "@/store/useBucoStore";

interface Props { message: Message; isLatest: boolean; }

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
    </div>
  );
}

export default function MessageBubble({ message, isLatest }: Props) {
  const { isLoading, addToWishlist } = useBucoStore();
  const isUser      = message.role === "user";
  const isEmpty     = !message.content && !message.spots?.length;
  const isStreaming = isLatest && isLoading && !isUser;

  if (isUser) {
    return (
      <div className="flex justify-end py-[6px] message-fade-in">
        <div className="bg-rust-light border border-[#e0c0b0] rounded-2xl rounded-br-[3px] px-[15px] py-[11px] font-mono text-[12px] font-medium text-rust-dark max-w-[68%] leading-[1.7] tracking-[0.02em]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-[10px] py-[6px] items-start message-fade-in">
      <div className="w-[28px] h-[28px] rounded-full bg-rust-light border border-[#e0c0b0] flex items-center justify-center font-serif text-[15px] text-rust flex-shrink-0 mt-[2px]">
        B
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[9px] font-bold text-gray-500 tracking-[0.12em] mb-1">BUCO</div>
        {isStreaming && isEmpty && <TypingIndicator />}
        {message.content && (
          <p className="font-mono text-[12px] text-gray-900 leading-[1.75] tracking-[0.02em] whitespace-pre-wrap">
            {message.content}
          </p>
        )}
        {message.spots && message.spots.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {message.spots.map((spot, i) => (
              <motion.div
                key={spot.id || `${spot.name}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.22, ease: "easeOut" }}
              >
                <SpotCard spot={spot} onBookmark={addToWishlist} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
