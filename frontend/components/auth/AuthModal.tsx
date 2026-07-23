"use client";

import { useState } from "react";
import { X, Mail, Lock, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import { useBucoStore } from "@/store/useBucoStore";

type Mode = "signin" | "signup";

export default function AuthModal() {
  const { authModalOpen, setAuthModal, showToast } = useBucoStore();
  const [mode, setMode]         = useState<Mode>("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const close = () => { setAuthModal(false); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = getSupabase();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() || email.split("@")[0] } },
        });
        if (error) throw error;
        if (data.session) {
          showToast("Welcome to Buco ♥");
          close();
        } else {
          showToast("Check your email to confirm your account");
          close();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast("Signed in — welcome back");
        close();
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {authModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="w-[360px] rounded-2xl bg-white border border-border shadow-2xl p-7 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="font-serif text-[34px] text-rust leading-none mb-1">
              B<em className="text-amber not-italic">u</em>co
            </div>
            <p className="font-mono text-[10px] text-gray-500 tracking-[0.08em] mb-6">
              {mode === "signin" ? "welcome back_" : "join the club_"}
            </p>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border p-[3px] mb-5 bg-sand-light">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 py-[7px] rounded-md font-mono text-[10px] tracking-[0.06em] transition-all ${
                    mode === m ? "bg-white text-rust shadow-sm font-bold" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {m === "signin" ? "sign in" : "sign up"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <label className="flex items-center gap-2 border border-border rounded-lg px-3 py-[10px] focus-within:border-amber transition-colors">
                  <User size={13} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="display name"
                    className="flex-1 bg-transparent outline-none font-mono text-[11px] text-gray-900 placeholder:text-gray-400"
                  />
                </label>
              )}
              <label className="flex items-center gap-2 border border-border rounded-lg px-3 py-[10px] focus-within:border-amber transition-colors">
                <Mail size={13} className="text-gray-400 flex-shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email"
                  className="flex-1 bg-transparent outline-none font-mono text-[11px] text-gray-900 placeholder:text-gray-400"
                />
              </label>
              <label className="flex items-center gap-2 border border-border rounded-lg px-3 py-[10px] focus-within:border-amber transition-colors">
                <Lock size={13} className="text-gray-400 flex-shrink-0" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password (6+ characters)"
                  className="flex-1 bg-transparent outline-none font-mono text-[11px] text-gray-900 placeholder:text-gray-400"
                />
              </label>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-mono text-[10px] text-rust-mid leading-relaxed"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 py-[11px] rounded-lg bg-rust text-white font-mono text-[11px] font-bold tracking-[0.08em] hover:bg-rust-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {mode === "signin" ? "sign in" : "create account"}
              </button>
            </form>

            <p className="font-mono text-[9px] text-gray-400 tracking-[0.04em] mt-4 text-center">
              your wishlist &amp; chats sync once you&apos;re in
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
