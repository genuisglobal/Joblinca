# SME Outreach Kit — Talent Challenges Content

Practical materials for recruiting Subject Matter Experts (SMEs) to author
the first 30 questions per launch domain. Copy-paste-and-edit, don't treat
as polished marketing.

Launch domains: **accountant, customer_service, admin_assistant.**

---

## 1. First-contact message

Use as an email, WhatsApp message, or LinkedIn DM. ~120 words. Keep it
short — SMEs are busy.

> Subject: Help shape Cameroon's first verified-skills platform for {{domain}}
>
> Hi {{Name}},
>
> I'm building Joblinca, a Cameroonian job platform with a Quiz-Verified
> talent badge that recruiters can filter on. Top-scoring talents get
> recruiter spotlight, interview boosts, and direct introductions.
>
> The badge is only as good as the questions behind it. I'm looking for
> a working {{domain_role}} to author the question pool for the
> {{domain}} quiz — 30 scenario-based questions grounded in real
> Cameroonian workplace situations.
>
> Estimated time: **4–6 hours total**, over 2 weeks. Compensation:
> {{compensation}}. I'll share two sample questions so you can see the
> quality bar before deciding.
>
> Would a 20-minute call this week work?
>
> — {{Your Name}}

Replace `{{domain}}` per send (Accounting / Customer Service /
Administrative Assistant) and `{{domain_role}}` accordingly
(working accountant / call-centre agent / experienced admin assistant).

---

## 2. The deal — for the first call

A one-page brief to share if they want details before committing.

### What we're asking from you

- **Author 30 multiple-choice questions** for the {{domain}} quiz.
- Mix: 30% recall (foundational knowledge), 40% application (use a concept
  in a calculation or task), 30% judgment (real workplace scenarios).
- Each question: prompt, 4 options, 1 correct answer, 1-paragraph
  explanation, source citation.
- All content drafted in **English first**. Joblinca's translation pipeline
  handles French; you'll review the FR back-translation for accuracy.

### What we're giving

- **Compensation:** {{flat fee per accepted question / retainer / Joblinca
  premium spotlight}}
- **Attribution:** Credited as "Reviewed by {{Your Name}}, {{Your Title}}"
  on the public challenge page (opt-in; you can stay anonymous).
- **Quarterly refresh contract:** First right of refusal on the quarterly
  question review at {{refresh_compensation}}.
- **Quiz access:** Free Joblinca premium for one year.

### Quality bar

Two sample questions are attached so you can see what we mean by
"scenario-based" and "Cameroon-real" before you commit.

We will reject any question that:
- Tests trivia (e.g. "Who is the current Minister of X?")
- Has more than one defensible correct answer
- Reads as a French/English comprehension test rather than a skill test
- Cites a source that has changed in the last 6 months without
  re-verification

### Time commitment

- Kick-off call: 30 min
- Drafting: 3–4 hours self-paced
- Peer-review round trip: 1 hour
- Pilot debrief: 30 min

Total: 4–6 hours over 2 weeks.

---

## 3. Kick-off call agenda

30 minutes. Run it the same way every time so the three SMEs end up with
comparable outputs.

| Time | Topic |
|------|-------|
| 0:00–0:05 | Joblinca + product context (1-minute pitch, 4 minutes for their questions) |
| 0:05–0:10 | The 3 sample questions + why they look the way they do |
| 0:10–0:20 | Their domain: which 3–5 sub-topics MUST be on the quiz? (e.g. for accountant: TVA basics, CNPS payroll, OHADA chart of accounts, monthly close, bank reconciliation) |
| 0:20–0:25 | Anti-patterns + the "challenging but fair" rule |
| 0:25–0:30 | Logistics: deadline, where they'll draft (Google Doc / Notion), how peer review works, compensation paperwork |

Walk away with: a written list of 3–5 sub-topics for their domain, signed
off by them, and a draft deadline (recommend **10 working days from
kick-off**).

---

## 4. Question authoring template

Give the SME a copy of this template (Google Doc or Notion page works
fine — no special tooling needed). They fill one per question.

```
QUESTION #__ of 30

Sub-topic: ____________________
Bloom layer (circle one): recall / application / judgment
Difficulty estimate (circle one): beginner / intermediate / advanced

PROMPT (1–3 sentences, English):
___________________________________________________________________
___________________________________________________________________

OPTIONS (4 total — keep all the same length and register):
A) ________________________________
B) ________________________________
C) ________________________________
D) ________________________________

CORRECT ANSWER: ___

EXPLANATION (1–3 sentences — why the correct answer is correct, and
what mistake a wrong-answerer is likely making):
___________________________________________________________________
___________________________________________________________________

SOURCE / EVIDENCE (be specific — citing "general knowledge" is not enough):
- Document / regulation / textbook: ____________
- URL or page reference: ____________
- Last verified accurate on: ____________

REVIEWER COMMENTS (filled by peer reviewer):
___________________________________________________________________
```

Once the 30 are drafted, you (or the admin) move them into the platform
via `PATCH /api/admin/skillup/challenges/[id]` with the `config` body
following the JSON shape in `talent-challenges-content-authoring.md`.

---

## 5. Acceptance criteria checklist

Before paying / accepting a question batch, every question must pass:

- [ ] Prompt is 1–3 sentences, unambiguous
- [ ] Exactly 4 options, similar length and register
- [ ] Exactly one defensible correct answer
- [ ] Distractors are plausible (a beginner could fall for each)
- [ ] No double negatives, "all of the above," "none of the above"
- [ ] Explanation cites a specific source (regulation, manual, textbook)
- [ ] Source was verified within the last 6 months
- [ ] Scenario references Cameroon (currency, employer, geography,
      regulation) where applicable
- [ ] Correct answer index varies across the 30 (target ~25% each of A/B/C/D)
- [ ] Bloom mix on the batch: ~9 recall, ~12 application, ~9 judgment
- [ ] Bilingual-translation-friendly (no idioms that won't translate)

---

## 6. Pilot acceptance gate

Before flipping the challenge from `draft` → `active`:

- 30 questions loaded into `talent_challenges.config.questions[]`
- ~10 pilot talents have attempted the quiz
- Per-question pass rate computed:
  - Questions with <20% pass rate: SME re-reviews. Likely a broken
    question or wrong key. Replace or rewrite.
  - Questions with >90% pass rate: too easy. Mark as warm-up only or
    swap into the practice pool.
- Aggregate quiz: target a 40–70% average pass rate across all 30
  questions.
- SME signs off on the final set.

Then admin flips status. The cron picks it up on the next Monday for
weekly leaderboard and spotlights start populating.

---

## Open items to fill before sending the first message

These placeholders in section 1 and 2 must be replaced with real values
before any outreach goes out. Don't promise something you haven't decided.

1. **`{{compensation}}`** — choose one model from
   `talent-challenges-content-authoring.md` Part 4 and write the
   number/structure here:
   - Flat fee per accepted question: __________ FCFA
   - Retainer for the 30-question batch: __________ FCFA
   - Joblinca premium spotlight only: (no cash)

2. **`{{refresh_compensation}}`** — what you'll pay quarterly for the
   ~2-hour refresh review:
   __________ FCFA per quarter

3. **Your name, title, and contact** as the platform owner — for the
   signature line.

4. **Three SME shortlists** — names and contact for the people you'll
   reach out to first per domain. Reach out to 2 per domain (you want
   the option to pick the better one for ongoing work):

   - Accountant: _____________________ , _____________________
   - Customer Service: _____________________ , _____________________
   - Admin Assistant: _____________________ , _____________________

5. **Pilot cohort** — 10 talents per domain you trust to take the quiz
   honestly and give feedback. Can overlap across domains.

---

## When you're ready

Fill the open items, send the first-contact messages to all 6 SME
candidates in one batch. Expect ~50% response rate, ~30% commitment rate.
That should land you 1 confirmed SME per domain, which is the minimum.

Once any one SME commits, the next thing I can help with is loading their
first 30 questions into the platform via the admin API. Ping me when
you're at that stage.
