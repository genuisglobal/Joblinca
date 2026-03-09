export const OPPORTUNITY_JOB_TYPES = ['job', 'internship', 'gig'] as const;
export const OPPORTUNITY_APPLICANT_ROLES = ['job_seeker', 'talent'] as const;
export const INTERNSHIP_TRACKS = ['unspecified', 'education', 'professional'] as const;
export const OPPORTUNITY_BROWSE_FILTERS = [
  'all',
  'job',
  'internship_education',
  'internship_professional',
  'gig',
] as const;
export const APPLY_METHODS = [
  'joblinca',
  'external_url',
  'email',
  'phone',
  'whatsapp',
  'multiple',
] as const;
export const APPLY_INTAKE_MODES = [
  'native',
  'managed_whatsapp',
  'managed_email',
  'external_redirect',
  'hybrid',
] as const;

export type OpportunityJobType = (typeof OPPORTUNITY_JOB_TYPES)[number];
export type OpportunityApplicantRole = (typeof OPPORTUNITY_APPLICANT_ROLES)[number];
export type InternshipTrack = (typeof INTERNSHIP_TRACKS)[number];
export type OpportunityBrowseFilter = (typeof OPPORTUNITY_BROWSE_FILTERS)[number];
export type ApplyMethod = (typeof APPLY_METHODS)[number];
export type ApplyIntakeMode = (typeof APPLY_INTAKE_MODES)[number];

export interface InternshipRequirementsInput {
  schoolRequired?: boolean;
  allowedSchools?: string[];
  allowedFieldsOfStudy?: string[];
  allowedSchoolYears?: string[];
  graduationYearMin?: number | null;
  graduationYearMax?: number | null;
  creditBearing?: boolean;
  requiresSchoolConvention?: boolean;
  academicCalendar?: string | null;
  academicSupervisorRequired?: boolean;
  portfolioRequired?: boolean;
  minimumProjectCount?: number | null;
  minimumBadgeCount?: number | null;
  conversionPossible?: boolean;
  expectedWeeklyAvailability?: string | null;
  stipendType?: string | null;
  notes?: Record<string, unknown>;
}

export interface OpportunityConfigurationInput {
  jobType?: string | null;
  visibility?: string | null;
  internshipTrack?: string | null;
  eligibleRoles?: unknown;
  applyMethod?: string | null;
  applyIntakeMode?: string | null;
  internshipRequirements?: InternshipRequirementsInput | null;
}

export interface NormalizedOpportunityConfiguration {
  jobType: OpportunityJobType;
  visibility: string;
  internshipTrack: InternshipTrack;
  eligibleRoles: OpportunityApplicantRole[];
  applyIntakeMode: ApplyIntakeMode;
  internshipRequirements: InternshipRequirementsInput | null;
}

export interface OpportunityValidationResult {
  valid: boolean;
  errors: string[];
  normalized: NormalizedOpportunityConfiguration;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizeText(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function normalizeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.trunc(parsed));
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  return fallback;
}

export function isOpportunityApplicantRole(value: unknown): value is OpportunityApplicantRole {
  return typeof value === 'string' && OPPORTUNITY_APPLICANT_ROLES.includes(value as OpportunityApplicantRole);
}

export function normalizeOpportunityJobType(value: unknown): OpportunityJobType {
  if (typeof value === 'string' && OPPORTUNITY_JOB_TYPES.includes(value as OpportunityJobType)) {
    return value as OpportunityJobType;
  }

  return 'job';
}

export function normalizeInternshipTrack(
  jobType: OpportunityJobType,
  value: unknown
): InternshipTrack {
  if (jobType !== 'internship') {
    return 'unspecified';
  }

  if (typeof value === 'string' && INTERNSHIP_TRACKS.includes(value as InternshipTrack)) {
    return value as InternshipTrack;
  }

  return 'unspecified';
}

export function resolveOpportunityBrowseFilter(value: unknown): OpportunityBrowseFilter {
  if (
    typeof value === 'string' &&
    OPPORTUNITY_BROWSE_FILTERS.includes(value as OpportunityBrowseFilter)
  ) {
    return value as OpportunityBrowseFilter;
  }

  return 'all';
}

export function opportunityBrowseCategoryFor(
  jobType: unknown,
  internshipTrack: unknown
): OpportunityJobType | 'internship_education' | 'internship_professional' {
  const normalizedJobType = normalizeOpportunityJobType(jobType);
  const normalizedTrack = normalizeInternshipTrack(normalizedJobType, internshipTrack);

  if (normalizedJobType === 'internship' && normalizedTrack === 'education') {
    return 'internship_education';
  }

  if (normalizedJobType === 'internship' && normalizedTrack === 'professional') {
    return 'internship_professional';
  }

  return normalizedJobType;
}

export function matchesOpportunityBrowseFilter(
  filter: OpportunityBrowseFilter,
  jobType: unknown,
  internshipTrack: unknown
): boolean {
  if (filter === 'all') {
    return true;
  }

  return opportunityBrowseCategoryFor(jobType, internshipTrack) === filter;
}

export function getOpportunityTypeLabel(
  jobType: unknown,
  internshipTrack: unknown
): string {
  const normalizedJobType = normalizeOpportunityJobType(jobType);
  const normalizedTrack = normalizeInternshipTrack(normalizedJobType, internshipTrack);

  if (normalizedJobType === 'internship' && normalizedTrack === 'education') {
    return 'Educational Internship';
  }

  if (normalizedJobType === 'internship' && normalizedTrack === 'professional') {
    return 'Professional Internship';
  }

  if (normalizedJobType === 'internship') {
    return 'Internship';
  }

  if (normalizedJobType === 'gig') {
    return 'Gig';
  }

  return 'Job';
}

export function defaultEligibleRolesForOpportunity(
  jobType: OpportunityJobType,
  internshipTrack: InternshipTrack,
  visibility: string | null = 'public'
): OpportunityApplicantRole[] {
  if (jobType === 'internship' && internshipTrack === 'education') {
    return ['talent'];
  }

  if (visibility === 'talent_only') {
    return ['talent'];
  }

  if (jobType === 'internship' && internshipTrack === 'professional') {
    return ['job_seeker', 'talent'];
  }

  if (jobType === 'internship') {
    return ['job_seeker', 'talent'];
  }

  return ['job_seeker'];
}

export function defaultApplyIntakeModeForApplyMethod(
  applyMethod: string | null | undefined
): ApplyIntakeMode {
  switch (applyMethod) {
    case 'whatsapp':
      return 'managed_whatsapp';
    case 'email':
      return 'managed_email';
    case 'external_url':
      return 'external_redirect';
    case 'multiple':
      return 'hybrid';
    case 'joblinca':
    case 'phone':
    default:
      return 'native';
  }
}

export function normalizeInternshipRequirements(
  jobType: OpportunityJobType,
  internshipTrack: InternshipTrack,
  requirements: InternshipRequirementsInput | null | undefined
): InternshipRequirementsInput | null {
  if (jobType !== 'internship' || internshipTrack === 'unspecified') {
    return null;
  }

  const raw = requirements || {};

  return {
    schoolRequired: normalizeBoolean(raw.schoolRequired, internshipTrack === 'education'),
    allowedSchools: normalizeStringArray(raw.allowedSchools),
    allowedFieldsOfStudy: normalizeStringArray(raw.allowedFieldsOfStudy),
    allowedSchoolYears: normalizeStringArray(raw.allowedSchoolYears),
    graduationYearMin: normalizeInteger(raw.graduationYearMin),
    graduationYearMax: normalizeInteger(raw.graduationYearMax),
    creditBearing: normalizeBoolean(raw.creditBearing, false),
    requiresSchoolConvention: normalizeBoolean(raw.requiresSchoolConvention, false),
    academicCalendar: normalizeText(raw.academicCalendar),
    academicSupervisorRequired: normalizeBoolean(raw.academicSupervisorRequired, false),
    portfolioRequired: normalizeBoolean(raw.portfolioRequired, internshipTrack === 'professional'),
    minimumProjectCount: normalizeInteger(raw.minimumProjectCount),
    minimumBadgeCount: normalizeInteger(raw.minimumBadgeCount),
    conversionPossible: normalizeBoolean(raw.conversionPossible, internshipTrack === 'professional'),
    expectedWeeklyAvailability: normalizeText(raw.expectedWeeklyAvailability),
    stipendType: normalizeText(raw.stipendType),
    notes:
      raw.notes && typeof raw.notes === 'object' && !Array.isArray(raw.notes)
        ? raw.notes
        : {},
  };
}

export function validateOpportunityConfiguration(
  input: OpportunityConfigurationInput
): OpportunityValidationResult {
  const jobType = normalizeOpportunityJobType(input.jobType);
  const visibility = normalizeText(input.visibility) || 'public';
  const internshipTrack = normalizeInternshipTrack(jobType, input.internshipTrack);
  const normalizedRoles = Array.isArray(input.eligibleRoles)
    ? input.eligibleRoles.filter(isOpportunityApplicantRole)
    : [];
  const eligibleRoles =
    normalizedRoles.length > 0
      ? Array.from(new Set(normalizedRoles))
      : defaultEligibleRolesForOpportunity(jobType, internshipTrack, visibility);
  const applyIntakeMode =
    typeof input.applyIntakeMode === 'string' &&
    APPLY_INTAKE_MODES.includes(input.applyIntakeMode as ApplyIntakeMode)
      ? (input.applyIntakeMode as ApplyIntakeMode)
      : defaultApplyIntakeModeForApplyMethod(input.applyMethod);
  const internshipRequirements = normalizeInternshipRequirements(
    jobType,
    internshipTrack,
    input.internshipRequirements
  );
  const graduationYearMin = internshipRequirements?.graduationYearMin ?? null;
  const graduationYearMax = internshipRequirements?.graduationYearMax ?? null;

  const errors: string[] = [];

  if (jobType === 'internship' && internshipTrack === 'unspecified') {
    errors.push('Select whether this internship is educational or professional.');
  }

  if (jobType !== 'internship' && internshipTrack !== 'unspecified') {
    errors.push('Only internship opportunities can define an internship track.');
  }

  if (visibility !== 'public' && visibility !== 'talent_only') {
    errors.push('Visibility must be public or talent_only.');
  }

  if (jobType === 'internship' && internshipTrack === 'education') {
    if (!eligibleRoles.includes('talent')) {
      errors.push('Educational internships must remain open to talent profiles.');
    }
    if (eligibleRoles.some((role) => role !== 'talent')) {
      errors.push('Educational internships currently support talent applicants only.');
    }
  }

  if (visibility === 'talent_only' && !eligibleRoles.includes('talent')) {
    errors.push('Talent-only visibility requires talent to be an eligible applicant role.');
  }

  if (eligibleRoles.length === 0) {
    errors.push('At least one eligible applicant role is required.');
  }

  if (graduationYearMin !== null && graduationYearMax !== null && graduationYearMin > graduationYearMax) {
    errors.push('Graduation year minimum cannot be greater than the maximum.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      jobType,
      visibility,
      internshipTrack,
      eligibleRoles,
      applyIntakeMode,
      internshipRequirements,
    },
  };
}

export function canRoleApplyToOpportunity(
  role: string | null | undefined,
  eligibleRoles: unknown,
  jobType: string | null | undefined,
  internshipTrack: string | null | undefined,
  visibility: string | null | undefined
): boolean {
  if (!isOpportunityApplicantRole(role)) {
    return false;
  }

  const normalizedJobType = normalizeOpportunityJobType(jobType);
  const normalizedTrack = normalizeInternshipTrack(normalizedJobType, internshipTrack);
  const normalizedRoles = Array.isArray(eligibleRoles)
    ? eligibleRoles.filter(isOpportunityApplicantRole)
    : defaultEligibleRolesForOpportunity(normalizedJobType, normalizedTrack, visibility || 'public');

  return normalizedRoles.includes(role);
}

export function applicationDashboardHrefForRole(role: string | null | undefined): string {
  return role === 'talent'
    ? '/dashboard/talent/applications'
    : '/dashboard/job-seeker/applications';
}

export function describeEligibleRoles(
  eligibleRoles: unknown,
  jobType: string | null | undefined,
  internshipTrack: string | null | undefined,
  visibility: string | null | undefined
): string {
  const normalizedJobType = normalizeOpportunityJobType(jobType);
  const normalizedTrack = normalizeInternshipTrack(normalizedJobType, internshipTrack);
  const roles = Array.isArray(eligibleRoles)
    ? eligibleRoles.filter(isOpportunityApplicantRole)
    : defaultEligibleRolesForOpportunity(normalizedJobType, normalizedTrack, visibility || 'public');

  if (roles.length === 1 && roles[0] === 'talent') {
    return 'Talent profiles';
  }

  if (roles.length === 1 && roles[0] === 'job_seeker') {
    return 'Job seeker profiles';
  }

  return 'Job seeker and talent profiles';
}
