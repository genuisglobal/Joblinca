# WhatsApp message templates: Phase 5 submission sheet

WhatsApp only delivers **free-form** messages within 24 hours of the person's last message to us. Anything later needs a Meta-approved **template**. Several flows send plain text today and silently fail outside that window. This sheet lists the templates to submit in Meta Business Manager → WhatsApp Manager → Message templates, ready to copy.

## Why each is needed

| # | Template | Fixes |
|---|---|---|
| 1 | `admin_handoff_alert_v1` | Handoff alerts only reach admins who messaged the business number in the last 24h |
| 2 | `admin_user_message_v1` | Same, for messages forwarded while a conversation is with the team |
| 3 | `team_reply_v1` | `REPLY <phone> …` fails if the user has been quiet for 24h |
| 4 | `signup_link_reminder_v1` | No nudge for people who started signup in chat but never set a password |
| 5 | `job_post_approved_v1` | `lib/jobs/recruiter-notify.ts` uses plain text (admin approve, admin reject and the auto-approve sweep). It only reaches recruiters who have chatted with the bot, and only within 24h of their last message, so most never hear their post went live |
| 6 | `job_post_rejected_v1` | Same, for rejections |

Also: **add French (`fr`) versions of the existing templates** (`matched_jobs_digest_v1`, `application_status_update_v1`, `interview_*_v1`, `field_registration_complete_v1`). All of them are English-only today, so French speakers get English. Submit each under the same name with language **French**. The code already sends `*_TEMPLATE_LANG`; the follow-up change is to pick `fr` per lead from `wa_leads.language`.

## Meta rules to keep in mind

- A body can't **start or end** with a variable, and two variables can't be adjacent. The drafts below respect this.
- Every variable needs a **sample value** at submission. Use the ones given.
- Use category **Utility**: these are all about the person's own account, request, application or job post. A template submitted as Utility can be re-categorised to Marketing by Meta; if that happens, resubmit with plainer wording rather than accepting it.
- Keep `_v1` in the name. Any later wording change becomes `_v2` (approved templates can't be edited freely).

---

## 1. `admin_handoff_alert_v1`

- **Category:** Utility · **Language:** English (`en`) · **Recipients:** numbers in `ADMIN_ALERT_WHATSAPP`

**Body**
```
New WhatsApp handoff: {{1}}
From {{2}} at {{3}}.

{{4}}

To answer, reply here with REPLY {{3}} and your message. Send RESUME {{3}} to hand the chat back to the assistant.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | reason | `scam or safety` |
| {{2}} | name, or "Unknown" | `Ada Nkem` |
| {{3}} | phone, E.164 | `+237670000001` |
| {{4}} | agent's summary | `Was asked to pay 10,000 FCFA for training before an interview.` |

---

## 2. `admin_user_message_v1`

- **Category:** Utility · **Language:** English (`en`) · **Recipients:** admins

**Body**
```
Message from {{1}} while waiting for the JobLinca team:

{{2}}

Reply here with REPLY {{1}} and your message, or RESUME {{1}} to hand back to the assistant.
```

| Var | Sample |
|---|---|
| {{1}} | `+237670000001` |
| {{2}} | `Hello? Is anyone there?` |

---

## 3. `team_reply_v1`

- **Category:** Utility · **Languages:** English (`en`) + French (`fr`) · **Recipients:** the user in a handoff

**Body (en)**
```
Hello {{1}}, a member of the JobLinca team replied to your request:

{{2}}

Reply here to continue the conversation.
```

**Body (fr)**
```
Bonjour {{1}}, un membre de l'équipe JobLinca a répondu à votre demande :

{{2}}

Répondez ici pour poursuivre la conversation.
```

| Var | Sample |
|---|---|
| {{1}} | `Ada` |
| {{2}} | `Thanks for reporting this. We have removed the job and blocked the company.` |

---

## 4. `signup_link_reminder_v1`

- **Category:** Utility · **Languages:** `en` + `fr` · **Recipients:** people who asked for an account in chat but haven't set a password after ~24h

**Body (en)**
```
Hi {{1}}, your JobLinca account is almost ready. Set your password to see every job and apply right here on WhatsApp.
```

**Body (fr)**
```
Bonjour {{1}}, votre compte JobLinca est presque prêt. Choisissez votre mot de passe pour voir toutes les offres et postuler ici sur WhatsApp.
```

**Button:** Visit website, **dynamic** URL
- Text: `Set my password` / `Choisir mon mot de passe`
- URL: `https://joblinca.com/complete-registration/{{1}}`
- Sample suffix: `Xk3p9QwL2mN8vR4tY6zA1bC5dE7fG0hJ`

| Var | Sample |
|---|---|
| body {{1}} | `Ada` |

---

## 5. `job_post_approved_v1`

- **Category:** Utility · **Languages:** `en` + `fr` · **Recipients:** recruiter who posted the job

**Body (en)**
```
Good news: your job post "{{1}}" ({{2}}) is now live on JobLinca. Candidates can start applying today.
```

**Body (fr)**
```
Bonne nouvelle : votre offre « {{1}} » ({{2}}) est maintenant en ligne sur JobLinca. Les candidats peuvent postuler dès aujourd'hui.
```

**Button:** Visit website, **dynamic** URL
- Text: `View job` / `Voir l'offre`
- URL: `https://joblinca.com/jobs/{{1}}`
- Sample suffix: `3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b`

| Var | Sample |
|---|---|
| {{1}} | `Cashier` |
| {{2}} | `JL-001042` |

---

## 6. `job_post_rejected_v1`

- **Category:** Utility · **Languages:** `en` + `fr` · **Recipients:** recruiter who posted the job

**Body (en)**
```
Your job post "{{1}}" ({{2}}) was not published. Reason: {{3}}. You can edit it and submit it again from your dashboard.
```

**Body (fr)**
```
Votre offre « {{1}} » ({{2}}) n'a pas été publiée. Motif : {{3}}. Vous pouvez la modifier et la soumettre à nouveau depuis votre tableau de bord.
```

**Button:** Visit website, **static** URL
- Text: `Open dashboard` / `Ouvrir le tableau de bord`
- URL: `https://joblinca.com/dashboard/recruiter/jobs`

| Var | Sample |
|---|---|
| {{1}} | `Cashier` |
| {{2}} | `JL-001042` |
| {{3}} | `the salary and duties are missing` |

---

## Wiring (done; works before approval)

All six are wired through `lib/messaging/wa-templates.ts`: **try the template, fall back to the plain text we sent before.** Until Meta approves a template its call fails and the text goes out exactly as today. Once approved, delivery outside the 24h window starts working without a deploy. Set any env var below to `off` to skip a template, or to a different name (e.g. `team_reply_v2`) to switch versions.

| Template | Env var (default = name above) | Where |
|---|---|---|
| 1 | `WA_ADMIN_HANDOFF_TEMPLATE` | `handoff_to_human` tool → `lib/admin-alerts.ts` |
| 2 | `WA_ADMIN_USER_MESSAGE_TEMPLATE` | paused-lead forward in `router.ts` |
| 3 | `WA_TEAM_REPLY_TEMPLATE` | admin `REPLY` in `router.ts`; template only if the user's last message is >24h old |
| 4 | `WA_SIGNUP_REMINDER_TEMPLATE` | daily cron `/api/cron/wa-signup-reminders` (10:15 UTC): in-chat signups whose link was sent 24h–7d ago and is still unused get **one** reminder with a freshly minted link (only token hashes are stored, so the first link can't be resent; minting expires it) |
| 5, 6 | `WA_JOB_POST_APPROVED_TEMPLATE`, `WA_JOB_POST_REJECTED_TEMPLATE` | `lib/jobs/recruiter-notify.ts` |

Language: pass `fr` when `wa_leads.language = 'fr'`, else `en`.
