import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getRequestBaseUrl } from '@/lib/app-url';
import {
  buildOfficerSignupUrl,
  getOfficerMetricsMap,
  getRecentRegistrationsForOfficer,
} from '@/lib/registration-officers';
import CopyTextButton from '@/components/field-agents/CopyTextButton';

export default async function FieldAgentDashboardPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/dashboard/field-agent');
  }

  const serviceClient = createServiceSupabaseClient();
  const [{ data: profile }, { data: officer, error: officerError }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('full_name, first_name, last_name, email, phone, role')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('registration_officers')
      .select('id, officer_code, is_active, region, town, created_at, deactivated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (officerError) {
    throw new Error(officerError.message || 'Failed to load field agent account');
  }

  if (!profile || profile.role !== 'field_agent' || !officer) {
    redirect('/dashboard');
  }

  const metricsMap = await getOfficerMetricsMap(serviceClient, [user.id]);
  const recentRegistrations = await getRecentRegistrationsForOfficer(serviceClient, user.id, 8);
  const metrics = metricsMap[user.id] || {
    registrationCount: 0,
    onboardingCompletedCount: 0,
    applicationsSubmittedCount: 0,
    latestRegistrationAt: null,
  };
  const shareUrl = buildOfficerSignupUrl(getRequestBaseUrl(), officer.officer_code);
  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    profile.full_name ||
    profile.email ||
    'Field Agent';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-400">Field Agent</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{displayName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Share your officer link or code when you assist someone with account creation. New
              registrations that use it will be tracked under your dashboard.
            </p>
            {!officer.is_active && (
              <div className="mt-4 rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
                This field agent account is inactive. New registrations will not be credited until
                an admin reactivates it.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 lg:w-[360px]">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Officer code</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-2xl font-semibold tracking-[0.2em] text-white">
                {officer.officer_code}
              </span>
              <CopyTextButton value={officer.officer_code} label="Copy code" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.25em] text-gray-500">Registration link</p>
            <p className="mt-2 break-all text-sm text-gray-300">{shareUrl}</p>
            <div className="mt-3">
              <CopyTextButton value={shareUrl} label="Copy link" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Registrations"
          value={metrics.registrationCount}
          detail="Accounts credited to you"
        />
        <MetricCard
          label="Onboarding Complete"
          value={metrics.onboardingCompletedCount}
          detail="Attributed users who finished onboarding"
        />
        <MetricCard
          label="Applied"
          value={metrics.applicationsSubmittedCount}
          detail="Attributed users who submitted an application"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,0.8fr]">
        <section className="rounded-2xl border border-gray-700 bg-gray-800">
          <div className="border-b border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Recent registrations</h2>
            <p className="text-sm text-gray-400">
              Latest accounts that were created using your officer code.
            </p>
          </div>

          {recentRegistrations.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No registrations have been credited to this account yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {recentRegistrations.map((registration) => (
                <div key={registration.userId} className="grid gap-3 px-6 py-4 md:grid-cols-[1.2fr,0.8fr,0.8fr,0.8fr]">
                  <div>
                    <p className="font-medium text-white">{registration.fullName}</p>
                    <p className="text-sm capitalize text-gray-400">
                      {registration.role.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Joined</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {registration.createdAt
                        ? new Date(registration.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Onboarding</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {registration.onboardingCompleted ? 'Complete' : 'Pending'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Applied</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {registration.hasSubmittedApplication ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white">Coverage</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">Region</dt>
              <dd className="mt-1 text-sm text-gray-300">{officer.region || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">Town</dt>
              <dd className="mt-1 text-sm text-gray-300">{officer.town || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-300">
                {new Date(officer.created_at).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">Latest registration</dt>
              <dd className="mt-1 text-sm text-gray-300">
                {metrics.latestRegistrationAt
                  ? new Date(metrics.latestRegistrationAt).toLocaleDateString()
                  : 'No registrations yet'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
      <p className="text-sm uppercase tracking-[0.25em] text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-400">{detail}</p>
    </div>
  );
}
