import os
import json
import time
import redis
from functools import lru_cache

CACHE_TTL_SEARCH  = 3600   # 1 hour  — search results
CACHE_TTL_SPOT    = 86400  # 24 hours — individual spot details
CACHE_TTL_SESSION = 1800   # 30 min  — conversation sessions

# In-process fallback cache used when Redis isn't configured. Keeps repeat
# searches from re-hitting Yelp (500 free calls/day) and the LLM tools.
_MEMORY_CACHE: dict[str, tuple[float, str]] = {}
_MEMORY_CACHE_MAX = 500


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis | None:
    url = os.getenv("UPSTASH_REDIS_URL")
    if not url:
        print("[Redis] UPSTASH_REDIS_URL not set — caching disabled")
        return None
    try:
        client = redis.from_url(url, decode_responses=True)
        client.ping()
        return client
    except Exception as e:
        print(f"[Redis] connection failed: {e} — caching disabled")
        return None


def cache_get(key: str) -> dict | list | None:
    client = get_redis_client()
    if not client:
        entry = _MEMORY_CACHE.get(key)
        if entry and entry[0] > time.time():
            return json.loads(entry[1])
        _MEMORY_CACHE.pop(key, None)
        return None
    try:
        value = client.get(key)
        return json.loads(value) if value else None
    except Exception:
        return None


def cache_set(key: str, value: dict | list, ttl: int = CACHE_TTL_SEARCH) -> None:
    client = get_redis_client()
    if not client:
        if len(_MEMORY_CACHE) >= _MEMORY_CACHE_MAX:
            oldest = min(_MEMORY_CACHE, key=lambda k: _MEMORY_CACHE[k][0])
            _MEMORY_CACHE.pop(oldest, None)
        _MEMORY_CACHE[key] = (time.time() + ttl, json.dumps(value))
        return
    try:
        client.setex(key, ttl, json.dumps(value))
    except Exception as e:
        print(f"[Redis] cache_set error: {e}")


def cache_delete(key: str) -> None:
    client = get_redis_client()
    if not client:
        _MEMORY_CACHE.pop(key, None)
        return
    try:
        client.delete(key)
    except Exception:
        pass


def make_search_cache_key(query: str, city: str, price_max: float | None) -> str:
    safe      = query.lower().strip().replace(" ", "_")
    safe_city = city.lower().replace(" ", "_").replace(",", "")
    price_str = str(int(price_max)) if price_max else "any"
    return f"search:{safe_city}:{safe}:{price_str}"
