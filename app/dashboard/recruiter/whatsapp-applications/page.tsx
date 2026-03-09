'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface WhatsAppScreeningSession {
  id: string;
  wa_phone: string;
  state: string;
  language_code: 'en' | 'fr';
  weighted_score: number | null;
  must_have_passed: boolean | null;
  result_label: 'qualified' | 'review' | 'reject' | null;
  ai_summary_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
  ai_recommendation: 'strong_yes' | 'review' | 'reject' | null;
  created_at: string;
  completed_at: string | null;
  jobs: {
    title: string | null;
    company_name: string | null;
  } | null;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
}

function resultBadgeColor(result: string | null): string {
  if (result === 'qualified') return 'bg-green-600/20 text-green-300 border-green-500/40';
  if (result === 'review') return 'bg-yellow-600/20 text-yellow-300 border-yellow-500/40';
  if (result === 'reject') return 'bg-red-600/20 text-red-300 border-red-500/40';
  return 'bg-gray-700/40 text-gray-300 border-gray-600';
}

function aiBadgeColor(status: string | null): string {
  if (status === 'completed') return 'bg-blue-600/20 text-blue-300 border-blue-500/40';
  if (status === 'processing' || status === 'pending') return 'bg-yellow-600/20 text-yellow-300 border-yellow-500/40';
  if (status === 'failed') return 'bg-red-600/20 text-red-300 border-red-500/40';
  if (status === 'skipped') return 'bg-gray-700/40 text-gray-300 border-gray-600';
  return 'bg-gray-700/40 text-gray-300 border-gray-600';
}

function isMissingColumnErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('column') && lower.includes('does not exist');
}

export default function RecruiterWhatsAppApplicationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<WhatsAppScreeningSession[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace('/auth/login');
        return;
      }

      const baseSelect = `
        id,
        wa_phone,
        state,
        language_code,
        weighted_score,
        must_have_passed,
        result_label,
        created_at,
        completed_at,
        jobs:job_id (
          title,
          company_name
        )
      `;
      const aiSelect = `
        ${baseSelect},
        ai_summary_status,
        ai_recommendation
      `;

      let data: any[] | null = null;
      let error: { message?: string } | null = null;

      const primaryQuery = await supabase
        .from('wa_screening_sessions')
        .select(aiSelect)
        .order('created_at', { ascending: false })
        .limit(100);

      data = primaryQuery.data;
      error = primaryQuery.error;

      if (error && isMissingColumnErrorMessage(error.message)) {
        const fallbackQuery = await supabase
          .from('wa_screening_sessions')
          .select(baseSelect)
          .order('created_at', { ascending: false })
          .limit(100);
        data = fallbackQuery.data;
        error = fallbackQuery.error;
      }

      if (!mounted) return;

      if (error) {
        console.error('Failed to load WhatsApp screenings:', error);
        setSessions([]);
      } else {
        const normalized = (data || []).map((row: any) => ({
          ...row,
          ai_summary_status: row.ai_summary_status ?? null,
          ai_recommendation: row.ai_recommendation ?? null,
          jobs: Array.isArray(row.jobs) ? row.jobs[0] || null : row.jobs || null,
        }));
        setSessions(normalized as WhatsAppScreeningSession[]);
      }
      setLoading(false);
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  const completed = sessions.filter((s) => s.state === 'completed').length;
  const inProgress = sessions.filter((s) => !['completed', 'cancelled', 'quota_blocked'].includes(s.state)).length;
  const blocked = sessions.filter((s) => s.state === 'quota_blocked').length;
  const qualified = sessions.filter((s) => s.result_label === 'qualified').length;
  const review = sessions.filter((s) => s.result_label === 'review').length;
  const rejected = sessions.filter((s) => s.result_label === 'reject').length;
  const completedScores = sessions
    .filter((s) => s.state === 'completed' && typeof s.weighted_score === 'number')
    .map((s) => s.weighted_score as number);
  const avgScore = completedScores.length > 0
    ? Math.round(completedScores.reduce((sum, score) => sum + score, 0) / completedScores.length)
    : null;
  const aiCompleted = sessions.filter((s) => s.ai_summary_status === 'completed').length;
  const aiFailed = sessions.filter((s) => s.ai_summary_status === 'failed').length;
  const aiCoverage = completed > 0 ? Math.round((aiCompleted / completed) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">WhatsApp Screening</h1>
        <p className="text-gray-400 mt-1">Review candidates screened through WhatsApp.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">Total Sessions</p>
          <p className="text-2xl font-semibold text-white mt-1">{sessions.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">Completed</p>
          <p className="text-2xl font-semibold text-green-300 mt-1">{completed}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">In Progress / Blocked</p>
          <p className="text-2xl font-semibold text-yellow-300 mt-1">{inProgress + blocked}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">Qualified</p>
          <p className="text-xl font-semibold text-green-300 mt-1">{qualified}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">Review</p>
          <p className="text-xl font-semibold text-yellow-300 mt-1">{review}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">Rejected</p>
          <p className="text-xl font-semibold text-red-300 mt-1">{rejected}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">Avg Score</p>
          <p className="text-xl font-semibold text-white mt-1">{avgScore !== null ? `${avgScore}/100` : '-'}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">AI Completed</p>
          <p className="text-xl font-semibold text-blue-300 mt-1">{aiCompleted}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400">AI Coverage</p>
          <p className="text-xl font-semibold text-blue-200 mt-1">{aiCoverage}%</p>
          {aiFailed > 0 && <p className="text-xs text-red-300 mt-1">failed: {aiFailed}</p>}
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold text-gray-400 border-b border-gray-700">
          <div className="col-span-2">Candidate</div>
          <div className="col-span-3">Job</div>
          <div className="col-span-1">Lang</div>
          <div className="col-span-1">State</div>
          <div className="col-span-2">Result</div>
          <div className="col-span-1">Score</div>
          <div className="col-span-1">AI</div>
          <div className="col-span-1 text-right">Open</div>
        </div>

        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            No WhatsApp screening sessions yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-700/60">
            {sessions.map((session) => (
              <div key={session.id} className="grid grid-cols-12 gap-3 px-4 py-3 text-sm">
                <div className="col-span-2 text-gray-200">{maskPhone(session.wa_phone)}</div>
                <div className="col-span-3">
                  <p className="text-white">{session.jobs?.title || 'Unknown job'}</p>
                  <p className="text-xs text-gray-500">{session.jobs?.company_name || 'No company'}</p>
                </div>
                <div className="col-span-1 text-gray-300 uppercase">{session.language_code}</div>
                <div className="col-span-1 text-gray-300">{session.state}</div>
                <div className="col-span-2">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${resultBadgeColor(session.result_label)}`}>
                    {session.result_label || 'pending'}
                  </span>
                </div>
                <div className="col-span-1 text-gray-200">
                  {session.weighted_score !== null ? `${session.weighted_score}` : '-'}
                </div>
                <div className="col-span-1">
                  <div className="space-y-1">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${aiBadgeColor(session.ai_summary_status)}`}>
                      {session.ai_summary_status || 'n/a'}
                    </span>
                    {session.ai_recommendation && (
                      <div className="text-[11px] text-gray-400">{session.ai_recommendation}</div>
                    )}
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <Link
                    href={`/dashboard/recruiter/whatsapp-applications/${session.id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
