import {
  defaultEligibleRolesForOpportunity,
  getOpportunityTypeLabel,
  type InternshipTrack,
  type OpportunityApplicantRole,
  type OpportunityJobType,
} from './opportunities';

export interface InternshipRequirementsFormState {
  allowedSchools: string;
  allowedFieldsOfStudy: string;
  allowedSchoolYears: string;
  graduationYearMin: string;
  graduationYearMax: string;
  expectedWeeklyAvailability: string;
  stipendType: string;
  academicCalendar: string;
  schoolRequired: boolean;
  creditBearing: boolean;
  requiresSchoolConvention: boolean;
  academicSupervisorRequired: boolean;
  portfolioRequired: boolean;
  conversionPossible: boolean;
  minimumProjectCount: string;
  minimumBadgeCount: string;
}

export interface InternshipTrackPostingPreset {
  track: 'education' | 'professional';
  label: string;
  summary: string;
  recruiterHint: string;
  pipelineLabel: string;
  titlePlaceholder: string;
  descriptionPrompt: string;
  highlights: string[];
}

export function createEmptyInternshipRequirementsFormState(): InternshipRequirementsFormState {
  return {
    allowedSchools: '',
    allowedFieldsOfStudy: '',
    allowedSchoolYears: '',
    graduationYearMin: '',
    graduationYearMax: '',
    expectedWeeklyAvailability: '',
    stipendType: '',
    academicCalendar: '',
    schoolRequired: false,
    creditBearing: false,
    requiresSchoolConvention: false,
    academicSupervisorRequired: false,
    portfolioRequired: false,
    conversionPossible: false,
    minimumProjectCount: '',
    minimumBadgeCount: '',
  };
}

export function buildInternshipRequirementsPayload(
  state: InternshipRequirementsFormState
) {
  const parseInteger = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  };

  const parseList = (value: string): string[] =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    allowedSchools: parseList(state.allowedSchools),
    allowedFieldsOfStudy: parseList(state.allowedFieldsOfStudy),
    allowedSchoolYears: parseList(state.allowedSchoolYears),
    graduationYearMin: parseInteger(state.graduationYearMin),
    graduationYearMax: parseInteger(state.graduationYearMax),
    expectedWeeklyAvailability: state.expectedWeeklyAvailability.trim() || null,
    stipendType: state.stipendType.trim() || null,
    academicCalendar: state.academicCalendar.trim() || null,
    schoolRequired: state.schoolRequired,
    creditBearing: state.creditBearing,
    requiresSchoolConvention: state.requiresSchoolConvention,
    academicSupervisorRequired: state.academicSupervisorRequired,
    portfolioRequired: state.portfolioRequired,
    conversionPossible: state.conversionPossible,
    minimumProjectCount: parseInteger(state.minimumProjectCount),
    minimumBadgeCount: parseInteger(state.minimumBadgeCount),
  };
}

export function internshipRequirementsFormStateFromPayload(
  payload: Record<string, any> | null | undefined
): InternshipRequirementsFormState {
  const join = (value: unknown) =>
    Array.isArray(value) ? value.filter(Boolean).join(', ') : '';

  return {
    allowedSchools: join(payload?.allowedSchools),
    allowedFieldsOfStudy: join(payload?.allowedFieldsOfStudy),
    allowedSchoolYears: join(payload?.allowedSchoolYears),
    graduationYearMin:
      typeof payload?.graduationYearMin === 'number'
        ? String(payload.graduationYearMin)
        : '',
    graduationYearMax:
      typeof payload?.graduationYearMax === 'number'
        ? String(payload.graduationYearMax)
        : '',
    expectedWeeklyAvailability: payload?.expectedWeeklyAvailability || '',
    stipendType: payload?.stipendType || '',
    academicCalendar: payload?.academicCalendar || '',
    schoolRequired: Boolean(payload?.schoolRequired),
    creditBearing: Boolean(payload?.creditBearing),
    requiresSchoolConvention: Boolean(payload?.requiresSchoolConvention),
    academicSupervisorRequired: Boolean(payload?.academicSupervisorRequired),
    portfolioRequired: Boolean(payload?.portfolioRequired),
    conversionPossible: Boolean(payload?.conversionPossible),
    minimumProjectCount:
      typeof payload?.minimumProjectCount === 'number'
        ? String(payload.minimumProjectCount)
        : '',
    minimumBadgeCount:
      typeof payload?.minimumBadgeCount === 'number'
        ? String(payload.minimumBadgeCount)
        : '',
  };
}

const INTERNSHIP_TRACK_PRESETS: Record<
  'education' | 'professional',
  InternshipTrackPostingPreset
> = {
  education: {
    track: 'education',
    label: 'Educational Internship',
    summary:
      'Academic placement for students completing required school or credit-bearing internship periods.',
    recruiterHint:
      'Prioritize school fit, field of study, year level, academic calendar, and placement administration.',
    pipelineLabel:
      'Applied -> Eligibility Check -> Academic Review -> Recruiter Review -> Supervisor Review -> Placement Confirmed',
    titlePlaceholder: 'e.g. Marketing Student Internship (Academic Placement)',
    descriptionPrompt:
      'Describe the learning objectives, supervising team, academic requirements, and placement timeline.',
    highlights: [
      'Targets talent profiles by default',
      'Supports school, year, and academic calendar filters',
      'Best for convention or credit-bearing placements',
    ],
  },
  professional: {
    track: 'professional',
    label: 'Professional Internship',
    summary:
      'Work-readiness internship focused on projects, execution, portfolio evidence, and team contribution.',
    recruiterHint:
      'Prioritize project strength, weekly availability, portfolio proof, and conversion potential.',
    pipelineLabel:
      'Applied -> Recruiter Screen -> Assessment -> Interview -> Offer -> Hired',
    titlePlaceholder: 'e.g. Product Design Internship',
    descriptionPrompt:
      'Describe the tools, outcomes, project work, mentorship, and conversion potential for strong performers.',
    highlights: [
      'Targets job seekers and talent by default',
      'Best for portfolio-driven or assessment-based screening',
      'Designed for work-ready candidates and conversion funnels',
    ],
  },
};

export function getInternshipTrackPostingPreset(
  track: InternshipTrack | ''
): InternshipTrackPostingPreset | null {
  if (track === 'education' || track === 'professional') {
    return INTERNSHIP_TRACK_PRESETS[track];
  }

  return null;
}

export function getEligibleRolesLabel(
  jobType: OpportunityJobType,
  internshipTrack: InternshipTrack,
  visibility: string | null = 'public'
): string {
  return defaultEligibleRolesForOpportunity(jobType, internshipTrack, visibility)
    .map(formatApplicantRoleLabel)
    .join(', ');
}

function formatApplicantRoleLabel(role: OpportunityApplicantRole): string {
  return role === 'job_seeker' ? 'Job Seekers' : 'Talent';
}

export function applyInternshipTrackPreset(
  current: InternshipRequirementsFormState,
  track: InternshipTrack | ''
): InternshipRequirementsFormState {
  const next = createEmptyInternshipRequirementsFormState();
  const shared = {
    allowedFieldsOfStudy: current.allowedFieldsOfStudy,
    graduationYearMin: current.graduationYearMin,
    graduationYearMax: current.graduationYearMax,
    stipendType: current.stipendType,
  };

  if (track === 'education') {
    return {
      ...next,
      ...shared,
      allowedSchools: current.allowedSchools,
      allowedSchoolYears: current.allowedSchoolYears,
      academicCalendar: current.academicCalendar,
      schoolRequired: true,
      creditBearing: current.creditBearing,
      requiresSchoolConvention: current.requiresSchoolConvention,
      academicSupervisorRequired: current.academicSupervisorRequired,
    };
  }

  if (track === 'professional') {
    return {
      ...next,
      ...shared,
      expectedWeeklyAvailability: current.expectedWeeklyAvailability,
      portfolioRequired: true,
      conversionPossible: current.conversionPossible,
      minimumProjectCount: current.minimumProjectCount,
      minimumBadgeCount: current.minimumBadgeCount,
    };
  }

  return next;
}

export function getOpportunityPostingLabel(
  jobType: OpportunityJobType | string,
  internshipTrack: InternshipTrack | ''
): string {
  return getOpportunityTypeLabel(jobType, internshipTrack || 'unspecified');
}
