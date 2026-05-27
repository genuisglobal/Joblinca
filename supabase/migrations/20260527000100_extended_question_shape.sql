-- Sprint 6 — Mixed question types + per-question timers
--
-- No schema changes are required here because question content lives inside
-- talent_challenges.config (jsonb) and accepts arbitrary fields. This
-- migration updates the comment on that column so future contributors
-- understand the canonical shape after Sprint 6.
--
-- Supported question types: mcq_single, true_false, numeric, matching, ordering.

COMMENT ON COLUMN public.talent_challenges.config IS
  'Quiz config jsonb. Expected shape:
   {
     "time_limit_seconds": 600,                -- quiz-level safety net
     "shuffle_questions": true,
     "questions": [
       {
         "id": "acc-b01",                      -- domain-prefixed stable id
         "type": "mcq_single",                 -- mcq_single | true_false | numeric | matching | ordering
         "topic": "ohada_basics",
         "bloom_layer": "recall",              -- recall | application | judgment
         "time_limit_seconds": 90,             -- per-question countdown
         "question": "EN prompt",
         "question_fr": "FR prompt",
         "explanation": "Why the right answer is right.",
         "explanation_fr": "Pourquoi la bonne reponse est correcte.",
         "source": "OHADA AUDCIF Art. ...",
         "last_reviewed": "2026-05-27",

         -- mcq_single + true_false:
         "options": ["EN option A", "EN option B", "EN option C", "EN option D"],
         "options_fr": ["FR option A", ...],
         "correct_index": 1,

         -- numeric (instead of options/correct_index):
         "expected_value": 10500,
         "tolerance": 1,                       -- accept within +/- N units
         "unit_hint": "FCFA",
         "input_kind": "integer",              -- integer | decimal

         -- matching (instead of options):
         "left_items": ["EN left 1", "EN left 2", ...],
         "right_items": ["EN right 1", "EN right 2", ...],
         "left_items_fr": [...],
         "right_items_fr": [...],
         "correct_pairs": [[0, 2], [1, 0], [2, 1]],  -- (left_index, right_index)

         -- ordering (instead of options):
         "items": ["EN item 1", "EN item 2", ...],
         "items_fr": [...],
         "correct_order": [2, 0, 1, 3]         -- the order in which the items should appear
       }
     ]
   }

   When the optional "type" field is absent, the question is treated as mcq_single
   for backwards compatibility with the MVP shape.';
