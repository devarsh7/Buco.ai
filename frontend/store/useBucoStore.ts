import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message, ChatSession, Spot, AppView, AuthUser, WishlistItem, UserLocation } from "@/types";
import {
  streamChat,
  saveBookmark,
  fetchWishlist,
  removeBookmark,
  deleteConversation,
  renameConversation,
} from "@/lib/api";

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122-ish fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface BucoStore {
  sessions:        ChatSession[];
  activeSessionId: string | null;
  isLoading:       boolean;
  view:            AppView;
  city:            string;

  user:            AuthUser | null;
  authModalOpen:   boolean;

  wishlist:        WishlistItem[];
  wishlistLoading: boolean;

  userLocation:    UserLocation | null;
  toast:           string | null;

  // chat
  sendMessage:   (content: string) => Promise<void>;
  newSession:    () => void;
  openSession:   (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;

  // ui
  setView:         (view: AppView) => void;
  setCity:         (city: string)  => void;
  showToast:       (msg: string)   => void;
  setAuthModal:    (open: boolean) => void;
  setUserLocation: (loc: UserLocation | null) => void;

  // auth
  setUser: (user: AuthUser | null) => void;

  // wishlist
  loadWishlist:       () => Promise<void>;
  addToWishlist:      (spot: Spot) => Promise<void>;
  removeFromWishlist: (bookmarkId: string) => Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useBucoStore = create<BucoStore>()(
  persist(
    (set, get) => ({
      sessions:        [],
      activeSessionId: null,
      isLoading:       false,
      view:            "map",
      city:            "Toronto, ON",

      user:            null,
      authModalOpen:   false,

      wishlist:        [],
      wishlistLoading: false,

      userLocation: null,
      toast: null,

      // ── Chat sessions ────────────────────────────────────────────────────

      newSession: () => set({ activeSessionId: null, view: "map" }),

      openSession: (id) => {
        if (get().sessions.some((s) => s.id === id)) {
          set({ activeSessionId: id, view: "map" });
        }
      },

      renameSession: (id, title) => {
        const clean = title.trim().slice(0, 100);
        if (!clean) return;
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: clean } : x)),
        }));
        renameConversation(id, clean); // best-effort server sync
      },

      deleteSession: (id) => {
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        }));
        deleteConversation(id); // best-effort server sync
      },

      sendMessage: async (content) => {
        const { activeSessionId, city, user, isLoading, userLocation } = get();
        if (isLoading) return;
        // Claim the loading lock IMMEDIATELY — closes the double-click race
        // that could create duplicate sessions/messages.
        set({ isLoading: true, view: "map" });

        const now = new Date().toISOString();
        let sessionId = activeSessionId;

        // Create the session on first message
        if (!sessionId || !get().sessions.some((s) => s.id === sessionId)) {
          sessionId = generateId();
          const session: ChatSession = {
            id: sessionId,
            title: content.slice(0, 48),
            messages: [],
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: sessionId }));
        }

        const userMsg: Message      = { id: generateId(), role: "user", content, timestamp: now };
        const assistantId           = generateId();
        const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", spots: [], timestamp: now };

        const patchSession = (fn: (msgs: Message[]) => Message[]) =>
          set((s) => ({
            sessions: s.sessions.map((x) =>
              x.id === sessionId ? { ...x, messages: fn(x.messages), updatedAt: new Date().toISOString() } : x
            ),
          }));

        patchSession((msgs) => [...msgs, userMsg, assistantMsg]);

        const patchAssistant = (patch: Partial<Message>) =>
          patchSession((msgs) => msgs.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

        try {
          await streamChat(
            {
              message: content,
              session_id: sessionId!,
              city,
              user_id: user?.id,
              user_lat: userLocation?.lat,
              user_lng: userLocation?.lng,
            },
            {
              onText:  (text)  => patchAssistant({ content: text }),
              onSpots: (spots) => patchAssistant({ spots }),
              onDone:  ()      => set({ isLoading: false }),
              onError: (err)   => { patchAssistant({ content: err }); set({ isLoading: false }); },
            }
          );
        } catch {
          patchAssistant({ content: "Connection lost. Please try again." });
          set({ isLoading: false });
        }
      },

      // ── UI ───────────────────────────────────────────────────────────────

      setView: (view) => set({ view }),
      setCity: (city) => set({ city }),
      setAuthModal: (open) => set({ authModalOpen: open }),
      setUserLocation: (userLocation) => set({ userLocation }),

      showToast: (msg) => {
        set({ toast: msg });
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => set({ toast: null }), 2600);
      },

      // ── Auth ─────────────────────────────────────────────────────────────

      setUser: (user) => {
        set({ user });
        if (user) get().loadWishlist();
        else set({ wishlist: [] });
      },

      // ── Wishlist ─────────────────────────────────────────────────────────

      loadWishlist: async () => {
        const { user } = get();
        if (!user) return;
        set({ wishlistLoading: true });
        const items = await fetchWishlist(user.id);
        set({ wishlist: items, wishlistLoading: false });
      },

      addToWishlist: async (spot) => {
        const { user, showToast, loadWishlist, setAuthModal } = get();
        if (!user) { setAuthModal(true); return; }
        const ok = await saveBookmark(user.id, spot);
        showToast(ok ? `${spot.name} saved to Wishlist ♥` : "Couldn't save — try again");
        if (ok) loadWishlist();
      },

      removeFromWishlist: async (bookmarkId) => {
        const { user, showToast } = get();
        if (!user) return;
        set((s) => ({ wishlist: s.wishlist.filter((w) => w.id !== bookmarkId) }));
        const ok = await removeBookmark(user.id, bookmarkId);
        if (!ok) { showToast("Couldn't remove — try again"); get().loadWishlist(); }
      },
    }),
    {
      name: "buco-store",
      version: 2,
      migrate: (persisted: any) => ({
        ...persisted,
        // v1 had a separate "chat" view — chat now lives inside the map.
        view: persisted?.view === "wishlist" ? "wishlist" : "map",
      }),
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        view: s.view,
        city: s.city,
      }),
    }
  )
);
