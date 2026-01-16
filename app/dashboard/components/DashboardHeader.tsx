'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import VerificationBadge from './VerificationBadge';

interface UserInfo {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  avatarUrl?: string;
  role: string;
  isVerified?: boolean;
}

export default function DashboardHeader() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) return;

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
  }[user?.role || ''] || 'User';

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm">{roleLabel} Portal</p>
        </div>

        <div className="flex items-center gap-4">
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
