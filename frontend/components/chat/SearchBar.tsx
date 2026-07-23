"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { ArrowUp, Mic, Map, Heart } from "lucide-react";
import { useBucoStore } from "@/store/useBucoStore";
import clsx from "clsx";

export default function SearchBar() {
  const [input, setInput] = useState("");
  const { sendMessage, isLoading, setView } = useBucoStore();
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput("");
    if (ref.current) ref.current.style.height = "auto";
    await sendMessage(msg);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onInput = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
  };

  return (
    <div className="px-5 pb-4 pt-3 border-t border-border flex-shrink-0 bg-white">
      <div className="max-w-[760px] mx-auto">
        <div className={clsx(
          "flex gap-2 items-end border rounded-xl px-3 py-2 transition-all",
          "border-border focus-within:border-amber focus-within:shadow-[0_0_0_3px_rgba(210,138,45,0.08)]",
          isLoading && "opacity-70"
        )}>
          <textarea
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onInput={onInput}
            placeholder="ask buco... cheap pho in toronto under $15"
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none font-mono text-[12px] text-gray-900 placeholder:text-gray-400 tracking-[0.03em] resize-none leading-[1.6] py-0 max-h-[120px] overflow-y-auto"
          />
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="w-[30px] h-[30px] rounded-lg bg-rust flex items-center justify-center text-white flex-shrink-0 transition-all hover:bg-rust-dark hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 mb-[1px]"
          >
            <ArrowUp size={14} />
          </button>
        </div>
        <div className="flex gap-[12px] mt-2">
          <button className="flex items-center gap-1 font-mono text-[9px] font-bold text-gray-500 tracking-[0.05em] hover:text-amber transition-colors">
            <Mic size={12} />voice
          </button>
          <button onClick={() => setView("map")} className="flex items-center gap-1 font-mono text-[9px] font-bold text-gray-500 tracking-[0.05em] hover:text-amber transition-colors">
            <Map size={12} />snap map
          </button>
          <button onClick={() => setView("wishlist")} className="flex items-center gap-1 font-mono text-[9px] font-bold text-gray-500 tracking-[0.05em] hover:text-amber transition-colors">
            <Heart size={12} />wishlist
          </button>
        </div>
      </div>
    </div>
  );
}
