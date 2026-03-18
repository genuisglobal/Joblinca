import { randomBytes } from 'crypto';

export type RegistrationAttributionSource =
  | 'prefilled_link'
  | 'manual_prompt'
  | 'admin_override';

type DatabaseClient = {
  from: (table: string) => any;
};

export interface OfficerRecord {
  id: string;
  user_id: string;
  officer_code: string;
  is_active: boolean;
  region: string | null;
  town: string | null;
}

export interface ClaimRegistrationAttributionOptions {
  userId: string;
  officerCode: string;
  source: RegistrationAttributionSource;
  confirmedByUser: boolean;
  actorUserId?: string | null;
  notes?: string | null;
}

export interface ClaimRegistrationAttributionResult {
  officer: OfficerRecord;
  attributionId: string;
  created: boolean;
}

export interface OfficerMetrics {
  registrationCount: number;
  onboardingCompletedCount: number;
  applicationsSubmittedCount: number;
  latestRegistrationAt: string | null;
}

export interface RecentOfficerRegistration {
  userId: string;
  fullName: string;
  role: string;
  createdAt: string | null;
  attributedAt: string;
  onboardingCompleted: boolean;
  hasSubmittedApplication: boolean;
}

const OFFICER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeOfficerCode(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 4 ? normalized : null;
}

export function buildOfficerSignupUrl(baseUrl: string, officerCode: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return `${normalizedBaseUrl}/auth/register?officer=${encodeURIComponent(officerCode)}`;
}

function buildRandomOfficerCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += OFFICER_CODE_ALPHABET[bytes[index] % OFFICER_CODE_ALPHABET.length];
  }
  return code;
}

export async function generateUniqueOfficerCode(
  db: DatabaseClient,
  length = 6
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildRandomOfficerCode(length);
    const { data, error } = await db
      .from('registration_officers')
      .select('id')
      .eq('officer_code', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Failed to validate officer code');
    }

    if (!data) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique officer code');
}

export async function findOfficerByCode(
  db: DatabaseClient,
  rawOfficerCode: string
): Promise<OfficerRecord | null> {
  const normalizedOfficerCode = normalizeOfficerCode(rawOfficerCode);
  if (!normalizedOfficerCode) {
    return null;
  }

  const { data, error } = await db
    .from('registration_officers')
    .select('id, user_id, officer_code, is_active, region, town')
    .eq('officer_code', normalizedOfficerCode)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to resolve registration officer');
  }

  return (data as OfficerRecord | null) ?? null;
}

export async function recordRegistrationHelpResponse(
  db: DatabaseClient,
  userId: string,
  response: 'yes' | 'no'
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('profiles')
    .update({
      registration_help_response: response,
      registration_help_answered_at: now,
      updated_at: now,
    })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to update registration help response');
  }
}

export async function claimRegistrationAttribution(
  db: DatabaseClient,
  options: ClaimRegistrationAttributionOptions
): Promise<ClaimRegistrationAttributionResult> {
  const officer = await findOfficerByCode(db, options.officerCode);
  if (!officer) {
    throw new Error('Registration officer code not found');
  }

  if (officer.user_id === options.userId) {
    throw new Error('You cannot register your own officer code');
  }

  const now = new Date().toISOString();
  const { data: existingAttribution, error: existingAttributionError } = await db
    .from('registration_attributions')
    .select('id, officer_user_id, locked_at, confirmed_by_user')
    .eq('user_id', options.userId)
    .is('revoked_at', null)
    .maybeSingle();

  if (existingAttributionError) {
    throw new Error(existingAttributionError.message || 'Failed to load registration attribution');
  }

  if (existingAttribution) {
    if (existingAttribution.locked_at && existingAttribution.officer_user_id !== officer.user_id) {
      throw new Error('Registration attribution is locked');
    }

    if (existingAttribution.officer_user_id === officer.user_id) {
      const { error: updateExistingError } = await db
        .from('registration_attributions')
        .update({
          confirmed_by_user:
            Boolean(existingAttribution.confirmed_by_user) || options.confirmedByUser,
          updated_at: now,
          updated_by: options.actorUserId ?? options.userId,
          notes: options.notes ?? null,
        })
        .eq('id', existingAttribution.id);

      if (updateExistingError) {
        throw new Error(updateExistingError.message || 'Failed to update registration attribution');
      }

      await recordRegistrationHelpResponse(db, options.userId, 'yes');

      return {
        officer,
        attributionId: existingAttribution.id as string,
        created: false,
      };
    }

    const { error: revokeError } = await db
      .from('registration_attributions')
      .update({
        revoked_at: now,
        updated_at: now,
        updated_by: options.actorUserId ?? options.userId,
      })
      .eq('id', existingAttribution.id);

    if (revokeError) {
      throw new Error(revokeError.message || 'Failed to replace registration attribution');
    }
  }

  const { data: insertedAttribution, error: insertError } = await db
    .from('registration_attributions')
    .insert({
      user_id: options.userId,
      officer_user_id: officer.user_id,
      officer_code_snapshot: officer.officer_code,
      source: options.source,
      confirmed_by_user: options.confirmedByUser,
      created_by: options.actorUserId ?? options.userId,
      updated_by: options.actorUserId ?? options.userId,
      notes: options.notes ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertError || !insertedAttribution) {
    throw new Error(insertError?.message || 'Failed to create registration attribution');
  }

  await recordRegistrationHelpResponse(db, options.userId, 'yes');

  return {
    officer,
    attributionId: insertedAttribution.id as string,
    created: true,
  };
}

export async function getOfficerMetricsMap(
  db: DatabaseClient,
  officerUserIds: string[]
): Promise<Record<string, OfficerMetrics>> {
  const metrics: Record<string, OfficerMetrics> = {};
  for (const officerUserId of officerUserIds) {
    metrics[officerUserId] = {
      registrationCount: 0,
      onboardingCompletedCount: 0,
      applicationsSubmittedCount: 0,
      latestRegistrationAt: null,
    };
  }

  if (officerUserIds.length === 0) {
    return metrics;
  }

  const { data: attributions, error: attributionError } = await db
    .from('registration_attributions')
    .select('user_id, officer_user_id, created_at')
    .in('officer_user_id', officerUserIds)
    .is('revoked_at', null);

  if (attributionError) {
    throw new Error(attributionError.message || 'Failed to load officer attributions');
  }

  const attributionRows = (attributions || []) as Array<{
    user_id: string;
    officer_user_id: string;
    created_at: string;
  }>;

  const attributedUserIds = Array.from(
    new Set(attributionRows.map((row) => row.user_id).filter(Boolean))
  );

  let profileRows: Array<{ id: string; onboarding_completed: boolean | null }> = [];
  if (attributedUserIds.length > 0) {
    const { data, error } = await db
      .from('profiles')
      .select('id, onboarding_completed')
      .in('id', attributedUserIds);

    if (error) {
      throw new Error(error.message || 'Failed to load attributed profiles');
    }

    profileRows = (data || []) as Array<{ id: string; onboarding_completed: boolean | null }>;
  }

  const profileMap = new Map(
    profileRows.map((profile) => [profile.id, profile])
  );

  let applicationRows: Array<{
    applicant_id: string;
    is_draft: boolean | null;
    submitted_at: string | null;
  }> = [];
  if (attributedUserIds.length > 0) {
    const { data, error } = await db
      .from('applications')
      .select('applicant_id, is_draft, submitted_at')
      .in('applicant_id', attributedUserIds);

    if (error) {
      throw new Error(error.message || 'Failed to load attributed applications');
    }

    applicationRows = (data || []) as Array<{
      applicant_id: string;
      is_draft: boolean | null;
      submitted_at: string | null;
    }>;
  }

  const applicantsWithSubmittedApplications = new Set<string>();
  for (const row of applicationRows) {
    if (!row.applicant_id) {
      continue;
    }

    if (row.is_draft === false || Boolean(row.submitted_at)) {
      applicantsWithSubmittedApplications.add(row.applicant_id);
    }
  }

  for (const attribution of attributionRows) {
    const officerMetrics = metrics[attribution.officer_user_id];
    if (!officerMetrics) {
      continue;
    }

    officerMetrics.registrationCount += 1;

    if (
      !officerMetrics.latestRegistrationAt ||
      attribution.created_at > officerMetrics.latestRegistrationAt
    ) {
      officerMetrics.latestRegistrationAt = attribution.created_at;
    }

    const profile = profileMap.get(attribution.user_id);
    if (profile?.onboarding_completed) {
      officerMetrics.onboardingCompletedCount += 1;
    }

    if (applicantsWithSubmittedApplications.has(attribution.user_id)) {
      officerMetrics.applicationsSubmittedCount += 1;
    }
  }

  return metrics;
}

export async function getRecentRegistrationsForOfficer(
  db: DatabaseClient,
  officerUserId: string,
  limit = 10
): Promise<RecentOfficerRegistration[]> {
  const { data: attributions, error: attributionError } = await db
    .from('registration_attributions')
    .select('user_id, created_at')
    .eq('officer_user_id', officerUserId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (attributionError) {
    throw new Error(attributionError.message || 'Failed to load recent registrations');
  }

  const attributionRows = (attributions || []) as Array<{
    user_id: string;
    created_at: string;
  }>;

  const userIds = attributionRows.map((row) => row.user_id).filter(Boolean);
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await db
    .from('profiles')
    .select('id, full_name, first_name, last_name, role, created_at, onboarding_completed')
    .in('id', userIds);

  if (profilesError) {
    throw new Error(profilesError.message || 'Failed to load attributed profiles');
  }

  const { data: applications, error: applicationsError } = await db
    .from('applications')
    .select('applicant_id, is_draft, submitted_at')
    .in('applicant_id', userIds);

  if (applicationsError) {
    throw new Error(applicationsError.message || 'Failed to load attributed applications');
  }

  const profileMap = new Map(
    (profiles as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      created_at: string | null;
      onboarding_completed: boolean | null;
    }>).map((profile) => [profile.id, profile])
  );

  const applicantsWithSubmittedApplications = new Set<string>();
  for (const application of applications as Array<{
    applicant_id: string;
    is_draft: boolean | null;
    submitted_at: string | null;
  }>) {
    if (!application.applicant_id) {
      continue;
    }

    if (application.is_draft === false || Boolean(application.submitted_at)) {
      applicantsWithSubmittedApplications.add(application.applicant_id);
    }
  }

  return attributionRows.map((attribution) => {
    const profile = profileMap.get(attribution.user_id);
    const name =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      profile?.full_name ||
      'Unknown user';

    return {
      userId: attribution.user_id,
      fullName: name,
      role: profile?.role || 'unknown',
      createdAt: profile?.created_at || null,
      attributedAt: attribution.created_at,
      onboardingCompleted: Boolean(profile?.onboarding_completed),
      hasSubmittedApplication: applicantsWithSubmittedApplications.has(attribution.user_id),
    };
  });
}
