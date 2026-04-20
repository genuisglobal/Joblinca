import { evaluateApplicationEligibility } from '@/lib/applications/eligibility';
import { loadJobOpportunityMetadata } from '@/lib/opportunities-server';
import {
  APPLICATION_CV_BUCKET,
  buildStoragePublicUrl,
  getApplicationCvPath,
} from '@/lib/storage/resume-links';

export interface ApplicationContactInfoInput {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
}

export interface ApplicationEducationDetailsInput {
  schoolName?: string | null;
  fieldOfStudy?: string | null;
  schoolYear?: string | null;
  graduationYear?: string | null;
  needsCredit?: boolean | null;
  hasSchoolConvention?: boolean | null;
  academicSupervisor?: string | null;
}

export interface ApplicationProfessionalDetailsInput {
  portfolioUrl?: string | null;
  projectHighlights?: string | null;
  weeklyAvailability?: string | null;
  experienceSummary?: string | null;
}

export interface ApplicationProfileReadinessInput {
  projectCount?: number | null;
  badgeCount?: number | null;
  portfolioUrl?: string | null;
}

export interface ApplicationPayloadInput {
  contactInfo?: ApplicationContactInfoInput | null;
  educationDetails?: ApplicationEducationDetailsInput | null;
  professionalDetails?: ApplicationProfessionalDetailsInput | null;
  profileReadiness?: ApplicationProfileReadinessInput | null;
  resumeUrl?: string | null;
  resumePath?: string | null;
}

export interface ResolvedApplicationPayload {
  applicantRole: string;
  job: {
    id: string;
    published: boolean;
    approval_status: string | null;
    lifecycle_status: string | null;
    closes_at: string | null;
    removed_at: string | null;
    job_type: string | null;
    internship_track: string | null;
    visibility: string | null;
    eligible_roles: unknown;
  };
  contactInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
  };
  educationDetails: {
    schoolName: string;
    fieldOfStudy: string;
    schoolYear: string;
    graduationYear: string;
    needsCredit: boolean;
    hasSchoolConvention: boolean;
    academicSupervisor: string;
  };
  professionalDetails: {
    portfolioUrl: string;
    projectHighlights: string;
    weeklyAvailability: string;
    experienceSummary: string;
  };
  profileReadiness: {
    projectCount: number;
    badgeCount: number;
    portfolioUrl: string;
  };
  resumeUrl: string | null;
  candidateSnapshot: Record<string, unknown>;
  preview: ReturnType<typeof evaluateApplicationEligibility>;
}

type ServerSupabaseClient = {
  from: (table: string) => any;
};

type ResolveApplicationPayloadResult =
  | { ok: false; status: number; error: string }
  | { ok: true; data: ResolvedApplicationPayload };

export function normalizeApplicantRole(role: string | null | undefined) {
  if (!role) {
    return null;
  }

  return role === 'candidate' ? 'job_seeker' : role;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return 0;
}

function parseGraduationYear(value: unknown): number | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function extractPortfolioUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidateKeys = ['url', 'link', 'website', 'portfolioUrl'];

    for (const key of candidateKeys) {
      if (typeof record[key] === 'string' && record[key]) {
        return String(record[key]).trim();
      }
    }
  }

  return '';
}

export async function resolveApplicationPayload(
  supabase: ServerSupabaseClient,
  userId: string,
  userEmail: string | null | undefined,
  jobId: string,
  payload: ApplicationPayloadInput
): Promise<ResolveApplicationPayloadResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, role, phone')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      status: 403,
      error: 'Complete account setup before applying to jobs',
    };
  }

  const applicantRole = normalizeApplicantRole(profile.role);
  if (!applicantRole) {
    return {
      ok: false,
      status: 403,
      error: 'Complete account setup before applying to jobs',
    };
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(
      'id, published, approval_status, lifecycle_status, closes_at, removed_at, job_type, internship_track, visibility, eligible_roles'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    return {
      ok: false,
      status: 404,
      error: 'Job not found',
    };
  }

  const isTalent = applicantRole === 'talent';
  const isJobSeeker = applicantRole === 'job_seeker';

  const [jobSeekerProfile, talentProfile, projectsCountResult, badgeCountResult, requirementsResult] =
    await Promise.all([
      isJobSeeker
        ? supabase
            .from('job_seeker_profiles')
            .select('phone, location, resume_url')
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      isTalent
        ? supabase
            .from('talent_profiles')
            .select('school_name, graduation_year, field_of_study, portfolio, resume_url')
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      isTalent
        ? supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('candidate_id', userId)
        : Promise.resolve({ count: normalizeNumber(payload.profileReadiness?.projectCount) }),
      isTalent
        ? supabase
            .from('user_badges')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        : Promise.resolve({ count: normalizeNumber(payload.profileReadiness?.badgeCount) }),
      job.job_type === 'internship'
        ? loadJobOpportunityMetadata(supabase as any, jobId)
        : Promise.resolve({ data: null, error: null }),
    ]);

  const contactInfo = {
    fullName:
      normalizeText(payload.contactInfo?.fullName) ||
      normalizeText(profile.full_name) ||
      `${normalizeText(profile.first_name)} ${normalizeText(profile.last_name)}`.trim(),
    email:
      normalizeText(payload.contactInfo?.email) ||
      normalizeText(profile.email) ||
      normalizeText(userEmail),
    phone:
      normalizeText(payload.contactInfo?.phone) ||
      normalizeText(jobSeekerProfile?.data?.phone) ||
      normalizeText(profile.phone),
    location:
      normalizeText(payload.contactInfo?.location) ||
      normalizeText(jobSeekerProfile?.data?.location),
  };

  const educationDetails = {
    schoolName:
      normalizeText(payload.educationDetails?.schoolName) ||
      normalizeText(talentProfile?.data?.school_name),
    fieldOfStudy:
      normalizeText(payload.educationDetails?.fieldOfStudy) ||
      normalizeText(talentProfile?.data?.field_of_study),
    schoolYear: normalizeText(payload.educationDetails?.schoolYear),
    graduationYear:
      normalizeText(payload.educationDetails?.graduationYear) ||
      (talentProfile?.data?.graduation_year
        ? String(talentProfile.data.graduation_year)
        : ''),
    needsCredit: normalizeBoolean(payload.educationDetails?.needsCredit),
    hasSchoolConvention: normalizeBoolean(payload.educationDetails?.hasSchoolConvention),
    academicSupervisor: normalizeText(payload.educationDetails?.academicSupervisor),
  };

  const fallbackPortfolioUrl =
    normalizeText(payload.profileReadiness?.portfolioUrl) ||
    extractPortfolioUrl(talentProfile?.data?.portfolio);

  const professionalDetails = {
    portfolioUrl:
      normalizeText(payload.professionalDetails?.portfolioUrl) || fallbackPortfolioUrl,
    projectHighlights: normalizeText(payload.professionalDetails?.projectHighlights),
    weeklyAvailability: normalizeText(payload.professionalDetails?.weeklyAvailability),
    experienceSummary: normalizeText(payload.professionalDetails?.experienceSummary),
  };

  const profileReadiness = {
    projectCount:
      typeof projectsCountResult?.count === 'number'
        ? projectsCountResult.count
        : normalizeNumber(payload.profileReadiness?.projectCount),
    badgeCount:
      typeof badgeCountResult?.count === 'number'
        ? badgeCountResult.count
        : normalizeNumber(payload.profileReadiness?.badgeCount),
    portfolioUrl: fallbackPortfolioUrl,
  };

  const resumePath = getApplicationCvPath(payload.resumePath, userId);
  const uploadedResumeUrl = resumePath
    ? buildStoragePublicUrl(APPLICATION_CV_BUCKET, resumePath)
    : null;
  const resumeUrl =
    uploadedResumeUrl ||
    normalizeOptionalText(payload.resumeUrl) ||
    normalizeOptionalText(jobSeekerProfile?.data?.resume_url) ||
    normalizeOptionalText(talentProfile?.data?.resume_url);

  const candidateSnapshot = {
    role: applicantRole,
    contactInfo,
    hasResume: Boolean(resumeUrl),
    resumePath,
    internshipTrack: job.internship_track || null,
    educationDetails: job.internship_track === 'education' ? educationDetails : null,
    professionalDetails: job.internship_track === 'professional' ? professionalDetails : null,
    profileReadiness,
  };

  const preview = evaluateApplicationEligibility({
    job: {
      published: job.published !== false,
      approvalStatus: job.approval_status || null,
      lifecycleStatus: job.lifecycle_status || null,
      closesAt: job.closes_at || null,
      removedAt: job.removed_at || null,
      jobType: job.job_type || null,
      internshipTrack: job.internship_track || null,
      visibility: job.visibility || null,
      eligibleRoles: job.eligible_roles,
    },
    requirements: requirementsResult.data,
    context: {
      role: applicantRole,
      schoolName: educationDetails.schoolName,
      fieldOfStudy: educationDetails.fieldOfStudy,
      schoolYear: educationDetails.schoolYear,
      graduationYear: parseGraduationYear(educationDetails.graduationYear),
      needsCredit: educationDetails.needsCredit,
      hasSchoolConvention: educationDetails.hasSchoolConvention,
      academicSupervisor: educationDetails.academicSupervisor,
      portfolioUrl: professionalDetails.portfolioUrl || profileReadiness.portfolioUrl,
      weeklyAvailability: professionalDetails.weeklyAvailability,
      projectCount: profileReadiness.projectCount,
      badgeCount: profileReadiness.badgeCount,
      resumeUrl,
      phone: contactInfo.phone,
      email: contactInfo.email,
    },
  });

  return {
    ok: true,
    data: {
      applicantRole,
      job,
      contactInfo,
      educationDetails,
      professionalDetails,
      profileReadiness,
      resumeUrl,
      candidateSnapshot,
      preview,
    },
  };
}
