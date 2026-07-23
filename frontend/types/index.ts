export interface Spot {
  id: string;
  name: string;
  category: string;
  cuisine_tags: string[];
  address: string;
  city: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  price_min?: number;
  price_max?: number;
  price_label: string;
  distance_km?: number;
  phone: string;
  website: string;
  image_url: string;
  rating?: number;
  buco_pick: boolean;
  buco_score?: number;
  is_open?: boolean;
  happy_hour_now?: boolean;
  happy_hour_label?: string;
  source: "yelp" | "curated";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  spots?: Spot[];
  timestamp: string; // ISO string — safe for localStorage persistence
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string; // bookmark id
  note: string;
  visited: boolean;
  created_at: string;
  spot: Spot;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export type AppView = "map" | "wishlist";

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type SSEEvent =
  | { type: "text";  content: string }
  | { type: "spots"; spots: Spot[] }
  | { type: "done" }
  | { type: "error"; message: string };
