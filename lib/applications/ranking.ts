export type ApplicationEligibilityStatus =
  | 'eligible'
  | 'needs_review'
  | 'ineligible'
  | null
  | undefined;

export interface ApplicationRankingBreakdown {
  recency: number;
  completeness: number;
  ai_match: number;
  rating: number;
  stage_score: number;
  feedback_signal: number;
  eligibility: number;
  decision: number;
}

export interface RankingExplanationInput {
  rankingScore?: number | null;
  rankingBreakdown?: unknown;
  recruiterRating?: number | null;
  overallStageScore?: number | null;
  eligibilityStatus?: ApplicationEligibilityStatus;
  decisionStatus?: string | null;
  currentStageType?: string | null;
}

export interface RankingSignal {
  key: string;
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
  value: number;
}

export interface RankingExplanationSummary {
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
  signals: RankingSignal[];
}

export interface RecruiterAnalyticsInput {
  createdAt?: string | null;
  decisionStatus?: string | null;
  eligibilityStatus?: ApplicationEligibilityStatus;
  rankingScore?: number | null;
  rankingBreakdown?: unknown;
  overallStageScore?: number | null;
  viewedAt?: string | null;
  currentStageType?: string | null;
}

export interface RecruiterAnalyticsSummary {
  totalApplications: number;
  unreadCount: number;
  eligibleCount: number;
  needsReviewCount: number;
  ineligibleCount: number;
  hiredCount: number;
  rejectedCount: number;
  activeCount: number;
  advancedStageCount: number;
  averageRankingScore: number;
  averageStageScore: number;
  averageAiMatch: number;
  eligibleRate: number;
  hireRate: number;
  advancedStageRate: number;
}

export type RecruiterAnalyticsWindow = '7d' | '30d' | '90d';

export interface RecruiterAnalyticsTimelineBucket {
  key: string;
  label: string;
  applications: number;
  eligible: number;
  hired: number;
  advanced: number;
  unread: number;
}

export interface RecruiterAnalyticsTimeline {
  window: RecruiterAnalyticsWindow;
  windowDays: number;
  bucketSpanDays: number;
  totals: {
    applications: number;
    eligible: number;
    hired: number;
    advanced: number;
    unread: number;
  };
  buckets: RecruiterAnalyticsTimelineBucket[];
}

export type RecruiterFunnelEventType = 'apply' | 'eligible' | 'interview' | 'offer' | 'hire';

export interface RecruiterFunnelEvent {
  createdAt?: string | null;
  type: RecruiterFunnelEventType;
}

export interface SegmentedFunnelEvent extends RecruiterFunnelEvent {
  segmentKey: string;
  segmentLabel: string;
}

export interface RecruiterFunnelTimelineBucket {
  key: string;
  label: string;
  apply: number;
  eligible: number;
  interview: number;
  offer: number;
  hire: number;
}

export interface RecruiterFunnelTimeline {
  window: RecruiterAnalyticsWindow;
  windowDays: number;
  bucketSpanDays: number;
  totals: Record<RecruiterFunnelEventType, number>;
  buckets: RecruiterFunnelTimelineBucket[];
}

export interface SegmentedFunnelSummary {
  key: string;
  label: string;
  totals: Record<RecruiterFunnelEventType, number>;
  conversions: RecruiterFunnelConversions;
}

export interface RecruiterFunnelConversions {
  eligibilityFromApply: number;
  interviewFromEligible: number;
  offerFromInterview: number;
  hireFromOffer: number;
  hireFromApply: number;
}

const EMPTY_BREAKDOWN: ApplicationRankingBreakdown = {
  recency: 0,
  completeness: 0,
  ai_match: 0,
  rating: 0,
  stage_score: 0,
  feedback_signal: 0,
  eligibility: 0,
  decision: 0,
};

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatBucketLabel(start: Date, endExclusive: Date, spanDays: number): string {
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  if (spanDays === 1) {
    return startLabel;
  }

  const inclusiveEnd = addDays(endExclusive, -1);
  const endLabel = inclusiveEnd.toLocaleDateString('en-US', {
    month: start.getUTCMonth() === inclusiveEnd.getUTCMonth() ? undefined : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return `${startLabel}-${endLabel}`;
}

function getWindowDays(window: RecruiterAnalyticsWindow): number {
  switch (window) {
    case '7d':
      return 7;
    case '90d':
      return 90;
    case '30d':
    default:
      return 30;
  }
}

function getBucketSpanDays(windowDays: number): number {
  if (windowDays <= 7) return 1;
  if (windowDays <= 30) return 5;
  return 10;
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

export function normalizeRankingBreakdown(value: unknown): ApplicationRankingBreakdown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_BREAKDOWN };
  }

  const record = value as Record<string, unknown>;
  return {
    recency: asFiniteNumber(record.recency),
    completeness: asFiniteNumber(record.completeness),
    ai_match: asFiniteNumber(record.ai_match),
    rating: asFiniteNumber(record.rating),
    stage_score: asFiniteNumber(record.stage_score),
    feedback_signal: asFiniteNumber(record.feedback_signal),
    eligibility: asFiniteNumber(record.eligibility),
    decision: asFiniteNumber(record.decision),
  };
}

function pushSignal(signals: RankingSignal[], signal: RankingSignal | null) {
  if (!signal || !signal.label) return;
  signals.push(signal);
}

export function getRankingSignals(input: RankingExplanationInput): RankingSignal[] {
  const breakdown = normalizeRankingBreakdown(input.rankingBreakdown);
  const signals: RankingSignal[] = [];

  if (breakdown.decision >= 6 || input.decisionStatus === 'hired') {
    pushSignal(signals, {
      key: 'decision',
      label: 'Hired decision recorded',
      tone: 'positive',
      value: Math.max(breakdown.decision, 8),
    });
  } else if (breakdown.decision <= -6 || input.decisionStatus === 'rejected') {
    pushSignal(signals, {
      key: 'decision',
      label: 'Rejected decision recorded',
      tone: 'negative',
      value: Math.min(breakdown.decision, -8),
    });
  } else if (input.decisionStatus === 'withdrawn') {
    pushSignal(signals, {
      key: 'decision',
      label: 'Candidate withdrew',
      tone: 'negative',
      value: Math.min(breakdown.decision || -6, -6),
    });
  }

  if (breakdown.eligibility >= 8 || input.eligibilityStatus === 'eligible') {
    pushSignal(signals, {
      key: 'eligibility',
      label: 'Eligibility confirmed',
      tone: 'positive',
      value: Math.max(breakdown.eligibility, 10),
    });
  } else if (
    (breakdown.eligibility > 0 && breakdown.eligibility < 8) ||
    input.eligibilityStatus === 'needs_review'
  ) {
    pushSignal(signals, {
      key: 'eligibility',
      label: 'Eligibility needs review',
      tone: 'neutral',
      value: Math.max(breakdown.eligibility, 4),
    });
  } else if (breakdown.eligibility <= -6 || input.eligibilityStatus === 'ineligible') {
    pushSignal(signals, {
      key: 'eligibility',
      label: 'Eligibility blocked',
      tone: 'negative',
      value: Math.min(breakdown.eligibility, -10),
    });
  }

  if (breakdown.feedback_signal >= 8) {
    pushSignal(signals, {
      key: 'feedback',
      label: 'Strong reviewer recommendation',
      tone: 'positive',
      value: breakdown.feedback_signal,
    });
  } else if (breakdown.feedback_signal >= 2) {
    pushSignal(signals, {
      key: 'feedback',
      label: 'Positive reviewer recommendation',
      tone: 'positive',
      value: breakdown.feedback_signal,
    });
  } else if (breakdown.feedback_signal <= -6) {
    pushSignal(signals, {
      key: 'feedback',
      label: 'Strong reviewer concern',
      tone: 'negative',
      value: breakdown.feedback_signal,
    });
  } else if (breakdown.feedback_signal < 0) {
    pushSignal(signals, {
      key: 'feedback',
      label: 'Reviewer concern logged',
      tone: 'negative',
      value: breakdown.feedback_signal,
    });
  }

  const stageScore = Math.max(breakdown.stage_score, asFiniteNumber(input.overallStageScore) * 0.15);
  if (stageScore >= 8) {
    pushSignal(signals, {
      key: 'stage_score',
      label: 'Strong stage feedback',
      tone: 'positive',
      value: stageScore,
    });
  } else if (stageScore >= 3) {
    pushSignal(signals, {
      key: 'stage_score',
      label: 'Solid stage feedback',
      tone: 'positive',
      value: stageScore,
    });
  }

  const recruiterRatingSignal = Math.max(
    breakdown.rating,
    asFiniteNumber(input.recruiterRating) > 0 ? asFiniteNumber(input.recruiterRating) * 2 : 0
  );
  if (recruiterRatingSignal >= 8) {
    pushSignal(signals, {
      key: 'rating',
      label: 'High recruiter rating',
      tone: 'positive',
      value: recruiterRatingSignal,
    });
  } else if (recruiterRatingSignal > 0) {
    pushSignal(signals, {
      key: 'rating',
      label: 'Recruiter rating recorded',
      tone: 'positive',
      value: recruiterRatingSignal,
    });
  }

  if (breakdown.ai_match >= 12) {
    pushSignal(signals, {
      key: 'ai_match',
      label: 'Strong AI match',
      tone: 'positive',
      value: breakdown.ai_match,
    });
  } else if (breakdown.ai_match >= 4) {
    pushSignal(signals, {
      key: 'ai_match',
      label: 'AI alignment detected',
      tone: 'positive',
      value: breakdown.ai_match,
    });
  } else if (breakdown.ai_match === 0 && asFiniteNumber(input.rankingScore) < 35) {
    pushSignal(signals, {
      key: 'ai_match_gap',
      label: 'Weak AI alignment',
      tone: 'negative',
      value: -2,
    });
  }

  if (breakdown.completeness >= 10) {
    pushSignal(signals, {
      key: 'completeness',
      label: 'Complete application pack',
      tone: 'positive',
      value: breakdown.completeness,
    });
  } else if (breakdown.completeness >= 4) {
    pushSignal(signals, {
      key: 'completeness',
      label: 'Profile detail provided',
      tone: 'neutral',
      value: breakdown.completeness,
    });
  } else if (breakdown.completeness === 0 && asFiniteNumber(input.rankingScore) < 35) {
    pushSignal(signals, {
      key: 'completeness_gap',
      label: 'Thin application pack',
      tone: 'negative',
      value: -2,
    });
  }

  if (breakdown.recency >= 10) {
    pushSignal(signals, {
      key: 'recency',
      label: 'Recent applicant',
      tone: 'neutral',
      value: breakdown.recency,
    });
  }

  if (input.currentStageType === 'interview' || input.currentStageType === 'offer' || input.currentStageType === 'hire') {
    pushSignal(signals, {
      key: 'stage_progress',
      label: 'Advanced pipeline progress',
      tone: 'positive',
      value: 4,
    });
  } else if (
    (input.currentStageType === 'applied' || input.currentStageType === 'screening') &&
    asFiniteNumber(input.rankingScore) < 45
  ) {
    pushSignal(signals, {
      key: 'early_stage',
      label: 'Still early in pipeline',
      tone: 'neutral',
      value: 1,
    });
  }

  signals.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return signals;
}

export function summarizeRankingExplanation(
  input: RankingExplanationInput
): RankingExplanationSummary {
  const signals = getRankingSignals(input);
  const score = asFiniteNumber(input.rankingScore);
  const strongestSignal = signals[0] || null;

  if (strongestSignal?.tone === 'negative' || score < 35) {
    return {
      label: 'Lower priority',
      tone: 'negative',
      signals,
    };
  }

  if (strongestSignal?.tone === 'positive' || score >= 65) {
    return {
      label: 'High priority',
      tone: 'positive',
      signals,
    };
  }

  return {
    label: 'Mixed priority',
    tone: 'neutral',
    signals,
  };
}

export function summarizeRecruiterAnalytics(
  inputs: RecruiterAnalyticsInput[]
): RecruiterAnalyticsSummary {
  const summary: RecruiterAnalyticsSummary = {
    totalApplications: inputs.length,
    unreadCount: 0,
    eligibleCount: 0,
    needsReviewCount: 0,
    ineligibleCount: 0,
    hiredCount: 0,
    rejectedCount: 0,
    activeCount: 0,
    advancedStageCount: 0,
    averageRankingScore: 0,
    averageStageScore: 0,
    averageAiMatch: 0,
    eligibleRate: 0,
    hireRate: 0,
    advancedStageRate: 0,
  };

  if (inputs.length === 0) {
    return summary;
  }

  let rankingTotal = 0;
  let stageScoreTotal = 0;
  let aiMatchTotal = 0;
  let rankingCount = 0;
  let stageScoreCount = 0;

  for (const input of inputs) {
    const breakdown = normalizeRankingBreakdown(input.rankingBreakdown);

    if (!input.viewedAt) summary.unreadCount += 1;

    if (input.eligibilityStatus === 'eligible') {
      summary.eligibleCount += 1;
    } else if (input.eligibilityStatus === 'needs_review') {
      summary.needsReviewCount += 1;
    } else if (input.eligibilityStatus === 'ineligible') {
      summary.ineligibleCount += 1;
    }

    if (input.decisionStatus === 'hired') {
      summary.hiredCount += 1;
    } else if (input.decisionStatus === 'rejected') {
      summary.rejectedCount += 1;
    } else {
      summary.activeCount += 1;
    }

    if (
      input.currentStageType === 'interview' ||
      input.currentStageType === 'offer' ||
      input.currentStageType === 'hire'
    ) {
      summary.advancedStageCount += 1;
    }

    if (typeof input.rankingScore === 'number' && Number.isFinite(input.rankingScore)) {
      rankingTotal += input.rankingScore;
      rankingCount += 1;
    }

    if (typeof input.overallStageScore === 'number' && Number.isFinite(input.overallStageScore)) {
      stageScoreTotal += input.overallStageScore;
      stageScoreCount += 1;
    }

    aiMatchTotal += breakdown.ai_match;
  }

  summary.averageRankingScore = rankingCount > 0 ? rankingTotal / rankingCount : 0;
  summary.averageStageScore = stageScoreCount > 0 ? stageScoreTotal / stageScoreCount : 0;
  summary.averageAiMatch = aiMatchTotal / inputs.length;
  summary.eligibleRate = (summary.eligibleCount / inputs.length) * 100;
  summary.hireRate = (summary.hiredCount / inputs.length) * 100;
  summary.advancedStageRate = (summary.advancedStageCount / inputs.length) * 100;

  return summary;
}

export function buildRecruiterAnalyticsTimeline(
  inputs: RecruiterAnalyticsInput[],
  window: RecruiterAnalyticsWindow,
  now: Date = new Date()
): RecruiterAnalyticsTimeline {
  const windowDays = getWindowDays(window);
  const bucketSpanDays = getBucketSpanDays(windowDays);
  const bucketCount = Math.ceil(windowDays / bucketSpanDays);
  const todayStart = startOfUtcDay(now);
  const rangeStart = addDays(todayStart, -(windowDays - 1));
  const buckets: RecruiterAnalyticsTimelineBucket[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = addDays(rangeStart, index * bucketSpanDays);
    const bucketEnd = addDays(bucketStart, bucketSpanDays);
    buckets.push({
      key: bucketStart.toISOString(),
      label: formatBucketLabel(bucketStart, bucketEnd, bucketSpanDays),
      applications: 0,
      eligible: 0,
      hired: 0,
      advanced: 0,
      unread: 0,
    });
  }

  const totals = {
    applications: 0,
    eligible: 0,
    hired: 0,
    advanced: 0,
    unread: 0,
  };

  for (const input of inputs) {
    if (!input.createdAt) continue;

    const createdAt = new Date(input.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < rangeStart) continue;
    if (createdAt >= addDays(todayStart, 1)) continue;

    const createdDay = startOfUtcDay(createdAt);
    const diffDays = Math.floor((createdDay.getTime() - rangeStart.getTime()) / 86400000);
    const bucketIndex = Math.max(
      0,
      Math.min(bucketCount - 1, Math.floor(diffDays / bucketSpanDays))
    );
    const bucket = buckets[bucketIndex];

    bucket.applications += 1;
    totals.applications += 1;

    if (input.eligibilityStatus === 'eligible') {
      bucket.eligible += 1;
      totals.eligible += 1;
    }

    if (input.decisionStatus === 'hired') {
      bucket.hired += 1;
      totals.hired += 1;
    }

    if (
      input.currentStageType === 'interview' ||
      input.currentStageType === 'offer' ||
      input.currentStageType === 'hire'
    ) {
      bucket.advanced += 1;
      totals.advanced += 1;
    }

    if (!input.viewedAt) {
      bucket.unread += 1;
      totals.unread += 1;
    }
  }

  return {
    window,
    windowDays,
    bucketSpanDays,
    totals,
    buckets,
  };
}

export function buildRecruiterFunnelTimeline(
  events: RecruiterFunnelEvent[],
  window: RecruiterAnalyticsWindow,
  now: Date = new Date()
): RecruiterFunnelTimeline {
  const windowDays = getWindowDays(window);
  const bucketSpanDays = getBucketSpanDays(windowDays);
  const bucketCount = Math.ceil(windowDays / bucketSpanDays);
  const todayStart = startOfUtcDay(now);
  const rangeStart = addDays(todayStart, -(windowDays - 1));
  const buckets: RecruiterFunnelTimelineBucket[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = addDays(rangeStart, index * bucketSpanDays);
    const bucketEnd = addDays(bucketStart, bucketSpanDays);
    buckets.push({
      key: bucketStart.toISOString(),
      label: formatBucketLabel(bucketStart, bucketEnd, bucketSpanDays),
      apply: 0,
      eligible: 0,
      interview: 0,
      offer: 0,
      hire: 0,
    });
  }

  const totals: Record<RecruiterFunnelEventType, number> = {
    apply: 0,
    eligible: 0,
    interview: 0,
    offer: 0,
    hire: 0,
  };

  for (const event of events) {
    if (!event.createdAt) continue;

    const createdAt = new Date(event.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < rangeStart) continue;
    if (createdAt >= addDays(todayStart, 1)) continue;

    const createdDay = startOfUtcDay(createdAt);
    const diffDays = Math.floor((createdDay.getTime() - rangeStart.getTime()) / 86400000);
    const bucketIndex = Math.max(
      0,
      Math.min(bucketCount - 1, Math.floor(diffDays / bucketSpanDays))
    );
    const bucket = buckets[bucketIndex];

    bucket[event.type] += 1;
    totals[event.type] += 1;
  }

  return {
    window,
    windowDays,
    bucketSpanDays,
    totals,
    buckets,
  };
}

export function summarizeFunnelConversions(
  totals: Record<RecruiterFunnelEventType, number>
): RecruiterFunnelConversions {
  return {
    eligibilityFromApply: safeRate(totals.eligible, totals.apply),
    interviewFromEligible: safeRate(totals.interview, totals.eligible),
    offerFromInterview: safeRate(totals.offer, totals.interview),
    hireFromOffer: safeRate(totals.hire, totals.offer),
    hireFromApply: safeRate(totals.hire, totals.apply),
  };
}

export function summarizeSegmentedFunnel(
  events: SegmentedFunnelEvent[],
  window: RecruiterAnalyticsWindow,
  now: Date = new Date()
): SegmentedFunnelSummary[] {
  const windowDays = getWindowDays(window);
  const todayStart = startOfUtcDay(now);
  const rangeStart = addDays(todayStart, -(windowDays - 1));
  const aggregates = new Map<string, SegmentedFunnelSummary>();

  for (const event of events) {
    if (!event.createdAt) continue;

    const createdAt = new Date(event.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < rangeStart) continue;
    if (createdAt >= addDays(todayStart, 1)) continue;

    const existing =
      aggregates.get(event.segmentKey) ||
      {
        key: event.segmentKey,
        label: event.segmentLabel,
        totals: {
          apply: 0,
          eligible: 0,
          interview: 0,
          offer: 0,
          hire: 0,
        },
        conversions: {
          eligibilityFromApply: 0,
          interviewFromEligible: 0,
          offerFromInterview: 0,
          hireFromOffer: 0,
          hireFromApply: 0,
        },
      };

    existing.totals[event.type] += 1;
    aggregates.set(event.segmentKey, existing);
  }

  return Array.from(aggregates.values())
    .map((item) => ({
      ...item,
      conversions: summarizeFunnelConversions(item.totals),
    }))
    .sort((a, b) => {
      if (b.totals.apply !== a.totals.apply) {
        return b.totals.apply - a.totals.apply;
      }
      return a.label.localeCompare(b.label);
    });
}
