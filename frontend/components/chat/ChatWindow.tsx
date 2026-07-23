"use client";

import { useEffect, useRef } from "react";
import { useBucoStore } from "@/store/useBucoStore";
import MessageBubble from "./MessageBubble";
import WelcomeScreen from "./WelcomeScreen";
import SearchBar from "./SearchBar";

export default function ChatWindow() {
  const { sessions, activeSessionId } = useBucoStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = sessions.find((s) => s.id === activeSessionId)?.messages ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[22px] flex flex-col">
        {messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <div className="py-4 max-w-[760px] w-full mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} message={msg} isLatest={i === messages.length - 1} />
            ))}
          </div>
        )}
      </div>

      <SearchBar />
    </div>
  );
}
