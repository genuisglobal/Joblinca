export type MatchableRole = 'job_seeker' | 'talent';
export type MatchableJobType = 'job' | 'internship';

export interface MatchableJob {
  title: string | null;
  description: string | null;
  location: string | null;
  companyName: string | null;
  jobType: string | null;
  workType?: string | null;
}

export interface CandidateAtsSignals {
  totalApplications: number;
  hiredCount: number;
  rejectedCount: number;
  eligibleCount: number;
  needsReviewCount: number;
  ineligibleCount: number;
  averageStageScore: number;
  averageRecruiterRating: number;
}

export interface MatchableCandidate {
  userId: string;
  role: MatchableRole;
  summary: string;
  skills: string[];
  locationPreferences: string[];
  internshipEligible: boolean;
  atsSignals?: CandidateAtsSignals | null;
}

export interface MatchScoreResult {
  score: number;
  reasons: string[];
  keywordHits: string[];
  locationMatched: boolean;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
  'you', 'your', 'our', 'we', 'this', 'these', 'those', 'will', 'can',
  'has', 'have', 'had', 'not', 'but', 'about', 'into', 'across', 'their',
  'its', 'than', 'then', 'them', 'they', 'would', 'should',
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenizeForMatch(value: string): string[] {
  if (!value) return [];
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const unique = new Set<string>();
  for (const token of normalized.split(' ')) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    unique.add(token);
  }
  return Array.from(unique);
}

function hasLocationMatch(jobLocation: string | null, preferences: string[]): boolean {
  if (!jobLocation) return false;
  if (preferences.length === 0) return false;

  const normalizedJobLocation = normalizeText(jobLocation);
  if (!normalizedJobLocation) return false;

  const jobTokens = new Set(tokenizeForMatch(normalizedJobLocation));

  for (const preference of preferences) {
    const normalizedPreference = normalizeText(preference);
    if (!normalizedPreference) continue;
    if (
      normalizedPreference.includes(normalizedJobLocation) ||
      normalizedJobLocation.includes(normalizedPreference)
    ) {
      return true;
    }

    const prefTokens = tokenizeForMatch(normalizedPreference);
    for (const token of prefTokens) {
      if (jobTokens.has(token)) {
        return true;
      }
    }
  }

  return false;
}

function isRemoteJob(job: MatchableJob): boolean {
  const workType = (job.workType || '').toLowerCase().trim();
  if (workType === 'remote') return true;

  const location = normalizeText(job.location || '');
  if (!location) return false;

  return (
    location.includes('remote') ||
    location.includes('anywhere') ||
    location.includes('worldwide') ||
    location.includes('global') ||
    location.includes('work from home')
  );
}

function scoreAtsHistory(signals: CandidateAtsSignals | null | undefined): {
  score: number;
  reasons: string[];
} {
  if (!signals || signals.totalApplications <= 0) {
    return {
      score: 0,
      reasons: [],
    };
  }

  const hiredBonus = Math.min(12, signals.hiredCount * 4);
  const stageBonus = Math.min(10, Math.round(Math.max(0, signals.averageStageScore) * 0.1));
  const ratingBonus = Math.min(
    8,
    Math.round(Math.max(0, signals.averageRecruiterRating) * 1.5)
  );
  const rejectionPenalty = Math.min(8, signals.rejectedCount * 2);
  const ineligiblePenalty = Math.min(6, Math.round(signals.ineligibleCount * 1.5));
  const needsReviewPenalty = Math.min(4, signals.needsReviewCount);

  const score = Math.max(
    -12,
    Math.min(
      24,
      hiredBonus +
        stageBonus +
        ratingBonus -
        rejectionPenalty -
        ineligiblePenalty -
        needsReviewPenalty
    )
  );

  const reasons: string[] = [];
  if (signals.hiredCount > 0) {
    reasons.push('strong past recruiter outcomes');
  } else if (signals.averageStageScore >= 70) {
    reasons.push('strong prior recruiter stage scores');
  }

  if (signals.averageRecruiterRating >= 4) {
    reasons.push('high recruiter ratings');
  }

  if (signals.eligibleCount > 0 && signals.ineligibleCount === 0) {
    reasons.push('clean ATS eligibility history');
  }

  return { score, reasons };
}

export function normalizeJobType(jobType: string | null): MatchableJobType {
  return (jobType || '').toLowerCase() === 'internship' ? 'internship' : 'job';
}

export function targetRolesForJob(jobType: string | null): MatchableRole[] {
  return normalizeJobType(jobType) === 'internship'
    ? ['job_seeker', 'talent']
    : ['job_seeker'];
}

export function defaultMinScoreForJob(jobType: string | null): number {
  return normalizeJobType(jobType) === 'internship' ? 30 : 35;
}

export function scoreCandidateForJob(
  job: MatchableJob,
  candidate: MatchableCandidate
): MatchScoreResult {
  const jobType = normalizeJobType(job.jobType);
  const jobTokens = tokenizeForMatch(
    `${job.title || ''} ${job.description || ''} ${job.companyName || ''}`
  );
  const candidateTokens = tokenizeForMatch(
    `${candidate.summary} ${candidate.skills.join(' ')}`
  );

  const candidateTokenSet = new Set(candidateTokens);
  const keywordHits = jobTokens.filter((token) => candidateTokenSet.has(token));
  const intersectionCount = keywordHits.length;
  const normalizedDenominator = Math.max(1, Math.min(12, jobTokens.length));
  const keywordCoverage = intersectionCount / normalizedDenominator;
  const keywordScore = Math.min(
    60,
    Math.round(intersectionCount * 7 + keywordCoverage * 30)
  );

  const remoteJob = isRemoteJob(job);
  const locationMatched = hasLocationMatch(job.location, candidate.locationPreferences);
  const locationScore = remoteJob
    ? 20
    : !job.location
      ? 10
      : locationMatched
        ? 30
        : 0;

  let roleScore = 0;
  if (jobType === 'internship') {
    roleScore = candidate.role === 'talent' ? 15 : 10;
  } else if (candidate.role === 'job_seeker') {
    roleScore = 10;
  }

  const skillsScore = Math.min(10, candidate.skills.length * 2);
  const atsHistory = scoreAtsHistory(candidate.atsSignals);

  const score = Math.max(
    0,
    Math.min(100, keywordScore + locationScore + roleScore + skillsScore + atsHistory.score)
  );

  const reasons: string[] = [];
  if (intersectionCount > 0) {
    reasons.push(`keyword overlap: ${intersectionCount}`);
  }
  if (locationMatched) {
    reasons.push('location preference match');
  } else if (remoteJob) {
    reasons.push('remote opportunity');
  }
  if (jobType === 'internship' && candidate.role === 'talent') {
    reasons.push('internship-to-talent alignment');
  }
  if (jobType === 'internship' && candidate.role === 'job_seeker') {
    reasons.push('internship-to-job-seeker alignment');
  }
  if (skillsScore >= 6) {
    reasons.push('strong profile skills');
  }
  reasons.push(...atsHistory.reasons);

  return {
    score,
    reasons,
    keywordHits: keywordHits.slice(0, 8),
    locationMatched,
  };
}
