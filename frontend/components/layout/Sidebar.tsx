"use client";

import { useState } from "react";
import { Map, Heart, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBucoStore } from "@/store/useBucoStore";
import { AppView } from "@/types";
import clsx from "clsx";

const NAV = [
  { icon: Map,   label: "map",      view: "map"      as AppView },
  { icon: Heart, label: "wishlist", view: "wishlist" as AppView },
];

export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const {
    sessions, activeSessionId, view, city,
    newSession, openSession, renameSession, deleteSession, setView,
  } = useBucoStore();

  const close = () => onClose?.();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft]         = useState("");

  const startEdit = (id: string, title: string) => { setEditingId(id); setDraft(title); };
  const commitEdit = () => {
    if (editingId && draft.trim()) renameSession(editingId, draft);
    setEditingId(null);
  };

  return (
    <aside
      className={clsx(
        "w-[232px] flex-shrink-0 flex flex-col bg-white border-r border-border",
        // On phones the sidebar is an off-canvas drawer; on desktop it's static.
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[3000] max-md:w-[80vw] max-md:max-w-[300px] max-md:shadow-2xl max-md:transition-transform max-md:duration-200",
        mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
      )}
    >
      {/* Logo — just the B, same height as the top navbar so borders align */}
      <div className="h-14 flex-shrink-0 flex items-center justify-between px-[18px] border-b border-border">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="font-serif text-[28px] italic text-rust leading-none select-none"
        >
          B
        </motion.div>
        <button onClick={close} className="md:hidden p-1 text-gray-400 hover:text-gray-700" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      {/* New chat */}
      <motion.button
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.985 }}
        onClick={() => { newSession(); close(); }}
        className="mx-[10px] mt-3 mb-2 px-3 py-[9px] border border-rust rounded-lg font-mono text-[10px] font-bold text-rust flex items-center gap-[6px] tracking-[0.05em] hover:bg-rust-light transition-colors"
      >
        <Plus size={13} />
        new chat
      </motion.button>

      {/* Recent chats */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sessions.length > 0 && (
          <div className="px-4 pt-2 pb-[6px] font-mono text-[8px] font-bold text-gray-500 tracking-[0.2em] uppercase">
            recent
          </div>
        )}
        <AnimatePresence initial={false}>
          {sessions.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14, height: 0 }}
              transition={{ duration: 0.16 }}
              className={clsx(
                "group flex items-center gap-1 pr-2 border-l-2 transition-colors",
                s.id === activeSessionId && view === "map"
                  ? "border-l-rust bg-rust-light"
                  : "border-l-transparent hover:bg-sand-light"
              )}
            >
              {editingId === s.id ? (
                <div className="flex-1 flex items-center gap-1 px-3 py-[7px]">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 min-w-0 bg-white border border-amber rounded px-[6px] py-[3px] font-mono text-[10px] text-gray-900 outline-none"
                  />
                  <button onClick={commitEdit} className="p-[3px] text-teal hover:scale-110 transition-transform"><Check size={12} /></button>
                  <button onClick={() => setEditingId(null)} className="p-[3px] text-gray-400 hover:text-gray-700"><X size={12} /></button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { openSession(s.id); close(); }}
                    title={s.title}
                    className={clsx(
                      "flex-1 min-w-0 text-left px-4 py-[9px] font-mono text-[10px] whitespace-nowrap overflow-hidden text-ellipsis",
                      s.id === activeSessionId && view === "map" ? "text-rust font-bold" : "text-gray-700"
                    )}
                  >
                    {s.title}
                  </button>
                  <div className="hidden group-hover:flex items-center gap-[2px] flex-shrink-0">
                    <button
                      onClick={() => startEdit(s.id, s.title)}
                      title="Rename"
                      className="p-[4px] text-gray-400 hover:text-amber transition-colors"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${s.title}"?`)) deleteSession(s.id); }}
                      title="Delete"
                      className="p-[4px] text-gray-400 hover:text-rust transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {sessions.length === 0 && (
          <p className="px-4 pt-3 font-mono text-[9px] text-gray-400 leading-[1.8] tracking-[0.04em]">
            no chats yet —<br />ask buco something tasty
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="border-t border-border">
        {NAV.map(({ icon: Icon, label, view: v }) => (
          <button
            key={v}
            onClick={() => { setView(v); close(); }}
            className={clsx(
              "w-full flex items-center gap-[9px] px-4 py-[11px] font-mono text-[10px] tracking-[0.06em] transition-all relative",
              view === v ? "text-rust font-bold" : "text-gray-600 hover:bg-sand-light hover:text-gray-900"
            )}
          >
            {view === v && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r bg-rust"
              />
            )}
            <Icon size={15} />
            {label}
          </button>
        ))}
        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <div className="w-[7px] h-[7px] rounded-full bg-teal flex-shrink-0 animate-pulse" />
          <span className="font-mono text-[9px] font-bold text-gray-600 tracking-[0.08em] truncate">{city}</span>
        </div>
      </nav>
    </aside>
  );
}
