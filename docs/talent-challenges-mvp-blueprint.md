# Talent Challenges MVP Blueprint

## Goal
Add weekly talent quizzes and project challenges that:
- build relevant, practical experience
- rank top performers weekly
- write achievements to profile and resume data
- expose achievement signals to recruiters

## Existing Foundation (already in repo)
- Skill learning content + quiz engine:
  - `learning_tracks`, `learning_courses`, `learning_modules.quiz_questions`, `learning_progress`, `learning_streaks`
  - API: `/api/skillup/progress`, `/api/skillup/progress/complete`, `/api/skillup/tracks`, `/api/skillup/courses/[courseId]`
- Achievement primitives:
  - `user_badges` table with metadata support
  - existing `BadgeGrid` rendering in recruiter application view
- Talent achievements page exists:
  - `/dashboard/talent/achievements`
- Resume model supports certifications list:
  - `ResumeData.certifications`

## Product Design
### Challenge Types
1. Quiz Challenge
- timed objective quiz (MCQ)
- auto-scored
- weekly ranked

2. Project Challenge
- prompt + deliverables (text, github url, file url)
- rubric scoring
- can be auto + manual moderated
- weekly ranked

### Weekly Top Performer
- Ranking period: Monday 00:00 to Sunday 23:59 (Africa/Douala)
- Publish: Monday morning snapshot
- Public surfaces:
  - Talent profile badge
  - Talent achievements page
  - Recruiter candidate view (existing badge section)
- Resume integration:
  - append challenge achievements into `certifications` section when exporting/saving

## Data Model (new tables)
1. `talent_challenges`
- `id uuid pk`
- `slug text unique`
- `title text not null`
- `title_fr text`
- `description text`
- `description_fr text`
- `challenge_type text check in ('quiz','project')`
- `domain text` (data, design, product, etc.)
- `difficulty text check in ('beginner','intermediate','advanced')`
- `starts_at timestamptz`
- `ends_at timestamptz`
- `timezone text default 'Africa/Douala'`
- `status text check in ('draft','active','closed','published')`
- `max_ranked_attempts int default 1`
- `config jsonb default '{}'` (quiz settings / rubric)
- `created_by uuid references profiles(id)`
- `created_at`, `updated_at`

2. `talent_challenge_submissions`
- `id uuid pk`
- `challenge_id uuid references talent_challenges(id)`
- `user_id uuid references profiles(id)`
- `attempt_no int not null`
- `answers jsonb` (quiz answers)
- `project_submission jsonb` (urls, text, files)
- `auto_score numeric`
- `manual_score numeric`
- `final_score numeric`
- `status text check in ('draft','submitted','graded','disqualified')`
- `graded_by uuid references profiles(id)`
- `graded_at timestamptz`
- `metadata jsonb default '{}'`
- `created_at`, `updated_at`
- unique `(challenge_id, user_id, attempt_no)`

3. `talent_weekly_leaderboards`
- `id uuid pk`
- `week_key text` (e.g. `2026-W10`)
- `week_start date`
- `week_end date`
- `challenge_id uuid references talent_challenges(id)`
- `user_id uuid references profiles(id)`
- `rank int`
- `score numeric`
- `tie_breaker numeric default 0`
- `published_at timestamptz`
- unique `(week_key, challenge_id, user_id)`
- index `(week_key, rank)`

4. `talent_achievements` (normalized profile achievements)
- `id uuid pk`
- `user_id uuid references profiles(id)`
- `source_type text` (`challenge_weekly_top`, `challenge_completion`, `course_completion`, etc.)
- `title text`
- `description text`
- `issuer text default 'Joblinca'`
- `issued_at timestamptz`
- `expires_at timestamptz null`
- `metadata jsonb default '{}'`
- index `(user_id, issued_at desc)`

## RLS & Access
- Participants can read active challenges, and only manage their own submissions.
- Admin/staff can create challenges, grade project submissions, publish leaderboards.
- Recruiters can read challenge badges/achievements for candidates who applied to their jobs (same model used for `user_badges`).

## APIs (MVP)
1. Participant APIs
- `GET /api/skillup/challenges?status=active`
- `GET /api/skillup/challenges/[id]`
- `POST /api/skillup/challenges/[id]/submit` (quiz/project)
- `GET /api/skillup/challenges/[id]/my-submissions`
- `GET /api/skillup/leaderboard?week=YYYY-Www`
- `GET /api/skillup/achievements/me`

2. Admin APIs
- `POST /api/admin/skillup/challenges`
- `PATCH /api/admin/skillup/challenges/[id]`
- `POST /api/admin/skillup/challenges/[id]/grade/[submissionId]`
- `POST /api/admin/skillup/leaderboard/publish?week=YYYY-Www`

3. Resume Integration API
- `POST /api/resume/enrich-achievements`
- reads `talent_achievements` + selected `user_badges`
- returns normalized `ResumeData.certifications[]` additions

## UI Screens (MVP)
1. Talent
- `/dashboard/talent/challenges`
  - Active challenge cards
  - Attempt status + remaining attempts
- `/dashboard/talent/challenges/[id]`
  - Quiz runner or project submission form
- `/dashboard/talent/leaderboard`
  - Weekly leaderboard + domain filters
- Extend `/dashboard/talent/achievements`
  - Include challenge achievements + badges + certificates

2. Recruiter Visibility
- Keep current badge block in recruiter application detail
- Add challenge-specific labels in badge names/metadata
  - e.g. `Top Performer - Data Analysis (Week 2026-W10)`

3. Profile
- Add "Top Performer of the Week" strip on talent profile when current-week badge exists

## Weekly Job Pattern
Use the same cron pattern already in repo (`vercel.json` + `/api/cron/*`):
- New cron route: `/api/cron/skillup-weekly-leaderboard`
- Schedule: Monday 07:00 Africa/Douala (06:00 UTC normally)
- Steps:
  1. close previous week challenge windows
  2. compute top N per challenge
  3. snapshot into `talent_weekly_leaderboards`
  4. write `talent_achievements`
  5. upsert `user_badges`
  6. optional WhatsApp notification hook for winners

## Scoring Rules (safe MVP)
1. Quiz
- `final_score = auto_score`
- tie-break: faster completion time wins

2. Project
- `final_score = 0.6 * manual_score + 0.4 * auto_score` (configurable)
- tie-break: earlier submit time + rubric completeness

3. Anti-abuse
- limit ranked attempts (`max_ranked_attempts=1` default)
- disqualify duplicate content by simple similarity hash flag in metadata
- staff override workflow for disputes

## Rollout Plan
Phase 1 (1-2 weeks)
- DB migrations + participant quiz challenges + weekly leaderboard snapshot + badge/achievement writes

Phase 2 (1-2 weeks)
- project challenge submissions + grading UI + mixed scoring

Phase 3
- resume auto-enrichment endpoint + profile widgets + WhatsApp winner announcements

## Repo Touchpoints (expected)
- New migrations in `supabase/migrations`
- New APIs under `app/api/skillup/challenges/*`, `app/api/skillup/leaderboard/*`, `app/api/cron/skillup-weekly-leaderboard`
- Talent pages under `app/dashboard/talent/challenges/*` and `app/dashboard/talent/leaderboard/page.tsx`
- Achievements extension in `app/dashboard/talent/achievements/page.tsx`
- Resume enrichment hook in `app/api/resume/*` and `lib/resume.ts`
- Optional badge UI extension in `app/dashboard/skillup/components/BadgeGrid.tsx`

## Acceptance Criteria
- Talent can complete quiz challenge and appear in weekly leaderboard
- Monday cron creates published weekly ranking snapshot
- Top performers receive badge + achievement row
- Recruiter sees challenge badge on applicant details
- Resume enrichment includes latest top performer achievements
