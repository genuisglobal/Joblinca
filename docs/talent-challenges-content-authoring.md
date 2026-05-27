# Talent Challenges — Content Authoring Plan

Companion to `talent-challenges-v2-value-layer.md`. The platform is built.
This doc covers **what goes inside the quizzes**: how questions get
authored, how we keep them honest, and how they evolve.

## Goals

1. **Cameroon-real.** Questions and scenarios that reference real Cameroonian
   employers, currencies, regulations, languages, and workplace conditions —
   not generic global content translated into French.
2. **Challenging but fair.** A talent who scores in the top 10 on the
   accountant quiz must genuinely be better at accounting work than the rest
   — not better at trivia, not better at French, not better at guessing the
   author's intent.
3. **Dynamic.** Content rots. As OHADA standards update, as MTN restructures,
   as the MOH publishes new protocols, the quiz must update. We build for
   versioned content from day one, not as an afterthought.

## Non-goals

- Encyclopedic coverage of any field. We're testing job readiness, not
  certifying expertise.
- Cultural-fit or values-fit questions. Recruiters can vet that themselves;
  we don't want to be the platform that filtered out a great cashier
  because of a vague "professionalism" question.
- Pidgin/Camfranglais content. Formal job contexts run in EN or FR; mixing
  in informal registers tests language ability, not job skill.

---

## Part 1 — Making questions Cameroon-real

Every question should pass the "would this actually happen on a Cameroonian
job site this year?" test. Concrete tactics per domain:

### Cross-cutting realism elements
- **Currency:** FCFA, not USD or EUR, except where a multinational employer
  explicitly uses another currency.
- **Employers:** Named scenarios reference real companies a talent could
  plausibly work for. Rotate so we're not advertising any single one.
- **Geography:** Mix of Douala, Yaoundé, Bafoussam, Bamenda, Buea, Limbe,
  Garoua, Maroua. Avoid Douala-only bias.
- **Infrastructure realities:** Power outages, network interruptions,
  paper-vs-digital workflows, two-language workplaces, OHADA bookkeeping
  framework. These ARE the job; ignore them at your peril.

### Per-domain anchors

| Domain | Real employers / contexts | Regulations / frameworks | Common dilemmas to test |
|--------|---------------------------|--------------------------|-------------------------|
| `teacher` | Public schools (MINESEC), private schools, vocational centres, training NGOs (Plan, UNICEF programmes) | National curriculum, MINEDUB / MINESEC guidance, school year calendar | Class management with limited materials, mixed-ability streams, bilingual instruction |
| `accountant` | SMEs, microfinance (CamCCUL members, EMF), NGOs, schools, retail chains | OHADA SYSCOHADA chart of accounts, DGI tax filings (TVA, IRPP, CNPS), VAT thresholds | Reconciling cash vs bank, monthly close, expense categorization, supplier reconciliation |
| `admin_assistant` | NGOs, ministries, embassies, SMEs, schools | Procurement workflows, document retention, OHADA basics for non-accountants | Triaging requests, scheduling across time zones, handling sensitive documents |
| `cashier` | Supermarkets (Casino, Mahima, Score), gas stations, restaurants, microfinance teller | Cash handling SOPs, mobile money (MTN MoMo, Orange Money) reconciliation | End-of-day cash variance, suspected counterfeit, mobile-money disputes, queue management |
| `nurse` | Public hospitals (Laquintinie, Central), mission hospitals, private clinics, NGO health programmes | MOH protocols, vital signs ranges, infection control, vaccination schedules (PEV) | Triage in overcrowded OPD, drug reconciliation, communicating with non-French/non-English-speaking patients |
| `customer_service` | Telecom (MTN, Orange, Camtel), banks (Ecobank, SGC, Afriland), utilities (ENEO, CDE), insurance | Internal SLAs, complaint escalation, KYC basics | De-escalating a network-outage call, handling an angry customer, switching languages mid-call |
| `field_officer` | NGOs (Plan, CARE, MSF), health campaigns (PEV, malaria nets), polling, market research, microfinance loan officers | Household-survey ethics, informed consent, data quality checks, GPS protocols | Refused interview, suspected fraud during data collection, safety in remote areas |

### Anti-patterns to refuse
- "Who is the current Minister of Health?" → measures recall of names, not skill.
- "Translate this French paragraph to English." → measures language, not job.
- "Which is more important: customer satisfaction or company profit?" → no
  correct answer; measures ideology.
- "What time does Casino Akwa open?" → measures local-knowledge trivia,
  rots in months, irrelevant to skill.

---

## Part 2 — Making it challenging AND fair

The two failure modes:
- **Too easy:** Top 10 is full of anyone who showed up. Recruiters stop
  trusting the badge.
- **Unfair:** Top 10 reflects English fluency, lucky guessing, or
  inside knowledge of the author. Talents disengage; recruiters see noise.

### Question taxonomy (Bloom's, simplified)

Every domain quiz of 30 questions should mix these three layers:

| Layer | Share | What it tests | Example shape |
|-------|-------|---------------|---------------|
| **Recall** | ~30% (9 q) | Do they know the basics? | "What is the standard CNPS contribution rate for employees?" |
| **Application** | ~40% (12 q) | Can they use the concept? | "A supermarket cashier receives a 10,000 FCFA note for 7,250 FCFA of goods. How much change?" |
| **Judgment** | ~30% (9 q) | Can they reason through a real situation? | "A customer claims a 5,000 FCFA mobile-money transfer they sent was not received. The system shows the transfer as successful. What do you do first?" |

Top scorers separate from average scorers on the **Judgment** layer. That's
where skill shows. Don't skimp on it.

### Distractor design rules

The wrong answers (distractors) determine whether a question is fair.

- **Plausible, not random.** A wrong answer should be something a less-skilled
  candidate would actually think, not absurd nonsense. If 80% of test-takers
  pick distractor B, that's a signal — either B is a common misconception
  (good!) or B is genuinely defensible (rewrite the question).
- **Same length and register.** Don't make the correct answer noticeably
  longer or more formal than the distractors — talents pattern-match on this.
- **No "all of the above" / "none of the above."** They reward test-taking
  technique over domain knowledge.
- **No double negatives.** Tests reading comprehension, not skill.

### Difficulty calibration

A question's difficulty isn't decided by the author — it's measured after
talents take it. Track per question:

- **Pass rate** (% who got it right). Target band: **40%–70%**.
  - <20%: question is broken or the answer key is wrong. Retire and review.
  - >90%: too easy. Demote to "warmup" or retire.
- **Discrimination index** (whether top scorers got it right more often
  than bottom scorers). A question top scorers get wrong but bottom scorers
  get right is broken — retire it.
- **Time-to-answer.** Outliers (e.g. takes 4× the median) signal a
  confusing question.

These are computable from `talent_challenge_submissions.answers` +
`talent_practice_attempts` after launch. No new schema needed.

### Anti-cheating supports fairness, too

Already shipped in Sprint 1 (server-side time limit, `max_ranked_attempts`
enforcement, disqualification on overrun). One more thing worth doing
before launch:
- Question pool > quiz size. Each attempt randomly samples N questions
  from a pool of 2N. Two talents in a study group can't share an answer key.
  Cheap to implement once question pools exist.

---

## Part 3 — Keeping it dynamic

Content rots in three ways. We protect against each:

### Rot type 1: Regulations change
**Example:** CNPS rate changes, OHADA adopts a new chart of accounts, MOH
publishes a new triage protocol.

**Defense:** Every question carries metadata:
```json
{
  "id": "acc-cnps-rate-001",
  "domain": "accountant",
  "topic": "payroll_deductions",
  "source": "CNPS Note d'Information N°2024-12",
  "source_url": "https://...",
  "last_reviewed": "2026-03-15",
  "reviewed_by": "sme_marie_njoya",
  "review_due": "2027-03-15"
}
```

A quarterly admin job surfaces every question whose `review_due` is past or
within 60 days. SME re-confirms or replaces.

This metadata lives inside `talent_challenges.config.questions[]`. Schema
already accepts arbitrary fields per question — we just need authoring
discipline.

### Rot type 2: Questions become too easy
**Example:** A trending TikTok teaches "the cashier change question," now
95% of takers get it right.

**Defense:** The data-driven retirement rule above (pass rate >90%). The
quarterly review process retires top-band questions and promotes new
fresh ones.

### Rot type 3: New roles / employers / tools emerge
**Example:** New mobile-money operator launches. New tax form. New popular
ERP at SMEs.

**Defense:** A persistent backlog of "candidate questions" per domain.
Anyone — admin, SME, recruiter, talent — can suggest a new question via
a lightweight form. SME triages monthly. Promote 1–2 per quarter per
domain into the live pool.

This needs a small admin UI (`/admin/question-backlog`) — **not built
yet, but a small follow-up sprint.** For launch we can use a shared
spreadsheet or Notion board.

---

## Part 4 — Authoring workflow

### Roles

| Role | Responsibility | Count per domain |
|------|----------------|------------------|
| **Domain SME** | Authors questions, reviews drafts, validates currency | 1–2 |
| **Reviewer** | Cross-checks SME's questions for fairness, distractor quality, language | 1 |
| **Translator** | Translates EN → FR (or vice-versa) | 1 (can be shared across domains) |
| **Admin** | Loads into the platform, monitors data after launch, runs quarterly reviews | 1 platform-wide |

### Stages

1. **Draft (SME).** 30 questions per domain in a shared template
   (Google Doc / Notion). Each question has: prompt, 4 options, correct
   answer, brief explanation, source citation, difficulty estimate.
2. **Peer review (Reviewer).** Cross-check for clarity, distractor
   plausibility, bias. Reject anything that fails the anti-pattern checklist.
3. **Translation.** AI-draft FR, human-review by a bilingual reviewer.
   Sprint 0's `localized.ts` ships only translations that pass review.
4. **Pilot.** Load as a `draft`-status challenge. ~10–20 trusted talents
   attempt it; we collect data on pass rate + discrimination per question.
5. **Calibrate.** Retire/rewrite the bottom 10% of questions based on
   pilot stats. Keep 25–30 in the final pool.
6. **Launch.** Flip to `active`. Production stats start flowing.
7. **Maintain.** Quarterly review based on data + source updates.

### Compensation question (open decision)

SME work is real work — for nurse/teacher/accountant especially, you're
asking working professionals to spend 4–8 hours on a curriculum. Three
common models:
- **Flat fee per question** (e.g. 1,500–3,000 FCFA per accepted question).
  Easy to administer; aligns incentives with volume.
- **Retainer per domain** (e.g. 60,000 FCFA for first 30 + quarterly
  refresh). Better for ongoing relationship; harder to scale.
- **Joblinca premium / spotlight** for SMEs who are themselves seeking
  recruiter visibility. Free for you; only works for SMEs who also want
  to be discovered.

**Whatever you choose, write the model down before you reach out.** SMEs
will ask in the first conversation.

---

## Part 5 — What we'll measure after launch

Existing schema captures these without changes:

- **Pass rate per question** (from `talent_challenge_submissions.answers`).
- **Discrimination per question** (correlate item-correct with overall score).
- **Time-to-answer per question** (`metadata.time_limit_exceeded`,
  per-question timestamps if we add them).
- **Retake patterns** (`talent_practice_attempts`).
- **Recruiter signal** (do recruiters actually click `quiz_verified`
  candidates more? Track via `recruiter_candidate_outreach_events`).
- **Reply rate to auto-intro** (do recruiters engage with auto-intro'd
  winners? Track via the same events table).

Worth instrumenting from day one even if no one looks at the dashboard
for a month.

---

## Open decisions for you

These are the calls only you can make. Lock them down before reaching
out to SMEs.

1. **How many launch domains in the first wave?**
   All 7? Or 2–3 well-done first, then expand?
   Recommendation: launch with 2–3 (suggest **accountant**, **customer_service**,
   **admin_assistant** — highest volume, lowest harm-on-wrong-answer risk).
   Expand after pilot data lands.

2. **SME identification.**
   Who do you already know in each domain? For nurse / accountant in
   particular, the SME must be a working professional, not a teacher of
   the subject — there's a real difference.

3. **Compensation model** (see Part 4).

4. **Pilot cohort.**
   Who are the 10–20 trusted talents who take each quiz before launch?
   Recommendation: internal team + close talents you trust to give
   honest feedback.

5. **Launch language strategy.**
   EN-first with FR rolling out per domain as translations land, OR
   delay launch of each domain until both EN+FR are ready?
   Sprint 0 already supports the seamless-fallback approach — pick what
   matches your content team's pace.

6. **Quarterly review cadence and ownership.**
   Who runs the quarterly review? When? What's the trigger
   (calendar-based or data-threshold-based)?

7. **Where the backlog of candidate questions lives** until the
   `/admin/question-backlog` UI is built. Notion? Google Sheets? Issues?

## Repo touchpoints (when content lands)

- Question content goes into `talent_challenges.config.questions[]` via
  admin API: `PATCH /api/admin/skillup/challenges/[id]` with `config` body.
- Each question should follow the bilingual shape documented in migration
  `20260526000100`: `{ id, question, question_fr, options, options_fr,
  correct_index, explanation, explanation_fr, ...metadata }`.
- Once questions land, run `POST /api/admin/skillup/suggest-refs` for
  each challenge to seed AI-suggested study refs; approve via
  `/admin/study-refs`.
- Flip challenge `status` from `draft` to `active` to make it visible.

## Next step

Pick a domain to author first (recommend **accountant** as the easiest
to start — well-defined OHADA framework, low harm risk, talented SME
pool is largest). I can help you draft a question template + the first
batch of sample questions if useful.
