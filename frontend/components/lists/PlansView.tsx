"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Trash2, UserPlus, MapPin, Loader2, ListChecks, Pencil, Search, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import {
  getPlans, createPlan, getPlanDetail, addPlanMember, addPlanItem, removePlanItem,
  renamePlan, deletePlan, getFriends, searchYelp, PlanCard, PlanDetail, Friend,
} from "@/lib/api";
import { Spot } from "@/types";

const COBALT = "#2F6FB3";

export default function PlansView() {
  const { user, wishlist, loadWishlist, showToast, setView, setAuthModal } = useBucoStore();
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [selFriend, setSelFriend] = useState("");
  const [selSpot, setSelSpot] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Spot[]>([]);
  const [searching, setSearching] = useState(false);

  const loadPlans = async () => {
    if (!user) return;
    setPlans(await getPlans(user.id));
    setLoading(false);
  };

  useEffect(() => {
    if (!user) { setAuthModal(true); return; }
    loadPlans();
    getFriends(user.id).then((d) => setFriends(d.friends));
    loadWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center px-8">
          <ListChecks size={40} className="mx-auto mb-4 opacity-30" style={{ color: COBALT }} />
          <h2 className="font-serif text-[22px] text-gray-900 mb-2">Plan nights out together</h2>
          <p className="font-mono text-[10px] text-gray-500 tracking-[0.06em] leading-[1.9] mb-6">
            sign in to build shared lists with friends —<br />everyone adds the spots they love.
          </p>
          <button onClick={() => setAuthModal(true)} className="font-mono text-[11px] font-bold text-white px-6 py-[10px] rounded-full tracking-[0.06em]" style={{ background: COBALT }}>
            sign in
          </button>
        </div>
      </div>
    );
  }

  const openPlan = async (id: string) => {
    setDetail(null);
    setSelFriend(""); setSelSpot("");
    const d = await getPlanDetail(user.id, id);
    setDetail(d);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const p = await createPlan(user.id, newName.trim());
    setCreating(false);
    if (p) { setNewName(""); setPlans((prev) => [p, ...prev]); openPlan(p.id); }
    else showToast("Couldn't create the plan");
  };

  const reload = async () => { if (detail) setDetail(await getPlanDetail(user.id, detail.id)); };

  const addMember = async () => {
    if (!detail || !selFriend) return;
    const r = await addPlanMember(user.id, detail.id, selFriend);
    showToast(r.message);
    if (r.ok) { setSelFriend(""); reload(); }
  };

  const addItem = async () => {
    if (!detail || !selSpot) return;
    const r = await addPlanItem(user.id, detail.id, selSpot);
    showToast(r.message);
    if (r.ok) { setSelSpot(""); reload(); loadPlans(); }
  };

  const removeItem = async (spotId: string) => {
    if (!detail) return;
    const r = await removePlanItem(user.id, detail.id, spotId);
    if (r.ok) { reload(); loadPlans(); } else showToast(r.message);
  };

  const doRename = async () => {
    if (!detail || !editName.trim()) { setEditingName(false); return; }
    const r = await renamePlan(user.id, detail.id, editName.trim());
    setEditingName(false);
    if (r.ok) { setDetail({ ...detail, name: editName.trim() }); loadPlans(); showToast("Renamed"); }
    else showToast(r.message);
  };

  const doDelete = async () => {
    if (!detail) return;
    if (!window.confirm(`Delete "${detail.name}"? This can't be undone.`)) return;
    const r = await deletePlan(user.id, detail.id);
    showToast(r.message);
    if (r.ok) { setDetail(null); loadPlans(); }
  };

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearchResults(await searchYelp(searchQ.trim(), "Toronto, ON"));
    setSearching(false);
  };

  const addSearchSpot = async (spot: Spot) => {
    if (!detail) return;
    const r = await addPlanItem(user.id, detail.id, spot.id, "", spot);
    showToast(r.message);
    if (r.ok) { setSearchQ(""); setSearchResults([]); reload(); loadPlans(); }
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (detail) {
    const memberIds = new Set(detail.members.map((m) => m.user_id));
    const eligibleFriends = friends.filter((f) => !memberIds.has(f.user_id));
    const itemSpotIds = new Set(detail.items.map((i) => i.spot_id));
    const eligibleSpots = wishlist.filter((w) => !itemSpotIds.has(w.spot.id));

    return (
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-[680px] mx-auto px-6 py-8">
          <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeft size={13} /> all plans
          </button>

          <div className="flex items-center gap-2 mb-1">
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doRename()}
                  className="font-serif text-[24px] text-gray-900 border-b border-border bg-transparent focus:outline-none focus:border-gray-500"
                />
                <button onClick={doRename} title="Save" className="text-[#1D6B4A]"><Check size={18} /></button>
                <button onClick={() => setEditingName(false)} title="Cancel" className="text-gray-400"><X size={18} /></button>
              </>
            ) : (
              <>
                <h1 className="font-serif text-[26px] text-gray-900">{detail.name}</h1>
                <button onClick={() => { setEditName(detail.name); setEditingName(true); }} title="Rename plan" className="text-gray-400 hover:text-gray-700"><Pencil size={15} /></button>
                <button onClick={doDelete} title="Delete plan" className="ml-auto text-gray-400 hover:text-rust"><Trash2 size={16} /></button>
              </>
            )}
          </div>

          {/* members */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {detail.members.map((m) => (
              <span key={m.user_id} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border">
                <span className="w-5 h-5 rounded-full text-white font-serif text-[11px] flex items-center justify-center" style={{ background: COBALT }}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-gray-700">{m.name}</span>
              </span>
            ))}
          </div>

          {/* add friend */}
          {eligibleFriends.length > 0 && (
            <div className="flex gap-2 mb-6">
              <select value={selFriend} onChange={(e) => setSelFriend(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] bg-white focus:outline-none focus:border-gray-400">
                <option value="">Invite a friend…</option>
                {eligibleFriends.map((f) => <option key={f.user_id} value={f.user_id}>{f.name}</option>)}
              </select>
              <button onClick={addMember} disabled={!selFriend} className="px-4 rounded-lg font-semibold text-white text-[13px] flex items-center gap-1.5 disabled:opacity-50" style={{ background: COBALT }}>
                <UserPlus size={14} /> Invite
              </button>
            </div>
          )}

          {/* items */}
          <div className="text-[12px] font-semibold text-gray-500 mb-2">
            {detail.items.length} {detail.items.length === 1 ? "spot" : "spots"}
          </div>
          <div className="flex flex-col gap-2 mb-5">
            {detail.items.map((it) => (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 border border-border rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-sand-light flex items-center justify-center text-lg flex-shrink-0">
                  {it.category === "salon" ? "💅" : it.category === "cafe" ? "☕" : it.category === "bar" ? "🍸" : "🍽"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] font-bold text-gray-900 truncate">{it.name}</div>
                  {it.added_by_name && <div className="font-mono text-[9px] text-gray-400">added by {it.added_by_name}</div>}
                </div>
                <button onClick={() => removeItem(it.spot_id)} className="p-[6px] rounded-lg text-gray-300 hover:text-rust hover:bg-rust-light transition-all" title="Remove">
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
            {detail.items.length === 0 && (
              <div className="text-[13px] text-gray-400 py-2">No spots yet — add from your wishlist below.</div>
            )}
          </div>

          {/* add spot from wishlist */}
          {eligibleSpots.length > 0 ? (
            <div className="flex gap-2">
              <select value={selSpot} onChange={(e) => setSelSpot(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] bg-white focus:outline-none focus:border-gray-400">
                <option value="">Add from your wishlist…</option>
                {eligibleSpots.map((w) => <option key={w.spot.id} value={w.spot.id}>{w.spot.name}</option>)}
              </select>
              <button onClick={addItem} disabled={!selSpot} className="px-4 rounded-lg font-semibold text-white text-[13px] flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#E4531F" }}>
                <Plus size={14} /> Add
              </button>
            </div>
          ) : (
            <button onClick={() => setView("map")} className="font-mono text-[10px] font-bold text-teal tracking-[0.06em] hover:underline">
              save spots to your wishlist to add them here →
            </button>
          )}

          {/* Manually add any spot (not just from your wishlist) */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-[12px] font-semibold text-gray-500 mb-2">Or add any restaurant</div>
            <div className="flex gap-2">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Search restaurants, cafes, bars…"
                className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] focus:outline-none focus:border-gray-400"
              />
              <button onClick={runSearch} disabled={searching || !searchQ.trim()} className="px-3 rounded-lg border border-border text-[13px] font-semibold flex items-center disabled:opacity-50">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {searchResults.map((s) => (
                  <button key={s.id} onClick={() => addSearchSpot(s)} className="flex items-center justify-between px-3 py-2 border border-border rounded-lg text-[13px] hover:border-gray-400">
                    <span className="truncate">{s.name}</span>
                    <Plus size={14} style={{ color: "#E4531F" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Plans list ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-[680px] mx-auto px-6 py-8">
        <h1 className="font-serif text-[26px] text-gray-900 mb-1">Plans</h1>
        <p className="font-mono text-[10px] text-gray-400 tracking-[0.05em] mb-5">shared lists you build with friends.</p>

        <div className="flex gap-2 mb-6">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Name a plan — “Friday date night”"
            maxLength={80}
            className="flex-1 px-3 py-2.5 rounded-lg border border-border text-[14px] focus:outline-none focus:border-gray-400"
          />
          <button onClick={create} disabled={creating || !newName.trim()} className="px-4 rounded-lg font-semibold text-white text-[13px] flex items-center gap-1.5 disabled:opacity-50" style={{ background: COBALT }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 py-6">
            <Loader2 size={14} className="animate-spin" /> loading your plans...
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <ListChecks size={36} className="mx-auto mb-3 opacity-30" style={{ color: COBALT }} />
            <p className="font-mono text-[10px] text-gray-500 tracking-[0.06em] leading-[1.9]">
              no plans yet. name one above, invite friends,<br />and start collecting spots together.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map((p) => (
              <button key={p.id} onClick={() => openPlan(p.id)} className="text-left p-4 border border-border rounded-xl hover:border-gray-400 hover:shadow-sm transition-all">
                <div className="font-serif text-[18px] text-gray-900 mb-2 truncate">{p.name}</div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><MapPin size={11} /> {p.item_count} spots</span>
                  <span>· {p.member_count} {p.member_count === 1 ? "member" : "members"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
