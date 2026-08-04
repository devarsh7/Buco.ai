"use client";

import { useEffect, useState } from "react";
import { Loader2, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { fetchReviewFeed, ReviewCard } from "@/lib/api";
import { useBucoStore } from "@/store/useBucoStore";

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ReviewsFeed() {
  const { setView } = useBucoStore();
  const [reviews, setReviews] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviewFeed(40).then((r) => { setReviews(r); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500">
          <Loader2 size={14} className="animate-spin text-rust" /> loading the feed...
        </div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center px-8">
          <MessageSquare size={40} className="mx-auto mb-4 text-rust opacity-30" />
          <h2 className="font-serif text-[22px] text-gray-900 mb-2">No verified reviews yet</h2>
          <p className="font-mono text-[10px] text-gray-500 tracking-[0.06em] leading-[1.9] mb-6">
            check in at a spot, snap the dish, and drop the first<br />
            verified review — everyone will see it right here.
          </p>
          <button
            onClick={() => setView("map")}
            className="font-mono text-[11px] font-bold text-rust border border-rust px-6 py-[10px] rounded-full tracking-[0.06em] hover:bg-rust-light transition-all"
          >
            find somewhere to check in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-[680px] mx-auto px-6 py-8">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="font-serif text-[26px] text-gray-900">The Feed</h1>
          <span className="font-mono text-[10px] font-bold text-gray-500 tracking-[0.1em]">verified visits only</span>
        </div>
        <p className="font-mono text-[10px] text-gray-400 tracking-[0.05em] mb-6">
          every review below is from someone who actually showed up.
        </p>

        <div className="flex flex-col gap-3">
          {reviews.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.4) }}
              className="p-4 border border-border rounded-xl hover:border-amber transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-rust text-white font-serif text-[13px] flex items-center justify-center flex-shrink-0">
                    {(r.user_name || "L").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-bold text-gray-900 truncate">{r.user_name}</div>
                    <div className="font-mono text-[9px] text-gray-500 truncate">
                      at <span className="text-gray-800 font-bold">{r.spot_name}</span> · {timeAgo(r.created_at)}
                    </div>
                  </div>
                </div>
                <span
                  className="flex items-center gap-1 flex-shrink-0 font-mono text-[9px] font-bold px-2 py-[3px] rounded-full"
                  style={r.worth_it ? { background: "#e6f0ef", color: "#1D6B4A" } : { background: "#faece7", color: "#B5330C" }}
                >
                  {r.worth_it ? <ThumbsUp size={10} /> : <ThumbsDown size={10} />}
                  {r.worth_it ? "worth it" : "skip it"}
                </span>
              </div>
              {r.comment && <p className="text-[13px] text-gray-700 leading-relaxed">{r.comment}</p>}
              {r.actual_spend != null && (
                <div className="font-mono text-[10px] font-bold text-amber mt-1">
                  spent ${Math.round(Number(r.actual_spend))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
