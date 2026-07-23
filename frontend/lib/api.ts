import { Spot, SSEEvent, WishlistItem } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ChatPayload {
  message: string;
  session_id?: string;
  city?: string;
  user_id?: string;
  user_lat?: number;
  user_lng?: number;
}

interface StreamCallbacks {
  onText:  (text: string)  => void;
  onSpots: (spots: Spot[]) => void;
  onDone:  ()              => void;
  onError: (msg: string)   => void;
}

export async function streamChat(payload: ChatPayload, callbacks: StreamCallbacks): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    callbacks.onError("Can't reach the Buco server. Is the backend running on port 8000?");
    return;
  }

  if (!response.ok) { callbacks.onError(`Server error: ${response.status}`); return; }
  if (!response.body) { callbacks.onError("No response body"); return; }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotTerminal = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const event: SSEEvent = JSON.parse(raw);
        switch (event.type) {
          case "text":  callbacks.onText(event.content);  break;
          case "spots": callbacks.onSpots(event.spots);   break;
          case "done":  gotTerminal = true; callbacks.onDone();               break;
          case "error": gotTerminal = true; callbacks.onError(event.message); break;
        }
      } catch { /* malformed chunk */ }
    }
  }

  // Stream ended without a done/error event — don't leave the UI spinning.
  if (!gotTerminal) callbacks.onDone();
}

export async function fetchSpots(params: { q?: string; city?: string; category?: string; price_max?: number; limit?: number }): Promise<Spot[]> {
  const qs = new URLSearchParams();
  if (params.q)         qs.set("q", params.q);
  if (params.city)      qs.set("city", params.city);
  if (params.category)  qs.set("category", params.category);
  if (params.price_max) qs.set("price_max", String(params.price_max));
  if (params.limit)     qs.set("limit", String(params.limit));
  try {
    const resp = await fetch(`${API_URL}/api/spots/?${qs}`);
    if (!resp.ok) return [];
    return (await resp.json()).spots ?? [];
  } catch {
    return [];
  }
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

export async function saveBookmark(userId: string, spot: Spot, note = ""): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/api/bookmarks/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, spot_id: spot.id, note, spot }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchWishlist(userId: string): Promise<WishlistItem[]> {
  try {
    const resp = await fetch(`${API_URL}/api/bookmarks/${userId}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.bookmarks ?? [])
      .filter((b: any) => b.spots)
      .map((b: any) => ({
        id: b.id,
        note: b.note ?? "",
        visited: b.visited ?? false,
        created_at: b.created_at,
        spot: {
          ...b.spots,
          lat: b.spots.lat != null ? Number(b.spots.lat) : undefined,
          lng: b.spots.lng != null ? Number(b.spots.lng) : undefined,
          price_label: b.spots.price_min
            ? `$${Math.round(b.spots.price_min)}–${Math.round(b.spots.price_max ?? b.spots.price_min)}`
            : "",
          image_url: (b.spots.photos ?? [])[0] ?? "",
          source: b.spots.yelp_id ? "yelp" : "curated",
        } as Spot,
      }));
  } catch {
    return [];
  }
}

export async function removeBookmark(userId: string, bookmarkId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/api/bookmarks/${userId}/${bookmarkId}`, { method: "DELETE" });
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Conversations (server-side history for signed-in users) ──────────────────

export async function deleteConversation(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/conversations/${sessionId}`, { method: "DELETE" });
  } catch { /* local delete already happened */ }
}

export async function renameConversation(sessionId: string, title: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/conversations/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch { /* local rename already happened */ }
}
