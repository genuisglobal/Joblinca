#!/usr/bin/env node
/**
 * Load v1 question pool into the seeded draft challenges.
 *
 * Usage:
 *   node scripts/talent-challenges/load-questions.mjs
 *   node scripts/talent-challenges/load-questions.mjs --domain accountant
 *   node scripts/talent-challenges/load-questions.mjs --dry-run
 *
 * Requires env vars (read from .env.local automatically if present):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The script:
 *   1. Reads each domain's JSON file (questions-v1-<domain>.json).
 *   2. Builds the full config payload (time_limit, shuffle_questions, questions).
 *   3. Updates the seeded challenge row (by slug). Leaves status at 'draft'.
 *   4. Prints a summary: rows updated, question counts, verification queue.
 *
 * What it deliberately does NOT do:
 *   - Activate the challenge. Status stays 'draft' until you flip it manually.
 *   - Skip verification_required questions. They load too, but you should
 *     review them before activation. The script prints the list at the end.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

// ─── Tiny .env.local loader (no dotenv dependency) ──────────────────────────

function loadDotEnvLocal() {
  const candidates = ['.env.local', '.env'];
  for (const file of candidates) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

// ─── Arg parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const domainArgIndex = args.indexOf('--domain');
const domainArg =
  domainArgIndex !== -1 && args[domainArgIndex + 1] ? args[domainArgIndex + 1] : null;

// ─── Plan: domain → slug + question file ────────────────────────────────────

const PLAN = [
  {
    domain: 'accountant',
    slug: 'launch-accountant-basics',
    file: 'questions-v1-accountant.json',
  },
  {
    domain: 'admin_assistant',
    slug: 'launch-admin-assistant-basics',
    file: 'questions-v1-admin.json',
  },
];

const QUIZ_CONFIG_DEFAULTS = {
  time_limit_seconds: 1800,
  shuffle_questions: false,
};

// ─── Validation ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[loader] Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
  );
  console.error('         Put them in .env.local or export them in your shell.');
  process.exit(1);
}

// ─── Loader ─────────────────────────────────────────────────────────────────

async function patchChallenge(slug, config) {
  const url = `${SUPABASE_URL}/rest/v1/talent_challenges?slug=eq.${encodeURIComponent(
    slug,
  )}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ config }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PATCH ${slug} failed ${response.status}: ${text}`);
  }
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // ignore
  }
  return Array.isArray(payload) ? payload : [];
}

function summariseQuestions(questions) {
  const byType = new Map();
  const verificationQueue = [];
  for (const q of questions) {
    const type = q.type || 'mcq_single';
    byType.set(type, (byType.get(type) || 0) + 1);
    if (q.verification_required) {
      verificationQueue.push(q.id);
    }
  }
  return { byType, verificationQueue };
}

async function run() {
  const targets = domainArg
    ? PLAN.filter((p) => p.domain === domainArg)
    : PLAN;
  if (targets.length === 0) {
    console.error(`[loader] No domain matches "${domainArg}". Valid: ${PLAN.map((p) => p.domain).join(', ')}`);
    process.exit(1);
  }

  const allVerificationQueue = [];
  for (const target of targets) {
    const path = join(__dirname, target.file);
    if (!existsSync(path)) {
      console.error(`[loader] Missing file ${path}`);
      process.exit(1);
    }
    const questions = JSON.parse(readFileSync(path, 'utf-8'));
    const { byType, verificationQueue } = summariseQuestions(questions);

    const config = {
      ...QUIZ_CONFIG_DEFAULTS,
      questions,
    };

    console.log(`\n[loader] Domain: ${target.domain}`);
    console.log(`         Slug:   ${target.slug}`);
    console.log(`         Total:  ${questions.length} questions`);
    for (const [type, count] of byType.entries()) {
      console.log(`           ${type}: ${count}`);
    }
    if (verificationQueue.length > 0) {
      console.log(
        `         Verification required: ${verificationQueue.join(', ')}`,
      );
      allVerificationQueue.push(...verificationQueue);
    }

    if (dryRun) {
      console.log('         DRY RUN — no PATCH executed.');
      continue;
    }

    const rows = await patchChallenge(target.slug, config);
    if (rows.length === 0) {
      console.warn(
        `[loader] PATCH returned no rows for slug=${target.slug}. Confirm the seed migration ran.`,
      );
    } else {
      console.log(`         PATCH ok — challenge ${rows[0].id} updated.`);
      console.log(`         Status: ${rows[0].status} (kept as-is on purpose).`);
    }
  }

  console.log('\n[loader] Done.');
  if (allVerificationQueue.length > 0) {
    console.log('\n[loader] Verification queue summary:');
    console.log(
      '         SME sign-off required on these answer keys before activation:',
    );
    for (const id of allVerificationQueue) {
      console.log(`           - ${id}`);
    }
    console.log(
      '\n         When verified, set verification_required: false in the JSON,',
    );
    console.log('         re-run this script, and then flip status to "active".');
  }
}

run().catch((err) => {
  console.error('[loader] Failed:', err.message);
  process.exit(1);
});
