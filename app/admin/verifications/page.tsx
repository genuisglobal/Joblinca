import { createServerSupabaseClient } from '@/lib/supabase/server';
import VerificationsClient from './VerificationsClient';

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminVerificationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const activeTab = params.tab || 'recruiters';

  // Fetch recruiters with their profiles
  const { data: recruiters } = await supabase
    .from('recruiter_profiles')
    .select(`
      user_id,
      company_name,
      contact_email,
      recruiter_type,
      verification_status,
      verified_at,
      verification_notes,
      created_at,
      profile:user_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
    `)
    .order('created_at', { ascending: false });

  // Fetch job seekers with their profiles
  const { data: jobSeekers } = await supabase
    .from('job_seeker_profiles')
    .select(`
      user_id,
      headline,
      location,
      verification_status,
      verified_at,
      verification_notes,
      created_at,
      profile:user_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
    `)
    .order('created_at', { ascending: false });

  // Fetch verification documents
  const { data: verificationDocs } = await supabase
    .from('verifications')
    .select('*')
    .order('created_at', { ascending: false });

  // Get counts
  const recruiterCounts = {
    pending: recruiters?.filter(r => r.verification_status === 'pending').length || 0,
    verified: recruiters?.filter(r => r.verification_status === 'verified').length || 0,
    rejected: recruiters?.filter(r => r.verification_status === 'rejected').length || 0,
    unverified: recruiters?.filter(r => r.verification_status === 'unverified').length || 0,
    total: recruiters?.length || 0,
  };

  const jobSeekerCounts = {
    pending: jobSeekers?.filter(j => j.verification_status === 'pending').length || 0,
    verified: jobSeekers?.filter(j => j.verification_status === 'verified').length || 0,
    rejected: jobSeekers?.filter(j => j.verification_status === 'rejected').length || 0,
    unverified: jobSeekers?.filter(j => j.verification_status === 'unverified').length || 0,
    total: jobSeekers?.length || 0,
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Verifications</h1>
        <p className="text-gray-400 mt-1">Verify recruiters and job seekers</p>
      </div>

      <VerificationsClient
        activeTab={activeTab}
        recruiters={recruiters || []}
        jobSeekers={jobSeekers || []}
        verificationDocs={verificationDocs || []}
        recruiterCounts={recruiterCounts}
        jobSeekerCounts={jobSeekerCounts}
      />
    </div>
  );
}
