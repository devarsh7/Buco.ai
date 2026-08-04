"use client";

import { useRef, useState } from "react";
import { Camera, MapPin, X, Check, Loader2, Home, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import { checkIn, uploadDishPhoto, postReview, VisitResult } from "@/lib/api";
import { Spot } from "@/types";

const HOUSE_COLORS = ["#6FB98F", "#2E8B5E", "#1D6B4A"];

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("no-geo"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

export default function CheckInModal({
  spot,
  onClose,
  onSuccess,
}: {
  spot: Spot | null;
  onClose: () => void;
  onSuccess?: (r: VisitResult) => void;
}) {
  const { user, setAuthModal, showToast, loadPoints } = useBucoStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VisitResult | null>(null);

  // review step
  const [worthIt, setWorthIt] = useState<boolean | null>(null);
  const [spend, setSpend] = useState("");
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  if (!spot) return null;

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!user) { setAuthModal(true); return; }
    if (!file) { showToast("Add a photo of your dish to verify"); return; }
    setBusy(true);
    try {
      const pos = await getPosition().catch(() => null);
      if (!pos) { showToast("Turn on location to check in at the venue"); setBusy(false); return; }
      const photo_url = await uploadDishPhoto(user.id, file);
      if (!photo_url) { showToast("Photo upload failed — try again"); setBusy(false); return; }
      const r = await checkIn({
        user_id: user.id,
        spot_id: spot.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        photo_url,
      });
      if (!r) { showToast("Couldn't reach the server — try again"); setBusy(false); return; }
      setResult(r);
      if (r.verified) { loadPoints(); if (onSuccess) onSuccess(r); }
    } finally {
      setBusy(false);
    }
  };

  const sendReview = async () => {
    if (!user || worthIt === null) return;
    setPosting(true);
    const r = await postReview({
      user_id: user.id,
      spot_id: spot.id,
      worth_it: worthIt,
      actual_spend: spend ? Number(spend) : null,
      comment: comment.trim(),
    });
    setPosting(false);
    if (r?.ok) {
      setReviewDone(true);
      loadPoints();
      showToast(r.points_awarded ? `Review posted · +${r.points_awarded} points` : "Review posted");
    } else {
      showToast(r?.message || "Couldn't post review — try again");
    }
  };

  const tierColor = HOUSE_COLORS[Math.max(0, Math.min(2, (result?.building_tier ?? 1) - 1))];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="font-semibold text-[15px]">
            {result?.verified ? (reviewDone ? "All set" : "You're in") : "Check in"}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {/* ── Capture step ───────────────────────────────────────────── */}
        {!result && (
          <div className="p-5">
            <div className="text-[13px] text-gray-500 mb-1">You're checking in at</div>
            <div className="font-semibold text-[17px] mb-4">{spot.name}</div>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-gray-400 overflow-hidden hover:border-gray-400 transition-colors"
              style={preview ? { backgroundImage: `url(${preview})`, backgroundSize: "cover", backgroundPosition: "center", borderStyle: "solid" } : {}}
            >
              {!preview && (
                <>
                  <Camera size={26} />
                  <span className="text-[13px] font-medium">Snap the dish to verify</span>
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />

            <div className="flex items-center gap-2 text-[12px] text-gray-500 mt-3">
              <MapPin size={13} />
              We check your GPS at the venue — no faking it.
            </div>

            <button
              onClick={submit}
              disabled={busy}
              className="w-full mt-4 py-3 rounded-full font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "#E4531F" }}
            >
              {busy ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : "Check in"}
            </button>
          </div>
        )}

        {/* ── Verified result + review step ──────────────────────────── */}
        {result?.verified && !reviewDone && (
          <div className="p-6">
            <div className="text-center">
              <AnimatePresence>
                {result.leveled_up && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-white text-[12px] font-semibold"
                    style={{ background: tierColor }}
                  >
                    <Sparkles size={13} /> Leveled up!
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3"
                style={{ background: tierColor }}
              >
                <Home size={30} className="text-white" />
              </motion.div>

              <div className="font-semibold text-[18px]">{spot.name}</div>
              <div className="text-[14px] text-gray-600 mt-1">
                {result.building_label || "Checked in"}
                {result.visit_count > 0 ? ` · visit #${result.visit_count}` : ""}
              </div>
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-white text-[13px] font-semibold" style={{ background: "#1D6B4A" }}>
                <Check size={14} /> +{result.points_awarded} points
              </div>
            </div>

            {/* quick review */}
            <div className="mt-6 pt-5 border-t border-border">
              <div className="text-[14px] font-semibold mb-3">Worth it?</div>
              <div className="flex gap-2 mb-3">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setWorthIt(v)}
                    className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors"
                    style={
                      worthIt === v
                        ? { background: v ? "#1D6B4A" : "#B5330C", color: "#fff", borderColor: "transparent" }
                        : { borderColor: "#e2dfd6", color: "#4B433B" }
                    }
                  >
                    {v ? "Worth it" : "Not worth it"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] text-gray-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                  placeholder="What you actually spent"
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] focus:outline-none focus:border-gray-400"
                />
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="One line — what should people order?"
                rows={2}
                maxLength={600}
                className="w-full px-3 py-2 rounded-lg border border-border text-[13px] resize-none focus:outline-none focus:border-gray-400"
              />

              <div className="flex gap-2 mt-4">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-border font-semibold text-[13px] hover:bg-gray-50">
                  Skip
                </button>
                <button
                  onClick={sendReview}
                  disabled={worthIt === null || posting}
                  className="flex-1 py-2.5 rounded-full font-semibold text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#E4531F" }}
                >
                  {posting ? <><Loader2 size={14} className="animate-spin" /> Posting…</> : "Post review"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Not verified ───────────────────────────────────────────── */}
        {result && !result.verified && (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: "#faf3e3", color: "#a86d20" }}>
              <MapPin size={26} />
            </div>
            <div className="font-semibold text-[16px]">Not verified yet</div>
            <div className="text-[14px] text-gray-600 mt-1">{result.message}</div>
            <button onClick={onClose} className="w-full mt-5 py-2.5 rounded-full border border-border font-semibold text-[14px] hover:bg-gray-50">
              Done
            </button>
          </div>
        )}

        {/* ── Review posted ──────────────────────────────────────────── */}
        {reviewDone && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: "#1D6B4A" }}>
              <Check size={26} className="text-white" />
            </div>
            <div className="font-semibold text-[16px]">Thanks — that helps everyone</div>
            <div className="text-[13px] text-gray-500 mt-1">Your verified review is live.</div>
            <button onClick={onClose} className="w-full mt-5 py-2.5 rounded-full font-semibold text-white text-[14px]" style={{ background: "#E4531F" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
