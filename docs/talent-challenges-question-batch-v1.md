# Question Batch v1 — Format Conversion Demo

Maps the user's 200-question research bank into the platform's mixed-type
JSON shape (Sprint 6). This file shows **10 representative conversions** —
5 accountant + 5 admin — covering all four supported types (mcq_single,
true_false, numeric, matching, ordering).

**Before any of these go live**, every question needs SME verification.
Numerical answer keys (CNPS rates, payroll lookups, tax thresholds, FCFA
amounts) are the highest-risk items. Flagged with `"verification_required": true`
in metadata.

When the convention here looks right, I bulk-convert ~30 per domain.

---

## How to load into the platform

For each domain, PATCH the seeded challenge:

```
PATCH /api/admin/skillup/challenges/launch-accountant-basics
Content-Type: application/json

{
  "config": {
    "time_limit_seconds": 1800,
    "shuffle_questions": true,
    "questions": [ ...the array below... ]
  }
}
```

Then flip `status` from `draft` to `active` only after SME sign-off.

---

## Accountant — sample 5

### acc-b03 — Numeric (from research bank B3)

```json
{
  "id": "acc-b03",
  "type": "numeric",
  "topic": "vat_basics",
  "bloom_layer": "application",
  "time_limit_seconds": 120,
  "question": "A business buys office stationery for 100,000 FCFA plus VAT at 19.25%, paid immediately in cash. What is the total cash paid out?",
  "question_fr": "Une entreprise achète des fournitures de bureau pour 100 000 FCFA HT, plus la TVA à 19,25%, réglée immédiatement en espèces. Quel est le total décaissé ?",
  "expected_value": 119250,
  "tolerance": 1,
  "unit_hint": "FCFA",
  "input_kind": "integer",
  "explanation": "Total = 100,000 + (100,000 × 0.1925) = 119,250 FCFA.",
  "explanation_fr": "Total = 100 000 + (100 000 × 0,1925) = 119 250 FCFA.",
  "source": "OHADA / Code Général des Impôts du Cameroun (TVA 19,25%)",
  "verification_required": true,
  "research_source_id": "B3"
}
```

### acc-b13 — Numeric (depreciation)

```json
{
  "id": "acc-b13",
  "type": "numeric",
  "topic": "fixed_assets",
  "bloom_layer": "application",
  "time_limit_seconds": 90,
  "question": "A delivery tricycle costs 6,000,000 FCFA with zero residual value and a useful life of 5 years. What is the annual straight-line depreciation expense?",
  "question_fr": "Un tricycle de livraison coûte 6 000 000 FCFA, valeur résiduelle nulle, durée d'utilité 5 ans. Quel est l'amortissement linéaire annuel ?",
  "expected_value": 1200000,
  "tolerance": 1,
  "unit_hint": "FCFA",
  "input_kind": "integer",
  "explanation": "Straight-line: (6,000,000 - 0) / 5 = 1,200,000 FCFA per year.",
  "explanation_fr": "Amortissement linéaire : (6 000 000 - 0) / 5 = 1 200 000 FCFA par an.",
  "source": "OHADA SYSCOHADA — amortissements",
  "verification_required": false,
  "research_source_id": "B13"
}
```

### acc-b19 — MCQ single (DGI deadlines)

```json
{
  "id": "acc-b19",
  "type": "mcq_single",
  "topic": "tax_calendar",
  "bloom_layer": "recall",
  "time_limit_seconds": 60,
  "question": "According to the official DGI fiscal calendar, when are most monthly tax instalments due each month?",
  "question_fr": "Selon le calendrier fiscal officiel de la DGI, à quelle échéance sont généralement dues les acomptes mensuels ?",
  "options": [
    "By the 5th of the same month",
    "Within the first 15 days of the following month",
    "By the end of the same month",
    "Quarterly only, never monthly"
  ],
  "options_fr": [
    "Avant le 5 du mois en cours",
    "Dans les 15 premiers jours du mois suivant",
    "À la fin du mois en cours",
    "Trimestriellement uniquement, jamais mensuellement"
  ],
  "correct_index": 1,
  "explanation": "DGI's published fiscal calendar places monthly instalments in the first 15 days of the following month. Annual balances are due by 15 March.",
  "explanation_fr": "Le calendrier fiscal de la DGI fixe les acomptes mensuels dans les 15 premiers jours du mois suivant. Le solde annuel est dû au 15 mars.",
  "source": "DGI fiscal calendar 2026",
  "verification_required": true,
  "research_source_id": "B19"
}
```

### acc-b07 — Matching (asset/expense/liability classification)

```json
{
  "id": "acc-b07",
  "type": "matching",
  "topic": "account_classification",
  "bloom_layer": "recall",
  "time_limit_seconds": 150,
  "question": "Match each item to the correct initial classification.",
  "question_fr": "Faites correspondre chaque élément à sa classification initiale.",
  "left_items": [
    "Trade receivable",
    "Unpaid electricity bill",
    "Annual insurance paid in advance",
    "Inventory of goods for resale"
  ],
  "left_items_fr": [
    "Créance client",
    "Facture d'électricité non réglée",
    "Assurance annuelle payée d'avance",
    "Stock de marchandises à revendre"
  ],
  "right_items": ["Asset", "Liability", "Prepayment (asset)"],
  "right_items_fr": ["Actif", "Passif", "Charge constatée d'avance (actif)"],
  "correct_pairs": [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 0]
  ],
  "explanation": "Receivables and inventory are assets. Unpaid bills are liabilities. Prepaid insurance is recognised as an asset (prepayment) until consumed.",
  "explanation_fr": "Les créances et les stocks sont des actifs. Les factures non réglées sont des passifs. L'assurance payée d'avance est un actif (charge constatée d'avance) jusqu'à sa consommation.",
  "source": "OHADA SYSCOHADA basics",
  "verification_required": false,
  "research_source_id": "B7"
}
```

### acc-e13 — Ordering (forensic cash reconstruction sequence)

```json
{
  "id": "acc-e13",
  "type": "ordering",
  "topic": "audit_reconstruction",
  "bloom_layer": "judgment",
  "time_limit_seconds": 240,
  "question": "Put these forensic-reconstruction steps in the order an experienced auditor would normally follow when records are partial and a regional branch has only a bank statement, supplier statements and scanned receipts.",
  "question_fr": "Classez ces étapes de reconstruction forensique dans l'ordre que suivrait normalement un auditeur expérimenté lorsque les registres sont incomplets et qu'une agence régionale ne dispose que d'un relevé bancaire, de relevés fournisseurs et de scans de reçus.",
  "items": [
    "Anchor on external third-party evidence (bank statement, supplier statements)",
    "Sequence receipts and payments chronologically from external evidence",
    "Rebuild internal customer and supplier movements against the external timeline",
    "Identify unexplained gaps and duplicate or missing references",
    "Produce a residual unexplained balance as a memo for management"
  ],
  "items_fr": [
    "S'ancrer sur les preuves externes de tiers (relevé bancaire, relevés fournisseurs)",
    "Ordonner les encaissements et décaissements chronologiquement à partir des preuves externes",
    "Reconstruire les mouvements clients et fournisseurs internes par rapport à cette chronologie",
    "Identifier les écarts inexpliqués et les références dupliquées ou manquantes",
    "Produire le solde résiduel inexpliqué dans une note pour la direction"
  ],
  "correct_order": [0, 1, 2, 3, 4],
  "explanation": "External, third-party evidence is always the strongest anchor; everything internal is rebuilt against it. The unexplained residual is the deliverable that management can act on.",
  "explanation_fr": "Les preuves externes de tiers sont l'ancrage le plus fiable ; tout ce qui est interne est reconstruit par rapport à elles. Le solde résiduel inexpliqué est le livrable sur lequel la direction peut agir.",
  "source": "Audit good practice — forensic reconstruction",
  "verification_required": false,
  "research_source_id": "E13"
}
```

---

## Admin Assistant — sample 5

### adm-b01 — MCQ single (call logging)

```json
{
  "id": "adm-b01",
  "type": "mcq_single",
  "topic": "communication_basics",
  "bloom_layer": "recall",
  "time_limit_seconds": 60,
  "question": "When taking a phone message for a manager who is out of office, which set of fields gives the manager the most useful record?",
  "question_fr": "Quand vous prenez un message téléphonique pour un responsable absent, quel ensemble d'informations donne au responsable l'enregistrement le plus utile ?",
  "options": [
    "Caller name and phone number only",
    "Caller name, organisation, purpose, callback number, time, urgency, action required",
    "Caller name and a short summary of how they sounded",
    "Just the message, the manager can call back later"
  ],
  "options_fr": [
    "Nom et numéro de l'appelant uniquement",
    "Nom, organisme, objet, numéro de rappel, heure, urgence, action requise",
    "Nom de l'appelant et brève description de son ton",
    "Le message seul, le responsable rappellera plus tard"
  ],
  "correct_index": 1,
  "explanation": "A useful phone-message record gives the manager enough context to decide priority and respond without calling back to ask basic questions.",
  "explanation_fr": "Un bon message téléphonique donne au responsable assez de contexte pour décider de la priorité et répondre sans avoir à rappeler pour des informations de base.",
  "source": "Office administration practice",
  "verification_required": false,
  "research_source_id": "AD-B01"
}
```

### adm-b08 — True/False (confidentiality)

```json
{
  "id": "adm-b08",
  "type": "true_false",
  "topic": "confidentiality",
  "bloom_layer": "judgment",
  "time_limit_seconds": 45,
  "question": "A colleague who is not on the HR team asks to browse candidate CVs that are sitting on the reception desk. It is acceptable to let them browse since the CVs are not technically labelled confidential.",
  "question_fr": "Un collègue qui ne fait pas partie de l'équipe RH demande à consulter les CV des candidats laissés sur le comptoir d'accueil. Il est acceptable de le laisser consulter puisque les CV ne sont pas explicitement marqués confidentiels.",
  "options": ["True", "False"],
  "options_fr": ["Vrai", "Faux"],
  "correct_index": 1,
  "explanation": "Candidate CVs contain personal data and recruitment context. They are confidential by nature, not by label. Access is restricted to authorised HR staff.",
  "explanation_fr": "Les CV de candidats contiennent des données personnelles et un contexte de recrutement. Ils sont confidentiels par nature, pas par étiquetage. L'accès est limité au personnel RH autorisé.",
  "source": "Data-protection good practice",
  "verification_required": false,
  "research_source_id": "AD-B08"
}
```

### adm-b21 — Ordering (DGI notice control actions)

```json
{
  "id": "adm-b21",
  "type": "ordering",
  "topic": "compliance_routing",
  "bloom_layer": "application",
  "time_limit_seconds": 180,
  "question": "A DGI notice arrives at the general office mailbox at 16:30. Put these four first-hour actions in the correct order.",
  "question_fr": "Une notification de la DGI arrive dans la boîte mail générale à 16h30. Classez ces quatre actions de la première heure dans le bon ordre.",
  "items": [
    "Timestamp the notice and log it in the inward register",
    "Save / print a backup copy and secure the file",
    "Notify the responsible finance or compliance lead",
    "Open a follow-up tracker entry for this notice"
  ],
  "items_fr": [
    "Horodater la notification et l'enregistrer dans le registre du courrier entrant",
    "Sauvegarder / imprimer une copie de secours et sécuriser le dossier",
    "Informer le responsable financier ou de la conformité concerné",
    "Ouvrir une entrée de suivi dédiée à cette notification"
  ],
  "correct_order": [0, 2, 1, 3],
  "explanation": "Log first so the official receipt time is fixed; notify the responsible person quickly because some notices have short deadlines; backup the copy; then create the tracker entry. Logging precedes notifying because the responsible person will ask what the registered receipt time was.",
  "explanation_fr": "Enregistrer d'abord pour fixer l'heure officielle de réception ; prévenir rapidement la personne responsable car certaines notifications ont des délais courts ; sauvegarder la copie ; puis créer l'entrée de suivi. L'enregistrement précède la notification parce que la personne responsable demandera quelle est l'heure de réception consignée.",
  "source": "Office administration / DGI workflow",
  "verification_required": false,
  "research_source_id": "AD-B21"
}
```

### adm-b27 — Matching (channel selection)

```json
{
  "id": "adm-b27",
  "type": "matching",
  "topic": "communication_channel_choice",
  "bloom_layer": "application",
  "time_limit_seconds": 120,
  "question": "Match each work situation to the communication channel an experienced assistant would normally pick first.",
  "question_fr": "Faites correspondre chaque situation de travail au canal de communication qu'une assistante expérimentée choisirait normalement en premier.",
  "left_items": [
    "Sending a signed contract for the records",
    "An urgent clarification before a meeting in 10 minutes",
    "Following up on an unread message after a phone agreement",
    "A polite reminder about a recurring deadline a week away"
  ],
  "left_items_fr": [
    "Envoi d'un contrat signé pour les archives",
    "Clarification urgente avant une réunion dans 10 minutes",
    "Confirmation écrite après un accord téléphonique",
    "Rappel poli pour une échéance récurrente dans une semaine"
  ],
  "right_items": ["Email", "Phone call", "Email after a phone call"],
  "right_items_fr": ["Email", "Appel téléphonique", "Email après un appel téléphonique"],
  "correct_pairs": [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 0]
  ],
  "explanation": "Email for record / attachments and for non-urgent reminders. A call for urgent clarification. Email-after-call to lock down what was agreed verbally.",
  "explanation_fr": "Email pour les archives / pièces jointes et les rappels non urgents. Appel pour les clarifications urgentes. Email après l'appel pour formaliser ce qui a été convenu oralement.",
  "source": "Office administration practice",
  "verification_required": false,
  "research_source_id": "AD-B27"
}
```

### adm-b22 — MCQ single (CNPS file readiness)

```json
{
  "id": "adm-b22",
  "type": "mcq_single",
  "topic": "cnps_basics",
  "bloom_layer": "recall",
  "time_limit_seconds": 75,
  "question": "Someone walks in and asks for the employer's CNPS registration file. Which set of identifiers should be the easiest to retrieve immediately?",
  "question_fr": "Quelqu'un se présente et demande le dossier d'enregistrement CNPS de l'employeur. Quel ensemble d'identifiants doit être le plus facile à retrouver immédiatement ?",
  "options": [
    "Employer CNPS number, registration certificate, contact details, responsible officer, latest compliance trail",
    "Just the employer name and address",
    "Only the most recent payment receipt",
    "The list of all current employees and their CNPS numbers"
  ],
  "options_fr": [
    "Numéro CNPS de l'employeur, certificat d'enregistrement, coordonnées, responsable, dernière trace de conformité",
    "Le nom et l'adresse de l'employeur uniquement",
    "Le dernier reçu de paiement uniquement",
    "La liste de tous les employés actuels et leurs numéros CNPS"
  ],
  "correct_index": 0,
  "explanation": "The CNPS registration file proves the employer is registered and currently in good standing. Just a name and address, a single receipt, or a personnel list does not establish the employer's CNPS identity.",
  "explanation_fr": "Le dossier d'enregistrement CNPS prouve que l'employeur est immatriculé et à jour. Un simple nom et adresse, un reçu isolé ou la liste du personnel ne suffisent pas à établir l'identité CNPS de l'employeur.",
  "source": "CNPS employer obligations",
  "verification_required": true,
  "research_source_id": "AD-B22"
}
```

---

## Conventions used in this batch

These are the rules I'm applying for the bulk conversion. Flag any you'd
want changed before I expand to 30 per domain.

1. **ID format:** `acc-<level><number>` and `adm-<level><number>`, lowercase,
   hyphenated. Stable across versions. Matches `research_source_id` for
   traceability.
2. **time_limit_seconds:** Roughly the bank's "Time: X min" multiplied by 60,
   often rounded down to keep pressure. Adjusted up for matching/ordering
   because those need more interaction time. Pilot data should drive the
   final values.
3. **Bloom layer:** Carried over from the bank's positioning (recall /
   application / judgment).
4. **`verification_required: true`** on every question whose answer key
   depends on a *specific external rate, threshold, deadline, or barème*
   (TVA rate, CNPS rate, DGI calendar, employer obligations). These MUST
   be checked by a working SME before the challenge flips to `active`.
   Questions on universal accounting logic (depreciation calc, asset
   classification) carry `verification_required: false`.
5. **Explanations are 1–2 sentences.** They surface only when the talent
   gets a question wrong (recommendations flow from Sprint 2).
6. **FR translations** are AI-drafted and need bilingual review before
   talents see them. Per Sprint 0's resolver, FR will fall back to EN
   silently until reviewed.
7. **Numeric tolerance** is 1 for integer FCFA answers (handles rounding
   in the talent's mental math) and 0.5 for percentages. Adjust if pilot
   data shows talents getting "close enough" answers marked wrong.
8. **Distractor rule:** every wrong option must be something a beginner
   could plausibly believe. No nonsense options. No "all of the above."
9. **Matching uses [left_index, right_index] pairs.** Multiple left items
   can match the same right (e.g. two assets both map to "Asset").
10. **Ordering items list** stays in the natural order the talent first
    sees them; `correct_order` is the order they SHOULD end up in. The UI
    re-orders client-side.

---

## Next step

If conventions above look right, I bulk-convert ~25 more accountant questions
and ~25 more admin questions to hit 30 per domain. Output will be two JSON
arrays you can paste straight into the admin PATCH calls.

If anything in the conventions needs to change (timer values, tolerance,
ID format, source-credit naming), flag it now — easier to change once than
to redo 50 conversions.
