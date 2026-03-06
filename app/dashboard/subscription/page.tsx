import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserSubscription } from '@/lib/subscriptions';

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

export default async function DashboardSubscriptionPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

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
          <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-gray-400 text-sm">
            Manage your active plan, renewal, upgrades, and payment history.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/pricing"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Upgrade Plan
          </Link>
          <Link
            href="/pricing"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Renew
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Active Subscription</h2>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                subscription.isActive
                  ? 'bg-emerald-900/30 border border-emerald-600/40 text-emerald-300'
                  : 'bg-yellow-900/30 border border-yellow-600/40 text-yellow-300'
              }`}
            >
              {subscription.isActive ? 'Subscribed' : 'Free'}
            </span>
          </div>

          {subscription.isActive ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Plan Name</span>
                <span className="text-white font-medium">
                  {subscription.plan?.name || 'Active Plan'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Expiry Date</span>
                <span className="text-white font-medium">
                  {subscription.expiresAt
                    ? new Date(subscription.expiresAt).toLocaleDateString()
                    : 'No expiry'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Days Remaining</span>
                <span className="text-white font-medium">
                  {subscription.expiresAt ? subscription.daysRemaining : '-'}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">
                You do not have an active subscription right now.
              </p>
              <Link
                href="/pricing"
                className="inline-flex px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Activate Subscription
              </Link>
            </div>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="block w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              Go to Homepage
            </Link>
            <Link
              href="/pricing"
              className="block w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors text-center"
            >
              Change Plan
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Payment History</h2>
        {transactionRows.length === 0 ? (
          <p className="text-gray-400 text-sm">No payments yet.</p>
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
                        {plan?.name || tx.description || 'Payment'}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">
                        {Number(tx.amount).toLocaleString()} {tx.currency || 'XAF'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusClasses(tx.status)}`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                  {tx.provider_reference && (
                    <p className="text-xs text-gray-500 mt-2 font-mono">
                      Ref: {tx.provider_reference}
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
