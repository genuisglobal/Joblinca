import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardSidebar from './components/DashboardSidebar';
import DashboardHeader from './components/DashboardHeader';
import RegistrationOfficerPrompt from './components/RegistrationOfficerPrompt';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const rawRole = profile?.role || 'job_seeker';

  // Admins should never access /dashboard/* - redirect them to /admin
  if (rawRole === 'admin') {
    redirect('/admin');
  }

  // For non-admin users, cast to the expected role type
  const role = rawRole as 'recruiter' | 'job_seeker' | 'talent' | 'field_agent';

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <DashboardSidebar role={role} />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-0">
        <DashboardHeader />
        {role !== 'field_agent' && <RegistrationOfficerPrompt />}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
