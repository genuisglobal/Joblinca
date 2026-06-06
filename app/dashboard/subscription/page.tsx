import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserSubscription } from '@/lib/subscriptions';
import AutoRenewToggle from './AutoRenewToggle';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';

interface TransactionRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  description: string | null;
  provider: string | null;
  provider_reference: string | null;
  pricing_plans:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
}

function statusClasses(status: string): string {
  if (status === 'completed') {
    return 'bg-emerald-900/30 border border-emerald-600/40 text-emerald-300';
  }
  if (status === 'failed') {
    return 'bg-red-900/30 border border-red-600/40 text-red-300';
  }
  return 'bg-yellow-900/30 border border-yellow-600/40 text-yellow-300';
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

function formatDateTime(value: string, locale: Locale) {
  return new Date(value).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

function getStatusLabel(
  status: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (status) {
    case 'completed':
      return t('billing.status.completed');
    case 'failed':
      return t('billing.status.failed');
    default:
      return t('billing.status.pending');
  }
}

export default async function DashboardSubscriptionPage() {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const localize = (href: string) => addLocalePrefix(href, locale);
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${localize('/auth/login')}?redirect=${encodeURIComponent(localize('/dashboard/subscription'))}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role =
    profile?.role === 'recruiter' ||
    profile?.role === 'job_seeker' ||
    profile?.role === 'talent'
      ? profile.role
      : 'job_seeker';
  const pricingHref = localize(
    `/pricing?role=${encodeURIComponent(role)}&from=account`
  );
  const upgradeLabel = role === 'recruiter'
    ? t('billing.viewPostingPlans')
    : t('billing.upgradePlan');
  const renewLabel = role === 'recruiter'
    ? t('billing.openRecruiterPricing')
    : t('billing.renew');
  const changePlanLabel = role === 'recruiter'
    ? t('billing.recruiterPlans')
    : t('billing.changePlan');

  const subscription = await getUserSubscription(user.id);

  const { data: transactions } = await supabase
    .from('transactions')
    .select(
      'id, amount, currency, status, created_at, description, provider, provider_reference, pricing_plans(name)'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15);

  const transactionRows = (transactions || []) as TransactionRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('billing.title')}</h1>
          <p className="text-gray-400 text-sm">
            {t('billing.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={pricingHref}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {upgradeLabel}
          </Link>
          <Link
            href={pricingHref}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {renewLabel}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{t('billing.activeSubscription')}</h2>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                subscription.isActive
                  ? 'bg-emerald-900/30 border border-emerald-600/40 text-emerald-300'
                  : 'bg-yellow-900/30 border border-yellow-600/40 text-yellow-300'
              }`}
            >
              {subscription.isActive ? t('billing.subscribed') : t('billing.free')}
            </span>
          </div>

          {subscription.isActive ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{t('billing.planName')}</span>
                <span className="text-white font-medium">
                  {subscription.plan?.name || t('billing.activePlan')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{t('billing.expiryDate')}</span>
                <span className="text-white font-medium">
                  {subscription.expiresAt
                    ? formatDate(subscription.expiresAt, locale)
                    : t('billing.noExpiry')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{t('billing.daysRemaining')}</span>
                <span className="text-white font-medium">
                  {subscription.expiresAt ? subscription.daysRemaining : '-'}
                </span>
              </div>
              {subscription.expiresAt && (
                <AutoRenewToggle initialValue={subscription.autoRenew} />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">
                {role === 'recruiter'
                  ? t('billing.recruiterNoSubscription')
                  : t('billing.noActiveSubscription')}
              </p>
              <Link
                href={pricingHref}
                className="inline-flex px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {role === 'recruiter' ? t('billing.viewRecruiterPlans') : t('billing.activateSubscription')}
              </Link>
            </div>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">{t('billing.quickActions')}</h2>
          <div className="space-y-3">
            <Link
              href={localize('/dashboard')}
              className="block w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              {t('billing.goToDashboard')}
            </Link>
            <Link
              href={localize('/')}
              className="block w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              {t('billing.goToHomepage')}
            </Link>
            <Link
              href={pricingHref}
              className="block w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              {changePlanLabel}
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t('billing.paymentHistory')}</h2>
        {transactionRows.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('billing.noPaymentsYet')}</p>
        ) : (
          <div className="space-y-3">
            {transactionRows.map((tx) => {
              const plan =
                Array.isArray(tx.pricing_plans) ? tx.pricing_plans[0] : tx.pricing_plans;
              return (
                <div
                  key={tx.id}
                  className="rounded-lg border border-gray-700 bg-gray-900/60 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-white font-medium">
                        {plan?.name || tx.description || t('billing.payment')}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {formatDateTime(tx.created_at, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">
                        {Number(tx.amount).toLocaleString()} {tx.currency || 'XAF'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusClasses(tx.status)}`}>
                        {getStatusLabel(tx.status, t)}
                      </span>
                    </div>
                  </div>
                  {tx.provider_reference && (
                    <p className="text-xs text-gray-500 mt-2 font-mono">
                      {t('billing.reference')}: {tx.provider_reference}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
