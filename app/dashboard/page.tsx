import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  // Check if the user is logged in server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in, redirect to login page.
    redirect('/auth/login');
  }
  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p>Welcome back, {user.email}!</p>
      <p className="mt-4">
        Use the navigation to manage jobs, applications, vetting requests,
        subscriptions and more.
      </p>
    </main>
  );
}