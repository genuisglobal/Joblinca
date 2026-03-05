# WhatsApp AI Recruiter Design (Phase 1 First)

## Scope
Implement a WhatsApp screening flow that:
- accepts inbound WhatsApp messages through the existing webhook;
- runs a deterministic screening state machine;
- stores answers, scoring, and recruiter-facing screening records in Supabase;
- enforces WhatsApp apply limits by account tier;
- exposes results to recruiters in the dashboard;
- notifies recruiters through multiple channels (dashboard record first, channel fanout-capable schema).

Phase 1 excludes AI generation/summarization logic and keeps all behavior deterministic.

## Product Decisions (Confirmed)
1. Entry points: all (`reply to alert`, `APPLY <jobId>`, short link/QR deep link).
2. Identity mapping: match by existing phone where possible; otherwise continue with unmatched identity and prompt.
3. Screening catalog: hybrid (fixed must-have questions + optional follow-up slots).
4. Scoring: both must-have gate + weighted score (/100).
5. Recruiter notification: multiple channels.
6. Languages: user selects language.
7. Abuse/rate limiting:
- Free users: max 1 WhatsApp application/day.
- Paid users: max 10 WhatsApp applications/day.
- Extra applies are redirected to website or upgrade path.

## Existing Integration Points
- Webhook route: `app/api/whatsapp/webhook/route.ts`
- WhatsApp API client: `lib/whatsapp.ts`
- WhatsApp DB persistence: `lib/whatsapp-db.ts`
- Existing message logs: `whatsapp_logs`, `wa_conversations`, `wa_statuses`
- Jobs/applications models: `jobs`, `applications`, `profiles`, `subscriptions`, `pricing_plans`

## Phase 1 Data Model

### New tables
1. `wa_screening_sessions`
- One active screening session per phone+job+day entry.
- Tracks state, selected language, question cursor, and final score.

2. `wa_screening_answers`
- Normalized answer rows per session and question key.
- Includes score contribution and must-have evaluation flags.

3. `wa_screening_events`
- Append-only event log for state transitions, prompts, and inbound actions.
- Stores idempotency keys (`wa_message_id`) for replay safety.

4. `wa_screening_notifications`
- Outbound recruiter notification queue/log (dashboard, email, whatsapp channels).
- Enables multi-channel fanout and retries.

### Relationships and keys
- `wa_screening_sessions.wa_conversation_id -> wa_conversations.id`
- `wa_screening_sessions.job_id -> jobs.id`
- `wa_screening_sessions.recruiter_id -> profiles.id`
- `wa_screening_sessions.user_id -> profiles.id` (nullable, matched identity)
- `wa_screening_answers.session_id -> wa_screening_sessions.id`
- `wa_screening_events.session_id -> wa_screening_sessions.id`
- `wa_screening_notifications.session_id -> wa_screening_sessions.id`

### RLS strategy
- Service-role full access policies for webhook/server processing.
- Recruiter read policies on session/answers/events/notifications where `recruiter_id = auth.uid()`.
- No public write paths.

## State Machine (Phase 1)

### States
- `idle`
- `awaiting_language`
- `awaiting_job_reference`
- `awaiting_consent`
- `awaiting_question`
- `completed`
- `quota_blocked`
- `cancelled`

### Transitions
1. `idle -> awaiting_language`
- Trigger: inbound starts an apply flow or command.
- Bot asks language (e.g., `LANG EN` or `LANG FR`).

2. `awaiting_language -> awaiting_job_reference`
- Trigger: valid language selection.
- Bot asks for `APPLY <jobId>` or recognized job short-link.

3. `awaiting_job_reference -> quota_blocked`
- Trigger: daily limit exceeded by resolved user tier.

4. `awaiting_job_reference -> awaiting_consent`
- Trigger: valid job and daily quota available.
- Bot asks for consent to continue screening.

5. `awaiting_consent -> awaiting_question`
- Trigger: positive consent.
- Bot starts question sequence.

6. `awaiting_question -> awaiting_question`
- Trigger: answer accepted; next question exists.

7. `awaiting_question -> completed`
- Trigger: last required question answered.
- Session computes must-have gates and weighted score; notification records created.

8. Any active state -> `cancelled`
- Trigger: `STOP`, `CANCEL`, or explicit opt-out command.

## Screening Catalog and Scoring

### Catalog structure
- `must_have`: fixed deterministic questions with pass/fail validators.
- `weighted`: fixed weighted questions (+ optional follow-up slots).
- Job category mapping from existing job fields (title/job_type/work_type keywords).

### Score output
- `must_have_passed` boolean.
- `weighted_score` integer 0..100.
- `score_breakdown` jsonb with per-question contributions.
- Recommendation bands:
  - `qualified` (must-have pass and score >= threshold)
  - `review` (must-have pass, lower score)
  - `reject` (must-have fail)

## Identity Mapping
- Normalize WA number to E.164.
- Match to `profiles.phone` (normalized compare).
- If found, attach `user_id` to session.
- If not found, keep `user_id = null` and continue as WhatsApp-only candidate.

## Daily Quota Rules
- If no matched user: treat as free tier (limit 1/day).
- If matched user with active paid subscription relevant to job-seeker/talent flow: limit 10/day.
- Count scope: completed WhatsApp screenings for same user (or phone if unmatched) on current UTC date.

## Entry Point Handling
- Reply to alert: if context/referral includes job reference, use directly.
- `APPLY <jobId>` command: direct job selection.
- Short link/QR: parse job reference from message text or referral URL payload.
- If unresolved, route to `awaiting_job_reference`.

## Webhook Performance and Idempotency
- Keep signature verification mandatory in production.
- Continue existing `whatsapp_logs.wa_message_id` dedupe.
- Add session/event-level idempotency:
  - ignore inbound already recorded in `wa_screening_events` by `wa_message_id`.
- Never throw past top-level webhook handler; always ACK `200 OK`.
- Structured logs with safe fields only (no secrets/tokens).

## Security Checks
- Verify Meta `X-Hub-Signature-256`.
- Admin-protect test/simulation endpoints.
- No secret values in logs.
- Validate all inbound user-controlled strings (length bounds and allowlist where needed).
- Ensure recruiter-only read access for screening outputs.

## Notification Model (Phase 1)
- Always create `dashboard` notification records on completion.
- Create channel records for `email` and `whatsapp` where recruiter contact exists.
- Phase 1 persists and exposes channel statuses; fanout delivery execution can be retried by worker/cron.

## Dashboard Exposure (Phase 1)
- Recruiter page to list WhatsApp screening sessions with:
  - candidate phone / matched user;
  - job, state, must-have result, weighted score, created/completed timestamps.
- detail view includes answers + breakdown + notification statuses.

## Testability Plan (Local + Vercel)

### Local
1. Run migrations.
2. Use protected simulation endpoint to post fake inbound message payloads.
3. Verify:
- state transitions in DB;
- idempotency on repeated `wa_message_id`;
- quota block behavior for free/paid scenarios;
- session completion and notification rows.

### Vercel/Meta
1. Confirm webhook verification and signature pass.
2. Trigger inbound from real WhatsApp sandbox number.
3. Verify logs show quick ACK and processing without uncaught errors.
4. Verify recruiter dashboard displays completed screenings.

## Phase 2 (Implemented)

### AI summary
- Trigger: when a screening session reaches `completed`.
- Behavior:
  - sets `ai_summary_status = pending` then attempts AI generation;
  - writes recruiter-facing AI summary + recommendation + strengths + risks;
  - records model + token usage + error metadata;
  - falls back safely to `skipped`/`failed` without breaking webhook flow.
- Manual re-run:
  - `POST /api/whatsapp/screening/:id/ai-summary` (authenticated recruiter owner or admin via existing RLS).

### AI follow-up question (optional)
- Flag: `WA_SCREENING_AI_FOLLOWUP_ENABLED=true`.
- Behavior:
  - adds one optional AI-generated question to the end of the fixed catalog;
  - stores metadata in `ai_followup_generated` and `ai_followup_question`;
  - does not affect weighted score (weight=0 question).

### Required environment
- `OPENAI_API_KEY` for AI summary generation.
- `WA_SCREENING_AI_FOLLOWUP_ENABLED=true` (optional).

## Phase 3 (Implemented)

### Idempotency hardening
- Notification enqueue is now upserted by `(session_id, channel)` to avoid duplicate recruiter fanout rows.
- Screening progression/completion transitions use expected-state updates to reduce race-condition double-processing.
- Migration adds:
  - `wa_screening_notifications_session_channel_uidx` unique index,
  - retry-oriented partial index `wa_screening_notifications_retry_idx`,
  - duplicate cleanup before uniqueness enforcement.

### Retry operations
- New service operation:
  - `processPendingWhatsAppScreeningNotifications({ limit, maxAttempts })`
  - retries `pending/failed` notification rows with bounded attempts.
- New protected endpoint:
  - `POST /api/whatsapp/screening/retry-notifications`
  - auth: active admin session OR `Authorization: Bearer ${WA_SCREENING_RETRY_TOKEN}`.

### Recruiter analytics
- Recruiter WhatsApp screening list now includes:
  - qualified/review/reject counts,
  - average completed score,
  - AI completion coverage and failure count,
  - AI status badges per session row.

## Future
- Add email channel implementation + dead-letter queue for failed notification rows.
- Add time-series analytics and filtering (job/date/channel) for recruiter/admin reporting.
