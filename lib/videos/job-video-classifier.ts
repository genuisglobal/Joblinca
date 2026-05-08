import { detectContentLanguage, normalizeLocale } from '@/lib/i18n/locale';

import type {
  ClassifiedVideoJob,
  NormalizedVideoLocation,
  RawVideoJob,
  VideoCompanyStrength,
  VideoExperienceLevel,
  VideoJobCategory,
  VideoLanguage,
  VideoPlatformLabel,
  VideoSourceType,
} from './types';

const CITY_ALIASES: Array<{ city: NormalizedVideoLocation; aliases: string[] }> = [
  { city: 'Douala', aliases: ['douala'] },
  { city: 'Yaounde', aliases: ['yaounde'] },
  { city: 'Buea', aliases: ['buea'] },
  { city: 'Limbe', aliases: ['limbe'] },
  { city: 'Bamenda', aliases: ['bamenda'] },
  { city: 'Bafoussam', aliases: ['bafoussam'] },
  { city: 'Kribi', aliases: ['kribi'] },
  { city: 'Garoua', aliases: ['garoua'] },
  { city: 'Maroua', aliases: ['maroua'] },
  { city: 'Bertoua', aliases: ['bertoua'] },
  { city: 'Ngaoundere', aliases: ['ngaoundere'] },
];

const MULTI_LOCATION_MARKERS = [
  'multiple locations',
  'plusieurs localites',
  'nationwide',
  'all regions',
  'across cameroon',
  'plusieurs villes',
  'dans plusieurs villes',
  'more than one city',
];

const FRENCH_LANGUAGE_HINTS = [
  'recrute',
  'recrutement',
  'emploi',
  'offre',
  'poste',
  'candidature',
  'postulez',
  'postuler',
  'responsable',
  'comptable',
  'assistant',
  'technicien',
  'entreprise',
  'societe',
  'commercial',
  'ingenieur',
  'receptionniste',
  'aujourdhui',
];

const ENGLISH_LANGUAGE_HINTS = [
  'hiring',
  'job',
  'jobs',
  'vacancy',
  'vacancies',
  'apply',
  'required',
  'requirements',
  'manager',
  'officer',
  'engineer',
  'customer service',
  'receptionist',
  'urgent',
  'opportunity',
  'opportunities',
];

const EXPERIENCE_RULES: Array<{ level: VideoExperienceLevel; keywords: string[] }> = [
  {
    level: 'Senior Level',
    keywords: [
      'manager',
      'director',
      'responsable',
      'chef',
      'coordinator',
      'lead',
      'supervisor',
      'head of',
    ],
  },
  {
    level: 'Mid Level',
    keywords: [
      'officer',
      'accountant',
      'executive',
      'representative',
      'technician',
      'specialist',
      'analyst',
      'developer',
    ],
  },
  {
    level: 'Entry Level',
    keywords: [
      'intern',
      'internship',
      'assistant',
      'junior',
      'beginner',
      'graduate trainee',
      'customer care',
      'receptionist',
      'stage',
      'stagiaire',
      'trainee',
      'apprentice',
    ],
  },
];

const URGENCY_MARKERS = [
  'urgent',
  'urgently',
  'immediate',
  'apply now',
  'deadline soon',
  'recrutement urgent',
  'plusieurs postes',
  'mass recruitment',
  'postes a pourvoir',
  'recrutement massif',
  'needed now',
  'urgentement',
];

const FEATURED_COMPANIES = new Set([
  'dhl',
  'mtn',
  'orange',
  'ecobank',
  'uba',
  'bgfibank',
  'totalenergies',
  'guinness',
  'unicef',
  'undp',
  'dangote',
  'camtel',
  'canal plus',
  'canalplus',
  'cfao',
  'eneo',
  'sabc',
  'afriland',
  'societe generale',
  'sgbc',
]);

const CATEGORY_RULES: Array<{ category: VideoJobCategory; keywords: string[] }> = [
  {
    category: 'Mass Recruitment',
    keywords: ['mass recruitment', 'recrutement massif', 'plusieurs postes', 'many positions'],
  },
  {
    category: 'Internships & Entry-Level',
    keywords: ['internship', 'intern', 'stage', 'stagiaire', 'graduate trainee', 'entry level'],
  },
  {
    category: 'IT & Tech',
    keywords: [
      'software',
      'developer',
      'data',
      'it support',
      'devops',
      'network',
      'frontend',
      'backend',
      'cybersecurity',
      'full stack',
      'programmer',
      'webmaster',
      'system administrator',
    ],
  },
  {
    category: 'Marketing & Digital',
    keywords: [
      'marketing',
      'digital',
      'social media',
      'community manager',
      'brand',
      'seo',
      'content',
      'communication',
      'communications',
      'growth',
      'graphic designer',
    ],
  },
  {
    category: 'Sales & Commercial',
    keywords: [
      'sales',
      'commercial',
      'business development',
      'account manager',
      'field agent',
      'vendeur',
      'vente',
      'merchandiser',
    ],
  },
  {
    category: 'Accounting & Finance',
    keywords: [
      'accountant',
      'finance',
      'financial',
      'auditor',
      'comptable',
      'cashier',
      'treasury',
      'billing',
      'credit control',
    ],
  },
  {
    category: 'Customer Service',
    keywords: [
      'customer service',
      'customer care',
      'call center',
      'front desk',
      'client service',
      'guest relations',
      'support officer',
    ],
  },
  {
    category: 'Admin & Office',
    keywords: [
      'admin',
      'administrative',
      'office',
      'secretary',
      'receptionist',
      'reception',
      'front office',
      'executive assistant',
      'personal assistant',
    ],
  },
  {
    category: 'Logistics & Operations',
    keywords: [
      'logistics',
      'supply chain',
      'warehouse',
      'operations',
      'procurement',
      'inventory',
      'transport',
      'distribution',
      'driver',
      'chauffeur',
    ],
  },
  {
    category: 'Hospitality & Retail',
    keywords: [
      'hotel',
      'restaurant',
      'retail',
      'shop',
      'cashier',
      'waiter',
      'waitress',
      'barista',
      'store',
      'hostess',
      'housekeeping',
    ],
  },
  {
    category: 'Education & Training',
    keywords: [
      'teacher',
      'lecturer',
      'trainer',
      'school',
      'education',
      'professor',
      'tutor',
      'curriculum',
      'instructor',
    ],
  },
  {
    category: 'Healthcare',
    keywords: [
      'nurse',
      'doctor',
      'medical',
      'clinic',
      'hospital',
      'pharmacy',
      'pharmacist',
      'laboratory',
      'healthcare',
      'sage femme',
    ],
  },
  {
    category: 'NGO & Development',
    keywords: [
      'ngo',
      'ong',
      'development',
      'humanitarian',
      'livelihood',
      'program officer',
      'monitoring and evaluation',
      'm&e',
      'field coordinator',
      'grant',
    ],
  },
  {
    category: 'Engineering & Technical',
    keywords: [
      'engineer',
      'engineering',
      'electrical',
      'mechanical',
      'civil',
      'maintenance',
      'technician',
      'qa qc',
      'quality control',
      'surveyor',
    ],
  },
];

function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function scoreKeywords(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function normalizeCompany(value: string | null | undefined) {
  return normalizeText(value).replace(/\b(sarl|sa|sas|ltd|llc|inc|corp|group|co)\b/g, '').trim();
}

export function detectLanguage(
  title: string,
  description: string,
  sourceLanguage?: string | null
): VideoLanguage {
  const normalizedSource = normalizeLocale(sourceLanguage);
  const combined = normalizeText(`${title} ${description}`);

  if (!combined) {
    return normalizedSource || 'en';
  }

  const frScore = scoreKeywords(combined, FRENCH_LANGUAGE_HINTS);
  const enScore = scoreKeywords(combined, ENGLISH_LANGUAGE_HINTS);

  if (frScore > enScore) {
    return 'fr';
  }

  if (enScore > frScore) {
    return 'en';
  }

  const detected = detectContentLanguage(`${title} ${description}`);
  if (detected && (frScore > 0 || enScore > 0)) {
    return detected;
  }

  return normalizedSource || 'en';
}

export function normalizeLocation(
  location: string | null | undefined,
  cityHint?: string | null
): NormalizedVideoLocation {
  const combined = normalizeText([cityHint, location].filter(Boolean).join(' '));

  if (!combined) {
    return 'Cameroon';
  }

  if (
    containsAny(combined, MULTI_LOCATION_MARKERS) ||
    (combined.includes('douala') && combined.includes('yaounde')) ||
    (combined.includes('buea') && combined.includes('limbe'))
  ) {
    return 'Multiple Locations';
  }

  for (const entry of CITY_ALIASES) {
    if (entry.aliases.some((alias) => combined.includes(alias))) {
      return entry.city;
    }
  }

  if (combined.includes('cameroon') || combined.includes('cameroun')) {
    return 'Cameroon';
  }

  return 'Cameroon';
}

export function classifyJobCategory(params: {
  title: string;
  description: string;
  jobType?: string | null;
  internshipTrack?: string | null;
}): VideoJobCategory {
  const combined = normalizeText(
    [params.title, params.description, params.jobType, params.internshipTrack].filter(Boolean).join(' ')
  );

  if (!combined) {
    return 'Other';
  }

  for (const rule of CATEGORY_RULES) {
    if (containsAny(combined, rule.keywords)) {
      return rule.category;
    }
  }

  return 'Other';
}

export function classifyExperienceLevel(
  title: string,
  description: string
): VideoExperienceLevel {
  const combined = normalizeText(`${title} ${description}`);

  for (const rule of EXPERIENCE_RULES) {
    if (containsAny(combined, rule.keywords)) {
      return rule.level;
    }
  }

  return 'Unknown';
}

export function collectUrgencySignals(title: string, description: string): string[] {
  const combined = normalizeText(`${title} ${description}`);
  return URGENCY_MARKERS.filter((marker) => combined.includes(marker));
}

export function detectUrgency(title: string, description: string): boolean {
  return collectUrgencySignals(title, description).length > 0;
}

export function classifySourceType(
  job: Pick<
    RawVideoJob,
    'originType' | 'originDiscoveredJobId' | 'sourceName' | 'recruiterId' | 'postedByRole'
  >
): VideoSourceType {
  if (job.originType === 'claimed_discovered') {
    return 'partner_source';
  }

  if (job.originType === 'admin_import' || job.originDiscoveredJobId) {
    return 'scraped_external';
  }

  if (job.originType === 'native' && job.recruiterId) {
    return 'direct_platform';
  }

  if (job.originType === 'native' && job.postedByRole?.startsWith('admin_')) {
    return 'manual_upload';
  }

  if (normalizeText(job.sourceName) === 'joblinca') {
    return 'direct_platform';
  }

  return 'unknown';
}

export function detectDirectPlatformJob(
  job: Pick<
    RawVideoJob,
    | 'originType'
    | 'originDiscoveredJobId'
    | 'sourceName'
    | 'recruiterId'
    | 'sourceAttribution'
    | 'originalJobUrl'
  >
): boolean {
  if (job.originType === 'admin_import' || job.originType === 'claimed_discovered') {
    return false;
  }

  const sourceName = normalizeText(job.sourceName);
  const hasExternalAttribution =
    Boolean(job.originDiscoveredJobId) ||
    Boolean(job.originalJobUrl) ||
    Object.keys(job.sourceAttribution || {}).length > 0;

  if (job.originType === 'native' && !hasExternalAttribution) {
    return true;
  }

  return Boolean(job.recruiterId) && sourceName === 'joblinca';
}

export function detectTrustedByJoblinca(
  job: Pick<
    RawVideoJob,
    | 'published'
    | 'approvalStatus'
    | 'recruiterVerified'
    | 'recruiterVerificationStatus'
    | 'approvedBy'
    | 'platformVerificationStatus'
  >,
  directPlatformJob: boolean
) {
  if (!directPlatformJob) {
    return false;
  }

  if (!job.published || job.approvalStatus !== 'approved') {
    return false;
  }

  return Boolean(
    job.recruiterVerified ||
      job.recruiterVerificationStatus === 'verified' ||
      job.platformVerificationStatus === 'approved' ||
      job.platformVerificationStatus === 'trusted' ||
      job.approvedBy
  );
}

export function detectFeaturedCompany(params: {
  companyName: string;
  trustScore: number | null;
  scamScore: number | null;
  hasClearApplication: boolean;
  directPlatformJob: boolean;
  trustedByJoblinca: boolean;
}): boolean {
  const normalizedCompany = normalizeCompany(params.companyName);
  if (!normalizedCompany) {
    return false;
  }

  if ([...FEATURED_COMPANIES].some((company) => normalizedCompany.includes(company))) {
    return true;
  }

  if (params.trustedByJoblinca || (params.directPlatformJob && params.hasClearApplication)) {
    return true;
  }

  if ((params.trustScore || 0) >= 70 && (params.scamScore || 0) === 0 && params.hasClearApplication) {
    return true;
  }

  const looksProfessional =
    normalizedCompany.split(' ').length >= 2 ||
    containsAny(normalizedCompany, ['bank', 'hotel', 'clinic', 'college', 'university', 'foundation']);

  return looksProfessional && params.hasClearApplication && (params.scamScore || 0) <= 5;
}

function resolveCompanyStrength(params: {
  trustedByJoblinca: boolean;
  featuredCompany: boolean;
  trustScore: number | null;
  scamScore: number | null;
}): VideoCompanyStrength {
  if (params.trustedByJoblinca) {
    return 'verified_direct';
  }

  if (params.featuredCompany) {
    return 'featured';
  }

  if ((params.trustScore || 0) >= 70 && (params.scamScore || 0) <= 5) {
    return 'trusted';
  }

  if ((params.scamScore || 0) <= 15) {
    return 'standard';
  }

  return 'unknown';
}

function resolvePlatformLabel(params: {
  directPlatformJob: boolean;
  trustedByJoblinca: boolean;
  recruiterVerified: boolean;
  recruiterVerificationStatus: string | null;
}): VideoPlatformLabel | null {
  if (!params.directPlatformJob) {
    return null;
  }

  if (
    params.trustedByJoblinca &&
    (params.recruiterVerified || params.recruiterVerificationStatus === 'verified')
  ) {
    return 'Employer-Verified Jobs';
  }

  if (params.trustedByJoblinca) {
    return 'Trusted Joblinca Jobs';
  }

  return 'Direct Joblinca Jobs';
}

export function calculateVideoPriority(job: {
  trustedByJoblinca: boolean;
  featuredCompany: boolean;
  urgent: boolean;
  trustScore: number | null;
  scamScore: number | null;
  sourceType: VideoSourceType;
  hasClearApplication: boolean;
}): number {
  let priority = 100;

  if (job.trustedByJoblinca) {
    priority += 1000;
  } else if (job.sourceType === 'direct_platform') {
    priority += 850;
  } else if (job.sourceType === 'partner_source') {
    priority += 650;
  } else if (job.sourceType === 'scraped_external') {
    priority += 450;
  }

  if (job.featuredCompany) {
    priority += 220;
  }

  if (job.urgent) {
    priority += 180;
  }

  if ((job.trustScore || 0) >= 85) {
    priority += 120;
  } else if ((job.trustScore || 0) >= 70) {
    priority += 80;
  } else if ((job.trustScore || 0) >= 50) {
    priority += 40;
  }

  if (job.hasClearApplication) {
    priority += 25;
  }

  priority -= Math.max(0, job.scamScore || 0) * 12;

  return priority;
}

export function classifyVideoJob(rawJob: RawVideoJob): ClassifiedVideoJob {
  const language = detectLanguage(
    rawJob.title,
    rawJob.description,
    rawJob.languageHint || rawJob.sourceLanguage
  );
  const city = normalizeLocation(rawJob.rawLocation, rawJob.cityHint);
  const category = classifyJobCategory({
    title: rawJob.title,
    description: rawJob.description,
    jobType: rawJob.jobType,
    internshipTrack: rawJob.internshipTrack,
  });
  const experienceLevel = classifyExperienceLevel(rawJob.title, rawJob.description);
  const urgentSignals = collectUrgencySignals(rawJob.title, rawJob.description);
  const urgent = urgentSignals.length > 0;
  const sourceType = classifySourceType(rawJob);
  const directPlatformJob = detectDirectPlatformJob(rawJob);
  const trustedByJoblinca = detectTrustedByJoblinca(rawJob, directPlatformJob);
  const hasClearApplication = Boolean(
    rawJob.applicationUrl || rawJob.applyEmail || rawJob.applyPhone || rawJob.applyWhatsapp
  );
  const featuredCompany = detectFeaturedCompany({
    companyName: rawJob.company,
    trustScore: rawJob.trustScore,
    scamScore: rawJob.scamScore,
    hasClearApplication,
    directPlatformJob,
    trustedByJoblinca,
  });
  const companyStrength = resolveCompanyStrength({
    trustedByJoblinca,
    featuredCompany,
    trustScore: rawJob.trustScore,
    scamScore: rawJob.scamScore,
  });
  const videoPriority = calculateVideoPriority({
    trustedByJoblinca,
    featuredCompany,
    urgent,
    trustScore: rawJob.trustScore,
    scamScore: rawJob.scamScore,
    sourceType,
    hasClearApplication,
  });
  const platformLabel = resolvePlatformLabel({
    directPlatformJob,
    trustedByJoblinca,
    recruiterVerified: rawJob.recruiterVerified,
    recruiterVerificationStatus: rawJob.recruiterVerificationStatus,
  });

  return {
    ...rawJob,
    language,
    city,
    category,
    experienceLevel,
    urgent,
    urgentSignals,
    featuredCompany,
    companyStrength,
    videoPriority,
    directPlatformJob,
    trustedByJoblinca,
    verificationLabel: trustedByJoblinca ? 'Verified by Joblinca' : null,
    sourceType,
    platformLabel,
  };
}
