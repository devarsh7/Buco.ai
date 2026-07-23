"""
Geocode every spot in the Supabase `spots` table via OpenStreetMap Nominatim
and write exact lat/lng + postal_code back.

Usage (from the backend/ folder, venv active):
    python scripts/geocode_spots.py

Respects Nominatim's 1 req/sec rate limit. Free, no API key needed.
"""

import os
import sys
import time

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db.supabase import get_supabase_client  # noqa: E402

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "Buco-Budget-Concierge/0.1 (geocoding seed data)"}


def geocode(address: str, city: str) -> dict | None:
    params = {
        "street": address,
        "city": city,
        "country": "Canada",
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": 1,
    }
    resp = httpx.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    results = resp.json()
    if not results:
        return None
    r = results[0]
    return {
        "lat": round(float(r["lat"]), 6),
        "lng": round(float(r["lon"]), 6),
        "postal_code": r.get("address", {}).get("postcode", ""),
    }


def main():
    client = get_supabase_client()
    spots = client.table("spots").select("id, name, address, city").execute().data or []
    print(f"Geocoding {len(spots)} spots...\n")

    updated, failed = 0, 0
    for spot in spots:
        try:
            result = geocode(spot["address"], spot["city"])
            if result:
                update = {"lat": result["lat"], "lng": result["lng"]}
                if result["postal_code"]:
                    update["postal_code"] = result["postal_code"]
                client.table("spots").update(update).eq("id", spot["id"]).execute()
                print(f"  ✓ {spot['name']:30s} → {result['lat']}, {result['lng']}  {result['postal_code']}")
                updated += 1
            else:
                print(f"  ✗ {spot['name']:30s} → no result for '{spot['address']}, {spot['city']}'")
                failed += 1
        except Exception as e:
            print(f"  ✗ {spot['name']:30s} → {e}")
            failed += 1
        time.sleep(1.1)  # Nominatim rate limit

    print(f"\nDone. {updated} updated, {failed} failed.")


if __name__ == "__main__":
    main()
