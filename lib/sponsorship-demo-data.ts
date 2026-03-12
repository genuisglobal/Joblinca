import type { SponsorPlacement, SponsorStatus, SponsorType } from '@/lib/sponsorship-schema';

export interface DemoSponsorCampaignTemplate {
  seed_key: string;
  sponsor_type: SponsorType;
  placement: SponsorPlacement;
  status: SponsorStatus;
  sponsor_name: string;
  title: string;
  short_copy: string;
  cta_label: string;
  cta_url: string;
  image_url: string | null;
  sponsor_logo_url: string | null;
  audience_roles: string[];
  city_targets: string[];
  priority: number;
  price_xaf: number;
  duration_days: number;
}

export const DEMO_SPONSOR_CAMPAIGNS: DemoSponsorCampaignTemplate[] = [
  {
    seed_key: 'homepage-demo-job-douala-sales',
    sponsor_type: 'job',
    placement: 'homepage_shelf',
    status: 'active',
    sponsor_name: 'Atlas Consumer Group',
    title: 'Field Sales Lead for a fast-moving FMCG expansion in Douala',
    short_copy:
      'Sponsor placement example for a high-intent hiring push with immediate openings in distribution, retail growth, and territory activation.',
    cta_label: 'View Jobs',
    cta_url: '/jobs?location=Douala',
    image_url: null,
    sponsor_logo_url: null,
    audience_roles: ['candidate', 'talent'],
    city_targets: ['Douala'],
    priority: 90,
    price_xaf: 10000,
    duration_days: 21,
  },
  {
    seed_key: 'homepage-demo-employer-customer-ops',
    sponsor_type: 'employer',
    placement: 'homepage_shelf',
    status: 'active',
    sponsor_name: 'MboaPay',
    title: 'Customer operations hiring sprint across support, compliance, and onboarding',
    short_copy:
      'Employer spotlight example for a repeat recruiter building awareness before promoting individual openings in the main jobs feed.',
    cta_label: 'View Employers',
    cta_url: '/companies',
    image_url: null,
    sponsor_logo_url: null,
    audience_roles: ['candidate', 'talent'],
    city_targets: ['Douala', 'Yaounde'],
    priority: 80,
    price_xaf: 35000,
    duration_days: 30,
  },
  {
    seed_key: 'homepage-demo-academy-data-bootcamp',
    sponsor_type: 'academy',
    placement: 'homepage_shelf',
    status: 'active',
    sponsor_name: 'Northstar Academy',
    title: 'Work-ready data analytics bootcamp with portfolio and interview prep',
    short_copy:
      'Academy placement example aimed at free users who need a stronger profile before applying to analyst, ops, and reporting roles.',
    cta_label: 'Explore Programs',
    cta_url: '/auth/register?role=candidate',
    image_url: null,
    sponsor_logo_url: null,
    audience_roles: ['candidate', 'talent'],
    city_targets: ['Remote'],
    priority: 70,
    price_xaf: 25000,
    duration_days: 30,
  },
  {
    seed_key: 'homepage-demo-job-remote-product',
    sponsor_type: 'job',
    placement: 'homepage_shelf',
    status: 'active',
    sponsor_name: 'Kora Systems',
    title: 'Remote product support specialist for an English-first SaaS team',
    short_copy:
      'Second sponsored job example showing how a remote-friendly role can appear in the homepage shelf without replacing the main organic listings.',
    cta_label: 'Browse Remote Jobs',
    cta_url: '/jobs?remote=1',
    image_url: null,
    sponsor_logo_url: null,
    audience_roles: ['candidate', 'talent'],
    city_targets: ['Remote'],
    priority: 60,
    price_xaf: 12000,
    duration_days: 14,
  },
];
