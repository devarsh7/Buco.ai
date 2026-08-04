"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check, UserPlus, Loader2, Users } from "lucide-react";
import { useBucoStore } from "@/store/useBucoStore";
import {
  getFriends, requestFriend, respondFriend, setSharing as apiSetSharing,
  FriendsData, Friend,
} from "@/lib/api";

export default function FriendsModal({ onClose }: { onClose: () => void }) {
  const { user, setAuthModal, showToast } = useBucoStore();
  const [data, setData] = useState<FriendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    setData(await getFriends(user.id));
    setLoading(false);
  };
  useEffect(() => {
    if (!user) { setAuthModal(true); onClose(); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const copyCode = () => {
    if (!data?.code) return;
    navigator.clipboard?.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const add = async () => {
    if (!code.trim()) return;
    setSending(true);
    const r = await requestFriend(user.id, code.trim().toUpperCase());
    setSending(false);
    showToast(r.message);
    if (r.ok) { setCode(""); load(); }
  };

  const respond = async (f: Friend, accept: boolean) => {
    const r = await respondFriend(user.id, f.friendship_id, accept);
    showToast(r.message);
    load();
  };

  const toggleSharing = async () => {
    if (!data) return;
    const next = !data.share_visits;
    setData({ ...data, share_visits: next });
    const ok = await apiSetSharing(user.id, next);
    if (!ok) { setData({ ...data, share_visits: !next }); showToast("Couldn't update sharing"); }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-[15px]"><Users size={17} style={{ color: "#2F6FB3" }} /> Friends</div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {loading || !data ? (
          <div className="p-10 flex items-center justify-center text-gray-500"><Loader2 size={16} className="animate-spin" /></div>
        ) : (
          <div className="overflow-y-auto p-5">
            {/* Your code */}
            <div className="text-[13px] text-gray-500 mb-2">Your code · share it with your friends</div>
            <button onClick={copyCode} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:border-gray-400 transition-colors mb-5">
              <span className="font-mono text-[20px] font-bold tracking-[0.2em]" style={{ color: "#2F6FB3" }}>{data.code || "——————"}</span>
              <span className="flex items-center gap-1 text-[12px] text-gray-500">{copied ? <><Check size={14} /> copied</> : <><Copy size={14} /> copy</>}</span>
            </button>

            {/* Add by code */}
            <div className="flex gap-2 mb-5">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter a friend's code"
                maxLength={6}
                className="flex-1 px-3 py-2.5 rounded-lg border border-border text-[14px] font-mono tracking-[0.15em] uppercase focus:outline-none focus:border-gray-400"
              />
              <button onClick={add} disabled={sending || !code.trim()} className="px-4 rounded-lg font-semibold text-white text-[13px] flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#2F6FB3" }}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
              </button>
            </div>

            {/* Sharing toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl mb-5" style={{ background: "#eef4fb" }}>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: "#16324f" }}>Share my visits</div>
                <div className="text-[11px]" style={{ color: "#4a6b8a" }}>Let friends see the places you've verified.</div>
              </div>
              <button onClick={toggleSharing} className="relative w-11 h-6 rounded-full transition-colors" style={{ background: data.share_visits ? "#2F6FB3" : "#cfd6dd" }} aria-pressed={data.share_visits}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: data.share_visits ? "22px" : "2px" }} />
              </button>
            </div>

            {/* Incoming requests */}
            {data.incoming.length > 0 && (
              <div className="mb-5">
                <div className="text-[12px] font-semibold text-gray-500 mb-2">Requests</div>
                {data.incoming.map((f) => (
                  <div key={f.friendship_id} className="flex items-center justify-between py-2">
                    <span className="text-[14px] font-medium">{f.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => respond(f, true)} className="px-3 py-1.5 rounded-full text-white text-[12px] font-semibold" style={{ background: "#1D6B4A" }}>Accept</button>
                      <button onClick={() => respond(f, false)} className="px-3 py-1.5 rounded-full border border-border text-[12px] font-semibold text-gray-600">Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div className="text-[12px] font-semibold text-gray-500 mb-2">
              {data.friends.length} {data.friends.length === 1 ? "friend" : "friends"}
            </div>
            {data.friends.length === 0 ? (
              <div className="text-[13px] text-gray-400 py-3">No friends yet — share your code to get started.</div>
            ) : (
              data.friends.map((f) => (
                <div key={f.friendship_id} className="flex items-center gap-3 py-2">
                  <span className="w-8 h-8 rounded-full text-white font-serif text-[14px] flex items-center justify-center" style={{ background: "#2F6FB3" }}>
                    {f.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-[14px] font-medium">{f.name}</span>
                  {f.share_visits && <span className="text-[10px] font-mono text-gray-400">sharing ✓</span>}
                </div>
              ))
            )}

            {data.outgoing.length > 0 && (
              <div className="mt-4 text-[11px] text-gray-400">
                {data.outgoing.length} pending invite{data.outgoing.length === 1 ? "" : "s"} sent
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
