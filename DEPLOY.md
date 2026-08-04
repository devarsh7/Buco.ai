# Deploying Buco (backend on Render, frontend on Vercel)

Goal: one `git push` updates both. Vercel already auto-deploys the frontend;
this connects the FastAPI backend to Render so it deploys the same way. Render
runs a real long-lived server, so the streaming chat (SSE) keeps working.

---

## 1. Deploy the backend to Render (one-time setup)

1. Push the repo (it now contains `render.yaml` at the root and the CORS change).
2. Go to **https://dashboard.render.com → New → Blueprint**.
3. Connect your GitHub repo (`devarsh7/Buco.ai`). Render reads `render.yaml`
   and proposes a service named **buco-api**. Click **Apply**.
4. Open **buco-api → Environment** and fill in the secrets (these are `sync: false`
   in the blueprint, so Render leaves them blank for you):

   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | your Supabase project URL |
   | `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → **service_role** key |
   | `SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon** key |
   | `GROQ_API_KEY` | your Groq key |
   | `YELP_API_KEY` | your Yelp Fusion key |
   | `UPSTASH_REDIS_URL` | your Upstash Redis URL (or leave blank to disable caching) |
   | `FRONTEND_URL` | your Vercel URL, e.g. `https://bucoai.vercel.app` |
   | `HEAT_CRON_KEY` | any long random string |
   | `ADMIN_KEY` | any long random string |

5. Save. Render builds and deploys. When it's live you'll get a URL like
   **`https://buco-api.onrender.com`** — open `…/health`, it should return `{"status":"ok",...}`.

> Free tier note: the free instance sleeps after ~15 min idle, so the first
> request after a nap takes ~30s to wake. Fine for testing; upgrade for always-on.

---

## 2. Point the frontend at the backend (one-time)

1. In **Vercel → your project → Settings → Environment Variables**, set:

   `NEXT_PUBLIC_API_URL = https://buco-api.onrender.com`

   (Production, Preview, and Development — all three.)
2. **Redeploy** the frontend (Deployments → ⋯ → Redeploy, or just push a commit).

That's it — every API call in the app reads `NEXT_PUBLIC_API_URL`, so this single
variable repoints the whole site from `localhost` to Render. Now it works on your phone.

---

## 3. Keep the towers fresh (optional but recommended)

Towers only update when heat is recomputed. Two options:

- **Easiest (free):** create a free job at **https://cron-job.org** that every
  15 min sends `POST https://buco-api.onrender.com/api/heat/recompute` with header
  `X-Cron-Key: <your HEAT_CRON_KEY>`.
- **Render cron** (paid instances): add a Cron Job service running
  `python scripts/recompute_heat.py` on schedule `*/15 * * * *`.

---

## 4. From now on

`git push` → Vercel redeploys the frontend **and** Render redeploys the backend,
both from the same commit. No more restarting a local server.

Before your first deploy, make sure all migrations `001`–`009` have been run in
Supabase (the DB is shared between local and prod).
