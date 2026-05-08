export const VIDEO_ASPECT_RATIO = '9:16' as const;
export const VIDEO_RESOLUTION = '1080x1920' as const;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

export const NORMALIZED_VIDEO_LOCATIONS = [
  'Douala',
  'Yaounde',
  'Buea',
  'Limbe',
  'Bamenda',
  'Bafoussam',
  'Kribi',
  'Garoua',
  'Maroua',
  'Bertoua',
  'Ngaoundere',
  'Multiple Locations',
  'Cameroon',
] as const;

export const VIDEO_JOB_CATEGORIES = [
  'Sales & Commercial',
  'Marketing & Digital',
  'Accounting & Finance',
  'Customer Service',
  'Admin & Office',
  'IT & Tech',
  'Logistics & Operations',
  'Hospitality & Retail',
  'Education & Training',
  'Healthcare',
  'NGO & Development',
  'Engineering & Technical',
  'Internships & Entry-Level',
  'Mass Recruitment',
  'Other',
] as const;

export const VIDEO_BATCH_TYPES = [
  'single_job_alert',
  'top_jobs_today',
  'city_jobs',
  'category_jobs',
  'urgent_jobs',
  'french_daily_jobs',
  'english_daily_jobs',
  'trusted_joblinca_jobs',
] as const;

export const VIDEO_SOURCE_TYPES = [
  'direct_platform',
  'scraped_external',
  'partner_source',
  'manual_upload',
  'unknown',
] as const;

export const VIDEO_EXPERIENCE_LEVELS = [
  'Entry Level',
  'Mid Level',
  'Senior Level',
  'Unknown',
] as const;

export const VIDEO_COMPANY_STRENGTHS = [
  'verified_direct',
  'featured',
  'trusted',
  'standard',
  'unknown',
] as const;

export const VIDEO_PLATFORM_LABELS = [
  'Direct Joblinca Jobs',
  'Trusted Joblinca Jobs',
  'Employer-Verified Jobs',
] as const;

export type VideoLanguage = 'en' | 'fr';
export type NormalizedVideoLocation = (typeof NORMALIZED_VIDEO_LOCATIONS)[number];
export type VideoJobCategory = (typeof VIDEO_JOB_CATEGORIES)[number];
export type VideoBatchType = (typeof VIDEO_BATCH_TYPES)[number];
export type VideoSourceType = (typeof VIDEO_SOURCE_TYPES)[number];
export type VideoExperienceLevel = (typeof VIDEO_EXPERIENCE_LEVELS)[number];
export type VideoCompanyStrength = (typeof VIDEO_COMPANY_STRENGTHS)[number];
export type VideoPlatformLabel = (typeof VIDEO_PLATFORM_LABELS)[number];

export interface RawVideoJob {
  id: string;
  publicId: string | null;
  title: string;
  description: string;
  company: string;
  languageHint: VideoLanguage | null;
  sourceLanguage: string | null;
  rawLocation: string | null;
  cityHint: string | null;
  salary: number | null;
  salaryText: string | null;
  workType: string | null;
  jobType: string | null;
  internshipTrack: string | null;
  createdAt: string;
  closesAt: string | null;
  published: boolean;
  approvalStatus: string | null;
  lifecycleStatus: string | null;
  visibility: string | null;
  recruiterId: string | null;
  recruiterVerified: boolean;
  recruiterVerificationStatus: string | null;
  approvedBy: string | null;
  postedByRole: string | null;
  applyMethod: string | null;
  applicationUrl: string | null;
  jobUrl: string;
  applyEmail: string | null;
  applyPhone: string | null;
  applyWhatsapp: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  originalJobUrl: string | null;
  originType: string | null;
  originDiscoveredJobId: string | null;
  sourceAttribution: Record<string, unknown> | null;
  trustScore: number | null;
  scamScore: number | null;
  discoveredVerificationStatus: string | null;
  claimStatus: string | null;
  ingestionStatus: string | null;
  platformVerificationStatus: string | null;
}

export interface ClassifiedVideoJob extends RawVideoJob {
  language: VideoLanguage;
  city: NormalizedVideoLocation;
  category: VideoJobCategory;
  experienceLevel: VideoExperienceLevel;
  urgent: boolean;
  urgentSignals: string[];
  featuredCompany: boolean;
  companyStrength: VideoCompanyStrength;
  videoPriority: number;
  directPlatformJob: boolean;
  trustedByJoblinca: boolean;
  verificationLabel: string | null;
  sourceType: VideoSourceType;
  platformLabel: VideoPlatformLabel | null;
}

export interface VideoCaptionSet {
  default: string;
  tiktok: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  whatsapp: string;
}

export interface VideoScenePlan {
  id: string;
  label: string;
  durationSeconds: number;
  voiceover: string;
  onScreenText: string[];
  visualNotes: string[];
}

export interface VideoBatchDraft {
  id: string;
  slug: string;
  date: string;
  batchType: VideoBatchType;
  language: VideoLanguage;
  title: string;
  durationTarget: number;
  aspectRatio: typeof VIDEO_ASPECT_RATIO;
  resolution: typeof VIDEO_RESOLUTION;
  cta: string;
  jobs: ClassifiedVideoJob[];
  city?: NormalizedVideoLocation | null;
  category?: VideoJobCategory | null;
  notes?: string[];
}

export interface VideoBatchOutput extends VideoBatchDraft {
  script: string;
  caption: string;
  captionsByPlatform: VideoCaptionSet;
  hashtags: string[];
  scenePlan: VideoScenePlan[];
}

export interface HeyGenVideoPayload {
  provider: 'heygen';
  mode: 'dry_run' | 'live';
  batchId: string;
  title: string;
  language: VideoLanguage;
  output: {
    aspectRatio: typeof VIDEO_ASPECT_RATIO;
    resolution: typeof VIDEO_RESOLUTION;
    durationTarget: number;
  };
  brand: {
    name: 'Joblinca';
    website: string;
    cta: string;
  };
  style: {
    tone: string;
    presenterStyle: string;
    countryFocus: string;
  };
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    city: NormalizedVideoLocation;
    category: VideoJobCategory;
    experienceLevel: VideoExperienceLevel;
    applicationUrl: string;
    sourceType: VideoSourceType;
    trustedByJoblinca: boolean;
  }>;
  script: string;
  captions: VideoCaptionSet;
  hashtags: string[];
  scenePlan: VideoScenePlan[];
}

export interface ExistingBatchUsage {
  jobIds: Set<string>;
  batchIds: Set<string>;
}
