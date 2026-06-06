import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getUserSubscription } from '@/lib/subscriptions';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';

type CandidateRole = 'job_seeker' | 'talent';
type OutreachSource = 'candidate_search' | 'candidate_detail';

interface RouteContext {
  params: {
    id: string;
  };
}

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

interface CandidateDetailRecord {
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
  internshipEligible: boolean | null;
  skills: Array<{ name: string; rating: number | null }>;
  hasResume: boolean;
  resumeUrl: string | null;
  hasPortfolio: boolean;
  portfolioUrl: string | null;
  careerSummary: string;
  profileStrength: number;
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
      const rawName = typeof record.name === 'string' ? record.name : null;
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

function extractPortfolioUrl(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractPortfolioUrl(item);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['url', 'portfolio', 'link', 'href']) {
      const resolved = extractPortfolioUrl(record[key]);
      if (resolved) {
        return resolved;
      }
    }

    for (const rawValue of Object.values(record)) {
      const resolved = extractPortfolioUrl(rawValue);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function stringifyCareerInfo(value: unknown): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ');
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

function buildProfileStrength(candidate: Omit<CandidateDetailRecord, 'profileStrength'>) {
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

function isOutreachTrackingUnavailable(error: { message?: string | null } | null) {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('recruiter_candidate_outreach_events') &&
    (message.includes('does not exist') || message.includes('could not find'))
  );
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
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
    profile.admin_type &&
      ACTIVE_ADMIN_TYPES.includes(profile.admin_type as (typeof ACTIVE_ADMIN_TYPES)[number])
  );
  const isRecruiter = profile.role === 'recruiter';

  if (!isRecruiter && !isActiveAdmin) {
    return NextResponse.json(
      { error: 'Only recruiters and active admins can access candidate profiles.' },
      { status: 403 }
    );
  }

  if (!isActiveAdmin) {
    const subscription = await getUserSubscription(user.id);
    if (!subscription.isActive || subscription.plan?.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'An active recruiter subscription is required to view candidate profiles.' },
        { status: 403 }
      );
    }
  }

  const candidateId = params.id?.trim();

  if (!candidateId) {
    return NextResponse.json({ error: 'Candidate id is required.' }, { status: 400 });
  }

  const { data: candidateProfile, error: candidateProfileError } = await serviceSupabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, updated_at')
    .eq('id', candidateId)
    .maybeSingle();

  if (candidateProfileError) {
    return NextResponse.json({ error: 'Failed to load candidate profile.' }, { status: 500 });
  }

  if (!candidateProfile) {
    return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  }

  const normalizedRole = normalizeRole((candidateProfile as BaseProfileRow).role);

  if (!normalizedRole) {
    return NextResponse.json({ error: 'Candidate profile not available.' }, { status: 404 });
  }

  const [jobSeekerProfileResponse, talentProfileResponse] = await Promise.all([
    normalizedRole === 'job_seeker'
      ? serviceSupabase
          .from('job_seeker_profiles')
          .select('user_id, location, headline, location_interests, resume_url, career_info')
          .eq('user_id', candidateId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    normalizedRole === 'talent'
      ? serviceSupabase
          .from('talent_profiles')
          .select(
            'user_id, school_name, graduation_year, field_of_study, skills, location_interests, resume_url, portfolio, internship_eligible'
          )
          .eq('user_id', candidateId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  if (jobSeekerProfileResponse.error) {
    return NextResponse.json(
      { error: `Failed to load job seeker profile: ${jobSeekerProfileResponse.error.message}` },
      { status: 500 }
    );
  }

  if (talentProfileResponse.error) {
    return NextResponse.json(
      { error: `Failed to load talent profile: ${talentProfileResponse.error.message}` },
      { status: 500 }
    );
  }

  const jobSeekerProfile = jobSeekerProfileResponse.data as JobSeekerProfileRow | null;
  const talentProfile = talentProfileResponse.data as TalentProfileRow | null;
  const skills = parseSkills(talentProfile?.skills);
  const locationInterests =
    normalizedRole === 'job_seeker'
      ? parseStringArray(jobSeekerProfile?.location_interests)
      : parseStringArray(talentProfile?.location_interests);
  const headline =
    normalizedRole === 'job_seeker'
      ? jobSeekerProfile?.headline?.trim() || null
      : talentProfile?.field_of_study?.trim() || null;
  const location =
    normalizedRole === 'job_seeker'
      ? jobSeekerProfile?.location?.trim() || null
      : locationInterests[0] || null;
  const resumeUrl =
    (normalizedRole === 'job_seeker'
      ? jobSeekerProfile?.resume_url
      : talentProfile?.resume_url)?.trim() || null;
  const portfolioUrl = extractPortfolioUrl(talentProfile?.portfolio);
  const candidateBase: Omit<CandidateDetailRecord, 'profileStrength'> = {
    id: candidateId,
    fullName: candidateProfile.full_name?.trim() || 'Anonymous Candidate',
    avatarUrl: candidateProfile.avatar_url || null,
    role: normalizedRole,
    updatedAt: candidateProfile.updated_at || null,
    headline,
    location,
    locationInterests,
    fieldOfStudy: talentProfile?.field_of_study?.trim() || null,
    schoolName: talentProfile?.school_name?.trim() || null,
    graduationYear: talentProfile?.graduation_year || null,
    internshipEligible: talentProfile?.internship_eligible ?? null,
    skills,
    hasResume: Boolean(resumeUrl),
    resumeUrl,
    hasPortfolio: Boolean(normalizedRole === 'talent' && hasPortfolioValue(talentProfile?.portfolio)),
    portfolioUrl,
    careerSummary: stringifyCareerInfo(jobSeekerProfile?.career_info),
  };

  let outreachTrackingAvailable = true;
  const outreachCounts: Record<OutreachSource, number> = {
    candidate_search: 0,
    candidate_detail: 0,
  };
  let lastContactedAt: string | null = null;

  const { data: outreachEvents, error: outreachError } = await serviceSupabase
    .from('recruiter_candidate_outreach_events')
    .select('created_at, source')
    .eq('recruiter_id', user.id)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });

  if (outreachError) {
    outreachTrackingAvailable = false;

    if (!isOutreachTrackingUnavailable(outreachError)) {
      console.warn('Failed to load recruiter candidate outreach history:', outreachError.message);
    }
  } else if (Array.isArray(outreachEvents)) {
    lastContactedAt = outreachEvents[0]?.created_at || null;

    for (const event of outreachEvents) {
      const source = event.source === 'candidate_detail' ? 'candidate_detail' : 'candidate_search';
      outreachCounts[source]++;
    }
  }

  return NextResponse.json({
    candidate: {
      ...candidateBase,
      profileStrength: buildProfileStrength(candidateBase),
    },
    outreach: {
      trackingAvailable: outreachTrackingAvailable,
      total: outreachTrackingAvailable ? outreachCounts.candidate_search + outreachCounts.candidate_detail : 0,
      lastContactedAt,
      bySource: outreachCounts,
    },
  });
}
