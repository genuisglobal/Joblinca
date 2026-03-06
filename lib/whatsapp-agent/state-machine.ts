import type { ParsedTimeFilter } from '@/lib/whatsapp-agent/parser';

export type WaRoleSelection = 'jobseeker' | 'recruiter' | 'talent' | null;

export type WaConversationState =
  | 'idle'
  | 'menu'
  | 'jobseeker.awaiting_account_choice'
  | 'jobseeker.awaiting_location_scope'
  | 'jobseeker.awaiting_location_town'
  | 'jobseeker.awaiting_location'
  | 'jobseeker.awaiting_role_mode'
  | 'jobseeker.awaiting_keywords'
  | 'jobseeker.awaiting_time_filter'
  | 'jobseeker.ready_results'
  | 'recruiter.awaiting_title'
  | 'recruiter.awaiting_location'
  | 'recruiter.awaiting_salary'
  | 'recruiter.awaiting_description'
  | 'recruiter.awaiting_application_method'
  | 'talent.awaiting_name'
  | 'talent.awaiting_institution'
  | 'talent.awaiting_town'
  | 'talent.awaiting_major'
  | 'talent.awaiting_cv_projects'
  | 'talent.completed';

export interface JobSearchDraft {
  searchType?: 'job' | 'internship' | null;
  locationScope?: 'nationwide' | 'town' | null;
  location?: string | null;
  roleMode?: 'all' | 'specific' | null;
  roleKeywords?: string | null;
  timeFilter?: ParsedTimeFilter | null;
}

export interface RecruiterDraft {
  jobTitle?: string | null;
  location?: string | null;
  salary?: string | null;
  description?: string | null;
  applicationMethod?: string | null;
}

export interface TalentDraft {
  fullName?: string | null;
  institutionName?: string | null;
  town?: string | null;
  courseOrMajor?: string | null;
  cvOrProjects?: string | null;
}

export interface WaStatePayload {
  jobSearch?: JobSearchDraft;
  recruiterDraft?: RecruiterDraft;
  talentDraft?: TalentDraft;
}

export function isJobseekerState(state: string): boolean {
  return state.startsWith('jobseeker.');
}

export function isRecruiterState(state: string): boolean {
  return state.startsWith('recruiter.');
}

export function isTalentState(state: string): boolean {
  return state.startsWith('talent.');
}

export function isMenuRootState(state: WaConversationState): boolean {
  return state === 'idle' || state === 'menu';
}

export function defaultStatePayload(): WaStatePayload {
  return {
    jobSearch: {
      searchType: 'job',
      locationScope: null,
      location: null,
      roleMode: null,
      roleKeywords: null,
      timeFilter: null,
    },
    recruiterDraft: {
      jobTitle: null,
      location: null,
      salary: null,
      description: null,
      applicationMethod: null,
    },
    talentDraft: {
      fullName: null,
      institutionName: null,
      town: null,
      courseOrMajor: null,
      cvOrProjects: null,
    },
  };
}

export function mergePayload(
  existing: unknown,
  partial: Partial<WaStatePayload>
): WaStatePayload {
  const base = defaultStatePayload();
  const current = (existing && typeof existing === 'object' ? existing : {}) as WaStatePayload;

  return {
    jobSearch: {
      ...base.jobSearch,
      ...(current.jobSearch || {}),
      ...(partial.jobSearch || {}),
    },
    recruiterDraft: {
      ...base.recruiterDraft,
      ...(current.recruiterDraft || {}),
      ...(partial.recruiterDraft || {}),
    },
    talentDraft: {
      ...base.talentDraft,
      ...(current.talentDraft || {}),
      ...(partial.talentDraft || {}),
    },
  };
}

export function menuMessage(): string {
  return [
    'Welcome to JobLinca WhatsApp AI Agent.',
    '',
    'Reply with a number:',
    '1) Find a job',
    '2) Post a job',
    '3) Find internship',
    '4) Create account',
  ].join('\n');
}

export function timeFilterPrompt(): string {
  return [
    'Select time filter:',
    '1) Last 24 hours',
    '2) Last 1 week',
    '3) Last 1 month',
  ].join('\n');
}
