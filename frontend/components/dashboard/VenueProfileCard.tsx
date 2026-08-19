"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X, Store } from "lucide-react";
import {
  updateVenueProfile, addVenuePhoto, removeVenuePhoto, uploadVenuePhoto, VenueProfile,
} from "@/lib/api";

export default function VenueProfileCard({
  userId, spotId, spotName, profile, onSaved,
}: {
  userId: string;
  spotId: string;
  spotName: string;
  profile: VenueProfile;
  onSaved: () => void;
}) {
  const [name, setName] = useState(spotName);
  const [website, setWebsite] = useState(profile.website || "");
  const [happyHour, setHappyHour] = useState(profile.happy_hour_note || "");
  const [dealComment, setDealComment] = useState(profile.deal_comment || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"menu" | "deal" | null>(null);
  const [msg, setMsg] = useState("");
  const menuRef = useRef<HTMLInputElement>(null);
  const dealRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    const r = await updateVenueProfile(userId, spotId, {
      name: name.trim(), website: website.trim(),
      happy_hour_note: happyHour.trim(), deal_comment: dealComment.trim(),
    });
    setSaving(false);
    setMsg(r.message);
    if (r.ok) onSaved();
  };

  const onFile = async (kind: "menu" | "deal", e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(kind);
    const url = await uploadVenuePhoto(userId, spotId, kind, f);
    if (url) { await addVenuePhoto(userId, spotId, kind, url); onSaved(); }
    else setMsg("Upload failed");
    setUploading(null);
  };

  const removePhoto = async (kind: "menu" | "deal", url: string) => {
    await removeVenuePhoto(userId, spotId, kind, url);
    onSaved();
  };

  const PhotoRow = ({ kind, photos }: { kind: "menu" | "deal"; photos: string[] }) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400">
          {kind === "menu" ? "menu photos" : "deal photos"}
        </div>
        <button
          onClick={() => (kind === "menu" ? menuRef : dealRef).current?.click()}
          disabled={uploading === kind}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#742e12] disabled:opacity-50"
        >
          {uploading === kind ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} add
        </button>
      </div>
      <input ref={kind === "menu" ? menuRef : dealRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(kind, e)} />
      {photos.length === 0 ? (
        <div className="text-[12px] text-gray-400 pb-1">None yet.</div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {photos.map((url) => (
            <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#e2dfd6]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => removePhoto(kind, url)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const input = "w-full px-3 py-2 rounded-lg border border-[#e2dfd6] text-[13px] focus:outline-none focus:border-[#E4531F]";

  return (
    <div className="rounded-xl border border-[#e2dfd6] bg-white p-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 mb-4">
        <Store size={14} /> venue profile
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[12px] text-gray-500">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className="text-[12px] text-gray-500">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={input} />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[12px] text-gray-500">Happy hour</label>
        <input value={happyHour} onChange={(e) => setHappyHour(e.target.value)} placeholder="e.g. Mon–Fri 4–6pm · $5 pints, half-price apps" className={input} />
      </div>

      <div className="mb-4">
        <label className="text-[12px] text-gray-500">Deal / promo note</label>
        <textarea value={dealComment} onChange={(e) => setDealComment(e.target.value)} rows={2} placeholder="e.g. 20% off for students all day Tuesday" className={`${input} resize-none`} />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-4">
        <PhotoRow kind="menu" photos={profile.menu_photos} />
        <PhotoRow kind="deal" photos={profile.deal_photos} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="py-2 px-5 rounded-full font-semibold text-white text-[13px] disabled:opacity-50" style={{ background: "#742e12" }}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {msg && <span className="text-[12px] text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}
