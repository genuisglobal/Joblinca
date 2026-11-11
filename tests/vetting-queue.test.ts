import assert from 'node:assert/strict';

import {
  buildShortlistDeliveredMessage,
  candidateTier,
  computeDueAt,
  formatSlaRemaining,
  normalizeSelection,
  rankCandidates,
  slaState,
  type PoolCandidateInput,
} from '../lib/vetting/queue';

function candidate(overrides: Partial<PoolCandidateInput>): PoolCandidateInput {
  return {
    applicationId: 'app',
    candidateId: 'cand',
    applicationStatus: 'submitted',
    eligibilityStatus: null,
    rankingScore: null,
    screeningScore: null,
    screeningLabel: null,
    mustHavePassed: null,
    submittedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const now = new Date('2026-10-12T12:00:00Z');

// --- SLA ---------------------------------------------------------------------
assert.equal(computeDueAt(now).toISOString(), '2026-10-15T12:00:00.000Z', '72h SLA');
assert.equal(slaState('2026-10-14T12:00:00Z', 'pending', now), 'on_track');
assert.equal(slaState('2026-10-12T20:00:00Z', 'in_review', now), 'due_soon', 'within 12h');
assert.equal(slaState('2026-10-12T11:00:00Z', 'pending', now), 'overdue');
assert.equal(slaState('2026-10-12T11:00:00Z', 'delivered', now), 'done', 'closed requests have no SLA');
assert.equal(slaState(null, 'pending', now), 'on_track');
assert.equal(formatSlaRemaining('2026-10-14T17:00:00Z', now), '2d 5h left');
assert.equal(formatSlaRemaining('2026-10-12T08:00:00Z', now), '4h overdue');
assert.equal(formatSlaRemaining(null, now), 'no deadline');
console.log('ok - SLA clock');

// --- Tiers -------------------------------------------------------------------
assert.equal(candidateTier(candidate({ screeningLabel: 'qualified' })), 0);
assert.equal(candidateTier(candidate({ screeningLabel: 'review' })), 1);
assert.equal(candidateTier(candidate({})), 2);
assert.equal(candidateTier(candidate({ screeningLabel: 'reject' })), 3);
assert.equal(
  candidateTier(candidate({ screeningLabel: 'qualified', mustHavePassed: false })),
  3,
  'failed must-have beats a qualified label'
);
assert.equal(candidateTier(candidate({ eligibilityStatus: 'ineligible' })), 3);
console.log('ok - candidate tiers');

// --- Ranking -----------------------------------------------------------------
const ranked = rankCandidates([
  candidate({ applicationId: 'unscreened-high', rankingScore: 95 }),
  candidate({ applicationId: 'qualified-low', screeningLabel: 'qualified', screeningScore: 60 }),
  candidate({ applicationId: 'qualified-high', screeningLabel: 'qualified', screeningScore: 88 }),
  candidate({ applicationId: 'rejected-screen', screeningLabel: 'reject', screeningScore: 99 }),
  candidate({ applicationId: 'review', screeningLabel: 'review', screeningScore: 70 }),
  candidate({ applicationId: 'recruiter-rejected', applicationStatus: 'rejected', screeningLabel: 'qualified', screeningScore: 100 }),
  candidate({ applicationId: 'hired', applicationStatus: 'hired' }),
]);
assert.deepEqual(
  ranked.map((c) => c.applicationId),
  ['qualified-high', 'qualified-low', 'review', 'unscreened-high', 'rejected-screen'],
  'tier first, score second; rejected/hired applications excluded'
);
assert.deepEqual(ranked.map((c) => c.autoRank), [1, 2, 3, 4, 5]);
assert.equal(ranked[3].score, 95, 'falls back to ranking score when not screened');

const tie = rankCandidates([
  candidate({ applicationId: 'later', rankingScore: 50, submittedAt: '2026-10-05T00:00:00Z' }),
  candidate({ applicationId: 'earlier', rankingScore: 50, submittedAt: '2026-10-02T00:00:00Z' }),
  candidate({ applicationId: 'no-score' }),
]);
assert.deepEqual(tie.map((c) => c.applicationId), ['earlier', 'later', 'no-score'], 'ties go to earlier applicants; no score last');
console.log('ok - ranking');

// --- Selection ---------------------------------------------------------------
assert.deepEqual(
  normalizeSelection([
    { applicationId: 'a', note: '  strong sales record  ' },
    { applicationId: 'b' },
    { applicationId: 'a', note: 'duplicate' },
  ]),
  [
    { applicationId: 'a', rank: 1, note: 'strong sales record' },
    { applicationId: 'b', rank: 2, note: null },
  ],
  'ranks follow order, duplicates dropped, notes trimmed'
);
assert.deepEqual(normalizeSelection([]), []);
assert.throws(() => normalizeSelection('nope'), /array/);
assert.throws(() => normalizeSelection([{ note: 'x' }]), /applicationId/);
assert.throws(
  () => normalizeSelection(Array.from({ length: 21 }, (_, i) => ({ applicationId: `a${i}` }))),
  /at most 20/
);
assert.equal(normalizeSelection([{ applicationId: 'a', note: 'x'.repeat(900) }])[0].note?.length, 500);
console.log('ok - selection validation');

// --- Delivery message --------------------------------------------------------
const msg = buildShortlistDeliveredMessage({ jobTitle: 'Cashier', candidateCount: 5, link: 'https://joblinca.com/x' });
assert.match(msg, /"Cashier" is ready: 5 screened candidates/);
assert.match(msg, /5 candidats vérifiés/);
assert.ok(msg.endsWith('https://joblinca.com/x'));
assert.match(
  buildShortlistDeliveredMessage({ jobTitle: 'Driver', candidateCount: 1, link: 'l' }),
  /1 screened candidate,/
);
console.log('ok - delivery message');

console.log('All vetting-queue tests passed.');
