'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import VerificationBadge from './VerificationBadge';
import Link from 'next/link';

interface UserInfo {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  avatarUrl?: string;
  role: string;
  isVerified?: boolean;
}

interface SubscriptionData {
  isActive: boolean;
  plan: {
    name: string;
    slug: string;
  } | null;
  expiresAt: string | null;
}

export default function DashboardHeader() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setSubscriptionLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name, avatar_url, role')
        .eq('id', authUser.id)
        .single();

      // Check verification status for recruiters
      let isVerified = false;
      if (profile?.role === 'recruiter') {
        const { data: verification } = await supabase
          .from('verifications')
          .select('status')
          .eq('user_id', authUser.id)
          .single();
        isVerified = verification?.status === 'approved';
      }

      setUser({
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        fullName: profile?.full_name,
        email: authUser.email || '',
        avatarUrl: profile?.avatar_url,
        role: profile?.role || 'user',
        isVerified,
      });

      try {
        const res = await fetch('/api/subscriptions/me');
        if (res.ok) {
          const data = (await res.json()) as SubscriptionData;
          setSubscription(data);
        }
      } catch {
        // Ignore subscription load errors in header.
      } finally {
        setSubscriptionLoading(false);
      }
    }

    fetchUser();
  }, [supabase]);

  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.fullName || user?.email || 'User';

  const roleLabel = {
    recruiter: 'Recruiter',
    job_seeker: 'Job Seeker',
    talent: 'Talent',
    field_agent: 'Field Agent',
  }[user?.role || ''] || 'User';

  const showSubscription =
    user?.role === 'recruiter' || user?.role === 'job_seeker' || user?.role === 'talent';
  const isSubscribed = Boolean(subscription?.isActive);
  const expiryText = subscription?.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString()
    : 'No expiry';

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm">{roleLabel} Portal</p>
        </div>

        <div className="flex items-center gap-4">
          {showSubscription && (
            <div className="hidden lg:block">
              {subscriptionLoading ? (
                <div className="h-8 w-52 bg-gray-700 rounded-lg animate-pulse" />
              ) : isSubscribed ? (
                <Link
                  href="/dashboard/subscription"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-600/40 bg-emerald-900/20 text-emerald-300 text-xs"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>
                    Subscribed: {subscription?.plan?.name || 'Active Plan'} - Expires {expiryText}
                  </span>
                </Link>
              ) : (
                <Link
                  href="/dashboard/subscription"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-yellow-600/40 bg-yellow-900/20 text-yellow-300 text-xs"
                >
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span>No active subscription</span>
                </Link>
              )}
            </div>
          )}

          {user?.role === 'recruiter' && (
            <VerificationBadge isVerified={user?.isVerified || false} />
          )}

          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-white font-medium">{displayName}</p>
              <p className="text-gray-400 text-sm">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
