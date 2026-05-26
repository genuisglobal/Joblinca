import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getUserSubscription } from '@/lib/subscriptions';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';

type CandidateRole = 'job_seeker' | 'talent';
type DirectorySort = 'best' | 'recent' | 'name';

interface BaseProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  updated_at: string | null;
}

interface JobSeekerProfileRow {
  user_id: string;
  location: string | null;
  headline: string | null;
  location_interests: unknown;
  resume_url: string | null;
  career_info: unknown;
}

interface TalentProfileRow {
  user_id: string;
  school_name: string | null;
  graduation_year: number | null;
  field_of_study: string | null;
  skills: unknown;
  location_interests: unknown;
  resume_url: string | null;
  portfolio: unknown;
  internship_eligible: boolean | null;
}

interface QuizSignal {
  domain: string | null;
  bestScore: number;
  challengeTitle: string | null;
  earnedAt: string;
}

interface CandidateRecord {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: CandidateRole;
  updatedAt: string | null;
  headline: string | null;
  location: string | null;
  locationInterests: string[];
  fieldOfStudy: string | null;
  schoolName: string | null;
  graduationYear: number | null;
  skills: Array<{ name: string; rating: number | null }>;
  hasResume: boolean;
  hasPortfolio: boolean;
  profileStrength: number;
  quizSignal: QuizSignal | null;
}

interface CandidateSearchRecord extends CandidateRecord {
  careerSummary: string;
  searchHaystack: string;
  locationHaystack: string;
  skillHaystack: string;
  bestScore: number;
}

interface CandidateSearchContext {
  queryPhrase: string;
  queryTerms: string[];
  locationTerms: string[];
  skillTerms: string[];
}

function normalizeRole(role: string | null | undefined): CandidateRole | null {
  if (role === 'talent') {
    return 'talent';
  }

  if (role === 'job_seeker' || role === 'candidate') {
    return 'job_seeker';
  }

  return null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkills(value: unknown): Array<{ name: string; rating: number | null }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const rawNameValue = record.name;
      const rawName = typeof rawNameValue === 'string' ? rawNameValue : null;
      const rawRating = record.rating;
      const rating =
        typeof rawRating === 'number' && Number.isFinite(rawRating) ? rawRating : null;

      if (!rawName?.trim()) {
        return null;
      }

      return {
        name: rawName.trim(),
        rating,
      };
    })
    .filter((item): item is { name: string; rating: number | null } => Boolean(item));
}

function hasPortfolioValue(value: unknown): boolean {
  if (!value) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return false;
}

function stringifyCareerInfo(value: unknown): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function buildProfileStrength(candidate: Omit<CandidateRecord, 'profileStrength'>) {
  let score = 0;

  if (candidate.fullName.trim()) score += 1;
  if (candidate.avatarUrl) score += 1;
  if (candidate.headline) score += 2;
  if (candidate.location) score += 1;
  if (candidate.locationInterests.length > 0) score += 1;
  if (candidate.hasResume) score += 2;
  if (candidate.role === 'talent' && candidate.skills.length > 0) score += 2;
  if (candidate.role === 'talent' && candidate.fieldOfStudy) score += 1;
  if (candidate.role === 'talent' && candidate.hasPortfolio) score += 2;

  return Math.min(score, 10);
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitTerms(value: string) {
  return Array.from(new Set(normalizeText(value).split(/\s+/).filter(Boolean)));
}

function splitListTerms(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]+/)
        .map((segment) => normalizeText(segment))
        .filter(Boolean)
    )
  );
}

function buildSearchContext(
  q: string,
  locationFilter: string,
  skillFilter: string
): CandidateSearchContext {
  return {
    queryPhrase: normalizeText(q),
    queryTerms: splitTerms(q),
    locationTerms: splitListTerms(locationFilter),
    skillTerms: splitListTerms(skillFilter),
  };
}

function buildSearchHaystack(candidate: CandidateRecord, careerSummary: string) {
  return [
    candidate.fullName,
    candidate.headline || '',
    candidate.location || '',
    candidate.fieldOfStudy || '',
    candidate.schoolName || '',
    candidate.locationInterests.join(' '),
    candidate.skills.map((skill) => skill.name).join(' '),
    careerSummary,
  ]
    .join(' ');
}

function buildLocationHaystack(candidate: CandidateRecord) {
  return [candidate.location || '', candidate.locationInterests.join(' ')].join(' ');
}

function buildSkillHaystack(candidate: CandidateRecord, careerSummary: string) {
  return [
    candidate.skills.map((skill) => skill.name).join(' '),
    candidate.headline || '',
    candidate.fieldOfStudy || '',
    careerSummary,
  ].join(' ');
}

function matchesSegment(haystack: string, segment: string) {
  if (!segment) {
    return false;
  }

  if (haystack.includes(segment)) {
    return true;
  }

  const terms = splitTerms(segment);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function scoreFieldMatch(fieldValue: string, phrase: string, terms: string[]) {
  if (!fieldValue) {
    return 0;
  }

  let score = 0;
  const paddedField = ` ${fieldValue} `;

  if (phrase) {
    if (fieldValue === phrase) {
      score += 12;
    } else if (fieldValue.startsWith(phrase)) {
      score += 9;
    } else if (fieldValue.includes(phrase)) {
      score += 6;
    }
  }

  for (const term of terms) {
    if (paddedField.includes(` ${term} `)) {
      score += 3;
    } else if (fieldValue.includes(term)) {
      score += 1.5;
    }
  }

  return score;
}

function scoreSegmentMatches(haystack: string, segments: string[], exactScore: number, partialScore: number) {
  let score = 0;

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    if (haystack.includes(segment)) {
      score += exactScore;
      continue;
    }

    const terms = splitTerms(segment);
    const matchedTerms = terms.filter((term) => haystack.includes(term)).length;

    if (matchedTerms === 0) {
      continue;
    }

    if (matchedTerms === terms.length) {
      score += partialScore + matchedTerms;
    } else {
      score += matchedTerms;
    }
  }

  return score;
}

function scoreFreshness(updatedAt: string | null) {
  if (!updatedAt) {
    return 0;
  }

  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

  if (ageInDays <= 7) return 8;
  if (ageInDays <= 30) return 5;
  if (ageInDays <= 90) return 3;
  if (ageInDays <= 180) return 1;
  return 0;
}

function buildBestScore(candidate: CandidateSearchRecord, context: CandidateSearchContext) {
  const averageSkillRating =
    candidate.skills.length > 0
      ? candidate.skills.reduce((total, skill) => total + (skill.rating || 0), 0) / candidate.skills.length
      : 0;
  const readinessScore =
    candidate.profileStrength * 4 +
    (candidate.hasResume ? 8 : 0) +
    (candidate.hasPortfolio ? 5 : 0) +
    Math.min(candidate.skills.length, 6) +
    Math.round(averageSkillRating * 2);
  const freshnessScore = scoreFreshness(candidate.updatedAt);

  let queryScore = 0;
  if (context.queryPhrase) {
    if (candidate.searchHaystack.includes(context.queryPhrase)) {
      queryScore += 24;
    }

    const matchedQueryTerms = context.queryTerms.filter((term) =>
      candidate.searchHaystack.includes(term)
    ).length;

    queryScore += matchedQueryTerms * 6;
    if (matchedQueryTerms > 0 && matchedQueryTerms === context.queryTerms.length) {
      queryScore += 16;
    }

    queryScore += scoreFieldMatch(normalizeText(candidate.fullName), context.queryPhrase, context.queryTerms) * 4;
    queryScore += scoreFieldMatch(normalizeText(candidate.headline), context.queryPhrase, context.queryTerms) * 3;
    queryScore += scoreFieldMatch(normalizeText(candidate.fieldOfStudy), context.queryPhrase, context.queryTerms) * 3;
    queryScore += scoreFieldMatch(normalizeText(candidate.schoolName), context.queryPhrase, context.queryTerms);
    queryScore += scoreFieldMatch(candidate.skillHaystack, context.queryPhrase, context.queryTerms) * 2;
  }

  const skillScore =
    context.skillTerms.length > 0
      ? scoreSegmentMatches(candidate.skillHaystack, context.skillTerms, 18, 10)
      : 0;
  const locationScore =
    context.locationTerms.length > 0
      ? scoreSegmentMatches(candidate.locationHaystack, context.locationTerms, 12, 7)
      : 0;

  return queryScore + skillScore + locationScore + readinessScore + freshnessScore;
}

function matchesQuery(candidate: CandidateSearchRecord, context: CandidateSearchContext) {
  if (!context.queryPhrase) {
    return true;
  }

  if (candidate.searchHaystack.includes(context.queryPhrase)) {
    return true;
  }

  return (
    context.queryTerms.length > 0 &&
    context.queryTerms.every((term) => candidate.searchHaystack.includes(term))
  );
}

function matchesLocation(candidate: CandidateSearchRecord, context: CandidateSearchContext) {
  if (context.locationTerms.length === 0) {
    return true;
  }

  return context.locationTerms.some((term) => matchesSegment(candidate.locationHaystack, term));
}

function matchesSkill(candidate: CandidateSearchRecord, context: CandidateSearchContext) {
  if (context.skillTerms.length === 0) {
    return true;
  }

  return context.skillTerms.some((term) => matchesSegment(candidate.skillHaystack, term));
}

function compareCandidates(a: CandidateSearchRecord, b: CandidateSearchRecord, sort: DirectorySort) {
  if (sort === 'name') {
    return a.fullName.localeCompare(b.fullName);
  }

  if (sort === 'recent') {
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  }

  if (b.bestScore !== a.bestScore) {
    return b.bestScore - a.bestScore;
  }

  if (b.profileStrength !== a.profileStrength) {
    return b.profileStrength - a.profileStrength;
  }

  if (b.hasResume !== a.hasResume) {
    return b.hasResume ? 1 : -1;
  }

  if (b.skills.length !== a.skills.length) {
    return b.skills.length - a.skills.length;
  }

  if ((b.updatedAt || '') !== (a.updatedAt || '')) {
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  }

  return a.fullName.localeCompare(b.fullName);
}

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const serviceSupabase = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 });
  }

  const isActiveAdmin = Boolean(
    profile.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );
  const isRecruiter = profile.role === 'recruiter';

  if (!isRecruiter && !isActiveAdmin) {
    return NextResponse.json(
      { error: 'Only recruiters and active admins can access candidate search.' },
      { status: 403 }
    );
  }

  if (!isActiveAdmin) {
    const subscription = await getUserSubscription(user.id);
    if (!subscription.isActive || subscription.plan?.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'An active recruiter subscription is required to search candidates.' },
        { status: 403 }
      );
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const roleFilter = searchParams.get('role');
  const normalizedRoleFilter: CandidateRole | 'all' =
    roleFilter === 'job_seeker' || roleFilter === 'talent' ? roleFilter : 'all';
  const locationFilter = (searchParams.get('location') || '').trim().toLowerCase();
  const skillFilter = (searchParams.get('skill') || '').trim().toLowerCase();
  const searchContext = buildSearchContext(q, locationFilter, skillFilter);
  const hasResumeOnly = searchParams.get('has_resume') === '1';
  const sort =
    searchParams.get('sort') === 'recent' || searchParams.get('sort') === 'name'
      ? (searchParams.get('sort') as DirectorySort)
      : 'best';
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get('limit') || '24', 10) || 24, 1),
    48
  );
  const offset = Math.max(Number.parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  const quizVerifiedOnly = searchParams.get('quiz_verified') === '1';
  const challengeScoreMinRaw = Number.parseInt(
    searchParams.get('challenge_score_min') || '0',
    10
  );
  const challengeScoreMin = Number.isFinite(challengeScoreMinRaw)
    ? Math.max(0, Math.min(100, challengeScoreMinRaw))
    : 0;
  const challengeDomain = (searchParams.get('challenge_domain') || '').trim();
  const challengeSinceDaysRaw = Number.parseInt(
    searchParams.get('challenge_since_days') || '0',
    10
  );
  const challengeSinceDays = Number.isFinite(challengeSinceDaysRaw)
    ? Math.max(0, Math.min(365, challengeSinceDaysRaw))
    : 0;

  const quizFilterActive =
    quizVerifiedOnly ||
    challengeScoreMin > 0 ||
    challengeDomain.length > 0 ||
    challengeSinceDays > 0;

  const quizSignalByUser = new Map<string, QuizSignal>();
  let quizQualifiedIds: Set<string> | null = null;

  if (quizFilterActive) {
    let challengeIdFilter: string[] | null = null;
    if (challengeDomain) {
      const { data: challengeRows, error: challengeError } = await serviceSupabase
        .from('talent_challenges')
        .select('id')
        .eq('domain', challengeDomain);
      if (challengeError) {
        return NextResponse.json(
          { error: `Failed to load challenges: ${challengeError.message}` },
          { status: 500 }
        );
      }
      challengeIdFilter = ((challengeRows || []) as Array<{ id: string }>).map(
        (row) => row.id
      );
      if (challengeIdFilter.length === 0) {
        // No challenges in the requested domain — nobody qualifies.
        quizQualifiedIds = new Set<string>();
      }
    }

    if (quizQualifiedIds === null) {
      let submissionsQuery = serviceSupabase
        .from('talent_challenge_submissions')
        .select(
          'user_id, challenge_id, final_score, created_at, status, talent_challenges(title, domain)'
        )
        .in('status', ['submitted', 'graded'])
        .not('final_score', 'is', null)
        .gte('final_score', challengeScoreMin)
        .order('final_score', { ascending: false })
        .limit(2000);

      if (challengeSinceDays > 0) {
        const sinceIso = new Date(
          Date.now() - challengeSinceDays * 24 * 60 * 60 * 1000
        ).toISOString();
        submissionsQuery = submissionsQuery.gte('created_at', sinceIso);
      }
      if (challengeIdFilter && challengeIdFilter.length > 0) {
        submissionsQuery = submissionsQuery.in('challenge_id', challengeIdFilter);
      }

      const { data: submissionRows, error: submissionsError } = await submissionsQuery;
      if (submissionsError) {
        return NextResponse.json(
          { error: `Failed to load quiz submissions: ${submissionsError.message}` },
          { status: 500 }
        );
      }

      type SubmissionWithChallenge = {
        user_id: string;
        challenge_id: string;
        final_score: number | string | null;
        created_at: string;
        talent_challenges:
          | { title: string | null; domain: string | null }
          | Array<{ title: string | null; domain: string | null }>
          | null;
      };

      quizQualifiedIds = new Set<string>();
      for (const row of (submissionRows || []) as SubmissionWithChallenge[]) {
        const score = Number(row.final_score);
        if (!Number.isFinite(score)) continue;
        quizQualifiedIds.add(row.user_id);

        const challengeMeta = Array.isArray(row.talent_challenges)
          ? row.talent_challenges[0] ?? null
          : row.talent_challenges;

        const previous = quizSignalByUser.get(row.user_id);
        if (!previous || score > previous.bestScore) {
          quizSignalByUser.set(row.user_id, {
            domain: challengeMeta?.domain ?? null,
            bestScore: score,
            challengeTitle: challengeMeta?.title ?? null,
            earnedAt: row.created_at,
          });
        }
      }
    }
  }

  const { data: profiles, error: profilesError } = await serviceSupabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, updated_at');

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to load candidate profiles.' }, { status: 500 });
  }

  const baseProfiles = ((profiles || []) as BaseProfileRow[]).filter(
    (candidate) => normalizeRole(candidate.role) !== null
  );
  const jobSeekerIds = baseProfiles
    .filter((candidate) => normalizeRole(candidate.role) === 'job_seeker')
    .map((candidate) => candidate.id);
  const talentIds = baseProfiles
    .filter((candidate) => normalizeRole(candidate.role) === 'talent')
    .map((candidate) => candidate.id);

  const [{ data: jobSeekerProfiles, error: jobSeekerError }, { data: talentProfiles, error: talentError }] =
    await Promise.all([
      jobSeekerIds.length > 0
        ? serviceSupabase
            .from('job_seeker_profiles')
            .select('user_id, location, headline, location_interests, resume_url, career_info')
            .in('user_id', jobSeekerIds)
        : Promise.resolve({ data: [], error: null } as any),
      talentIds.length > 0
        ? serviceSupabase
            .from('talent_profiles')
            .select(
              'user_id, school_name, graduation_year, field_of_study, skills, location_interests, resume_url, portfolio, internship_eligible'
            )
            .in('user_id', talentIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

  if (jobSeekerError) {
    return NextResponse.json(
      { error: `Failed to load job seeker profiles: ${jobSeekerError.message}` },
      { status: 500 }
    );
  }

  if (talentError) {
    return NextResponse.json(
      { error: `Failed to load talent profiles: ${talentError.message}` },
      { status: 500 }
    );
  }

  const jobSeekerByUser = new Map<string, JobSeekerProfileRow>();
  ((jobSeekerProfiles || []) as JobSeekerProfileRow[]).forEach((row) => {
    jobSeekerByUser.set(row.user_id, row);
  });

  const talentByUser = new Map<string, TalentProfileRow>();
  ((talentProfiles || []) as TalentProfileRow[]).forEach((row) => {
    talentByUser.set(row.user_id, row);
  });

  const candidates: CandidateSearchRecord[] = baseProfiles.map((profileRow) => {
    const role = normalizeRole(profileRow.role) as CandidateRole;
    const jobSeekerProfile = role === 'job_seeker' ? jobSeekerByUser.get(profileRow.id) : null;
    const talentProfile = role === 'talent' ? talentByUser.get(profileRow.id) : null;
    const skills = parseSkills(talentProfile?.skills);
    const locationInterests =
      role === 'job_seeker'
        ? parseStringArray(jobSeekerProfile?.location_interests)
        : parseStringArray(talentProfile?.location_interests);
    const headline =
      role === 'job_seeker'
        ? jobSeekerProfile?.headline?.trim() || null
        : talentProfile?.field_of_study?.trim() || null;
    const location =
      role === 'job_seeker'
        ? jobSeekerProfile?.location?.trim() || null
        : locationInterests[0] || null;
    const fullName = profileRow.full_name?.trim() || 'Anonymous Candidate';
    const candidateBase = {
      id: profileRow.id,
      fullName,
      avatarUrl: profileRow.avatar_url || null,
      role,
      updatedAt: profileRow.updated_at || null,
      headline,
      location,
      locationInterests,
      fieldOfStudy: talentProfile?.field_of_study?.trim() || null,
      schoolName: talentProfile?.school_name?.trim() || null,
      graduationYear: talentProfile?.graduation_year || null,
      skills,
      hasResume: Boolean(
        (role === 'job_seeker'
          ? jobSeekerProfile?.resume_url
          : talentProfile?.resume_url) || ''
      ),
      hasPortfolio: Boolean(role === 'talent' && hasPortfolioValue(talentProfile?.portfolio)),
      quizSignal: quizSignalByUser.get(profileRow.id) ?? null,
    };
    const careerSummary = stringifyCareerInfo(jobSeekerProfile?.career_info);
    const candidateWithStrength = {
      ...candidateBase,
      profileStrength: buildProfileStrength(candidateBase),
    };
    const searchHaystack = normalizeText(
      buildSearchHaystack(candidateWithStrength, careerSummary)
    );
    const locationHaystack = normalizeText(buildLocationHaystack(candidateWithStrength));
    const skillHaystack = normalizeText(buildSkillHaystack(candidateWithStrength, careerSummary));
    const candidateRecord: CandidateSearchRecord = {
      ...candidateWithStrength,
      careerSummary,
      searchHaystack,
      locationHaystack,
      skillHaystack,
      bestScore: 0,
    };

    return {
      ...candidateRecord,
      bestScore: buildBestScore(candidateRecord, searchContext),
    };
  });

  const baseFiltered = candidates.filter((candidate) => {
    if (hasResumeOnly && !candidate.hasResume) {
      return false;
    }

    if (quizFilterActive) {
      if (!quizQualifiedIds || !quizQualifiedIds.has(candidate.id)) {
        return false;
      }
    }

    if (!matchesQuery(candidate, searchContext)) {
      return false;
    }

    if (!matchesLocation(candidate, searchContext)) {
      return false;
    }

    if (!matchesSkill(candidate, searchContext)) {
      return false;
    }

    return true;
  });

  const counts = {
    all: baseFiltered.length,
    job_seeker: baseFiltered.filter((candidate) => candidate.role === 'job_seeker').length,
    talent: baseFiltered.filter((candidate) => candidate.role === 'talent').length,
    with_resume: baseFiltered.filter((candidate) => candidate.hasResume).length,
  };

  const roleFiltered =
    normalizedRoleFilter === 'all'
      ? baseFiltered
      : baseFiltered.filter((candidate) => candidate.role === normalizedRoleFilter);

  const sortedCandidates = [...roleFiltered].sort((a, b) => compareCandidates(a, b, sort));
  const pagedCandidates = sortedCandidates.slice(offset, offset + limit).map((candidate) => ({
    id: candidate.id,
    fullName: candidate.fullName,
    avatarUrl: candidate.avatarUrl,
    role: candidate.role,
    updatedAt: candidate.updatedAt,
    headline: candidate.headline,
    location: candidate.location,
    locationInterests: candidate.locationInterests,
    fieldOfStudy: candidate.fieldOfStudy,
    schoolName: candidate.schoolName,
    graduationYear: candidate.graduationYear,
    skills: candidate.skills,
    hasResume: candidate.hasResume,
    hasPortfolio: candidate.hasPortfolio,
    profileStrength: candidate.profileStrength,
    quizSignal: candidate.quizSignal,
  }));

  return NextResponse.json({
    candidates: pagedCandidates,
    total: roleFiltered.length,
    limit,
    offset,
    counts,
  });
}
