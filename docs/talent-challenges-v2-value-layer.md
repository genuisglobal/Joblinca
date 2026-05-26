# Talent Challenges V2 — Value Layer

Follow-up to `talent-challenges-mvp-blueprint.md`. The MVP (challenges, submissions,
weekly leaderboard, badges, achievements, resume enrichment) is already implemented
in migration `20260306000200_talent_challenges_mvp.sql` and the `/api/skillup/*`
routes. This doc covers what to build *on top* so the system delivers real value to
talents and becomes commercially defensible.

## Guiding Principles
1. **Prizes are platform value, not cash.** Joblinca's currency is recruiter
   attention. Every prize converts that attention into something a talent feels.
2. **Failure is the product.** Most talents will *not* win. The wrong-answer →
   study-path loop is what keeps non-winners coming back, and is the lever that
   makes the academy integration matter.
3. **Recruiters must trust the signal.** If quiz badges can be gamed, recruiters
   stop filtering by them and the whole layer dies. Anti-cheating is Phase 1, not
   Phase 3.
4. **The commercial unlock is the recruiter-side filter**, not the talent-side
   gamification. Build for the recruiter buying the score, then the talent earning
   the score follows naturally.

---

## Phase A — Prize Mechanics (the reasons to compete)

All prizes below are zero-marginal-cost to Joblinca.

### A1. Featured Talent Spotlight
A 7-day pin to a *Featured Talents* carousel on recruiter discovery pages, plus a
"Top Performer" strip on the talent's public profile.

- **New table:** `talent_spotlights`
  - `id`, `user_id`, `source_type` (`weekly_winner`, `manual`, `recruiter_sponsored`)
  - `source_ref` (e.g. `talent_weekly_leaderboards.id`)
  - `domain` (mirrors challenge domain so the carousel can be domain-filtered)
  - `starts_at`, `ends_at`, `metadata jsonb`
  - unique `(user_id, source_type, source_ref)` to prevent duplicates
- **Cron extension:** in `/api/cron/skillup-weekly-leaderboard`, after writing
  `talent_weekly_leaderboards`, insert one `talent_spotlights` row per Top 3 with
  `ends_at = now + 7 days`.
- **New API:** `GET /api/recruiter/featured-talents?domain=...` — returns active
  spotlights joined to lightweight profile data.
- **UI:** strip component on the recruiter candidate search page; "Top Performer
  of the Week" banner on the public talent profile.
- **Why it works:** carousel placement on a page recruiters already visit means
  the prize is real eyeballs, not a vanity badge.

### A2. Quiz-Verified Application Boost
Winners get N "verified application" tokens. When they apply with a token, the
application carries a `quiz_verified` flag and is sorted to the top of the
recruiter's pipeline view, with a visible badge.

- **New table:** `talent_application_boosts`
  - `id`, `user_id`, `tokens_remaining int`, `granted_for` (challenge id or week),
    `expires_at`
- **Schema change:** add `applications.quiz_verified boolean default false` and
  `applications.quiz_verified_meta jsonb` (which challenge/score earned it).
- **API change:** `POST /api/applications/create` consumes a token when the user
  passes `use_boost: true`.
- **Recruiter UI:** sort default = `quiz_verified DESC, created_at DESC`; show a
  small "Quiz-Verified" chip on the row.

### A3. Auto-Intro to Matching Recruiters
When a talent wins in domain X, automatically generate a recruiter intro for any
active job in domain X they match. Uses the existing matching engine; the only
new piece is the trigger and a single template.

- **Cron extension:** after spotlight insert, find top match for each winner via
  existing matching code and create one `wa_screening_notifications`-style row or
  reuse `outreach_messages`.
- **No new tables required** — this is just a new caller of existing infra.

### A4. Streaks, Levels, Visible Progress
Retention beats prizes. Surface the progress they're already making.

- Reuse `learning_streaks` (already exists). Extend with `challenge_streak_weeks`.
- New `talent_levels` view derived from total `talent_achievements` rows by domain
  (no new table — a view keeps it cheap).
- Profile widget: "Level 3 Data Analyst · 4-week streak".

---

## Phase B — Academy & Course Integration

The MVP already has `learning_tracks` / `learning_courses` / `learning_modules`.
This phase wires them to challenges and to external providers.

### B1. External Provider Catalog
- **Schema change:** add to `learning_courses`:
  - `external_provider text` (`coursera`, `alx`, `andela`, `udemy`, `youtube`, etc.)
  - `external_url text`
  - `affiliate_code text`
  - `is_free boolean default false`
- **Seed data:** create one migration with curated rows per domain (start with
  Data, Software, Design, Sales, Customer Support — match your existing challenge
  domains).

### B2. Wrong-Answer → Course Map (the killer feature)
Every quiz question gets a fallback "if you missed this, study this" pointer,
sourced via AI suggestion + admin approval (see Confirmed Decisions above).

- **Schema:** refs live in the new `learning_module_question_refs` table — not
  inline in `quiz_questions` — so admin can moderate without editing JSON.
- **Question JSON keeps:** `id`, `prompt`, `prompt_fr`, `choices`, `choices_fr`,
  `correct`, `explain_correct`, `explain_correct_fr`. Refs are joined at query
  time where `status='approved'`.
- **API change:** `POST /api/skillup/challenges/[id]/submit` already returns
  scoring. Extend response with `recommendations: [{ question_id, refs[] }]` for
  wrong answers only, filtered to `status='approved'` and to the user's
  `preferred_language`.
- **UI:** post-quiz screen renders a "Study these to improve" panel. Free options
  surface first; paid affiliate links labeled clearly. If no approved ref exists
  for a missed question, show the `explain_correct` text alone — never show a
  pending suggestion to a talent.

### B3. Cohort Study Groups
After a quiz, talents who got <60% on the same skill get auto-grouped into a
WhatsApp/Telegram cohort for that week.

- **New table:** `study_cohorts` — `id, skill, week_key, channel_url, created_at`
- **New table:** `study_cohort_members` — `cohort_id, user_id, joined_at`
- **Cron:** weekly, after leaderboard publish — bucket by skill, create cohort,
  send WhatsApp invite to channel link.
- **MVP shortcut:** start with manual Telegram group URLs that an admin pastes;
  automate channel creation later.

### B4. Quarterly Scholarship Lottery
- Partner with one academy per quarter (no code, just outreach).
- Eligible pool = talents with ≥3 weeks of challenge participation in the quarter.
- Random draw weighted by total `talent_achievements` rows. Pure DB query, no new
  infra.

---

## Phase C — Study Aids (value during, not just after)

### C1. Adaptive Practice Mode (unranked)
Separate practice surface that re-serves missed questions on spaced repetition.

- **New table:** `talent_practice_attempts`
  - `id, user_id, question_id, challenge_id, was_correct, attempted_at, next_due_at`
- **API:** `GET /api/skillup/practice/next?domain=...` returns next-due question.
- **UI:** new tab on `/dashboard/talent/challenges` called "Practice" — no
  leaderboard pressure.

### C2. Daily WhatsApp Drill
One question per day via WhatsApp, free, opt-in. Reuses existing
`sendWhatsappTemplate` infra.

- **New Meta template:** `daily_quiz_drill_v1` with `{{1}}=question, {{2}}=link`.
- **New cron:** `/api/cron/daily-quiz-drill` at 07:00 Africa/Douala.
- **New table:** `daily_drill_subscriptions` — `user_id, domain, active`
- **Reply handling:** existing webhook recognizes `A`, `B`, `C`, `D` replies and
  records them as a `talent_practice_attempts` row.

### C3. Peer Explanations
Past winners can submit a short explanation for any question. Shown after the
talent answers (correct or not).

- **New table:** `question_explanations`
  - `id, question_id, author_user_id, text, language, upvotes, status`
- Light moderation queue in admin (`/dashboard/admin/explanations`).

### C4. Portfolio Builder
Every accepted project submission becomes a public portfolio entry.

- **Schema change:** add `talent_challenge_submissions.is_public boolean default false`
- **New public page:** `/talent/[handle]/portfolio` — lists graded project
  submissions with the rubric score visible.
- **No new tables** — reuses existing submission rows.

---

## Phase D — Recruiter-Side Commercial Unlock

### D1. Recruiter Score Filter
The feature that makes the entire quiz layer commercially valuable.

- **New API:** `GET /api/recruiter/candidates?challenge_score_min=80&domain=data&since_days=60`
- **Indexes needed:** composite on `(challenge_id, final_score desc, created_at desc)`
  on `talent_challenge_submissions`.
- **UI:** new filter section on recruiter candidate search — "Quiz-verified
  candidates" with score slider + domain selector + recency.

### D2. Recruiter-Sponsored Challenges
A recruiter pays to brand a challenge. Winner gets a guaranteed first-round
interview at that company.

- **Schema changes on `talent_challenges`:**
  - `sponsor_recruiter_id uuid references profiles(id) null`
  - `sponsor_company text null`
  - `sponsor_prize_text text null` (e.g. "Guaranteed first-round interview")
  - `sponsor_visible boolean default false`
- **New table:** `challenge_sponsor_interviews`
  - `id, challenge_id, user_id, week_key, status (offered/accepted/declined),
    interview_id (nullable, links to existing interviews table when scheduled)`
- **Cron:** after leaderboard publish, if `sponsor_recruiter_id` set, create
  `challenge_sponsor_interviews` rows for top N and notify both sides.
- **Pricing:** charge sponsoring recruiter through existing
  `subscriptions`/`payments` infra — separate one-shot SKU.

### D3. Anti-Cheating (non-negotiable for D1/D2)
- Time limits per question enforced server-side (don't trust the client).
- Question shuffling per attempt — already supported if `quiz_questions` is an
  array; ensure submit endpoint validates against the shuffled order issued.
- Device + IP fingerprint stored on `talent_challenge_submissions.metadata`;
  flag duplicates across accounts.
- Hard cap: `max_ranked_attempts=1` already exists — enforce it in the submit
  endpoint, not just the UI.
- Disqualification workflow: admin can flip submission `status='disqualified'`
  and the leaderboard cron must respect it.

---

## Suggested Shipping Order

| Sprint | Items | Why this order |
|--------|-------|----------------|
| 0 | i18n plumbing + content seed for 7 launch domains | Pre-req for everything. Without questions in the 7 domains, nothing else has anything to display. |
| 1 | A1 spotlight (Top 3 per domain) + D3 anti-cheating + access_tier flag | Make the prize real, the score trustworthy, and the free/paid gate enforceable in the same sprint. |
| 2 | B2 wrong-answer → course map + B1 external provider catalog + AI-suggestion endpoint + admin moderation queue | Turn non-winners into returning users. Retention engine. |
| 3 | D1 recruiter score filter | Commercial unlock — gives recruiters a reason to care, which feeds back into talent motivation. |
| 4 | A2 application boost + A3 auto-intro | Compound the prize: winners now also get pipeline priority and warm intros. |
| 5 | C1 adaptive practice + C2 daily WhatsApp drill | Daily-active habit loop. |
| 6 | D2 sponsored challenges (paid-plan exclusive) | Requires sales motion; build last when the platform proof is in. |
| Later | A4 levels, B3 cohorts, B4 scholarship, C3 peer explanations, C4 portfolio | Layer on once the loop above is healthy. |

## New Blockers Surfaced By These Decisions
1. **Content for 7 entry-level domains.** None of the launch domains (teacher,
   nurse, cashier, etc.) appear in the existing `learning_tracks` seed. Need
   ~30 questions × 7 domains = ~210 questions authored before any user-visible
   launch. Recommend: hire/contract a subject-matter expert per domain, or use
   AI to draft + SME to verify. SME verification is non-negotiable for
   teacher/nurse/accountant content where wrong answers cause real harm.
2. **AI translation review capacity.** EN-first with seamless FR means the
   translation queue will pile up. Decide who reviews FR translations (one
   bilingual admin? bilingual SMEs per domain?).
3. **Affiliate partnerships per domain.** Coursera/ALX may not have strong
   coverage for nursing or community field officer roles. Identify FR-language
   training partners specifically (e.g. OpenClassrooms, local nursing schools,
   IFC SME training, etc.) before B1 ships.

## Confirmed Product Decisions

### Launch Domains (7, not 5)
Pivot from generic tech skill domains to Cameroon's actual highest-volume entry-
level roles. Each becomes a `talent_challenges.domain` value:

| Domain key (EN)       | FR label                                    | Sectors                                              |
|-----------------------|---------------------------------------------|------------------------------------------------------|
| `teacher`             | Enseignant / Professeur                     | Schools, colleges, training centers                  |
| `accountant`          | Comptable / Assistant Comptable             | SMEs, NGOs, microfinance                             |
| `admin_assistant`     | Assistant Administratif                     | Offices, NGOs, schools, companies                    |
| `cashier`             | Caissier / Caissière                        | Supermarkets, shops, restaurants, microfinance       |
| `nurse`               | Infirmier / Aide-soignant                   | Hospitals, clinics, health centers, NGOs             |
| `customer_service`    | Agent Service Client / Conseiller Clientèle | Telecoms, banks, call centers                        |
| `field_officer`       | Agent de Terrain / Animateur Communautaire  | NGOs, surveys, health campaigns                      |

**Implication for content:** the existing `learning_tracks` may not cover these
roles — content acquisition (or commissioning) for these 7 domains is a blocker
for launch and should start in parallel with engineering work. Each domain needs
a starter quiz bank (~30 questions) and 1 entry-level project challenge prompt.

**Seed migration:** create `talent_challenges` rows in `draft` status for each
domain so admin UI has something to edit on day 1.

### Spotlight: Top 3 Per Domain
- Cron writes 3 spotlight rows per active domain per week → up to 21 spotlights
  active concurrently across the 7 launch domains.
- Recruiter carousel defaults to "all domains" but defaults the filter to the
  recruiter's currently-posted job domains where possible.
- Talent profile only shows the *highest-rank current spotlight* if a talent
  somehow wins in multiple domains.

### Free vs Paid Gating
Two independent flags on `talent_challenges`, both admin-controlled:

- **`access_tier text check in ('free','paid')` default `'free'`**
  Admin flips per challenge. Paid-tier challenges require an active subscription
  to even attempt; UI shows a lock + upgrade CTA.
- **`is_sponsored boolean default false`** (already covered by `sponsor_recruiter_id`
  being non-null in Phase D2)
  Sponsored challenges are *always* `access_tier='paid'` — enforce this at insert
  time via a check constraint or DB trigger.

Admin UI extension: the challenge edit page gets a "Access" section with a
radio toggle (Free / Paid) and a clear note "Sponsored challenges must be Paid".

### Course Ref Curation: AI-Suggested + Admin Approval
Two-step pipeline.

- **Schema:** add `learning_module_question_refs` table
  - `id, question_id text, module_id uuid null, external_url text null,`
    `external_provider text null, status text check in ('pending','approved','rejected'),`
    `suggested_by text check in ('ai','admin'), suggested_at, reviewed_by uuid, reviewed_at,`
    `confidence numeric null, notes text`
  - This replaces the inline `study_refs[]` in `quiz_questions` JSON from B2.
  - Question on the quiz only renders refs where `status='approved'`.
- **AI job:** new endpoint `POST /api/admin/skillup/suggest-refs` that, given a
  question + its correct answer + the available `learning_courses`/external
  catalog, calls the LLM to propose 1–3 refs per question with a confidence score.
  Rows written with `status='pending'`.
- **Admin moderation queue:** new page `/dashboard/admin/study-refs` lists pending
  rows with question preview + suggested ref + LLM rationale; approve / reject /
  edit. Bulk-approve high-confidence rows.
- **Cron / batch:** when a new challenge moves from `draft` → `active`, enqueue
  suggestion generation for every question that has no approved refs yet.

### Languages: EN-first launch, FR-seamless from day one
Goal stated: "users have a seamless experience in their language of choice
between English and French without even knowing whether the site is one or the
other." This is achievable but requires discipline.

- **User preference:** add `profiles.preferred_language text check in ('en','fr')
  default 'en'` if not already present (`profiles` likely has it via i18n — verify
  before adding).
- **Resolver rule (server- and client-side):** for any localized field,
  `localized(field) = profile.preferred_language === 'fr' ? (field_fr ?? field) : field`.
  Never show mixed-language content in one block.
- **Existing fields already bilingual:** `talent_challenges.title_fr`,
  `description_fr` — keep using them.
- **Extend bilingual coverage to:**
  - `quiz_questions[].prompt_fr`, `choices_fr`, `explain_correct_fr`
  - `talent_achievements.title_fr`, `description_fr`
  - `learning_module_question_refs` (if a ref is a YouTube link, store an `fr` URL
    when one exists)
- **Translation pipeline:** EN authored first. AI-translate to FR at creation
  time, queue for admin review with a `translation_status` column.
  Approved-only FR text is served. No untranslated FR ever shown to users.
- **Fallback rule:** if FR is missing/unapproved, server returns EN *with a
  silent flag in the response* (`served_language: 'en_fallback'`) — UI doesn't
  show a language switcher mid-content; the fallback is invisible.
- **What this means for launch:** ship EN content + the i18n plumbing + the
  translation queue at the same time. FR can light up domain-by-domain as
  translations land, without any code changes.

## Repo Touchpoints (expected)
- New migrations in `supabase/migrations/` for spotlights, boosts, practice
  attempts, sponsor interviews, explanations, cohorts, drill subscriptions.
- Extend `app/api/cron/skillup-weekly-leaderboard/route.ts` for spotlight +
  intro + cohort creation.
- New routes under `app/api/recruiter/featured-talents/`,
  `app/api/recruiter/candidates/` (filter extension),
  `app/api/skillup/practice/`, `app/api/cron/daily-quiz-drill/`.
- Extend `lib/whatsapp.ts` with the daily drill template helper.
- Extend recruiter candidate search UI + talent challenge result UI.
- Extend admin tools: explanation moderation, sponsored-challenge creation.
