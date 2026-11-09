import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardSidebar from './components/DashboardSidebar';
import DashboardHeader from './components/DashboardHeader';
import SeekerBottomNav from './components/SeekerBottomNav';
import RegistrationOfficerPrompt from './components/RegistrationOfficerPrompt';
import { getRequestLocale } from '@/lib/i18n/server';
import { addLocalePrefix } from '@/lib/i18n/locale';
import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getRequestLocale();
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${addLocalePrefix('/auth/login', locale)}?redirect=${encodeURIComponent(addLocalePrefix('/dashboard', locale))}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .single();

  const rawRole = profile?.role || 'job_seeker';
  const isActiveAdmin = Boolean(
    profile?.admin_type &&
    ACTIVE_ADMIN_TYPES.includes(profile.admin_type as AdminType)
  );

  // Admins should never access /dashboard/* - redirect them to /admin.
  // An active admin_type wins even when `role` was left at its old value
  // (e.g. a job seeker promoted by setting admin_type only).
  if (isActiveAdmin) {
    redirect(addLocalePrefix('/admin', locale));
  }
  if (rawRole === 'admin') {
    redirect(addLocalePrefix('/jobs', locale));
  }

  // For non-admin users, cast to the expected role type
  const role = rawRole as 'recruiter' | 'job_seeker' | 'talent' | 'field_agent';

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <DashboardSidebar role={role} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen lg:ml-0">
        <DashboardHeader />
        {role !== 'field_agent' && <RegistrationOfficerPrompt />}
        <main className={`flex-1 p-4 sm:p-6 overflow-auto ${role === 'job_seeker' ? 'pb-24 lg:pb-6' : ''}`}>{children}</main>
        {role === 'job_seeker' && <SeekerBottomNav />}
      </div>
    </div>
  );
}
