export const SPONSOR_TYPES = ['job', 'employer', 'academy'] as const;
export const SPONSOR_STATUSES = [
  'draft',
  'pending_approval',
  'active',
  'paused',
  'ended',
  'rejected',
] as const;
export const SPONSOR_PLACEMENTS = [
  'homepage_shelf',
  'jobs_top',
  'jobs_infeed',
  'city_top',
  'skillup_partners',
] as const;
export const SPONSOR_EVENT_TYPES = ['impression', 'click', 'cta_click'] as const;

export type SponsorType = (typeof SPONSOR_TYPES)[number];
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];
export type SponsorPlacement = (typeof SPONSOR_PLACEMENTS)[number];
export type SponsorEventType = (typeof SPONSOR_EVENT_TYPES)[number];

export interface SponsorFeedItem {
  id: string;
  sponsorType: SponsorType;
  placement: SponsorPlacement;
  badgeLabel: string;
  headline: string;
  sponsorName: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  isExternal: boolean;
  logoUrl: string | null;
  meta: string[];
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminSponsorCampaignRecord {
  id: string;
  sponsor_type: SponsorType;
  status: SponsorStatus;
  placement: SponsorPlacement;
  sponsor_name: string;
  title: string;
  short_copy: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  sponsor_logo_url: string | null;
  job_id: string | null;
  recruiter_id: string | null;
  partner_course_id: string | null;
  audience_roles: string[];
  city_targets: string[];
  priority: number;
  price_xaf: number;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  stats: {
    all_time: SponsorCampaignStats;
    last_7_days: SponsorCampaignStats;
  };
  job: {
    id: string;
    title: string;
    company_name: string | null;
  } | null;
  recruiter: {
    id: string;
    company_name: string;
    verified: boolean;
  } | null;
  partner_course: {
    id: string;
    partner_name: string;
    title: string;
  } | null;
}

export interface SponsorCampaignStats {
  impressions: number;
  clicks: number;
  cta_clicks: number;
  ctr_percent: number;
  last_event_at: string | null;
}

export function isSponsorType(value: string): value is SponsorType {
  return (SPONSOR_TYPES as readonly string[]).includes(value);
}

export function isSponsorStatus(value: string): value is SponsorStatus {
  return (SPONSOR_STATUSES as readonly string[]).includes(value);
}

export function isSponsorPlacement(value: string): value is SponsorPlacement {
  return (SPONSOR_PLACEMENTS as readonly string[]).includes(value);
}

export function isSponsorEventType(value: string): value is SponsorEventType {
  return (SPONSOR_EVENT_TYPES as readonly string[]).includes(value);
}
