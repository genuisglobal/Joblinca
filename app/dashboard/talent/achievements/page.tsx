import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const BADGE_COLORS = {
  bronze: {
    bg: 'bg-amber-900/30',
    border: 'border-amber-700',
    text: 'text-amber-400',
  },
  silver: {
    bg: 'bg-gray-500/30',
    border: 'border-gray-400',
    text: 'text-gray-300',
  },
  gold: {
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-600',
    text: 'text-yellow-400',
  },
  platinum: {
    bg: 'bg-cyan-900/30',
    border: 'border-cyan-500',
    text: 'text-cyan-400',
  },
};

export default async function AchievementsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch certifications
  const { data: certifications } = await supabase
    .from('certifications')
    .select(
      `
      *,
      tests:test_id (
        name,
        description,
        category
      )
    `
    )
    .eq('candidate_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch test attempts
  const { data: testAttempts } = await supabase
    .from('test_attempts')
    .select(
      `
      *,
      tests:test_id (
        name,
        description,
        category
      )
    `
    )
    .eq('candidate_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Achievements</h1>
        <p className="text-gray-400 mt-1">
          Your certifications and test results
        </p>
      </div>

      {/* Certifications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Certifications</h2>
        {!certifications || certifications.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
            <p className="text-gray-400 mb-4">No certifications yet.</p>
            <p className="text-sm text-gray-500">
              Complete tests to earn certifications and showcase your skills.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {certifications.map((cert) => {
              const colors =
                BADGE_COLORS[cert.badge as keyof typeof BADGE_COLORS] ||
                BADGE_COLORS.bronze;
              return (
                <div
                  key={cert.id}
                  className={`p-4 rounded-xl border ${colors.bg} ${colors.border}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${colors.bg} border ${colors.border}`}
                    >
                      <svg
                        className={`w-6 h-6 ${colors.text}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-white">
                        {cert.tests?.name || 'Certification'}
                      </h3>
                      <p className={`text-sm ${colors.text} capitalize`}>
                        {cert.badge} Badge
                      </p>
                      {cert.tests?.category && (
                        <p className="text-xs text-gray-500 mt-1">
                          {cert.tests.category}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {new Date(cert.created_at).toLocaleDateString()}
                    </span>
                    {cert.verified && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test Attempts */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Test History</h2>
        {!testAttempts || testAttempts.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <p className="text-gray-400">No test attempts yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {testAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="p-4 bg-gray-700/50 rounded-lg flex items-center justify-between"
              >
                <div>
                  <h3 className="font-medium text-white">
                    {attempt.tests?.name || 'Test'}
                  </h3>
                  {attempt.tests?.category && (
                    <p className="text-sm text-gray-400">
                      {attempt.tests.category}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {attempt.score !== null && (
                    <p
                      className={`text-lg font-bold ${
                        attempt.score >= 80
                          ? 'text-green-400'
                          : attempt.score >= 60
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {attempt.score}%
                    </p>
                  )}
                  <p className="text-xs text-gray-500 capitalize">
                    {attempt.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
