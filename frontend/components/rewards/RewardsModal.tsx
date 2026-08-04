"use client";

import { useEffect, useState } from "react";
import { X, Gift, Loader2, Star, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import { fetchSpotRewards, redeemReward, RewardCard, RedeemResult } from "@/lib/api";
import { Spot } from "@/types";

function useCountdown(expiresAt?: string | null) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setLeft("expired"); return; }
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

export default function RewardsModal({ spot, onClose }: { spot: Spot | null; onClose: () => void }) {
  const { user, points, loadPoints, showToast, setAuthModal } = useBucoStore();
  const [rewards, setRewards] = useState<RewardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [issued, setIssued] = useState<RedeemResult | null>(null);
  const left = useCountdown(issued?.expires_at);

  useEffect(() => {
    if (!spot) return;
    fetchSpotRewards(spot.id).then((r) => { setRewards(r); setLoading(false); });
  }, [spot]);

  if (!spot) return null;

  const redeem = async (r: RewardCard) => {
    if (!user) { setAuthModal(true); return; }
    setRedeeming(r.id);
    const res = await redeemReward(user.id, r.id);
    setRedeeming(null);
    if (res?.ok) { setIssued(res); loadPoints(); }
    else showToast(res?.message || "Couldn't redeem — try again");
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-[15px]"><Gift size={17} style={{ color: "#E4531F" }} /> Rewards</div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {issued ? (
          <div className="p-6 text-center">
            <div className="text-[13px] text-gray-500 mb-1">Show this at {spot.name}</div>
            <div className="text-[15px] font-semibold mb-4">{issued.title}</div>
            <div className="rounded-2xl border-2 border-dashed py-6 mb-3" style={{ borderColor: "#E4531F" }}>
              <div className="font-mono text-[34px] font-bold tracking-[0.35em]" style={{ color: "#E4531F" }}>{issued.code}</div>
            </div>
            <div className="text-[12px] text-gray-500">expires in {left || "…"}</div>
            <div className="text-[11px] text-gray-400 mt-1">staff enter this code in Buco to apply your reward</div>
            <button onClick={onClose} className="w-full mt-5 py-2.5 rounded-full border border-border font-semibold text-[14px] hover:bg-gray-50">Done</button>
          </div>
        ) : (
          <div className="overflow-y-auto">
            <div className="px-5 py-3 flex items-center justify-between border-b border-border" style={{ background: "#faf3e3" }}>
              <span className="text-[13px] text-gray-600">Your points</span>
              <span className="flex items-center gap-1.5 font-semibold text-[14px]" style={{ color: "#a86d20" }}>
                <Star size={13} className="fill-amber text-amber" /> {points}
              </span>
            </div>

            {loading ? (
              <div className="p-10 flex items-center justify-center text-gray-500"><Loader2 size={16} className="animate-spin" /></div>
            ) : rewards.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-gray-400">No rewards here yet — check back soon.</div>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                {rewards.map((r) => {
                  const affordable = points >= r.cost_points;
                  const soldOut = r.stock != null && r.stock <= 0;
                  return (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-4 border border-border rounded-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[14px]">{r.title}</div>
                          {r.description && <div className="text-[12px] text-gray-500 mt-0.5">{r.description}</div>}
                        </div>
                        <div className="font-mono text-[12px] font-bold whitespace-nowrap" style={{ color: "#a86d20" }}>{r.cost_points} pts</div>
                      </div>
                      <button
                        onClick={() => redeem(r)}
                        disabled={!affordable || soldOut || redeeming === r.id}
                        className="w-full mt-3 py-2 rounded-full font-semibold text-white text-[13px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                        style={{ background: "#E4531F" }}
                      >
                        {redeeming === r.id ? <Loader2 size={14} className="animate-spin" />
                          : soldOut ? "Sold out"
                          : affordable ? <><Check size={14} /> Redeem</>
                          : `Need ${r.cost_points - points} more pts`}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
