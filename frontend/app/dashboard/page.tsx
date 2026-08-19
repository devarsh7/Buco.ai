"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBucoStore } from "@/store/useBucoStore";
import {
  getManagedSpots, claimSpot, getDashboard, createManagerReward, deactivateReward,
  ManagerSpot, Dashboard, RewardCard,
} from "@/lib/api";
import VenueProfileCard from "@/components/dashboard/VenueProfileCard";

const TIER_LABEL = ["—", "warming up", "hot", "blazing 🔥"];

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e2dfd6] bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400">{label}</div>
      <div className="font-serif text-[26px] text-gray-900 mt-1 leading-none">{value}</div>
      {sub && <div className="font-mono text-[10px] text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useBucoStore();
  const [spots, setSpots] = useState<ManagerSpot[]>([]);
  const [spotId, setSpotId] = useState<string>("");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);

  const [rTitle, setRTitle] = useState("");
  const [rCost, setRCost] = useState("");
  const [rStock, setRStock] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSpots = async () => {
    if (!user) return;
    const s = await getManagedSpots(user.id);
    setSpots(s);
    if (s.length) setSpotId((prev) => prev || s[0].spot_id);
    setLoading(false);
  };

  useEffect(() => { if (user) loadSpots(); else setLoading(false); }, [user]);

  const loadDash = async () => {
    if (!user || !spotId) return;
    setDash(await getDashboard(user.id, spotId));
  };
  useEffect(() => { loadDash(); }, [spotId, user]);

  const claim = async () => {
    if (!user || !claimCode.trim()) return;
    setClaiming(true);
    const r = await claimSpot(user.id, claimCode.trim().toUpperCase());
    setClaiming(false);
    setMsg(r.message);
    if (r.ok) { setClaimCode(""); loadSpots(); }
  };

  const addReward = async () => {
    if (!user || !spotId || !rTitle.trim() || !rCost) return;
    setCreating(true);
    const r = await createManagerReward(user.id, spotId, {
      title: rTitle.trim(),
      cost_points: Number(rCost),
      stock: rStock ? Number(rStock) : null,
    });
    setCreating(false);
    if (r?.ok) { setRTitle(""); setRCost(""); setRStock(""); loadDash(); }
    else setMsg("Couldn't create the reward");
  };

  const pause = async (rw: RewardCard) => {
    if (!user) return;
    const r = await deactivateReward(user.id, rw.id);
    setMsg(r.message);
    loadDash();
  };

  // ── not signed in ──────────────────────────────────────────────────────────
  if (!loading && !user) {
    return (
      <Shell>
        <div className="text-center py-16">
          <p className="text-[15px] text-gray-600 mb-4">Sign in on the Buco app to manage your venue.</p>
          <Link href="/" className="inline-block font-semibold text-white px-6 py-2.5 rounded-full" style={{ background: "#742e12" }}>
            Go to Buco →
          </Link>
        </div>
      </Shell>
    );
  }

  // ── no venue claimed yet ─────────────────────────────────────────────────────
  if (!loading && user && spots.length === 0) {
    return (
      <Shell>
        <div className="max-w-sm mx-auto py-12">
          <h2 className="font-serif text-[24px] text-gray-900 mb-1">Claim your venue</h2>
          <p className="text-[13px] text-gray-500 mb-5">Enter the claim code Buco gave you to unlock your dashboard.</p>
          <div className="flex gap-2">
            <input
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              placeholder="Claim code"
              maxLength={6}
              className="flex-1 px-3 py-2.5 rounded-lg border border-[#e2dfd6] font-mono tracking-[0.2em] uppercase text-[15px] focus:outline-none focus:border-[#E4531F]"
            />
            <button onClick={claim} disabled={claiming || !claimCode.trim()} className="px-5 rounded-lg font-semibold text-white text-[13px] disabled:opacity-50" style={{ background: "#742e12" }}>
              {claiming ? "…" : "Claim"}
            </button>
          </div>
          {msg && <div className="text-[12px] text-gray-500 mt-3">{msg}</div>}
        </div>
      </Shell>
    );
  }

  // ── dashboard ────────────────────────────────────────────────────────────────
  const maxDaily = dash ? Math.max(1, ...dash.visits.daily.map((d) => d.count)) : 1;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-serif text-[28px] text-gray-900 leading-none">{dash?.spot_name || "Dashboard"}</h1>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-gray-400 mt-1">merchant dashboard</div>
        </div>
        {spots.length > 1 && (
          <select value={spotId} onChange={(e) => setSpotId(e.target.value)} className="px-3 py-2 rounded-lg border border-[#e2dfd6] text-[13px] bg-white">
            {spots.map((s) => <option key={s.spot_id} value={s.spot_id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {!dash ? (
        <div className="text-gray-500 text-[13px]">Loading…</div>
      ) : (
        <div className="flex flex-col gap-6">
          <VenueProfileCard
            userId={user!.id}
            spotId={dash.spot_id}
            spotName={dash.spot_name}
            profile={dash.profile}
            onSaved={loadDash}
          />

          {/* stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Verified visits" value={dash.visits.total} sub={`${dash.visits.last_7d} in last 7d`} />
            <Stat label="Unique visitors" value={dash.visits.unique_visitors} sub={`${dash.visits.repeat_visitors} came back`} />
            <Stat label="Worth it" value={`${dash.reviews.worth_it_pct}%`} sub={`${dash.reviews.count} reviews`} />
            <Stat label="Avg spend" value={dash.reviews.avg_spend != null ? `$${dash.reviews.avg_spend}` : "—"} sub="reported by guests" />
            <Stat label="Momentum" value={TIER_LABEL[dash.momentum.tier] || "—"} sub={dash.momentum.tier ? `${dash.momentum.visitor_count} recent visitors` : "not trending yet"} />
            <Stat label="Rewards redeemed" value={dash.redemptions.redeemed} sub={`${dash.redemptions.issued} issued`} />
            <Stat label="Points spent" value={dash.redemptions.points_spent} sub="on your rewards" />
            <Stat label="Repeat rate" value={`${dash.visits.unique_visitors ? Math.round(100 * dash.visits.repeat_visitors / dash.visits.unique_visitors) : 0}%`} sub="loyal regulars" />
          </div>

          {/* daily visits */}
          <div className="rounded-xl border border-[#e2dfd6] bg-white p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-3">verified visits · last 14 days</div>
            <div className="flex items-end gap-1 h-24">
              {dash.visits.daily.map((d) => (
                <div key={d.date} className="flex-1 rounded-t" title={`${d.date}: ${d.count}`}
                  style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%`, background: "#d28a2d", opacity: d.count ? 1 : 0.25 }} />
              ))}
            </div>
          </div>

          {/* reviews + rewards */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[#e2dfd6] bg-white p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-3">recent reviews</div>
              {dash.reviews.recent.length === 0 ? (
                <div className="text-[13px] text-gray-400">No reviews yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {dash.reviews.recent.map((r, i) => (
                    <div key={i} className="border-b border-[#f0ede4] pb-2 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold">{r.user_name}</span>
                        <span className="font-mono text-[10px] font-bold" style={{ color: r.worth_it ? "#1D6B4A" : "#B5330C" }}>
                          {r.worth_it ? "worth it" : "skip it"}
                        </span>
                      </div>
                      {r.comment && <div className="text-[12px] text-gray-600 mt-0.5">{r.comment}</div>}
                      {r.actual_spend != null && <div className="font-mono text-[10px] text-gray-400 mt-0.5">${Math.round(Number(r.actual_spend))}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#e2dfd6] bg-white p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-3">your rewards</div>
              <div className="flex flex-col gap-2 mb-4">
                {dash.rewards.length === 0 ? (
                  <div className="text-[13px] text-gray-400">No active rewards. Add one below.</div>
                ) : dash.rewards.map((rw) => (
                  <div key={rw.id} className="flex items-center justify-between border border-[#f0ede4] rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{rw.title}</div>
                      <div className="font-mono text-[10px] text-gray-400">{rw.cost_points} pts{rw.stock != null ? ` · ${rw.stock} left` : ""}</div>
                    </div>
                    <button onClick={() => pause(rw)} className="font-mono text-[10px] font-bold text-gray-400 hover:text-[#B5330C]">pause</button>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#f0ede4] pt-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-2">add a reward</div>
                <input value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="e.g. Free coffee" className="w-full mb-2 px-3 py-2 rounded-lg border border-[#e2dfd6] text-[13px] focus:outline-none focus:border-[#E4531F]" />
                <div className="flex gap-2">
                  <input value={rCost} onChange={(e) => setRCost(e.target.value)} type="number" placeholder="cost (pts)" className="flex-1 px-3 py-2 rounded-lg border border-[#e2dfd6] text-[13px] focus:outline-none focus:border-[#E4531F]" />
                  <input value={rStock} onChange={(e) => setRStock(e.target.value)} type="number" placeholder="stock (opt)" className="w-28 px-3 py-2 rounded-lg border border-[#e2dfd6] text-[13px] focus:outline-none focus:border-[#E4531F]" />
                </div>
                <button onClick={addReward} disabled={creating || !rTitle.trim() || !rCost} className="w-full mt-2 py-2 rounded-full font-semibold text-white text-[13px] disabled:opacity-50" style={{ background: "#E4531F" }}>
                  {creating ? "Adding…" : "Add reward"}
                </button>
              </div>
            </div>
          </div>

          {msg && <div className="text-[12px] text-gray-500">{msg}</div>}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf8f2]">
      <div className="max-w-[900px] mx-auto px-6 py-8">
        <div className="font-serif text-[22px] mb-6" style={{ color: "#742e12" }}>
          B<em className="not-italic" style={{ color: "#d28a2d" }}>u</em>co <span className="font-mono text-[10px] tracking-[0.14em] text-gray-400 uppercase">for restaurants</span>
        </div>
        {children}
      </div>
    </div>
  );
}
