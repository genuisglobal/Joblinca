import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { PartnerCourse } from '@/lib/skillup/types';
import type {
  AdminSponsorCampaignRecord,
  SponsorCampaignStats,
  SponsorFeedItem,
  SponsorPlacement,
  SponsorType,
} from '@/lib/sponsorship-schema';

type NullableRelation<T> = T | T[] | null;

interface JobCampaignRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary: number | null;
  company_name: string | null;
  work_type: string | null;
  recruiter_id: string | null;
}

interface RecruiterCampaignRow {
  id: string;
  company_name: string;
  company_description: string | null;
  verified: boolean;
}

interface RecruiterLogoRow {
  user_id: string;
  company_logo_url: string | null;
}

type PartnerCourseCampaignRow = Pick<
  PartnerCourse,
  'id' | 'partner_name' | 'title' | 'description' | 'url' | 'referral_url' | 'cost_type' | 'level' | 'duration_minutes'
>;

interface SponsorCampaignRow {
  id: string;
  sponsor_type: SponsorType;
  placement: SponsorPlacement;
  status: string;
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
  audience_roles: string[] | null;
  city_targets: string[] | null;
  priority: number | null;
  price_xaf: number | null;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  job: NullableRelation<JobCampaignRow>;
  recruiter: NullableRelation<RecruiterCampaignRow>;
  partner_course?: NullableRelation<PartnerCourseCampaignRow>;
}

interface SponsorEventRow {
  campaign_id: string;
  event_type: 'impression' | 'click' | 'cta_click';
  created_at: string;
}

interface SponsorCampaignStatsBundle {
  all_time: SponsorCampaignStats;
  last_7_days: SponsorCampaignStats;
}

function normalizeRelation<T>(value: NullableRelation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function createEmptyCampaignStats(): SponsorCampaignStats {
  return {
    impressions: 0,
    clicks: 0,
    cta_clicks: 0,
    ctr_percent: 0,
    last_event_at: null,
  };
}

function createEmptyCampaignStatsBundle(): SponsorCampaignStatsBundle {
  return {
    all_time: createEmptyCampaignStats(),
    last_7_days: createEmptyCampaignStats(),
  };
}

function isLiveWindow(campaign: Pick<SponsorCampaignRow, 'starts_at' | 'ends_at'>, now: Date): boolean {
  if (campaign.starts_at) {
    const startsAt = new Date(campaign.starts_at);
    if (!Number.isNaN(startsAt.getTime()) && startsAt > now) {
      return false;
    }
  }

  if (campaign.ends_at) {
    const endsAt = new Date(campaign.ends_at);
    if (!Number.isNaN(endsAt.getTime()) && endsAt < now) {
      return false;
    }
  }

  return true;
}

function excerpt(value: string | null | undefined, maxLength = 120): string {
  const trimmed = (value || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}

function formatSalary(value: number | null): string | null {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} XAF`;
}

function formatPartnerDuration(minutes: number | undefined): string | null {
  if (!minutes || !Number.isFinite(minutes)) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

let partnerCoursesTableExistsPromise: Promise<boolean> | null = null;
let partnerCourseRelationshipAvailable = true;

async function hasPartnerCoursesTable() {
  if (!partnerCoursesTableExistsPromise) {
    partnerCoursesTableExistsPromise = (async () => {
      const supabase = createServiceSupabaseClient();
      const { error } = await supabase.from('partner_courses').select('id').limit(1);

      if (!error) {
        return true;
      }

      const message = error.message.toLowerCase();
      if (message.includes('partner_courses') && message.includes('does not exist')) {
        return false;
      }

      throw new Error(`Failed to inspect partner_courses table: ${error.message}`);
    })();
  }

  return partnerCoursesTableExistsPromise;
}

function isMissingPartnerCourseRelationshipError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('could not find a relationship') &&
    normalized.includes('partner_course_id')
  );
}

function buildActiveSponsorFeedSelect(includePartnerCourse: boolean) {
  const fields = [
    'id',
    'sponsor_type',
    'placement',
    'status',
    'sponsor_name',
    'title',
    'short_copy',
    'cta_label',
    'cta_url',
    'image_url',
    'sponsor_logo_url',
    'job_id',
    'recruiter_id',
    'partner_course_id',
    'audience_roles',
    'city_targets',
    'priority',
    'price_xaf',
    'starts_at',
    'ends_at',
    'metadata',
    'created_at',
    'updated_at',
    `job:job_id (
      id,
      title,
      description,
      location,
      salary,
      company_name,
      work_type,
      recruiter_id
    )`,
    `recruiter:recruiter_id (
      id,
      company_name,
      company_description,
      verified
    )`,
  ];

  if (includePartnerCourse) {
    fields.push(`partner_course:partner_course_id (
      id,
      partner_name,
      title,
      description,
      url,
      referral_url,
      cost_type,
      level,
      duration_minutes
    )`);
  }

  return fields.join(',\n');
}

function buildAdminSponsorCampaignSelect(includePartnerCourse: boolean) {
  const fields = [
    'id',
    'sponsor_type',
    'status',
    'placement',
    'sponsor_name',
    'title',
    'short_copy',
    'cta_label',
    'cta_url',
    'image_url',
    'sponsor_logo_url',
    'job_id',
    'recruiter_id',
    'partner_course_id',
    'audience_roles',
    'city_targets',
    'priority',
    'price_xaf',
    'starts_at',
    'ends_at',
    'metadata',
    'created_at',
    'updated_at',
    `job:job_id (
      id,
      title,
      company_name
    )`,
    `recruiter:recruiter_id (
      id,
      company_name,
      verified
    )`,
  ];

  if (includePartnerCourse) {
    fields.push(`partner_course:partner_course_id (
      id,
      partner_name,
      title
    )`);
  }

  return fields.join(',\n');
}

async function fetchSponsorCampaignRows(input: {
  mode: 'active_feed' | 'admin_list';
  placement?: SponsorPlacement;
  limit?: number;
}) {
  const supabase = createServiceSupabaseClient();
  let includePartnerCourse =
    partnerCourseRelationshipAvailable && (await hasPartnerCoursesTable());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let query = supabase
      .from('sponsor_campaigns')
      .select(
        input.mode === 'active_feed'
          ? buildActiveSponsorFeedSelect(includePartnerCourse)
          : buildAdminSponsorCampaignSelect(includePartnerCourse)
      );

    if (input.mode === 'active_feed') {
      query = query
        .eq('placement', input.placement!)
        .eq('status', 'active')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(Math.max(12, (input.limit || 6) * 4));
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (!error) {
      return ((data || []) as unknown) as SponsorCampaignRow[];
    }

    if (includePartnerCourse && isMissingPartnerCourseRelationshipError(error.message)) {
      partnerCourseRelationshipAvailable = false;
      includePartnerCourse = false;
      continue;
    }

    throw new Error(`Failed to load sponsor campaigns: ${error.message}`);
  }

  return [];
}

async function getRecruiterLogoMap(recruiterIds: string[]) {
  if (!recruiterIds.length) {
    return new Map<string, string | null>();
  }

  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('recruiter_profiles')
    .select('user_id, company_logo_url')
    .in('user_id', recruiterIds);

  const rows = ((data || []) as RecruiterLogoRow[]).filter((row) => row.user_id);
  return new Map(rows.map((row) => [row.user_id, row.company_logo_url || null]));
}

async function getRecruiterOpenJobCountMap(recruiterIds: string[]) {
  if (!recruiterIds.length) {
    return new Map<string, number>();
  }

  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('jobs')
    .select('recruiter_id')
    .in('recruiter_id', recruiterIds)
    .eq('published', true)
    .eq('approval_status', 'approved');

  const counts = new Map<string, number>();
  for (const row of ((data || []) as Array<{ recruiter_id: string | null }>)) {
    if (!row.recruiter_id) {
      continue;
    }
    counts.set(row.recruiter_id, (counts.get(row.recruiter_id) || 0) + 1);
  }

  return counts;
}

function applyEventToStats(stats: SponsorCampaignStats, event: SponsorEventRow) {
  if (event.event_type === 'impression') {
    stats.impressions += 1;
  } else if (event.event_type === 'click') {
    stats.clicks += 1;
  } else if (event.event_type === 'cta_click') {
    stats.cta_clicks += 1;
  }

  if (
    event.created_at &&
    (!stats.last_event_at ||
      new Date(event.created_at).getTime() > new Date(stats.last_event_at).getTime())
  ) {
    stats.last_event_at = event.created_at;
  }
}

function finalizeCampaignStats(stats: SponsorCampaignStats): SponsorCampaignStats {
  return {
    ...stats,
    ctr_percent:
      stats.impressions > 0
        ? Number(((stats.clicks / stats.impressions) * 100).toFixed(1))
        : 0,
  };
}

async function getSponsorEventStatsMap(campaignIds: string[]) {
  const statsByCampaign = new Map<string, SponsorCampaignStatsBundle>();
  const last7DaysCutoff = new Date();
  last7DaysCutoff.setDate(last7DaysCutoff.getDate() - 7);

  for (const campaignId of campaignIds) {
    statsByCampaign.set(campaignId, createEmptyCampaignStatsBundle());
  }

  if (!campaignIds.length) {
    return statsByCampaign;
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('sponsor_events')
    .select('campaign_id, event_type, created_at')
    .in('campaign_id', campaignIds);

  if (error) {
    throw new Error(`Failed to load sponsor campaign stats: ${error.message}`);
  }

  for (const row of (data || []) as SponsorEventRow[]) {
    const current = statsByCampaign.get(row.campaign_id) || createEmptyCampaignStatsBundle();

    applyEventToStats(current.all_time, row);

    const createdAt = new Date(row.created_at);
    if (!Number.isNaN(createdAt.getTime()) && createdAt >= last7DaysCutoff) {
      applyEventToStats(current.last_7_days, row);
    }

    statsByCampaign.set(row.campaign_id, current);
  }

  for (const [campaignId, stats] of statsByCampaign.entries()) {
    statsByCampaign.set(campaignId, {
      all_time: finalizeCampaignStats(stats.all_time),
      last_7_days: finalizeCampaignStats(stats.last_7_days),
    });
  }

  return statsByCampaign;
}

function resolveFeedItem(
  campaign: SponsorCampaignRow,
  recruiterLogoMap: Map<string, string | null>,
  recruiterOpenJobCountMap: Map<string, number>
): SponsorFeedItem | null {
  const job = normalizeRelation(campaign.job);
  const recruiter = normalizeRelation(campaign.recruiter);
  const partnerCourse = normalizeRelation(campaign.partner_course);
  const defaultPriority = typeof campaign.priority === 'number' ? campaign.priority : 0;

  if (campaign.sponsor_type === 'job') {
    const ctaUrl = campaign.cta_url || (job ? `/jobs/${job.id}` : '');
    const headline = job?.title || campaign.title;
    if (!ctaUrl || !headline) {
      return null;
    }

    const meta = [job?.location || null, job?.work_type === 'remote' ? 'Remote' : null, formatSalary(job?.salary || null)]
      .filter((value): value is string => Boolean(value));

    return {
      id: campaign.id,
      sponsorType: 'job',
      placement: campaign.placement,
      badgeLabel: 'Sponsored Job',
      headline,
      sponsorName: job?.company_name || campaign.sponsor_name,
      description:
        excerpt(campaign.short_copy, 140) ||
        excerpt(job?.description, 140) ||
        'Priority placement from a sponsoring employer.',
      ctaLabel: campaign.cta_label || 'View Job',
      ctaUrl,
      isExternal: isExternalUrl(ctaUrl),
      logoUrl:
        campaign.sponsor_logo_url ||
        campaign.image_url ||
        recruiterLogoMap.get(job?.recruiter_id || '') ||
        null,
      meta,
      priority: defaultPriority,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
    };
  }

  if (campaign.sponsor_type === 'employer') {
    const ctaUrl = campaign.cta_url || (recruiter ? `/companies/${recruiter.id}` : '');
    const headline = recruiter?.company_name || campaign.title;
    if (!ctaUrl || !headline) {
      return null;
    }

    const openRoleCount = recruiter ? recruiterOpenJobCountMap.get(recruiter.id) || 0 : 0;
    const meta = [
      recruiter?.verified ? 'Verified employer' : null,
      openRoleCount > 0 ? `${openRoleCount} active ${openRoleCount === 1 ? 'job' : 'jobs'}` : null,
    ].filter((value): value is string => Boolean(value));

    return {
      id: campaign.id,
      sponsorType: 'employer',
      placement: campaign.placement,
      badgeLabel: 'Sponsored Employer',
      headline,
      sponsorName: campaign.sponsor_name || recruiter?.company_name || 'Employer Spotlight',
      description:
        excerpt(campaign.short_copy, 140) ||
        excerpt(recruiter?.company_description, 140) ||
        'Explore this hiring employer and its live openings on Joblinca.',
      ctaLabel: campaign.cta_label || 'View Company',
      ctaUrl,
      isExternal: isExternalUrl(ctaUrl),
      logoUrl:
        campaign.sponsor_logo_url ||
        campaign.image_url ||
        recruiterLogoMap.get(recruiter?.id || '') ||
        null,
      meta,
      priority: defaultPriority,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
    };
  }

  const ctaUrl = campaign.cta_url || partnerCourse?.referral_url || partnerCourse?.url || '';
  const headline = partnerCourse?.title || campaign.title;
  if (!ctaUrl || !headline) {
    return null;
  }

  const meta = [
    partnerCourse?.level || null,
    partnerCourse?.cost_type || null,
    formatPartnerDuration(partnerCourse?.duration_minutes),
  ].filter((value): value is string => Boolean(value));

  return {
    id: campaign.id,
    sponsorType: 'academy',
    placement: campaign.placement,
    badgeLabel: 'Sponsored Academy',
    headline,
    sponsorName: partnerCourse?.partner_name || campaign.sponsor_name,
    description:
      excerpt(campaign.short_copy, 140) ||
      excerpt(partnerCourse?.description, 140) ||
      'Upskill with an approved training partner.',
    ctaLabel: campaign.cta_label || 'Explore Program',
    ctaUrl,
    isExternal: true,
    logoUrl: campaign.sponsor_logo_url || campaign.image_url || null,
    meta,
    priority: defaultPriority,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
  };
}

export async function getActiveSponsorFeedItems(input: {
  placement: SponsorPlacement;
  limit?: number;
}) {
  const { placement, limit = 6 } = input;
  const rows = await fetchSponsorCampaignRows({
    mode: 'active_feed',
    placement,
    limit,
  });
  const now = new Date();
  const liveRows = rows.filter((row) => isLiveWindow(row, now));

  const recruiterIds = Array.from(
    new Set(
      liveRows
        .flatMap((row) => {
          const linkedJob = normalizeRelation(row.job);
          const linkedRecruiter = normalizeRelation(row.recruiter);
          return [row.recruiter_id, linkedRecruiter?.id, linkedJob?.recruiter_id];
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  const [recruiterLogoMap, recruiterOpenJobCountMap] = await Promise.all([
    getRecruiterLogoMap(recruiterIds),
    getRecruiterOpenJobCountMap(recruiterIds),
  ]);

  return liveRows
    .map((row) => resolveFeedItem(row, recruiterLogoMap, recruiterOpenJobCountMap))
    .filter((row): row is SponsorFeedItem => Boolean(row))
    .slice(0, limit);
}

export async function listSponsorCampaigns(): Promise<AdminSponsorCampaignRecord[]> {
  const rows = await fetchSponsorCampaignRows({ mode: 'admin_list' });
  const eventStatsByCampaign = await getSponsorEventStatsMap(rows.map((row) => row.id));

  return rows.map((row) => {
    const linkedJob = normalizeRelation(row.job);
    const linkedRecruiter = normalizeRelation(row.recruiter);
    const linkedPartnerCourse = normalizeRelation(row.partner_course || null);
    const stats = eventStatsByCampaign.get(row.id) || createEmptyCampaignStatsBundle();

    return {
      id: row.id,
      sponsor_type: row.sponsor_type,
      status: row.status as AdminSponsorCampaignRecord['status'],
      placement: row.placement,
      sponsor_name: row.sponsor_name,
      title: row.title,
      short_copy: row.short_copy,
      cta_label: row.cta_label,
      cta_url: row.cta_url,
      image_url: row.image_url,
      sponsor_logo_url: row.sponsor_logo_url,
      job_id: row.job_id,
      recruiter_id: row.recruiter_id,
      partner_course_id: row.partner_course_id,
      audience_roles: row.audience_roles || [],
      city_targets: row.city_targets || [],
      priority: typeof row.priority === 'number' ? row.priority : 0,
      price_xaf: typeof row.price_xaf === 'number' ? row.price_xaf : 0,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      stats,
      job: linkedJob
        ? {
            id: linkedJob.id,
            title: linkedJob.title,
            company_name: linkedJob.company_name,
          }
        : null,
      recruiter: linkedRecruiter
        ? {
            id: linkedRecruiter.id,
            company_name: linkedRecruiter.company_name,
            verified: linkedRecruiter.verified,
          }
        : null,
      partner_course: linkedPartnerCourse
        ? {
            id: linkedPartnerCourse.id,
            partner_name: linkedPartnerCourse.partner_name,
            title: linkedPartnerCourse.title,
          }
        : null,
    };
  });
}
