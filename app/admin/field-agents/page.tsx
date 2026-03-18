import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getRequestBaseUrl } from '@/lib/app-url';
import {
  buildOfficerSignupUrl,
  getOfficerMetricsMap,
} from '@/lib/registration-officers';
import FieldAgentsClient from './FieldAgentsClient';

export default async function AdminFieldAgentsPage() {
  await requireAdminType(['super', 'operations']);

  const serviceClient = createServiceSupabaseClient();
  const { data: officers, error: officersError } = await serviceClient
    .from('registration_officers')
    .select('id, user_id, officer_code, is_active, region, town, notes, created_at, deactivated_at')
    .order('created_at', { ascending: false });

  if (officersError) {
    throw new Error(officersError.message || 'Failed to load field agents');
  }

  const officerRows = (officers || []) as Array<{
    id: string;
    user_id: string;
    officer_code: string;
    is_active: boolean;
    region: string | null;
    town: string | null;
    notes: string | null;
    created_at: string;
    deactivated_at: string | null;
  }>;

  const officerUserIds = officerRows.map((officer) => officer.user_id);
  const { data: profiles, error: profilesError } = officerUserIds.length
    ? await serviceClient
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, phone')
        .in('id', officerUserIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message || 'Failed to load field agent profiles');
  }

  const profileMap = new Map(
    (profiles as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
    }>).map((profile) => [profile.id, profile])
  );

  const metricsMap = await getOfficerMetricsMap(serviceClient, officerUserIds);
  const baseUrl = getRequestBaseUrl();

  const agents = officerRows.map((officer) => {
    const profile = profileMap.get(officer.user_id);
    const fullName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      profile?.full_name ||
      'Unknown field agent';
    const metrics = metricsMap[officer.user_id] || {
      registrationCount: 0,
      onboardingCompletedCount: 0,
      applicationsSubmittedCount: 0,
      latestRegistrationAt: null,
    };

    return {
      id: officer.id,
      userId: officer.user_id,
      fullName,
      email: profile?.email || '',
      phone: profile?.phone || '',
      officerCode: officer.officer_code,
      isActive: officer.is_active,
      region: officer.region || '',
      town: officer.town || '',
      notes: officer.notes || '',
      createdAt: officer.created_at,
      deactivatedAt: officer.deactivated_at,
      shareUrl: buildOfficerSignupUrl(baseUrl, officer.officer_code),
      metrics,
    };
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Field Agents</h1>
        <p className="mt-1 text-gray-400">
          Provision field agent accounts, manage officer codes, and track assisted registrations.
        </p>
      </div>

      <FieldAgentsClient agents={agents} />
    </div>
  );
}
