# Talent Challenges — v1 Question Pool

Bulk conversion of the user's research bank into platform JSON.
30 accountant + 30 admin assistant questions.

**Conventions** are documented in `talent-challenges-question-batch-v1.md`.
This doc is the *payload* — two JSON arrays ready to paste into the admin
PATCH endpoint.

**`verification_required: true`** flags every question whose answer key
depends on a Cameroon-specific rate, threshold, deadline, or barème.
None of these go live until an SME signs off on the flagged keys.

## How to load

```
PATCH /api/admin/skillup/challenges/launch-accountant-basics
Content-Type: application/json

{
  "config": {
    "time_limit_seconds": 1800,
    "shuffle_questions": false,
    "questions": [ ...the accountant array below... ]
  }
}
```

Same call for `launch-admin-assistant-basics` with the admin array.

Leave `status` at `draft` until SME review is complete. Flip via:

```
PATCH /api/admin/skillup/challenges/launch-accountant-basics
{ "status": "active" }
```

---

## Accountant — 30 questions

```json
[
  {
    "id": "acc-b01",
    "type": "mcq_single",
    "topic": "ohada_basics",
    "bloom_layer": "recall",
    "time_limit_seconds": 60,
    "question": "Which statement best describes the structure of the OHADA/SYSCOHADA chart of accounts?",
    "question_fr": "Quelle affirmation décrit le mieux la structure du plan de comptes OHADA/SYSCOHADA ?",
    "options": [
      "Classes 1-3 are profit-and-loss accounts; classes 4-8 are balance-sheet accounts",
      "Classes 1-5 are mainly balance-sheet accounts; classes 6-7 are ordinary charges and products; class 8 is other charges and products",
      "Only classes 6 and 7 are used in OHADA",
      "OHADA does not distinguish balance-sheet from profit-and-loss accounts"
    ],
    "options_fr": [
      "Les classes 1-3 sont des comptes de résultat ; les classes 4-8 des comptes de bilan",
      "Les classes 1-5 sont principalement des comptes de bilan ; 6-7 sont des charges et produits ordinaires ; 8 sont d'autres charges et produits",
      "Seules les classes 6 et 7 sont utilisées en OHADA",
      "L'OHADA ne distingue pas les comptes de bilan des comptes de résultat"
    ],
    "correct_index": 1,
    "explanation": "Classes 1-5 cover balance-sheet accounts (capital, fixed assets, stocks, third parties, treasury). 6-7 are ordinary charges/products. Class 8 carries other charges and products.",
    "explanation_fr": "Les classes 1-5 couvrent les comptes de bilan (capitaux, immobilisations, stocks, tiers, trésorerie). 6-7 sont les charges et produits ordinaires. La classe 8 porte les autres charges et produits.",
    "source": "OHADA SYSCOHADA chart of accounts",
    "verification_required": false,
    "research_source_id": "B1"
  },
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
    "source": "Code Général des Impôts du Cameroun (TVA 19,25%)",
    "verification_required": true,
    "research_source_id": "B3"
  },
  {
    "id": "acc-b04",
    "type": "numeric",
    "topic": "ar_basics",
    "bloom_layer": "application",
    "time_limit_seconds": 120,
    "question": "A Yaoundé wholesaler sells goods on credit for 500,000 FCFA plus VAT at 19.25%. What is the total amount receivable from the customer?",
    "question_fr": "Un grossiste à Yaoundé vend des marchandises à crédit pour 500 000 FCFA HT, plus la TVA à 19,25%. Quel est le montant total à recevoir du client ?",
    "expected_value": 596250,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Customer balance = 500,000 + (500,000 × 0.1925) = 596,250 FCFA. The VAT collected is a liability, not revenue.",
    "explanation_fr": "Créance client = 500 000 + (500 000 × 0,1925) = 596 250 FCFA. La TVA collectée est une dette, pas un produit.",
    "source": "Code Général des Impôts du Cameroun (TVA 19,25%)",
    "verification_required": true,
    "research_source_id": "B4"
  },
  {
    "id": "acc-b05",
    "type": "numeric",
    "topic": "cash_control",
    "bloom_layer": "application",
    "time_limit_seconds": 120,
    "question": "Petty-cash float is 150,000 FCFA. At close of day the cashier presents vouchers totaling 2,500 FCFA and the cash physically counted is 146,500 FCFA. How much is the shortage (enter a positive number)?",
    "question_fr": "L'avance de petite caisse est de 150 000 FCFA. À la clôture, le caissier présente des justificatifs totalisant 2 500 FCFA et l'espèces comptées est de 146 500 FCFA. Quel est le montant du manquant (entrer un nombre positif) ?",
    "expected_value": 1000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Cash + vouchers should equal the float. 146,500 + 2,500 = 149,000. The float is 150,000. Shortage = 1,000 FCFA.",
    "explanation_fr": "Espèces + justificatifs doivent égaler l'avance. 146 500 + 2 500 = 149 000. L'avance est de 150 000. Manquant = 1 000 FCFA.",
    "source": "Cash control good practice",
    "verification_required": false,
    "research_source_id": "B5"
  },
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
    "correct_pairs": [[0, 0], [1, 1], [2, 2], [3, 0]],
    "explanation": "Receivables and inventory are assets. Unpaid bills are liabilities. Prepaid insurance is an asset (prepayment) until consumed.",
    "explanation_fr": "Les créances et les stocks sont des actifs. Les factures non réglées sont des passifs. L'assurance payée d'avance est un actif jusqu'à sa consommation.",
    "source": "OHADA SYSCOHADA basics",
    "verification_required": false,
    "research_source_id": "B7"
  },
  {
    "id": "acc-b08",
    "type": "numeric",
    "topic": "supplier_reconciliation",
    "bloom_layer": "application",
    "time_limit_seconds": 180,
    "question": "Your ledger shows Supplier K at 330,000 FCFA payable. The supplier statement shows 380,000 FCFA. You confirm an unrecorded supplier invoice of 50,000 FCFA. What is the correct reconciled balance owed?",
    "question_fr": "Votre grand livre indique le Fournisseur K à 330 000 FCFA. Le relevé fournisseur indique 380 000 FCFA. Vous identifiez une facture fournisseur non enregistrée de 50 000 FCFA. Quel est le solde réconcilié correct ?",
    "expected_value": 380000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "After posting the missing invoice, the ledger balance becomes 330,000 + 50,000 = 380,000 FCFA, matching the supplier statement.",
    "explanation_fr": "Après enregistrement de la facture manquante, le solde du grand livre devient 330 000 + 50 000 = 380 000 FCFA, conforme au relevé fournisseur.",
    "source": "Reconciliation good practice",
    "verification_required": false,
    "research_source_id": "B8"
  },
  {
    "id": "acc-b09",
    "type": "numeric",
    "topic": "inventory",
    "bloom_layer": "application",
    "time_limit_seconds": 60,
    "question": "Opening stock of cooking-oil cartons is 120. Purchases during the week are 45 cartons. Sales are 130 cartons. Ignoring losses, what is the closing quantity?",
    "question_fr": "Stock d'ouverture de cartons d'huile : 120. Achats de la semaine : 45 cartons. Ventes : 130 cartons. En ignorant les pertes, quel est le stock final ?",
    "expected_value": 35,
    "tolerance": 0,
    "unit_hint": "cartons",
    "input_kind": "integer",
    "explanation": "Closing = Opening + Purchases - Sales = 120 + 45 - 130 = 35 cartons.",
    "explanation_fr": "Stock final = Stock initial + Achats - Ventes = 120 + 45 - 130 = 35 cartons.",
    "source": "Inventory arithmetic",
    "verification_required": false,
    "research_source_id": "B9"
  },
  {
    "id": "acc-b12",
    "type": "numeric",
    "topic": "margin_analysis",
    "bloom_layer": "application",
    "time_limit_seconds": 90,
    "question": "Sales are 3,800,000 FCFA and cost of goods sold is 2,470,000 FCFA. What is the gross-margin percentage? Enter the value (e.g. 35.0 for 35%).",
    "question_fr": "Les ventes sont de 3 800 000 FCFA et le coût des marchandises vendues de 2 470 000 FCFA. Quel est le taux de marge brute en pourcentage ? Entrez la valeur (ex. 35,0 pour 35%).",
    "expected_value": 35.0,
    "tolerance": 0.5,
    "unit_hint": "%",
    "input_kind": "decimal",
    "explanation": "Gross margin = (3,800,000 - 2,470,000) / 3,800,000 = 1,330,000 / 3,800,000 = 35.0%.",
    "explanation_fr": "Marge brute = (3 800 000 - 2 470 000) / 3 800 000 = 1 330 000 / 3 800 000 = 35,0%.",
    "source": "Financial analysis basics",
    "verification_required": false,
    "research_source_id": "B12"
  },
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
    "source": "OHADA SYSCOHADA - amortissements",
    "verification_required": false,
    "research_source_id": "B13"
  },
  {
    "id": "acc-b15",
    "type": "numeric",
    "topic": "accruals",
    "bloom_layer": "application",
    "time_limit_seconds": 120,
    "question": "A company pays 240,000 FCFA on 1 October for a 12-month insurance policy. The financial year ends on 31 December. How much insurance expense should be recognised in the current year?",
    "question_fr": "Une entreprise paie 240 000 FCFA le 1er octobre pour une police d'assurance de 12 mois. L'exercice se clôture le 31 décembre. Quel montant d'assurance doit être comptabilisé en charge sur l'exercice ?",
    "expected_value": 60000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Three months consumed (Oct, Nov, Dec): 240,000 × 3/12 = 60,000 FCFA expense. The remaining 180,000 FCFA stays as a prepayment.",
    "explanation_fr": "Trois mois consommés (oct, nov, déc) : 240 000 × 3/12 = 60 000 FCFA en charge. Les 180 000 FCFA restants restent en charge constatée d'avance.",
    "source": "Accrual accounting basics",
    "verification_required": false,
    "research_source_id": "B15"
  },
  {
    "id": "acc-b16",
    "type": "mcq_single",
    "topic": "control_basics",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "Why is a balanced trial balance necessary but not sufficient proof that the accounts are correct?",
    "question_fr": "Pourquoi une balance équilibrée est-elle nécessaire mais pas suffisante pour prouver que les comptes sont corrects ?",
    "options": [
      "Equal debits and credits prove arithmetic balance, but errors of omission, wrong classification, wrong period, and compensating errors can still exist",
      "It only checks revenue accounts",
      "It is not relevant once a company is computerised",
      "It only matters at year-end, not month-end"
    ],
    "options_fr": [
      "L'équilibre arithmétique entre débits et crédits est respecté, mais des omissions, des erreurs de classement, de période ou compensatoires peuvent subsister",
      "Elle ne vérifie que les comptes de produits",
      "Elle n'est plus pertinente dès qu'une entreprise est informatisée",
      "Elle ne compte qu'en fin d'exercice, pas en clôture mensuelle"
    ],
    "correct_index": 0,
    "explanation": "A trial balance only proves equal totals of debits and credits. Whole-transaction omissions, mis-classifications between accounts, period errors, and offsetting mistakes all leave the trial balance balanced but the books wrong.",
    "explanation_fr": "La balance ne prouve que l'égalité des totaux de débits et de crédits. Les omissions complètes, les erreurs de classement entre comptes, les erreurs de période et les erreurs compensatoires laissent la balance équilibrée mais les comptes faux.",
    "source": "Bookkeeping control basics",
    "verification_required": false,
    "research_source_id": "B16"
  },
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
      "Trimestriellement uniquement"
    ],
    "correct_index": 1,
    "explanation": "DGI's published fiscal calendar places monthly instalments in the first 15 days of the following month. Annual balances are due by 15 March.",
    "explanation_fr": "Le calendrier fiscal de la DGI fixe les acomptes mensuels dans les 15 premiers jours du mois suivant. Le solde annuel est dû au 15 mars.",
    "source": "DGI fiscal calendar 2026",
    "verification_required": true,
    "research_source_id": "B19"
  },
  {
    "id": "acc-b20",
    "type": "mcq_single",
    "topic": "withholding",
    "bloom_layer": "recall",
    "time_limit_seconds": 75,
    "question": "Under the official 2026 DGI withholding order, what VAT-withholding rate applies to transactions subject to source withholding?",
    "question_fr": "Conformément à l'arrêté ministériel 2026 sur les retenues à la source, quel taux de retenue de TVA s'applique aux opérations concernées ?",
    "options": ["17.5%", "18.0%", "19.25%", "20.0%"],
    "options_fr": ["17,5%", "18,0%", "19,25%", "20,0%"],
    "correct_index": 2,
    "explanation": "The official 2026 order maintains VAT withholding at 19.25%. AIR for cited active suppliers is 2.2%, and 10% for suppliers outside the active-taxpayer file.",
    "explanation_fr": "L'arrêté 2026 maintient la retenue TVA à 19,25%. L'AIR pour les fournisseurs actifs visés est de 2,2%, et 10% pour les fournisseurs hors fichier actif.",
    "source": "Arrêté ministériel 2026 sur les retenues à la source",
    "verification_required": true,
    "research_source_id": "B20"
  },
  {
    "id": "acc-b22",
    "type": "mcq_single",
    "topic": "tax_calendar",
    "bloom_layer": "recall",
    "time_limit_seconds": 75,
    "question": "When is patente generally due for renewal by an existing taxpayer in Cameroon?",
    "question_fr": "Quand la patente est-elle généralement due pour renouvellement par un contribuable existant au Cameroun ?",
    "options": [
      "By 31 January",
      "By the last day of February",
      "By 31 March",
      "By 30 June"
    ],
    "options_fr": [
      "Avant le 31 janvier",
      "Avant le dernier jour de février",
      "Avant le 31 mars",
      "Avant le 30 juin"
    ],
    "correct_index": 1,
    "explanation": "Patente renewal is due by the last day of February for existing taxpayers. Property tax sits on a separate timeline (commonly 30 June).",
    "explanation_fr": "Le renouvellement de la patente est dû au plus tard le dernier jour de février pour les contribuables existants. La taxe foncière suit un autre calendrier (généralement le 30 juin).",
    "source": "DGI fiscal calendar 2026",
    "verification_required": true,
    "research_source_id": "B22"
  },
  {
    "id": "acc-b25",
    "type": "numeric",
    "topic": "liquidity_ratio",
    "bloom_layer": "application",
    "time_limit_seconds": 75,
    "question": "Current assets are 5,400,000 FCFA and current liabilities are 3,600,000 FCFA. What is the current ratio? Enter as a decimal (e.g. 1.50).",
    "question_fr": "L'actif circulant est de 5 400 000 FCFA et le passif circulant de 3 600 000 FCFA. Quel est le ratio de liquidité générale ? Entrez en décimal (ex. 1,50).",
    "expected_value": 1.50,
    "tolerance": 0.05,
    "unit_hint": "ratio",
    "input_kind": "decimal",
    "explanation": "Current ratio = Current assets / Current liabilities = 5,400,000 / 3,600,000 = 1.50.",
    "explanation_fr": "Ratio = Actif circulant / Passif circulant = 5 400 000 / 3 600 000 = 1,50.",
    "source": "Financial analysis basics",
    "verification_required": false,
    "research_source_id": "B25"
  },
  {
    "id": "acc-b26",
    "type": "numeric",
    "topic": "cash_forecast",
    "bloom_layer": "application",
    "time_limit_seconds": 150,
    "question": "Opening cash is 400,000 FCFA. Expected cash receipts this week are 850,000 FCFA. Cash payments are: supplier 500,000, wages 300,000, transport 90,000. What is the closing cash for the week?",
    "question_fr": "La trésorerie d'ouverture est de 400 000 FCFA. Encaissements prévus de la semaine : 850 000 FCFA. Décaissements : fournisseur 500 000, salaires 300 000, transport 90 000. Quelle est la trésorerie de clôture ?",
    "expected_value": 360000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Closing = 400,000 + 850,000 - (500,000 + 300,000 + 90,000) = 1,250,000 - 890,000 = 360,000 FCFA.",
    "explanation_fr": "Clôture = 400 000 + 850 000 - (500 000 + 300 000 + 90 000) = 1 250 000 - 890 000 = 360 000 FCFA.",
    "source": "Cash forecasting basics",
    "verification_required": false,
    "research_source_id": "B26"
  },
  {
    "id": "acc-i01",
    "type": "numeric",
    "topic": "asset_capitalization",
    "bloom_layer": "application",
    "time_limit_seconds": 180,
    "question": "A company imports equipment costing 4,000,000 FCFA. Freight to the Douala warehouse is 200,000 FCFA and installation is 150,000 FCFA. Assuming all three are directly attributable costs, what amount should be capitalised as the cost of the asset?",
    "question_fr": "Une entreprise importe un équipement coûtant 4 000 000 FCFA. Le fret jusqu'à l'entrepôt de Douala est de 200 000 FCFA et l'installation de 150 000 FCFA. En supposant que les trois sont des coûts directement attribuables, quel montant capitaliser ?",
    "expected_value": 4350000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Cost = 4,000,000 + 200,000 + 150,000 = 4,350,000 FCFA. Directly attributable costs are capitalised under SYSCOHADA.",
    "explanation_fr": "Coût = 4 000 000 + 200 000 + 150 000 = 4 350 000 FCFA. Les coûts directement attribuables sont capitalisés selon le SYSCOHADA.",
    "source": "OHADA SYSCOHADA - immobilisations",
    "verification_required": false,
    "research_source_id": "I1"
  },
  {
    "id": "acc-i05",
    "type": "numeric",
    "topic": "asset_disposal",
    "bloom_layer": "application",
    "time_limit_seconds": 180,
    "question": "A machine cost 10,000,000 FCFA and accumulated depreciation is 6,500,000 FCFA. It is sold for 4,200,000 FCFA cash. What is the gain on disposal? Enter as a positive number.",
    "question_fr": "Une machine a coûté 10 000 000 FCFA et l'amortissement cumulé est de 6 500 000 FCFA. Elle est vendue 4 200 000 FCFA en espèces. Quel est le gain sur cession ? Entrer un nombre positif.",
    "expected_value": 700000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Carrying amount = 10,000,000 - 6,500,000 = 3,500,000. Gain = 4,200,000 - 3,500,000 = 700,000 FCFA.",
    "explanation_fr": "Valeur nette comptable = 10 000 000 - 6 500 000 = 3 500 000. Gain = 4 200 000 - 3 500 000 = 700 000 FCFA.",
    "source": "OHADA SYSCOHADA - cessions",
    "verification_required": false,
    "research_source_id": "I5"
  },
  {
    "id": "acc-i06",
    "type": "numeric",
    "topic": "vat_calculation",
    "bloom_layer": "application",
    "time_limit_seconds": 180,
    "question": "Sales for the month are 8,000,000 FCFA before VAT. Purchases eligible for VAT deduction are 3,500,000 FCFA before VAT. At a VAT rate of 19.25%, what is the net VAT payable to the DGI for the month?",
    "question_fr": "Les ventes du mois sont de 8 000 000 FCFA HT. Les achats ouvrant droit à déduction sont de 3 500 000 FCFA HT. Au taux de TVA de 19,25%, quelle est la TVA nette à payer à la DGI pour le mois ?",
    "expected_value": 866250,
    "tolerance": 5,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Output VAT = 8,000,000 × 0.1925 = 1,540,000. Input VAT = 3,500,000 × 0.1925 = 673,750. Net = 1,540,000 - 673,750 = 866,250 FCFA.",
    "explanation_fr": "TVA collectée = 8 000 000 × 0,1925 = 1 540 000. TVA déductible = 3 500 000 × 0,1925 = 673 750. Net = 1 540 000 - 673 750 = 866 250 FCFA.",
    "source": "Code Général des Impôts du Cameroun (TVA 19,25%)",
    "verification_required": true,
    "research_source_id": "I6"
  },
  {
    "id": "acc-i07",
    "type": "numeric",
    "topic": "ar_reconciliation",
    "bloom_layer": "application",
    "time_limit_seconds": 150,
    "question": "The customer statement shows 1,250,000 FCFA owed. Your ledger shows 1,390,000 FCFA. You identify an unposted credit note of 140,000 FCFA issued before month-end. What is the corrected ledger balance?",
    "question_fr": "Le relevé client indique 1 250 000 FCFA dus. Votre grand livre indique 1 390 000 FCFA. Vous identifiez un avoir non enregistré de 140 000 FCFA émis avant la clôture du mois. Quel est le solde corrigé du grand livre ?",
    "expected_value": 1250000,
    "tolerance": 1,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Posting the missing credit note reduces the ledger: 1,390,000 - 140,000 = 1,250,000 FCFA, matching the customer statement.",
    "explanation_fr": "L'enregistrement de l'avoir manquant réduit le grand livre : 1 390 000 - 140 000 = 1 250 000 FCFA, conforme au relevé client.",
    "source": "Reconciliation good practice",
    "verification_required": false,
    "research_source_id": "I7"
  },
  {
    "id": "acc-i08",
    "type": "numeric",
    "topic": "cost_accounting",
    "bloom_layer": "application",
    "time_limit_seconds": 150,
    "question": "A beverages producer makes 1,000 crates in a month. Direct materials are 1,800,000 FCFA; direct labour 700,000 FCFA; allocated factory overhead 500,000 FCFA. What is the unit cost per crate?",
    "question_fr": "Un producteur de boissons fabrique 1 000 caisses dans le mois. Matières premières 1 800 000 FCFA ; main d'œuvre directe 700 000 FCFA ; frais généraux d'usine alloués 500 000 FCFA. Quel est le coût unitaire par caisse ?",
    "expected_value": 3000,
    "tolerance": 1,
    "unit_hint": "FCFA per crate",
    "input_kind": "integer",
    "explanation": "Total cost = 1,800,000 + 700,000 + 500,000 = 3,000,000. Unit cost = 3,000,000 / 1,000 = 3,000 FCFA per crate.",
    "explanation_fr": "Coût total = 1 800 000 + 700 000 + 500 000 = 3 000 000. Coût unitaire = 3 000 000 / 1 000 = 3 000 FCFA par caisse.",
    "source": "Cost accounting basics",
    "verification_required": false,
    "research_source_id": "I8"
  },
  {
    "id": "acc-i09",
    "type": "numeric",
    "topic": "trend_analysis",
    "bloom_layer": "application",
    "time_limit_seconds": 90,
    "question": "Sales rose from 24,000,000 FCFA to 27,600,000 FCFA year on year. What is the sales-growth percentage? Enter as a decimal (e.g. 15.0 for 15%).",
    "question_fr": "Le chiffre d'affaires est passé de 24 000 000 FCFA à 27 600 000 FCFA d'une année sur l'autre. Quel est le taux de croissance ? Entrez en décimal (ex. 15,0 pour 15%).",
    "expected_value": 15.0,
    "tolerance": 0.5,
    "unit_hint": "%",
    "input_kind": "decimal",
    "explanation": "Growth = (27,600,000 - 24,000,000) / 24,000,000 = 3,600,000 / 24,000,000 = 15.0%.",
    "explanation_fr": "Croissance = (27 600 000 - 24 000 000) / 24 000 000 = 3 600 000 / 24 000 000 = 15,0%.",
    "source": "Financial analysis basics",
    "verification_required": false,
    "research_source_id": "I9"
  },
  {
    "id": "acc-i10",
    "type": "numeric",
    "topic": "break_even",
    "bloom_layer": "application",
    "time_limit_seconds": 120,
    "question": "A bakery sells a bread basket for 2,000 FCFA. Variable cost per basket is 1,200 FCFA. Monthly fixed costs are 1,600,000 FCFA. What is the break-even volume in baskets per month?",
    "question_fr": "Une boulangerie vend un panier à 2 000 FCFA. Coût variable par panier : 1 200 FCFA. Coûts fixes mensuels : 1 600 000 FCFA. Quel est le seuil de rentabilité en paniers par mois ?",
    "expected_value": 2000,
    "tolerance": 1,
    "unit_hint": "baskets/month",
    "input_kind": "integer",
    "explanation": "Contribution per basket = 2,000 - 1,200 = 800. Break-even = 1,600,000 / 800 = 2,000 baskets.",
    "explanation_fr": "Marge sur coûts variables par panier = 2 000 - 1 200 = 800. Seuil = 1 600 000 / 800 = 2 000 paniers.",
    "source": "Cost-volume-profit basics",
    "verification_required": false,
    "research_source_id": "I10"
  },
  {
    "id": "acc-i11",
    "type": "numeric",
    "topic": "investment_appraisal",
    "bloom_layer": "application",
    "time_limit_seconds": 120,
    "question": "A generator costs 5,000,000 FCFA and is expected to save 1,400,000 FCFA per year in fuel and downtime over 5 years. Ignoring discounting and taxes, what is the simple payback period in years? Round to 2 decimals.",
    "question_fr": "Un groupe électrogène coûte 5 000 000 FCFA et devrait permettre une économie de 1 400 000 FCFA par an pendant 5 ans. En ignorant l'actualisation et la fiscalité, quel est le délai de récupération simple en années ? Arrondir à 2 décimales.",
    "expected_value": 3.57,
    "tolerance": 0.05,
    "unit_hint": "years",
    "input_kind": "decimal",
    "explanation": "Simple payback = 5,000,000 / 1,400,000 ≈ 3.57 years.",
    "explanation_fr": "Délai simple = 5 000 000 / 1 400 000 ≈ 3,57 ans.",
    "source": "Capital budgeting basics",
    "verification_required": false,
    "research_source_id": "I11"
  },
  {
    "id": "acc-i12",
    "type": "numeric",
    "topic": "working_capital",
    "bloom_layer": "application",
    "time_limit_seconds": 90,
    "question": "Inventory days = 48, receivable days = 52, payable days = 35. What is the cash-conversion cycle in days?",
    "question_fr": "Jours de stock = 48, jours clients = 52, jours fournisseurs = 35. Quel est le cycle de conversion de la trésorerie en jours ?",
    "expected_value": 65,
    "tolerance": 0,
    "unit_hint": "days",
    "input_kind": "integer",
    "explanation": "CCC = Inventory days + Receivable days - Payable days = 48 + 52 - 35 = 65 days.",
    "explanation_fr": "CCT = Jours stock + Jours clients - Jours fournisseurs = 48 + 52 - 35 = 65 jours.",
    "source": "Working-capital analysis",
    "verification_required": false,
    "research_source_id": "I12"
  },
  {
    "id": "acc-i22",
    "type": "numeric",
    "topic": "withholding_calculation",
    "bloom_layer": "application",
    "time_limit_seconds": 240,
    "question": "Assumption: a listed withholding agent pays an active supplier in the real regime for goods worth 1,000,000 FCFA before VAT. Using the official 2026 rates (VAT withholding 19.25%, AIR 2.2%), compute the total VAT withholding amount in FCFA.",
    "question_fr": "Hypothèse : un payeur figurant sur la liste des retenues à la source paie un fournisseur actif sous le régime du réel pour des marchandises de 1 000 000 FCFA HT. Avec les taux officiels 2026 (retenue TVA 19,25%, AIR 2,2%), calculez le montant total de la retenue de TVA en FCFA.",
    "expected_value": 192500,
    "tolerance": 5,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "VAT withholding = 1,000,000 × 0.1925 = 192,500 FCFA. (The 2.2% AIR of 22,000 FCFA is a separate withholding, not asked here.)",
    "explanation_fr": "Retenue TVA = 1 000 000 × 0,1925 = 192 500 FCFA. (Les 2,2% d'AIR, soit 22 000 FCFA, sont une retenue distincte, non demandée ici.)",
    "source": "Arrêté ministériel 2026 sur les retenues à la source",
    "verification_required": true,
    "research_source_id": "I22"
  },
  {
    "id": "acc-e01",
    "type": "numeric",
    "topic": "inventory_costing",
    "bloom_layer": "application",
    "time_limit_seconds": 240,
    "question": "A distributor purchases goods for 3,000,000 FCFA before VAT, pays freight of 120,000 FCFA, returns 200,000 FCFA of goods before VAT, and receives a commercial discount of 50,000 FCFA before VAT. Assuming freight is part of inventory cost, what is the final inventory intake before VAT?",
    "question_fr": "Un distributeur achète des marchandises pour 3 000 000 FCFA HT, paie un fret de 120 000 FCFA, retourne 200 000 FCFA de marchandises HT et reçoit une remise commerciale de 50 000 FCFA HT. En supposant que le fret fait partie du coût d'inventaire, quel est le coût final d'entrée en stock HT ?",
    "expected_value": 2870000,
    "tolerance": 5,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Intake = 3,000,000 + 120,000 - 200,000 - 50,000 = 2,870,000 FCFA.",
    "explanation_fr": "Entrée en stock = 3 000 000 + 120 000 - 200 000 - 50 000 = 2 870 000 FCFA.",
    "source": "OHADA SYSCOHADA - stocks",
    "verification_required": false,
    "research_source_id": "E1"
  },
  {
    "id": "acc-e03",
    "type": "numeric",
    "topic": "cash_flow",
    "bloom_layer": "application",
    "time_limit_seconds": 240,
    "question": "Net profit is 9,000,000 FCFA. Depreciation is 2,200,000 FCFA. Receivables rise by 1,500,000 FCFA, inventory falls by 600,000 FCFA, and payables rise by 900,000 FCFA. What is operating cash flow using the indirect method?",
    "question_fr": "Bénéfice net : 9 000 000 FCFA. Amortissement : 2 200 000 FCFA. Les créances augmentent de 1 500 000 FCFA, le stock diminue de 600 000 FCFA, les dettes fournisseurs augmentent de 900 000 FCFA. Quel est le flux de trésorerie d'exploitation par la méthode indirecte ?",
    "expected_value": 11200000,
    "tolerance": 5,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "OCF = 9,000,000 + 2,200,000 - 1,500,000 + 600,000 + 900,000 = 11,200,000 FCFA.",
    "explanation_fr": "FT exploitation = 9 000 000 + 2 200 000 - 1 500 000 + 600 000 + 900 000 = 11 200 000 FCFA.",
    "source": "Cash-flow statement basics",
    "verification_required": false,
    "research_source_id": "E3"
  },
  {
    "id": "acc-e04",
    "type": "numeric",
    "topic": "inventory_provision",
    "bloom_layer": "application",
    "time_limit_seconds": 180,
    "question": "A Yaoundé electronics trader holds 50 slow-moving tablets bought at 150,000 FCFA each. Market evidence suggests they can only be sold at 115,000 FCFA each before selling costs. Ignoring selling costs, what total write-down should the controller propose?",
    "question_fr": "Un commerçant d'électronique à Yaoundé détient 50 tablettes lentes achetées à 150 000 FCFA chacune. Les preuves de marché suggèrent qu'elles ne peuvent être vendues qu'à 115 000 FCFA chacune avant frais de vente. En ignorant les frais de vente, quelle dépréciation totale doit proposer le contrôleur ?",
    "expected_value": 1750000,
    "tolerance": 5,
    "unit_hint": "FCFA",
    "input_kind": "integer",
    "explanation": "Per-unit write-down = 150,000 - 115,000 = 35,000. Total = 35,000 × 50 = 1,750,000 FCFA.",
    "explanation_fr": "Dépréciation par unité = 150 000 - 115 000 = 35 000. Total = 35 000 × 50 = 1 750 000 FCFA.",
    "source": "OHADA SYSCOHADA - dépréciation des stocks",
    "verification_required": false,
    "research_source_id": "E4"
  },
  {
    "id": "acc-e13",
    "type": "ordering",
    "topic": "audit_reconstruction",
    "bloom_layer": "judgment",
    "time_limit_seconds": 240,
    "question": "Put these forensic-reconstruction steps in the order an experienced auditor would normally follow when records are partial and a regional branch has only a bank statement, supplier statements and scanned receipts.",
    "question_fr": "Classez ces étapes de reconstruction forensique dans l'ordre qu'un auditeur expérimenté suivrait normalement lorsque les registres sont incomplets et qu'une agence régionale n'a qu'un relevé bancaire, des relevés fournisseurs et des scans de reçus.",
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
    "explanation": "External third-party evidence is the strongest anchor; everything internal is rebuilt against it. The unexplained residual is the deliverable management can act on.",
    "explanation_fr": "Les preuves externes de tiers sont l'ancrage le plus fiable ; tout ce qui est interne est reconstruit par rapport à elles. Le solde résiduel inexpliqué est le livrable sur lequel la direction peut agir.",
    "source": "Audit good practice - forensic reconstruction",
    "verification_required": false,
    "research_source_id": "E13"
  }
]
```

---

## Admin Assistant — 30 questions

```json
[
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
  },
  {
    "id": "adm-b02",
    "type": "mcq_single",
    "topic": "visitor_triage",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "A visitor insists they have an urgent appointment, but there is no calendar entry and no host has notified you. What is the correct first action?",
    "question_fr": "Un visiteur insiste avoir un rendez-vous urgent, mais il n'y a aucune entrée au calendrier et aucun hôte ne vous a informé. Quelle est la première action correcte ?",
    "options": [
      "Let them in immediately; you don't want them complaining",
      "Verify identity and purpose, contact the host or a delegate, keep the visitor waiting professionally",
      "Refuse access without explanation and ask them to leave",
      "Send them straight to the CEO so the CEO can decide"
    ],
    "options_fr": [
      "Le faire entrer immédiatement pour éviter une plainte",
      "Vérifier identité et objet, contacter l'hôte ou un délégué, faire patienter le visiteur professionnellement",
      "Refuser l'accès sans explication et lui demander de partir",
      "L'envoyer directement chez le DG pour qu'il décide"
    ],
    "correct_index": 1,
    "explanation": "Verify and route — don't grant uncontrolled access, don't refuse without explanation, and don't escalate to leadership for routine visitor triage.",
    "explanation_fr": "Vérifier puis orienter — ni accès non contrôlé, ni refus sans explication, ni remontée systématique au top management pour un triage routinier.",
    "source": "Office administration good practice",
    "verification_required": false,
    "research_source_id": "AD-B02"
  },
  {
    "id": "adm-b07",
    "type": "mcq_single",
    "topic": "inbox_priority",
    "bloom_layer": "judgment",
    "time_limit_seconds": 60,
    "question": "Which item in your inbox should usually be opened FIRST?",
    "question_fr": "Lequel des éléments suivants devez-vous généralement ouvrir EN PREMIER dans votre boîte mail ?",
    "options": [
      "A routine supplier reminder about restocking",
      "A scanned signed contract from a partner",
      "A compliance notice from a public authority",
      "A newsletter from a professional network"
    ],
    "options_fr": [
      "Un rappel fournisseur de routine pour le réapprovisionnement",
      "Un contrat signé scanné d'un partenaire",
      "Une notification de conformité d'une administration publique",
      "Une newsletter d'un réseau professionnel"
    ],
    "correct_index": 2,
    "explanation": "Compliance notices from authorities often carry deadlines. Open and route them before any routine traffic, including signed contracts which are normally less time-sensitive.",
    "explanation_fr": "Les notifications de conformité ont souvent des délais. Les ouvrir et orienter avant tout courrier de routine, y compris les contrats signés qui sont en général moins urgents.",
    "source": "Inbox prioritisation good practice",
    "verification_required": false,
    "research_source_id": "AD-B07"
  },
  {
    "id": "adm-b08",
    "type": "true_false",
    "topic": "confidentiality",
    "bloom_layer": "judgment",
    "time_limit_seconds": 45,
    "question": "A colleague not on the HR team asks to browse candidate CVs sitting on the reception desk. It is acceptable to let them browse because the CVs are not technically labelled confidential.",
    "question_fr": "Un collègue qui ne fait pas partie de l'équipe RH demande à consulter les CV des candidats laissés sur le comptoir d'accueil. Il est acceptable de le laisser consulter puisque les CV ne sont pas explicitement marqués confidentiels.",
    "options": ["True", "False"],
    "options_fr": ["Vrai", "Faux"],
    "correct_index": 1,
    "explanation": "Candidate CVs contain personal data and recruitment context. They are confidential by nature, not by label. Access is restricted to authorised HR staff.",
    "explanation_fr": "Les CV contiennent des données personnelles et un contexte de recrutement. Ils sont confidentiels par nature, pas par étiquetage. L'accès est limité au personnel RH autorisé.",
    "source": "Data protection good practice",
    "verification_required": false,
    "research_source_id": "AD-B08"
  },
  {
    "id": "adm-b09",
    "type": "mcq_single",
    "topic": "calendar_planning",
    "bloom_layer": "application",
    "time_limit_seconds": 75,
    "question": "Your manager has three external meetings in different parts of Yaoundé on the same day. What should you build into the calendar before sending confirmations?",
    "question_fr": "Votre responsable a trois rendez-vous externes dans des quartiers différents de Yaoundé le même jour. Que devez-vous intégrer au calendrier avant d'envoyer les confirmations ?",
    "options": [
      "Back-to-back meetings to maximise productive time",
      "Travel time, preparation buffers, overrun allowance, venue or link verification, and a lunch slot",
      "Only the meeting times themselves; the manager handles the rest",
      "Half-hour buffers only at the very start and end of the day"
    ],
    "options_fr": [
      "Réunions enchaînées pour maximiser le temps utile",
      "Temps de trajet, buffers de préparation, marge pour dépassements, vérification des lieux/liens, créneau déjeuner",
      "Seulement les heures de réunion ; le responsable gère le reste",
      "Buffers d'une demi-heure uniquement en début et fin de journée"
    ],
    "correct_index": 1,
    "explanation": "Realistic Yaoundé schedules need travel time, preparation buffers, and overrun allowances. Stacking meetings back-to-back guarantees the day collapses on the first delay.",
    "explanation_fr": "Une journée yaoundéenne réaliste nécessite trajets, buffers de préparation et marges pour dépassements. Enchaîner les réunions garantit l'effondrement au premier retard.",
    "source": "Executive assistant good practice",
    "verification_required": false,
    "research_source_id": "AD-B09"
  },
  {
    "id": "adm-b10",
    "type": "mcq_single",
    "topic": "room_booking",
    "bloom_layer": "application",
    "time_limit_seconds": 60,
    "question": "Two teams claim the same meeting room at 09:00. What is the correct first step?",
    "question_fr": "Deux équipes revendiquent la même salle de réunion à 09h00. Quelle est la première démarche correcte ?",
    "options": [
      "Whoever arrives first gets the room",
      "Check the booking record, identify the rightful holder, propose an alternative room or time to the other, and update the calendar",
      "Let the senior manager decide on the spot",
      "Cancel both meetings and ask everyone to reschedule"
    ],
    "options_fr": [
      "Le premier arrivé garde la salle",
      "Vérifier l'enregistrement de réservation, identifier le détenteur légitime, proposer une autre salle ou créneau à l'autre équipe, mettre à jour le calendrier",
      "Laisser le responsable le plus senior trancher sur place",
      "Annuler les deux réunions et demander à chacun de reprogrammer"
    ],
    "correct_index": 1,
    "explanation": "Booking records are the source of truth. Identify the rightful holder, then propose an alternative — don't reward chaos or shortcut by seniority.",
    "explanation_fr": "L'enregistrement de réservation fait foi. Identifier le détenteur légitime puis proposer une alternative — ne pas récompenser le chaos ni trancher par ancienneté.",
    "source": "Office administration good practice",
    "verification_required": false,
    "research_source_id": "AD-B10"
  },
  {
    "id": "adm-b11",
    "type": "mcq_single",
    "topic": "meeting_records",
    "bloom_layer": "recall",
    "time_limit_seconds": 60,
    "question": "Which set of sections belongs in good minutes for an internal operations meeting?",
    "question_fr": "Quel ensemble de sections convient à un bon procès-verbal de réunion d'exploitation interne ?",
    "options": [
      "Word-for-word transcript of every comment",
      "Date and time, attendees, agenda, key decisions, action items with owners and deadlines",
      "Just the action items, nothing else",
      "Date and a list of who spoke, with no decisions or actions"
    ],
    "options_fr": [
      "Transcription mot à mot de chaque commentaire",
      "Date et heure, participants, ordre du jour, décisions clés, actions avec responsables et échéances",
      "Uniquement les actions, rien d'autre",
      "Date et liste des intervenants, sans décisions ni actions"
    ],
    "correct_index": 1,
    "explanation": "Effective minutes record decisions and actions, not verbatim discussion. Owner and deadline make actions enforceable.",
    "explanation_fr": "De bons PV consignent les décisions et actions, pas la discussion verbatim. Responsable et échéance rendent les actions exécutables.",
    "source": "Meeting minutes good practice",
    "verification_required": false,
    "research_source_id": "AD-B11"
  },
  {
    "id": "adm-b12",
    "type": "matching",
    "topic": "meeting_artefacts",
    "bloom_layer": "recall",
    "time_limit_seconds": 120,
    "question": "Match each document to its primary purpose.",
    "question_fr": "Faites correspondre chaque document à son objectif principal.",
    "left_items": ["Agenda", "Minutes", "Action tracker"],
    "left_items_fr": ["Ordre du jour", "Procès-verbal", "Tableau de suivi des actions"],
    "right_items": [
      "Before-meeting plan of what will be discussed and in what order",
      "After-meeting record of decisions and assigned actions",
      "Living document used between meetings to follow up on owners and deadlines"
    ],
    "right_items_fr": [
      "Plan avant réunion de ce qui sera discuté et dans quel ordre",
      "Compte rendu après réunion des décisions et actions assignées",
      "Document vivant utilisé entre réunions pour suivre responsables et échéances"
    ],
    "correct_pairs": [[0, 0], [1, 1], [2, 2]],
    "explanation": "Three distinct artefacts with three distinct timing roles — before, immediately after, and ongoing between meetings.",
    "explanation_fr": "Trois livrables distincts avec trois rôles temporels distincts — avant, immédiatement après, et en continu entre les réunions.",
    "source": "Meeting management good practice",
    "verification_required": false,
    "research_source_id": "AD-B12"
  },
  {
    "id": "adm-b16",
    "type": "true_false",
    "topic": "document_control",
    "bloom_layer": "recall",
    "time_limit_seconds": 45,
    "question": "A scanned document with one missing page is still acceptable for official filing as long as the visible pages are readable.",
    "question_fr": "Un document scanné avec une page manquante est acceptable pour le classement officiel tant que les pages visibles sont lisibles.",
    "options": ["True", "False"],
    "options_fr": ["Vrai", "Faux"],
    "correct_index": 1,
    "explanation": "An incomplete scan is unacceptable. Re-scan to capture all pages and verify completeness before filing.",
    "explanation_fr": "Un scan incomplet est inacceptable. Re-scanner pour capturer toutes les pages et vérifier l'intégralité avant classement.",
    "source": "Document control good practice",
    "verification_required": false,
    "research_source_id": "AD-B16"
  },
  {
    "id": "adm-b17",
    "type": "mcq_single",
    "topic": "continuity",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "The office printer fails and power is fluctuating, one hour before a board file must be delivered. What is the right response?",
    "question_fr": "L'imprimante du bureau tombe en panne et l'alimentation fluctue, une heure avant la remise d'un dossier du conseil. Quelle est la bonne réponse ?",
    "options": [
      "Wait for power to stabilise and the printer to come back",
      "Switch to a backup printer or service centre, prioritise the essential pages, notify the file owner, document any delay risk",
      "Cancel the delivery and reschedule the board",
      "Ask the board chair to come collect the file in person"
    ],
    "options_fr": [
      "Attendre que l'alimentation se stabilise et que l'imprimante revienne",
      "Passer sur une imprimante de secours ou un centre de reprographie, prioriser les pages essentielles, prévenir le responsable du dossier, consigner tout risque de retard",
      "Annuler la livraison et reporter le conseil",
      "Demander au président du conseil de venir chercher le dossier en personne"
    ],
    "correct_index": 1,
    "explanation": "Continuity means executing through the disruption — find backup capacity, prioritise, and communicate. Waiting passively is not a plan.",
    "explanation_fr": "La continuité, c'est exécuter malgré la perturbation — trouver une capacité de secours, prioriser, communiquer. Attendre passivement n'est pas un plan.",
    "source": "Business continuity practice",
    "verification_required": false,
    "research_source_id": "AD-B17"
  },
  {
    "id": "adm-b18",
    "type": "mcq_single",
    "topic": "stock_register",
    "bloom_layer": "recall",
    "time_limit_seconds": 75,
    "question": "Which set of columns belongs in a basic stationery stock register?",
    "question_fr": "Quel ensemble de colonnes appartient à un registre de stock de fournitures basique ?",
    "options": [
      "Item, opening balance, received, issued, closing balance, reorder level, custodian",
      "Just item and quantity",
      "Item, supplier, and price only",
      "Item, opening balance, and a single notes field"
    ],
    "options_fr": [
      "Article, stock initial, reçu, sorti, stock final, niveau de réapprovisionnement, responsable",
      "Article et quantité uniquement",
      "Article, fournisseur et prix uniquement",
      "Article, stock initial et un seul champ remarques"
    ],
    "correct_index": 0,
    "explanation": "A useful register tracks flows in and out, signals when to reorder, and identifies the custodian responsible for the count.",
    "explanation_fr": "Un registre utile suit les flux entrants/sortants, signale le réapprovisionnement et identifie le responsable du décompte.",
    "source": "Stock control good practice",
    "verification_required": false,
    "research_source_id": "AD-B18"
  },
  {
    "id": "adm-b20",
    "type": "mcq_single",
    "topic": "document_escalation",
    "bloom_layer": "judgment",
    "time_limit_seconds": 60,
    "question": "A sealed tax document arrives while the finance manager is at lunch. What should happen immediately?",
    "question_fr": "Un document fiscal scellé arrive pendant la pause déjeuner du directeur financier. Que doit-il se passer immédiatement ?",
    "options": [
      "Open it to see how urgent it is",
      "Log receipt with timestamp, keep it sealed and secured, alert the delegate, hand over on the finance manager's return",
      "Leave it on the manager's desk and continue with other tasks",
      "Forward the envelope to the CEO"
    ],
    "options_fr": [
      "L'ouvrir pour évaluer l'urgence",
      "Enregistrer la réception avec horodatage, le garder scellé et sécurisé, prévenir le suppléant, le remettre au retour du directeur financier",
      "Le laisser sur le bureau du responsable et continuer ses tâches",
      "Transférer l'enveloppe au DG"
    ],
    "correct_index": 1,
    "explanation": "Sealed regulatory mail must not be opened by intermediaries. Log, secure, and alert the delegate so it isn't lost or delayed.",
    "explanation_fr": "Le courrier réglementaire scellé ne doit pas être ouvert par des intermédiaires. Enregistrer, sécuriser et prévenir un suppléant pour éviter perte ou retard.",
    "source": "Office administration good practice",
    "verification_required": false,
    "research_source_id": "AD-B20"
  },
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
      "Notify the responsible finance or compliance lead",
      "Save or print a backup copy and secure the file",
      "Open a follow-up tracker entry for this notice"
    ],
    "items_fr": [
      "Horodater la notification et l'enregistrer dans le registre du courrier entrant",
      "Prévenir le responsable financier ou de conformité concerné",
      "Sauvegarder ou imprimer une copie de secours et sécuriser le dossier",
      "Ouvrir une entrée de suivi dédiée à cette notification"
    ],
    "correct_order": [0, 1, 2, 3],
    "explanation": "Log first to fix the official receipt time, notify the owner quickly because some notices have short deadlines, backup the copy, then create the tracker. Logging precedes notifying because the owner will ask what the registered receipt time was.",
    "explanation_fr": "Enregistrer d'abord pour fixer l'heure officielle, prévenir vite car certaines notifications ont des délais courts, sauvegarder la copie, puis créer le suivi. L'enregistrement précède la notification parce que le responsable demandera l'heure de réception consignée.",
    "source": "Office administration / DGI workflow",
    "verification_required": false,
    "research_source_id": "AD-B21"
  },
  {
    "id": "adm-b22",
    "type": "mcq_single",
    "topic": "cnps_basics",
    "bloom_layer": "recall",
    "time_limit_seconds": 75,
    "question": "Someone walks in and asks for the employer's CNPS registration file. Which set of identifiers should be the easiest to retrieve immediately?",
    "question_fr": "Quelqu'un demande le dossier d'enregistrement CNPS de l'employeur. Quel ensemble d'identifiants doit être le plus facile à retrouver immédiatement ?",
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
    "explanation": "The CNPS registration file proves the employer is registered and currently in good standing. A name and address, a single receipt, or a personnel list does not establish the employer's CNPS identity.",
    "explanation_fr": "Le dossier d'enregistrement CNPS prouve que l'employeur est immatriculé et à jour. Un simple nom et adresse, un reçu isolé ou la liste du personnel ne suffisent pas à établir l'identité CNPS de l'employeur.",
    "source": "CNPS employer obligations",
    "verification_required": true,
    "research_source_id": "AD-B22"
  },
  {
    "id": "adm-b25",
    "type": "true_false",
    "topic": "executive_confidentiality",
    "bloom_layer": "judgment",
    "time_limit_seconds": 45,
    "question": "If a friend politely asks where the director is travelling this week, it is fine to share the itinerary since the friend is harmless.",
    "question_fr": "Si un ami demande poliment où le directeur voyage cette semaine, il est correct de partager l'itinéraire puisque l'ami est sans danger.",
    "options": ["True", "False"],
    "options_fr": ["Vrai", "Faux"],
    "correct_index": 1,
    "explanation": "Travel itineraries are confidential — disclosure creates security and reputational risk regardless of who is asking. Only share through authorised channels.",
    "explanation_fr": "Les itinéraires de voyage sont confidentiels — la divulgation crée des risques de sécurité et de réputation quelle que soit la personne. Ne partager que par les canaux autorisés.",
    "source": "Executive assistant good practice",
    "verification_required": false,
    "research_source_id": "AD-B25"
  },
  {
    "id": "adm-b26",
    "type": "mcq_single",
    "topic": "fraud_detection",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "You receive a WhatsApp message from an unknown number claiming to be your CEO and telling you to pay a supplier urgently. What is the safest first move?",
    "question_fr": "Vous recevez un message WhatsApp d'un numéro inconnu prétendant être votre DG et vous demandant de payer un fournisseur en urgence. Quel est le premier geste le plus sûr ?",
    "options": [
      "Process the payment quickly to avoid upsetting the CEO",
      "Do not act; verify the CEO's request through an official channel; preserve the message; escalate the suspicious request",
      "Reply asking the sender to send the same instruction from the CEO's known number",
      "Forward the message to colleagues for their opinion"
    ],
    "options_fr": [
      "Traiter le paiement rapidement pour ne pas contrarier le DG",
      "Ne pas agir ; vérifier la demande du DG par un canal officiel ; conserver le message ; faire remonter la demande suspecte",
      "Répondre en demandant à l'expéditeur d'envoyer la même instruction depuis le numéro connu du DG",
      "Transférer le message à des collègues pour avis"
    ],
    "correct_index": 1,
    "explanation": "Classic CEO-impersonation fraud. Verify through an independent official channel, preserve the message as evidence, and escalate via the standard fraud-reporting path.",
    "explanation_fr": "Fraude classique par usurpation du DG. Vérifier via un canal officiel indépendant, conserver le message comme preuve et faire remonter via la procédure standard de signalement.",
    "source": "Office security good practice",
    "verification_required": false,
    "research_source_id": "AD-B26"
  },
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
      "Locking in what was agreed on a phone call",
      "A polite reminder about a recurring deadline a week away"
    ],
    "left_items_fr": [
      "Envoi d'un contrat signé pour les archives",
      "Clarification urgente avant une réunion dans 10 minutes",
      "Formaliser ce qui a été convenu lors d'un appel téléphonique",
      "Rappel poli pour une échéance récurrente dans une semaine"
    ],
    "right_items": ["Email", "Phone call", "Email after a phone call"],
    "right_items_fr": ["Email", "Appel téléphonique", "Email après un appel téléphonique"],
    "correct_pairs": [[0, 0], [1, 1], [2, 2], [3, 0]],
    "explanation": "Email for records, attachments, and non-urgent reminders. A call for urgent clarification. Email-after-call to formalise what was agreed verbally.",
    "explanation_fr": "Email pour archives, pièces jointes et rappels non urgents. Appel pour clarifications urgentes. Email après l'appel pour formaliser ce qui a été convenu oralement.",
    "source": "Office administration practice",
    "verification_required": false,
    "research_source_id": "AD-B27"
  },
  {
    "id": "adm-b28",
    "type": "mcq_single",
    "topic": "acknowledgment_messages",
    "bloom_layer": "application",
    "time_limit_seconds": 75,
    "question": "Which structure makes a brief acknowledgment message confirming receipt of documents most useful?",
    "question_fr": "Quelle structure rend le plus utile un court message d'accusé de réception de documents ?",
    "options": [
      "A single line: 'Received, thanks'",
      "Receipt confirmed, document reference, next step, responsible contact, polite close",
      "Long paragraph thanking the sender",
      "Restate the entire content of what was received"
    ],
    "options_fr": [
      "Une seule ligne : « Reçu, merci »",
      "Confirmation de réception, référence du document, étape suivante, contact responsable, conclusion polie",
      "Long paragraphe pour remercier l'expéditeur",
      "Reformuler tout le contenu reçu"
    ],
    "correct_index": 1,
    "explanation": "An acknowledgement should be concise but actionable: what was received, what happens next, and who owns it.",
    "explanation_fr": "Un accusé de réception doit être bref mais actionnable : ce qui a été reçu, ce qui suit, qui est responsable.",
    "source": "Office communications good practice",
    "verification_required": false,
    "research_source_id": "AD-B28"
  },
  {
    "id": "adm-b29",
    "type": "mcq_single",
    "topic": "de_escalation",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "An angry visitor says they have been kept waiting too long. What should your response sound like?",
    "question_fr": "Un visiteur en colère affirme avoir attendu trop longtemps. À quoi doit ressembler votre réponse ?",
    "options": [
      "Argue back that the delay was their fault for arriving early",
      "Calm apology, verify their need, give a realistic update, escalate if needed",
      "Walk away and ignore the visitor until they calm down",
      "Tell them to come back another day"
    ],
    "options_fr": [
      "Argumenter que le retard est de leur faute parce qu'ils sont arrivés en avance",
      "Excuse calme, vérifier leur besoin, donner un point réaliste, escalader si nécessaire",
      "S'éloigner et ignorer le visiteur jusqu'à ce qu'il se calme",
      "Lui demander de revenir un autre jour"
    ],
    "correct_index": 1,
    "explanation": "De-escalation: acknowledge the feeling, give a realistic update, and escalate if you can't resolve it yourself. Don't argue, don't ignore, don't punish.",
    "explanation_fr": "Désamorçage : reconnaître le ressenti, donner un point réaliste et escalader si vous ne pouvez pas régler vous-même. Ne pas argumenter, ne pas ignorer, ne pas punir.",
    "source": "Front desk good practice",
    "verification_required": false,
    "research_source_id": "AD-B29"
  },
  {
    "id": "adm-b30",
    "type": "true_false",
    "topic": "record_integrity",
    "bloom_layer": "judgment",
    "time_limit_seconds": 45,
    "question": "A colleague asks you to amend an attendance sheet after it has been signed off, 'to help someone out.' It is acceptable as long as the amendment is small.",
    "question_fr": "Un collègue vous demande de modifier une feuille de présence après qu'elle a été signée, « pour aider quelqu'un ». C'est acceptable tant que la modification est petite.",
    "options": ["True", "False"],
    "options_fr": ["Vrai", "Faux"],
    "correct_index": 1,
    "explanation": "Altering a signed-off record is record-falsification regardless of size. Refuse, route any legitimate correction through the formal process, and preserve the original.",
    "explanation_fr": "Modifier un enregistrement signé est une falsification quelle que soit l'ampleur. Refuser, faire passer toute correction légitime par la procédure formelle, conserver l'original.",
    "source": "Record integrity good practice",
    "verification_required": false,
    "research_source_id": "AD-B30"
  },
  {
    "id": "adm-i01",
    "type": "mcq_single",
    "topic": "calendar_structure",
    "bloom_layer": "application",
    "time_limit_seconds": 90,
    "question": "How should you structure an executive's weekly calendar so urgent work doesn't destroy every planned meeting?",
    "question_fr": "Comment structurer le calendrier hebdomadaire d'un dirigeant pour que les urgences ne ruinent pas chaque réunion prévue ?",
    "options": [
      "Stack meetings back-to-back to maximise the number of slots",
      "Fixed priorities, buffer blocks, preparation windows, travel time, and protected focus slots",
      "Leave the calendar mostly empty and let the day organise itself",
      "Only schedule meetings two days at a time"
    ],
    "options_fr": [
      "Enchaîner les réunions pour maximiser les créneaux",
      "Priorités fixes, blocs tampons, fenêtres de préparation, temps de trajet, créneaux protégés de concentration",
      "Garder le calendrier presque vide et laisser la journée s'organiser seule",
      "Ne planifier que sur deux jours à la fois"
    ],
    "correct_index": 1,
    "explanation": "Structured calendars survive interruption because buffers and protected slots absorb the shocks. Back-to-back stacking guarantees a collapse on the first delay.",
    "explanation_fr": "Un calendrier structuré survit aux interruptions grâce aux buffers et créneaux protégés. L'enchaînement garantit l'effondrement au premier retard.",
    "source": "Executive assistant good practice",
    "verification_required": false,
    "research_source_id": "AD-I01"
  },
  {
    "id": "adm-i04",
    "type": "mcq_single",
    "topic": "action_tracker_design",
    "bloom_layer": "application",
    "time_limit_seconds": 75,
    "question": "Which set of columns makes an action tracker genuinely useful rather than decorative?",
    "question_fr": "Quel ensemble de colonnes rend un tableau de suivi des actions réellement utile et non purement décoratif ?",
    "options": [
      "Decision, owner, due date, status, evidence, blocker, next follow-up",
      "Just decision and due date",
      "Decision, the manager's mood, and a comment",
      "Decision and status only"
    ],
    "options_fr": [
      "Décision, responsable, échéance, statut, preuve, blocage, prochaine relance",
      "Décision et échéance uniquement",
      "Décision, humeur du responsable et un commentaire",
      "Décision et statut uniquement"
    ],
    "correct_index": 0,
    "explanation": "Owner + due date make actions enforceable; evidence + blocker columns force honest status updates rather than vague 'in progress' entries.",
    "explanation_fr": "Responsable + échéance rendent les actions exécutables ; les colonnes preuve + blocage forcent des points honnêtes plutôt qu'un vague « en cours ».",
    "source": "Project administration good practice",
    "verification_required": false,
    "research_source_id": "AD-I04"
  },
  {
    "id": "adm-i09",
    "type": "mcq_single",
    "topic": "expense_review",
    "bloom_layer": "judgment",
    "time_limit_seconds": 90,
    "question": "Which three red flags should make an expense claim unsuitable for immediate processing?",
    "question_fr": "Quels trois signaux d'alerte rendent une note de frais inapte au traitement immédiat ?",
    "options": [
      "The employee submitted it on a Monday",
      "Missing support, unclear business purpose, no approval or mismatch with the travel or event record",
      "The total amount is larger than last month",
      "The claim is in a different language than the policy"
    ],
    "options_fr": [
      "L'employé l'a soumise un lundi",
      "Justificatifs manquants, objet d'affaires flou, absence d'approbation ou divergence avec le dossier voyage/événement",
      "Le montant total est plus élevé que le mois précédent",
      "La note est dans une autre langue que la politique"
    ],
    "correct_index": 1,
    "explanation": "Substance, support, and approval — those are the three controls every expense claim must pass. Day of submission, total trend, and language don't decide validity.",
    "explanation_fr": "Substance, justificatifs et approbation — ce sont les trois contrôles que doit passer toute note de frais. Le jour de soumission, la tendance du total et la langue ne décident pas de la validité.",
    "source": "Expense control good practice",
    "verification_required": false,
    "research_source_id": "AD-I09"
  },
  {
    "id": "adm-i14",
    "type": "mcq_single",
    "topic": "procurement_change_control",
    "bloom_layer": "judgment",
    "time_limit_seconds": 90,
    "question": "A vendor revises its quote upward after the approval was already granted. What should happen before procurement moves forward?",
    "question_fr": "Un fournisseur révise son devis à la hausse après que l'approbation a été obtenue. Que doit-il se passer avant que les achats ne poursuivent ?",
    "options": [
      "Process the higher amount silently to keep the timeline",
      "Re-evaluate against the approval threshold and competitive process, document the revision, obtain renewed sign-off if needed",
      "Refuse the revised quote outright and find a new vendor",
      "Split the difference informally with the vendor"
    ],
    "options_fr": [
      "Traiter le montant supérieur en silence pour tenir le planning",
      "Réévaluer par rapport au seuil d'approbation et au processus concurrentiel, documenter la révision, obtenir une nouvelle approbation si nécessaire",
      "Refuser le devis révisé d'office et chercher un autre fournisseur",
      "Couper la poire en deux de manière informelle avec le fournisseur"
    ],
    "correct_index": 1,
    "explanation": "A material change resets the approval. Document the revision and get fresh sign-off — don't hide the change, don't reject reflexively.",
    "explanation_fr": "Une modification matérielle remet à zéro l'approbation. Documenter la révision et obtenir une nouvelle approbation — ne pas cacher le changement, ne pas refuser par réflexe.",
    "source": "Procurement control good practice",
    "verification_required": false,
    "research_source_id": "AD-I14"
  },
  {
    "id": "adm-i20",
    "type": "ordering",
    "topic": "inspection_preparation",
    "bloom_layer": "application",
    "time_limit_seconds": 240,
    "question": "Finance says a DGI or CNPS inspection team may arrive soon. Put these five preparation steps in the right order.",
    "question_fr": "La finance annonce qu'une équipe d'inspection DGI ou CNPS pourrait arriver bientôt. Classez ces cinq étapes de préparation dans le bon ordre.",
    "items": [
      "Confirm scope of inspection and the documents most likely to be requested",
      "Pull and index the files most likely to be requested",
      "Set up the document room: visitor sign-in, request log, copy/scan support",
      "Brief the responsible finance or compliance lead on what is ready and any gaps",
      "Open a document-request tracker for items the team asks for during the visit"
    ],
    "items_fr": [
      "Confirmer le périmètre de l'inspection et les documents les plus probables",
      "Sortir et indexer les dossiers les plus probables",
      "Préparer la salle des documents : registre des visiteurs, journal des demandes, support copie/scan",
      "Briefer le responsable financier ou de conformité sur ce qui est prêt et les écarts",
      "Ouvrir un tracker des demandes pour les éléments réclamés pendant la visite"
    ],
    "correct_order": [0, 1, 2, 3, 4],
    "explanation": "Scope first, then build the file pull against it, then logistics, then briefing, then run the tracker once the visit starts.",
    "explanation_fr": "D'abord le périmètre, puis la constitution des dossiers, puis la logistique, puis le briefing, puis le tracker une fois la visite commencée.",
    "source": "DGI / CNPS inspection good practice",
    "verification_required": false,
    "research_source_id": "AD-I20"
  },
  {
    "id": "adm-i25",
    "type": "true_false",
    "topic": "hr_confidentiality",
    "bloom_layer": "judgment",
    "time_limit_seconds": 45,
    "question": "It is fine to store salary letters and performance evaluations in an open shared folder so the whole team can find them quickly.",
    "question_fr": "Il est acceptable de stocker les lettres de salaire et les évaluations de performance dans un dossier partagé ouvert pour que toute l'équipe les retrouve rapidement.",
    "options": ["True", "False"],
    "options_fr": ["Vrai", "Faux"],
    "correct_index": 1,
    "explanation": "Salary and evaluation documents are confidential. Restricted access with a clear owner is required; convenience does not override confidentiality.",
    "explanation_fr": "Les documents de salaire et d'évaluation sont confidentiels. Un accès restreint avec un responsable clair est obligatoire ; la commodité ne prime pas sur la confidentialité.",
    "source": "HR confidentiality good practice",
    "verification_required": false,
    "research_source_id": "AD-I25"
  },
  {
    "id": "adm-i27",
    "type": "mcq_single",
    "topic": "continuity_planning",
    "bloom_layer": "judgment",
    "time_limit_seconds": 90,
    "question": "A power cut and network failure hit the same morning a deadline-sensitive online compliance task is pending. What do you do?",
    "question_fr": "Une coupure de courant et une panne réseau surviennent le matin même où une tâche de conformité en ligne sensible aux délais est en attente. Que faites-vous ?",
    "options": [
      "Wait passively until power and network return",
      "Switch to a backup connectivity path or location, notify the owner, preserve evidence, and use the documented contingency route",
      "Cancel the compliance task and explain after the fact",
      "Ask the regulator for an indefinite extension"
    ],
    "options_fr": [
      "Attendre passivement le retour du courant et du réseau",
      "Basculer sur un canal de connectivité ou un site de secours, prévenir le responsable, conserver les preuves, suivre la procédure de contingence documentée",
      "Annuler la tâche de conformité et expliquer après coup",
      "Demander à l'administration un report sans date"
    ],
    "correct_index": 1,
    "explanation": "Continuity plans exist precisely for this. Switch to backup, communicate, preserve evidence — don't wait, don't cancel, don't ask for an open-ended extension.",
    "explanation_fr": "Les plans de continuité existent précisément pour cela. Basculer en secours, communiquer, conserver les preuves — ne pas attendre, ne pas annuler, ne pas demander de report indéfini.",
    "source": "Business continuity good practice",
    "verification_required": false,
    "research_source_id": "AD-I27"
  },
  {
    "id": "adm-i29",
    "type": "mcq_single",
    "topic": "rumor_management",
    "bloom_layer": "judgment",
    "time_limit_seconds": 75,
    "question": "Staff ask whether layoffs are coming because they saw many sealed HR envelopes. What should you say?",
    "question_fr": "Le personnel demande si des licenciements arrivent parce qu'ils ont vu de nombreuses enveloppes RH scellées. Que devez-vous dire ?",
    "options": [
      "Tell them what you think is happening to calm them down",
      "Do not speculate; keep confidentiality; direct concerns to the authorised communication channel (HR or leadership)",
      "Refuse to talk and walk away",
      "Forward their concerns anonymously to leadership without telling them"
    ],
    "options_fr": [
      "Leur dire ce que vous pensez qu'il se passe pour les calmer",
      "Ne pas spéculer ; maintenir la confidentialité ; rediriger les préoccupations vers le canal de communication autorisé (RH ou direction)",
      "Refuser de parler et s'éloigner",
      "Faire remonter leurs préoccupations anonymement à la direction sans les en informer"
    ],
    "correct_index": 1,
    "explanation": "Speculation amplifies rumour and damages trust. Decline to speculate, name the authorised channel, and let staff escalate properly if they want answers.",
    "explanation_fr": "La spéculation amplifie la rumeur et abîme la confiance. Refuser de spéculer, nommer le canal autorisé, et laisser le personnel faire remonter correctement.",
    "source": "Office communications good practice",
    "verification_required": false,
    "research_source_id": "AD-I29"
  },
  {
    "id": "adm-e20",
    "type": "mcq_single",
    "topic": "segregation_of_duties",
    "bloom_layer": "judgment",
    "time_limit_seconds": 90,
    "question": "Why is it risky if the same person requests petty cash, approves it, holds the cash box, and records retirement?",
    "question_fr": "Pourquoi est-il risqué que la même personne demande la petite caisse, l'approuve, détienne la caisse et enregistre les régularisations ?",
    "options": [
      "It is not risky as long as the person is trusted",
      "Concentration of control over the entire cash cycle enables error and fraud and removes any independent check",
      "It is risky only when amounts exceed 100,000 FCFA",
      "It is risky only if the person is new to the company"
    ],
    "options_fr": [
      "Ce n'est pas risqué tant que la personne est de confiance",
      "Concentrer le contrôle sur tout le cycle de caisse permet erreur et fraude et supprime tout contrôle indépendant",
      "Ce n'est risqué qu'au-delà de 100 000 FCFA",
      "Ce n'est risqué que si la personne est nouvelle dans l'entreprise"
    ],
    "correct_index": 1,
    "explanation": "Segregation of duties is structural, not personality-based. The same individual touching every stage of a cash cycle removes the independent check that catches mistakes and deters fraud.",
    "explanation_fr": "La séparation des tâches est structurelle, pas une question de personne. La même personne intervenant à chaque étape du cycle de caisse supprime le contrôle indépendant qui détecte les erreurs et dissuade la fraude.",
    "source": "Internal control good practice",
    "verification_required": false,
    "research_source_id": "AD-E20"
  }
]
```

---

## Verification queue

Questions whose answer keys MUST be verified by a working SME before
the challenge flips to `active`. All flagged `verification_required: true`:

**Accountant (5):** `acc-b03`, `acc-b04`, `acc-b19`, `acc-b20`, `acc-b22`,
`acc-i06`, `acc-i22`. Verify against current DGI calendar, withholding
order, and CGI. If any rate has changed in 2026, update `expected_value`
or `correct_index` before activation.

**Admin (1):** `adm-b22`. Verify the CNPS registration-file contents
list against CNPS employer obligations.

Once SME signs off, set `verification_required: false` on the JSON before
activating.

## What this doc does NOT cover

- **Judgment scenarios that need free-text answers.** Roughly 60% of the
  original research bank is open-ended judgment cases. Those go into the
  backlog until/unless we ship manual-review support in a future sprint.
- **Payroll-barème lookups (B23, B24).** These need the exact current
  numbers from the DGI barème PDF, which we cannot verify from here.
  Skipped pending an SME with access to confirm.
- **Pure governance/case-study questions (E11, E12, E40, etc.).** Same
  reason — they require free-text answers we can't auto-grade.

## Next steps

1. SME (or anyone with current DGI/CNPS source access) reviews the 8
   verification_required entries.
2. Admin PATCHes both arrays into the seeded challenges.
3. Pilot with 10–20 talents per domain.
4. Item-stats review: retire any question outside the 40–70% pass band,
   confirm discrimination on the judgment-tier items.
5. Flip status to `active` per domain when satisfied.
