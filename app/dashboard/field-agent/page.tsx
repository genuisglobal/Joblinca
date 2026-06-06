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
import FieldRegistrationLeadsPanel from '@/components/field-agents/FieldRegistrationLeadsPanel';
import FieldSupportTicketsPanel from '@/components/field-agents/FieldSupportTicketsPanel';
import FieldRecruiterVerificationPanel from '@/components/field-agents/FieldRecruiterVerificationPanel';
import { listRegistrationLeadsForOfficer } from '@/lib/field-registration/service';
import { listAttributedRecruitersForOfficer } from '@/lib/recruiter-verifications/service';
import { listSupportTicketsForFieldAgent } from '@/lib/support-tickets/service';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';

function formatDate(date: string | null, locale: Locale) {
  if (!date) {
    return null;
  }

  return new Date(date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

function translateRegistrationRole(
  role: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (role) {
    case 'job_seeker':
      return t('fieldAgent.registrationRole.jobSeeker');
    case 'talent':
      return t('fieldAgent.registrationRole.talent');
    case 'recruiter':
      return t('fieldAgent.registrationRole.recruiter');
    case 'field_agent':
      return t('fieldAgent.registrationRole.fieldAgent');
    default:
      return t('fieldAgent.registrationRole.unknown');
  }
}

export default async function FieldAgentDashboardPage() {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const localize = (href: string) => addLocalePrefix(href, locale);
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `${localize('/auth/login')}?redirect=${encodeURIComponent(
        localize('/dashboard/field-agent')
      )}`
    );
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
    redirect(localize('/dashboard'));
  }

  const metricsMap = await getOfficerMetricsMap(serviceClient, [user.id]);
  const recentRegistrations = await getRecentRegistrationsForOfficer(serviceClient, user.id, 8);
  const recentLeads = await listRegistrationLeadsForOfficer(serviceClient, user.id, {
    limit: 10,
  });
  const recentTickets = await listSupportTicketsForFieldAgent(serviceClient, user.id, {
    limit: 10,
  });
  const attributedRecruiters = await listAttributedRecruitersForOfficer(
    serviceClient,
    user.id,
    10
  );
  const metrics = metricsMap[user.id] || {
    registrationCount: 0,
    onboardingCompletedCount: 0,
    applicationsSubmittedCount: 0,
    latestRegistrationAt: null,
  };
  const shareUrl = buildOfficerSignupUrl(getRequestBaseUrl(), officer.officer_code, locale);
  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    profile.full_name ||
    profile.email ||
    t('fieldAgent.title');

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-400">{t('fieldAgent.title')}</p>

            <h1 className="mt-2 text-3xl font-semibold text-white">{displayName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              {t('fieldAgent.subtitle')}
            </p>
            {!officer.is_active && (
              <div className="mt-4 rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
                {t('fieldAgent.inactiveNotice')}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 lg:w-[360px]">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.officerCode')}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-2xl font-semibold tracking-[0.2em] text-white">
                {officer.officer_code}
              </span>
              <CopyTextButton
                value={officer.officer_code}
                label={t('fieldAgent.copyCode')}
                copiedLabel={t('common.copied')}
              />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.registrationLink')}</p>
            <p className="mt-2 break-all text-sm text-gray-300">{shareUrl}</p>
            <div className="mt-3">
              <CopyTextButton
                value={shareUrl}
                label={t('fieldAgent.copyLink')}
                copiedLabel={t('common.copied')}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label={t('fieldAgent.metrics.registrations')}
          value={metrics.registrationCount}
          detail={t('fieldAgent.metrics.registrationsDetail')}
        />
        <MetricCard
          label={t('fieldAgent.metrics.onboardingComplete')}
          value={metrics.onboardingCompletedCount}
          detail={t('fieldAgent.metrics.onboardingCompleteDetail')}
        />
        <MetricCard
          label={t('fieldAgent.metrics.applied')}
          value={metrics.applicationsSubmittedCount}
          detail={t('fieldAgent.metrics.appliedDetail')}
        />
      </div>

      <FieldRegistrationLeadsPanel
        initialLeads={recentLeads}
        locale={locale}
        isActive={Boolean(officer.is_active)}
      />

      <FieldSupportTicketsPanel
        initialTickets={recentTickets}
        recentLeads={recentLeads}
        locale={locale}
        isActive={Boolean(officer.is_active)}
      />

      <FieldRecruiterVerificationPanel
        recruiters={attributedRecruiters}
        locale={locale}
        isActive={Boolean(officer.is_active)}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr,0.8fr]">
        <section className="rounded-2xl border border-gray-700 bg-gray-800">
          <div className="border-b border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">{t('fieldAgent.recentRegistrations')}</h2>
            <p className="text-sm text-gray-400">
              {t('fieldAgent.recentRegistrationsSubtitle')}
            </p>
          </div>

          {recentRegistrations.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              {t('fieldAgent.noRegistrations')}
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {recentRegistrations.map((registration) => (
                <div key={registration.userId} className="grid gap-3 px-6 py-4 md:grid-cols-[1.2fr,0.8fr,0.8fr,0.8fr]">
                  <div>
                    <p className="font-medium text-white">{registration.fullName}</p>
                    <p className="text-sm capitalize text-gray-400">
                      {translateRegistrationRole(registration.role, t)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.joined')}</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {formatDate(registration.createdAt, locale) || t('fieldAgent.unknown')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.onboarding')}</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {registration.onboardingCompleted
                        ? t('fieldAgent.complete')
                        : t('fieldAgent.pending')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.applied')}</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {registration.hasSubmittedApplication ? t('common.yes') : t('common.no')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white">{t('fieldAgent.coverage')}</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.region')}</dt>
              <dd className="mt-1 text-sm text-gray-300">{officer.region || t('fieldAgent.notSet')}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.town')}</dt>
              <dd className="mt-1 text-sm text-gray-300">{officer.town || t('fieldAgent.notSet')}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.created')}</dt>
              <dd className="mt-1 text-sm text-gray-300">
                {formatDate(officer.created_at, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.25em] text-gray-500">{t('fieldAgent.latestRegistration')}</dt>
              <dd className="mt-1 text-sm text-gray-300">
                {metrics.latestRegistrationAt
                  ? formatDate(metrics.latestRegistrationAt, locale)
                  : t('fieldAgent.noRegistrationsYet')}
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
