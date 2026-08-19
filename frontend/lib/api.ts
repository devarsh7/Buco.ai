import { Spot, SSEEvent, WishlistItem } from "@/types";
import { getSupabase } from "@/lib/supabase";

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

export async function fetchConversations(userId: string): Promise<{ id: string; title: string; created_at?: string; updated_at?: string }[]> {
  try {
    const resp = await fetch(`${API_URL}/api/conversations/?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return [];
    return (await resp.json()).conversations ?? [];
  } catch {
    return [];
  }
}

export async function fetchConversation(sessionId: string): Promise<{ id: string; messages: any[]; created_at?: string; updated_at?: string; title?: string } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/conversations/${sessionId}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

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

// ── Living map: verified visits, buildings, points ───────────────────────────

export interface VisitResult {
  ok: boolean;
  id?: string;
  spot_id: string;
  verified: boolean;
  distance_m?: number | null;
  visit_count: number;
  building_tier: number;   // 0 none · 1 small · 2 bigger · 3 landmark
  building_label: string;
  leveled_up: boolean;
  previous_tier: number;
  points_awarded: number;
  message: string;
  error?: string | null;
}

export interface ReviewCard {
  id: string;
  spot_id: string;
  user_id: string;
  worth_it: boolean;
  actual_spend?: number | null;
  comment: string;
  created_at?: string | null;
  user_name: string;
  spot_name: string;
  spot_category: string;
}

export interface MapPin {
  spot_id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  category: string;
  layer: "discovery" | "wishlist" | "visited";
  visit_count: number;
  building_tier: number;
  building_label: string;
}

export interface UserMap {
  visited: MapPin[];
  wishlist: MapPin[];
  discovery: MapPin[];
  points: number;
}

/** Uploads a dish photo to Supabase Storage (bucket: "dishes") and returns a
 *  public URL. Photos live in object storage + CDN, never in Postgres. */
export async function uploadDishPhoto(userId: string, file: File): Promise<string> {
  try {
    const supabase = getSupabase();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("dishes").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) { console.error("[uploadDishPhoto]", error.message); return ""; }
    return supabase.storage.from("dishes").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[uploadDishPhoto]", e);
    return "";
  }
}

export async function checkIn(payload: {
  user_id: string;
  spot_id: string;
  lat: number;
  lng: number;
  photo_url: string;
}): Promise<VisitResult | null> {
  try {
    const resp = await fetch(`${API_URL}/api/visits/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchUserMap(
  userId: string,
  bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number }
): Promise<UserMap> {
  const empty: UserMap = { visited: [], wishlist: [], discovery: [], points: 0 };
  const qs = new URLSearchParams({ user_id: userId });
  if (bounds) {
    qs.set("min_lng", String(bounds.minLng));
    qs.set("min_lat", String(bounds.minLat));
    qs.set("max_lng", String(bounds.maxLng));
    qs.set("max_lat", String(bounds.maxLat));
  }
  try {
    const resp = await fetch(`${API_URL}/api/visits/map?${qs}`);
    if (!resp.ok) return empty;
    return await resp.json();
  } catch {
    return empty;
  }
}

export async function fetchPoints(userId: string): Promise<number> {
  try {
    const resp = await fetch(`${API_URL}/api/visits/points?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return 0;
    return (await resp.json()).points ?? 0;
  } catch {
    return 0;
  }
}

// ── Reviews (verified only) ──────────────────────────────────────────────────

export async function postReview(payload: {
  user_id: string;
  spot_id: string;
  worth_it: boolean;
  actual_spend?: number | null;
  comment?: string;
}): Promise<{ ok: boolean; points_awarded: number; message: string } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/reviews/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchReviewFeed(limit = 30): Promise<ReviewCard[]> {
  try {
    const resp = await fetch(`${API_URL}/api/reviews/feed?limit=${limit}`);
    if (!resp.ok) return [];
    return (await resp.json()).reviews ?? [];
  } catch {
    return [];
  }
}

export async function fetchSpotReviews(spotId: string, limit = 20): Promise<ReviewCard[]> {
  try {
    const resp = await fetch(`${API_URL}/api/reviews/spot/${spotId}?limit=${limit}`);
    if (!resp.ok) return [];
    return (await resp.json()).reviews ?? [];
  } catch {
    return [];
  }
}

// ── Friends ──────────────────────────────────────────────────────────────────

export interface Friend {
  friendship_id: string;
  user_id: string;
  name: string;
  share_visits: boolean;
}

export interface FriendsData {
  code: string;
  share_visits: boolean;
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

export interface FriendPin {
  spot_id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  category: string;
  friend_names: string[];
  friend_count: number;
}

const EMPTY_FRIENDS: FriendsData = { code: "", share_visits: false, friends: [], incoming: [], outgoing: [] };

export async function getFriends(userId: string): Promise<FriendsData> {
  try {
    const resp = await fetch(`${API_URL}/api/friends/?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return EMPTY_FRIENDS;
    return await resp.json();
  } catch {
    return EMPTY_FRIENDS;
  }
}

export async function requestFriend(userId: string, code: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/friends/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, code }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function respondFriend(
  userId: string, friendshipId: string, accept: boolean
): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/friends/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, friendship_id: friendshipId, accept }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function setSharing(userId: string, share: boolean): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/api/friends/sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, share_visits: share }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchFriendsMap(userId: string): Promise<FriendPin[]> {
  try {
    const resp = await fetch(`${API_URL}/api/friends/map?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return [];
    return (await resp.json()).pins ?? [];
  } catch {
    return [];
  }
}

// ── Collaborative plans (shared wishlists) ───────────────────────────────────

export interface PlanCard {
  id: string;
  name: string;
  owner_id: string;
  item_count: number;
  member_count: number;
}

export interface PlanMember { user_id: string; name: string; }

export interface PlanItem {
  id: string;
  spot_id: string;
  name: string;
  category: string;
  lat?: number | null;
  lng?: number | null;
  note: string;
  added_by_name: string;
}

export interface PlanDetail {
  id: string;
  name: string;
  owner_id: string;
  members: PlanMember[];
  items: PlanItem[];
}

export async function getPlans(userId: string): Promise<PlanCard[]> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return [];
    return (await resp.json()).lists ?? [];
  } catch {
    return [];
  }
}

export async function createPlan(userId: string, name: string): Promise<PlanCard | null> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function renamePlan(userId: string, listId: string, name: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function deletePlan(userId: string, listId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function getPlanDetail(userId: string, listId: string): Promise<PlanDetail | null> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function addPlanMember(userId: string, listId: string, friendId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, friend_id: friendId }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function addPlanItem(userId: string, listId: string, spotId: string, note = "", spot?: Spot | null): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, spot_id: spotId, note, spot: spot ?? null }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export interface VenuePublic {
  name: string;
  website: string;
  menu_url: string;
  menu_photos: string[];
  deal_photos: string[];
  deal_comment: string;
  happy_hour_note: string;
}

/** Public venue profile (menu/deal photos, deals, happy hour) shown to customers. */
export async function fetchVenue(spotId: string): Promise<VenuePublic | null> {
  try {
    const resp = await fetch(`${API_URL}/api/spots/${spotId}/venue`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Yelp-only search for adding any restaurant to a plan (not limited to the seed). */
export async function searchYelp(q: string, city = "Toronto, ON"): Promise<Spot[]> {
  const qs = new URLSearchParams({ q, city });
  try {
    const resp = await fetch(`${API_URL}/api/spots/yelp?${qs}`);
    if (!resp.ok) return [];
    return (await resp.json()).spots ?? [];
  } catch {
    return [];
  }
}

export async function removePlanItem(userId: string, listId: string, spotId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/lists/${listId}/items/${spotId}?user_id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

// ── Towers (area momentum) ───────────────────────────────────────────────────

export interface Tower {
  geohash7: string;
  lat?: number | null;
  lng?: number | null;
  tier: number;          // 1 small · 2 tall · 3 blazing
  visitor_count: number;
  spot_names: string[];
}

export async function fetchTowers(bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number }): Promise<Tower[]> {
  const qs = new URLSearchParams();
  if (bounds) {
    qs.set("min_lng", String(bounds.minLng));
    qs.set("min_lat", String(bounds.minLat));
    qs.set("max_lng", String(bounds.maxLng));
    qs.set("max_lat", String(bounds.maxLat));
  }
  try {
    const resp = await fetch(`${API_URL}/api/heat/towers?${qs}`);
    if (!resp.ok) return [];
    return (await resp.json()).towers ?? [];
  } catch {
    return [];
  }
}

/** Manual trigger for testing; in production a cron hits this every ~15 min. */
export async function recomputeHeat(): Promise<{ ok: boolean; towers?: number } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/heat/recompute`, { method: "POST" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Rewards & redemption ─────────────────────────────────────────────────────

export interface RewardCard {
  id: string;
  spot_id: string;
  title: string;
  description: string;
  cost_points: number;
  stock?: number | null;
  terms: string;
}

export interface RedeemResult {
  ok: boolean;
  code: string;
  title: string;
  expires_at?: string | null;
  message: string;
}

export interface RedemptionCard {
  id: string;
  code: string;
  status: string;
  expires_at?: string | null;
  title: string;
  spot_name: string;
}

export async function fetchSpotRewards(spotId: string): Promise<RewardCard[]> {
  try {
    const resp = await fetch(`${API_URL}/api/rewards/spot/${spotId}`);
    if (!resp.ok) return [];
    return (await resp.json()).rewards ?? [];
  } catch {
    return [];
  }
}

export async function redeemReward(userId: string, rewardId: string): Promise<RedeemResult | null> {
  try {
    const resp = await fetch(`${API_URL}/api/rewards/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, reward_id: rewardId }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchMyRedemptions(userId: string): Promise<RedemptionCard[]> {
  try {
    const resp = await fetch(`${API_URL}/api/rewards/mine?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return [];
    return (await resp.json()).redemptions ?? [];
  } catch {
    return [];
  }
}

export async function redeemCode(code: string, spotId?: string): Promise<{ ok: boolean; reward_title: string; spot_name: string; message: string } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/rewards/redeem-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, spot_id: spotId }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function createReward(payload: {
  spot_id: string; title: string; cost_points: number; description?: string; stock?: number | null;
}): Promise<{ ok: boolean; id?: string } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/rewards/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Restaurant manager / dashboard ───────────────────────────────────────────

export interface ManagerSpot { spot_id: string; name: string; city: string; }
export interface DayCount { date: string; count: number; }
export interface DashReview {
  user_name: string; worth_it: boolean; actual_spend?: number | null; comment: string; created_at?: string | null;
}
export interface VenueProfile {
  website: string;
  menu_url: string;
  menu_photos: string[];
  deal_photos: string[];
  deal_comment: string;
  happy_hour_note: string;
}

export interface Dashboard {
  spot_id: string;
  spot_name: string;
  visits: { total: number; unique_visitors: number; repeat_visitors: number; last_7d: number; last_30d: number; daily: DayCount[] };
  reviews: { count: number; worth_it_pct: number; avg_spend?: number | null; recent: DashReview[] };
  momentum: { tier: number; visitor_count: number };
  redemptions: { issued: number; redeemed: number; points_spent: number };
  rewards: RewardCard[];
  profile: VenueProfile;
}

/** Uploads a venue photo (menu/deal) to Supabase Storage and returns a public URL. */
export async function uploadVenuePhoto(userId: string, spotId: string, kind: "menu" | "deal", file: File): Promise<string> {
  try {
    const supabase = getSupabase();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `venue/${spotId}/${kind}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("dishes").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg",
    });
    if (error) { console.error("[uploadVenuePhoto]", error.message); return ""; }
    return supabase.storage.from("dishes").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[uploadVenuePhoto]", e);
    return "";
  }
}

export async function updateVenueProfile(userId: string, spotId: string, fields: {
  name?: string; website?: string; deal_comment?: string; happy_hour_note?: string; menu_url?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/${spotId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, ...fields }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function addVenuePhoto(userId: string, spotId: string, kind: "menu" | "deal", url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/${spotId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, kind, url }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function removeVenuePhoto(userId: string, spotId: string, kind: "menu" | "deal", url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/${spotId}/photos/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, kind, url }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function getManagedSpots(userId: string): Promise<ManagerSpot[]> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/spots?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return [];
    return (await resp.json()).spots ?? [];
  } catch {
    return [];
  }
}

export async function claimSpot(userId: string, claimCode: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, claim_code: claimCode }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export async function getDashboard(userId: string, spotId: string): Promise<Dashboard | null> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/${spotId}/dashboard?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function createManagerReward(userId: string, spotId: string, payload: {
  title: string; cost_points: number; description?: string; stock?: number | null;
}): Promise<{ ok: boolean; id?: string } | null> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/${spotId}/rewards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, ...payload }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function deactivateReward(userId: string, rewardId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API_URL}/api/manager/rewards/${rewardId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    return await resp.json();
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}
