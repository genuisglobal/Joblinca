# Talent Challenges MVP - Validation Checklist

## 1) Local Setup
- Run migration:
  - `supabase db push` (or apply `supabase/migrations/20260306000200_talent_challenges_mvp.sql`)
- Build + typecheck:
  - `npm run lint`
  - `npm run build`
- Run challenge helper tests:
  - `npm run test:skillup-challenges`

## 2) Admin API Smoke Tests
- Create challenge:
  - `POST /api/admin/skillup/challenges`
  - Required: `title`, `challenge_type`, `starts_at`, `ends_at`
  - Confirm row in `talent_challenges`
- Update challenge:
  - `PATCH /api/admin/skillup/challenges/[id]`
  - Confirm status transitions (`draft -> active`)
- Grade submission:
  - `POST /api/admin/skillup/challenges/[id]/grade/[submissionId]`
  - Confirm `manual_score`, `final_score`, `graded_by`, `graded_at`

## 3) Participant Flow Tests
- Open list:
  - `GET /api/skillup/challenges?status=active`
- Open detail:
  - `GET /api/skillup/challenges/[id]`
- Submit quiz:
  - `POST /api/skillup/challenges/[id]/submit` with `answers`
  - Confirm auto score and graded status
- Submit project:
  - `POST /api/skillup/challenges/[id]/submit` with all 3 deliverables:
    - `summary_text`
    - `github_url`
    - `file_url`
  - Confirm accepted and marked `submitted`
- My submissions:
  - `GET /api/skillup/challenges/[id]/my-submissions`

## 4) Leaderboard + Achievements Tests
- Publish manually:
  - `POST /api/admin/skillup/leaderboard/publish`
  - Optional body: `week`, `challengeId`, `topN`, `notifyWhatsapp`
- Verify writes:
  - `talent_weekly_leaderboards` rows created (Top 10 default)
  - `talent_achievements` upserted (`source_key` unique)
  - `user_badges` inserted for winners
- Read leaderboard:
  - `GET /api/skillup/leaderboard?week=YYYY-Www`
- Read my achievements:
  - `GET /api/skillup/achievements/me`

## 5) Dashboard UI Checks
- Talent sidebar shows:
  - `/dashboard/talent/challenges`
  - `/dashboard/talent/leaderboard`
- Talent challenge page:
  - can submit quiz/project
  - attempt limit displayed
- Talent leaderboard page:
  - week filter + grouped challenge tables
- Talent achievements page:
  - challenge highlights + badge collection
- Recruiter application detail:
  - challenge highlights visible for applicant

## 6) Resume Enrichment
- Call:
  - `POST /api/resume/enrich-achievements`
- Confirm response includes:
  - `additions`
  - `merged_certifications`
  - challenge achievements + badges transformed to certification entries

## 7) Cron + Production Rollout
- `vercel.json` includes:
  - `/api/cron/skillup-weekly-leaderboard` on `0 6 * * 1` (UTC)
- Verify cron auth:
  - route rejects missing/invalid cron auth
- Verify first production run:
  - `GET /api/cron/skillup-weekly-leaderboard` (authorized)
  - confirm summary counts and DB rows

## 8) WhatsApp Winner Notification Checks
- Ensure envs are present:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
- Ensure winners have `wa_leads.linked_user_id` + `phone_e164`
- Publish leaderboard with `notifyWhatsapp=true`
- Confirm:
  - outbound message row in WhatsApp logs tables
  - messages received by winners

## 9) Known Non-blocking Notes
- Existing unrelated lint warnings (`<img>`, hook deps) remain in repo.
- Existing unrelated `npm run test:wa-agent` currently has a failing NLP test (`recruiter intent parse` suite expects `talent`), not introduced by this change set.
