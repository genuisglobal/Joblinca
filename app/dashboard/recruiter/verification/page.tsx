import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VerificationBadge from '../../components/VerificationBadge';
import VerificationForm from './VerificationForm';

export default async function RecruiterVerificationPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch verification status
  const { data: verification } = await supabase
    .from('verifications')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const status = verification?.status || null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Verification Status</h1>

      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <VerificationBadge
            isVerified={status === 'approved'}
            size="lg"
          />
          <div>
            <h2 className="text-lg font-semibold text-white">
              {status === 'approved'
                ? 'You are verified!'
                : status === 'pending'
                  ? 'Verification in progress'
                  : 'Get verified'}
            </h2>
            <p className="text-gray-400">
              {status === 'approved'
                ? 'Your recruiter account has been verified.'
                : status === 'pending'
                  ? 'We are reviewing your submitted documents.'
                  : 'Verify your identity to build trust with candidates.'}
            </p>
          </div>
        </div>

        {status === 'approved' && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
            <h3 className="font-medium text-green-400 mb-2">
              Benefits of Verification
            </h3>
            <ul className="text-gray-300 space-y-1 text-sm">
              <li>- Verified badge on all your job postings</li>
              <li>- Higher visibility in search results</li>
              <li>- Increased trust from candidates</li>
              <li>- Priority support from our team</li>
            </ul>
          </div>
        )}

        {status === 'pending' && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <h3 className="font-medium text-yellow-400 mb-2">
              Verification Pending
            </h3>
            <p className="text-gray-300 text-sm">
              Your documents have been submitted and are under review. This
              typically takes 1-3 business days. We will notify you once the
              verification is complete.
            </p>
          </div>
        )}

        {status === 'rejected' && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-red-400 mb-2">
              Verification Rejected
            </h3>
            <p className="text-gray-300 text-sm">
              Unfortunately, your previous verification request was rejected.
              Please review your documents and try again.
            </p>
          </div>
        )}

        {(!status || status === 'rejected') && (
          <>
            <div className="mb-6">
              <h3 className="font-medium text-white mb-3">
                What you will need:
              </h3>
              <ul className="text-gray-300 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Government-issued ID (Passport, National ID, or Driver License)
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  A selfie holding your ID
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Company registration documents (optional but recommended)
                </li>
              </ul>
            </div>

            <VerificationForm />
          </>
        )}
      </div>
    </div>
  );
}
