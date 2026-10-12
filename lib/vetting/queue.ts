/**
 * Pure helpers for the Shortlist Service vetting queue: SLA clock, candidate
 * ranking and the recruiter delivery message. No I/O here so it stays
 * unit-testable; data access lives in lib/vetting/service.ts.
 */

export const SHORTLIST_SLA_HOURS = 72;
export const DUE_SOON_HOURS = 12;

export const OPEN_VETTING_STATUSES = ['pending', 'in_review'] as const;
export const VETTING_STATUSES = [
  'pending',
  'in_review',
  'delivered',
  'completed',
  'cancelled',
] as const;
export type VettingStatus = (typeof VETTING_STATUSES)[number];

export const VETTING_SOURCES = ['payment', 'manual', 'free_trial', 'backfill'] as const;
export type VettingSource = (typeof VETTING_SOURCES)[number];

export type SlaState = 'on_track' | 'due_soon' | 'overdue' | 'done';

export function computeDueAt(from: Date, hours: number = SHORTLIST_SLA_HOURS): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function isOpenStatus(status: string | null | undefined): boolean {
  return (OPEN_VETTING_STATUSES as readonly string[]).includes(status ?? '');
}

export function slaState(
  dueAt: string | Date | null | undefined,
  status: string | null | undefined,
  now: Date = new Date()
): SlaState {
  if (!isOpenStatus(status)) return 'done';
  if (!dueAt) return 'on_track';
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const msLeft = due.getTime() - now.getTime();
  if (Number.isNaN(msLeft)) return 'on_track';
  if (msLeft < 0) return 'overdue';
  if (msLeft <= DUE_SOON_HOURS * 60 * 60 * 1000) return 'due_soon';
  return 'on_track';
}

/** "5h left", "2d 3h left", "4h overdue". */
export function formatSlaRemaining(
  dueAt: string | Date | null | undefined,
  now: Date = new Date()
): string {
  if (!dueAt) return 'no deadline';
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const msLeft = due.getTime() - now.getTime();
  if (Number.isNaN(msLeft)) return 'no deadline';
  const totalHours = Math.floor(Math.abs(msLeft) / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const span = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return msLeft < 0 ? `${span} overdue` : `${span} left`;
}

// ---------------------------------------------------------------------------
// Candidate ranking
// ---------------------------------------------------------------------------

export type ScreeningLabel = 'qualified' | 'review' | 'reject';

export interface PoolCandidateInput {
  applicationId: string;
  candidateId: string;
  applicationStatus: string | null;
  eligibilityStatus: string | null;
  rankingScore: number | null;
  screeningScore: number | null;
  screeningLabel: ScreeningLabel | null;
  mustHavePassed: boolean | null;
  submittedAt: string | null;
}

export interface RankedPoolCandidate extends PoolCandidateInput {
  /** 0 = strongest group. See candidateTier. */
  tier: number;
  /** Screening score when the candidate was screened, else the ranking score. */
  score: number | null;
  autoRank: number;
}

/**
 * Group candidates before sorting by score, so a high ranking score never
 * lifts someone who failed screening above someone who passed it:
 *   0 qualified on WhatsApp screening
 *   1 flagged for review by screening
 *   2 not screened
 *   3 rejected by screening, failed a must-have, or ineligible
 */
export function candidateTier(c: PoolCandidateInput): number {
  if (
    c.screeningLabel === 'reject' ||
    c.mustHavePassed === false ||
    c.eligibilityStatus === 'ineligible'
  ) {
    return 3;
  }
  if (c.screeningLabel === 'qualified') return 0;
  if (c.screeningLabel === 'review') return 1;
  return 2;
}

/** Applications the officer should never be offered for a shortlist. */
export function isExcludedFromPool(c: Pick<PoolCandidateInput, 'applicationStatus'>): boolean {
  return c.applicationStatus === 'rejected' || c.applicationStatus === 'hired';
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function rankCandidates(candidates: PoolCandidateInput[]): RankedPoolCandidate[] {
  return candidates
    .filter((c) => !isExcludedFromPool(c))
    .map((c) => ({
      ...c,
      tier: candidateTier(c),
      score: finite(c.screeningScore) ?? finite(c.rankingScore),
    }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const scoreA = a.score ?? -Infinity;
      const scoreB = b.score ?? -Infinity;
      if (scoreA !== scoreB) return scoreB - scoreA;
      // Earlier applicants first on a tie.
      return (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '');
    })
    .map((c, index) => ({ ...c, autoRank: index + 1 }));
}

// ---------------------------------------------------------------------------
// Shortlist selection
// ---------------------------------------------------------------------------

export interface ShortlistSelectionInput {
  applicationId: string;
  note?: string | null;
}

export interface NormalizedSelection {
  applicationId: string;
  rank: number;
  note: string | null;
}

export const MAX_SHORTLIST_SIZE = 20;
const MAX_NOTE_LENGTH = 500;

/**
 * Validate an officer's ordered selection: drops duplicates, trims notes,
 * assigns ranks from list order. Throws on anything malformed.
 */
export function normalizeSelection(input: unknown): NormalizedSelection[] {
  if (!Array.isArray(input)) {
    throw new Error('candidates must be an array');
  }
  if (input.length > MAX_SHORTLIST_SIZE) {
    throw new Error(`A shortlist can hold at most ${MAX_SHORTLIST_SIZE} candidates`);
  }

  const seen = new Set<string>();
  const result: NormalizedSelection[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      throw new Error('Each candidate must be an object');
    }
    const { applicationId, note } = item as Record<string, unknown>;
    if (typeof applicationId !== 'string' || applicationId.trim() === '') {
      throw new Error('Each candidate needs an applicationId');
    }
    if (seen.has(applicationId)) continue;
    seen.add(applicationId);
    const trimmed = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : '';
    result.push({ applicationId, rank: result.length + 1, note: trimmed || null });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Delivery message
// ---------------------------------------------------------------------------

export function buildShortlistDeliveredMessage(params: {
  jobTitle: string;
  candidateCount: number;
  link: string;
}): string {
  const { jobTitle, candidateCount, link } = params;
  const people = candidateCount === 1 ? 'candidate' : 'candidates';
  const personnes = candidateCount === 1 ? 'candidat' : 'candidats';
  return [
    `Your Joblinca shortlist for "${jobTitle}" is ready: ${candidateCount} screened ${people}, ranked.`,
    `Votre présélection Joblinca pour « ${jobTitle} » est prête : ${candidateCount} ${personnes} vérifiés et classés.`,
    '',
    link,
  ].join('\n');
}
