# Buco — Local Setup Guide

## Prerequisites
- Node.js 18+  
- Python 3.11+  
- [Supabase](https://supabase.com) account (free)  
- [Groq](https://console.groq.com) account (free)  
- [Yelp Fusion](https://fusion.yelp.com) API key (free)

---

## 1 — Supabase
1. Create a new project at supabase.com
2. SQL Editor → New Query → paste `supabase/migrations/001_initial_schema.sql` → Run
3. SQL Editor → New Query → paste `supabase/migrations/002_map_auth_wishlist.sql` → Run
   (adds postal codes + accurate coordinates, conversation titles, and the signup trigger)
4. Settings → API → copy Project URL, service_role key, anon key
5. Authentication → Providers → Email: for local dev, turn OFF "Confirm email"
   so sign-ups work instantly (or keep it on and confirm via email)
6. Optional but recommended for a pin-perfect snap map — re-geocode every spot:
   ```bash
   cd backend && python scripts/geocode_spots.py
   ```

---

## 2 — Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your keys
python main.py                  # → http://localhost:8000
```

---

## 3 — Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev                         # → http://localhost:3000
```

---

## 4 — Test
Open http://localhost:3000 and type: `find me cheap ramen under $15`

---

## Switching to Paid LLM
Open `backend/agent/llm.py` → comment Groq block → uncomment Claude or GPT-4o → add key to `.env` → restart backend.

---

## Deploy
- **Frontend**: `npx vercel --prod` (set NEXT_PUBLIC_API_URL to your backend URL)
- **Backend**: Render.com — start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
