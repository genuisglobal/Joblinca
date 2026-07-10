---
name: verify
description: How to run and verify Joblinca locally
---

# Verifying Joblinca

## Launch
- `npm run dev` from the repo root → Next.js 14 on http://localhost:3000 (~7s boot). `.env.local` is picked up automatically.
- Every route is locale-prefixed by middleware: `GET /resume` 307-redirects to `/en/resume`. Use `curl -L` or hit `/en/...` directly. API routes under `/api/` are NOT locale-prefixed.

## Env gotchas
- `.env.local` has Supabase (likely the production project — do not write test data) but NO `OPENAI_API_KEY` and NO Upstash vars.
  - AI routes (`/api/resume/optimize`, `/api/resume/ats-score`, parse's smart path) return 503 "AI service not configured" / fall back locally.
  - Rate limiting uses the in-memory fallback (per-process, resets on restart) — exercisable in dev.

## Flows worth driving
- `/en/resume` — CV builder landing (public, client component; SSR HTML contains "CV Builder", "Upload Existing Resume").
- Resume APIs: `saved` (GET/DELETE), `saved/[id]/attach`, `optimize`, `generate`, `save` all require auth → 401 anon. `parse` and `ats-score` are anon-allowed but IP rate-limited (5/h and 10/h).
- Rate limits are easy to hit while testing parse (5/h per IP) — restart the dev server to reset the in-memory counter.

## Auth-gated UI
- No test credentials available; Supabase project appears shared with prod. Don't create accounts or rows. Auth flows (save resume, My Resumes, attach-to-application) need a real session — verify in staging or with the user's own login via browser.
