"use client";

import { useState } from "react";
import { redeemCode } from "@/lib/api";

export default function MerchantRedeem() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; reward_title?: string; spot_name?: string; message: string } | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const r = await redeemCode(code.trim().toUpperCase());
    setBusy(false);
    setResult(r ?? { ok: false, message: "Couldn't reach the server." });
    if (r?.ok) setCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f2] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="font-serif text-[30px] tracking-[0.01em]" style={{ color: "#742e12" }}>
            B<em className="not-italic" style={{ color: "#d28a2d" }}>u</em>co
          </div>
          <div className="font-mono text-[10px] font-bold tracking-[0.14em] text-gray-500 uppercase mt-1">merchant · redeem a code</div>
        </div>

        <div className="bg-white border border-[#e2dfd6] rounded-2xl p-6 shadow-sm">
          <label className="text-[13px] text-gray-500">Customer's code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="6-digit code"
            maxLength={6}
            autoFocus
            className="w-full mt-2 px-4 py-3 rounded-xl border border-[#e2dfd6] text-center font-mono text-[26px] font-bold tracking-[0.3em] uppercase focus:outline-none focus:border-[#E4531F]"
          />
          <button
            onClick={submit}
            disabled={busy || !code.trim()}
            className="w-full mt-4 py-3 rounded-full font-semibold text-white disabled:opacity-50"
            style={{ background: "#E4531F" }}
          >
            {busy ? "Checking…" : "Redeem"}
          </button>

          {result && (
            <div
              className="mt-4 rounded-xl p-4 text-center"
              style={result.ok ? { background: "#e6f0ef" } : { background: "#faece7" }}
            >
              {result.ok ? (
                <>
                  <div className="text-[15px] font-semibold" style={{ color: "#1D6B4A" }}>✓ Apply: {result.reward_title}</div>
                  {result.spot_name && <div className="text-[12px] text-gray-500 mt-0.5">{result.spot_name}</div>}
                  <div className="text-[11px] text-gray-500 mt-1">Comp this in your POS as usual.</div>
                </>
              ) : (
                <div className="text-[14px] font-semibold" style={{ color: "#B5330C" }}>{result.message}</div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4 font-mono tracking-[0.05em]">
          codes are one-time and expire — no POS setup needed
        </p>
      </div>
    </div>
  );
}
