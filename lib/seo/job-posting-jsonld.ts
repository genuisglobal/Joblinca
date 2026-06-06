/**
 * Builds a Schema.org JobPosting object hardened against Google for Jobs
 * validation rules. Reference: https://developers.google.com/search/docs/appearance/structured-data/job-posting
 *
 * Google for Jobs requires (and grades on):
 *   - title, description, datePosted, hiringOrganization
 *   - validThrough (strongly recommended; postings expire after this date)
 *   - jobLocation (physical) OR jobLocationType=TELECOMMUTE + applicantLocationRequirements
 *   - employmentType (array of allowed enum values)
 *   - identifier (for deduplication signals)
 *   - baseSalary range when possible
 *   - directApply boolean
 */

const DEFAULT_VALIDITY_DAYS = 60;

// Google's allowed employmentType values.
const ALLOWED_EMPLOYMENT_TYPES = new Set([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'INTERN',
  'VOLUNTEER',
  'PER_DIEM',
  'OTHER',
]);

function mapEmploymentType(jobType: string | null | undefined): string[] {
  if (!jobType) return ['FULL_TIME'];
  const normalized = String(jobType).toUpperCase().replace(/-/g, '_');
  const aliases: Record<string, string[]> = {
    JOB: ['FULL_TIME'],
    FULL_TIME: ['FULL_TIME'],
    FULLTIME: ['FULL_TIME'],
    PART_TIME: ['PART_TIME'],
    PARTTIME: ['PART_TIME'],
    CONTRACT: ['CONTRACTOR'],
    CONTRACTOR: ['CONTRACTOR'],
    FREELANCE: ['CONTRACTOR'],
    GIG: ['CONTRACTOR', 'TEMPORARY'],
    TEMP: ['TEMPORARY'],
    TEMPORARY: ['TEMPORARY'],
    INTERN: ['INTERN'],
    INTERNSHIP: ['INTERN'],
    VOLUNTEER: ['VOLUNTEER'],
    APPRENTICESHIP: ['INTERN'],
  };
  const mapped = aliases[normalized];
  if (mapped) return mapped;
  return ALLOWED_EMPLOYMENT_TYPES.has(normalized) ? [normalized] : ['OTHER'];
}

interface JobForJsonLd {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  closes_at?: string | null;
  location?: string | null;
  work_type?: string | null;
  job_type?: string | null;
  salary?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  company_name?: string | null;
  company_logo_url?: string | null;
  image_url?: string | null;
  apply_method?: string | null;
  external_apply_url?: string | null;
  language?: string | null;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeValidThrough(job: JobForJsonLd): string {
  if (job.closes_at) return new Date(job.closes_at).toISOString();
  const posted = new Date(job.created_at);
  const validity = new Date(posted.getTime() + DEFAULT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return validity.toISOString();
}

const ALLOWED_SALARY_PERIODS = new Set(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']);

function buildSalary(job: JobForJsonLd) {
  const currency = (job.salary_currency || 'XAF').toUpperCase();
  const rawPeriod = (job.salary_period || 'MONTH').toUpperCase();
  const unitText = ALLOWED_SALARY_PERIODS.has(rawPeriod) ? rawPeriod : 'MONTH';

  const min = typeof job.salary_min === 'number' && job.salary_min > 0 ? job.salary_min : null;
  const max = typeof job.salary_max === 'number' && job.salary_max > 0 ? job.salary_max : null;

  if (min !== null && max !== null) {
    return {
      '@type': 'MonetaryAmount',
      currency,
      value: {
        '@type': 'QuantitativeValue',
        minValue: min,
        maxValue: max,
        unitText,
      },
    };
  }

  const single = min ?? max ?? (job.salary && job.salary > 0 ? job.salary : null);
  if (single === null) return undefined;
  return {
    '@type': 'MonetaryAmount',
    currency,
    value: {
      '@type': 'QuantitativeValue',
      value: single,
      unitText,
    },
  };
}

function buildLocation(job: JobForJsonLd) {
  if (job.work_type === 'remote') return undefined;
  const locality = job.location?.trim();
  return {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality || 'Cameroon',
      addressCountry: 'CM',
    },
  };
}

function isDirectApply(job: JobForJsonLd): boolean {
  // True means the apply flow stays on our site. external_url / external_apply_url
  // means the candidate is sent off-platform.
  if (!job.apply_method) return !job.external_apply_url;
  return job.apply_method === 'joblinca';
}

export function buildJobPostingJsonLd(
  job: JobForJsonLd,
  options: { appUrl: string }
) {
  const { appUrl } = options;
  const jobUrl = `${appUrl}/jobs/${job.id}`;
  const description = job.description
    ? stripHtml(job.description).slice(0, 5000)
    : '';

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description,
    datePosted: new Date(job.created_at).toISOString(),
    validThrough: computeValidThrough(job),
    employmentType: mapEmploymentType(job.job_type),
    identifier: {
      '@type': 'PropertyValue',
      name: 'Joblinca',
      value: job.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company_name || 'Joblinca',
      sameAs: appUrl,
      ...(job.company_logo_url && { logo: job.company_logo_url }),
    },
    url: jobUrl,
    directApply: isDirectApply(job),
    inLanguage: job.language === 'fr' ? 'fr-CM' : 'en-CM',
  };

  if (job.work_type === 'remote') {
    jsonLd.jobLocationType = 'TELECOMMUTE';
    jsonLd.applicantLocationRequirements = {
      '@type': 'Country',
      name: 'Cameroon',
    };
    // Google still recommends a jobLocation even for remote — they accept it
    // alongside TELECOMMUTE when the employer is location-based.
    const fallbackLocation = buildLocation({ ...job, work_type: 'onsite' });
    if (fallbackLocation) jsonLd.jobLocation = fallbackLocation;
  } else {
    jsonLd.jobLocation = buildLocation(job);
  }

  const salary = buildSalary(job);
  if (salary) jsonLd.baseSalary = salary;

  if (job.image_url) jsonLd.image = job.image_url;

  return jsonLd;
}
