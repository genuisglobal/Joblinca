import type { ParsedTimeFilter } from '@/lib/whatsapp-agent/parser';
import { getServerT } from '@/lib/i18n/server-t';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

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
  | 'recruiter.awaiting_publish_confirmation';

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

export interface WaStatePayload {
  jobSearch?: JobSearchDraft;
  recruiterDraft?: RecruiterDraft;
}

export function isJobseekerState(state: string): boolean {
  return state.startsWith('jobseeker.');
}

export function isRecruiterState(state: string): boolean {
  return state.startsWith('recruiter.');
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
  };
}

export function menuMessage(locale: Locale = DEFAULT_LOCALE): string {
  const t = getServerT(locale);
  return [
    t('wa.menu.title'),
    '',
    t('wa.menu.instruction'),
    t('wa.menu.findJob'),
    t('wa.menu.postJob'),
    t('wa.menu.findInternship'),
    t('wa.menu.createAccount'),
  ].join('\n');
}

export function timeFilterPrompt(locale: Locale = DEFAULT_LOCALE): string {
  const t = getServerT(locale);
  return [
    t('wa.timeFilter.title'),
    t('wa.timeFilter.day'),
    t('wa.timeFilter.week'),
    t('wa.timeFilter.month'),
  ].join('\n');
}
