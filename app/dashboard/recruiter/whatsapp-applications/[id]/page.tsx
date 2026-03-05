'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface SessionDetail {
  id: string;
  wa_phone: string;
  state: string;
  language_code: 'en' | 'fr';
  weighted_score: number | null;
  must_have_passed: boolean | null;
  result_label: 'qualified' | 'review' | 'reject' | null;
  must_have_fail_reasons: string[] | null;
  score_breakdown: Record<string, number> | null;
  ai_summary_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
  ai_summary_text: string | null;
  ai_recommendation: 'strong_yes' | 'review' | 'reject' | null;
  ai_key_strengths: string[];
  ai_key_risks: string[];
  ai_model: string | null;
  ai_tokens_used: number | null;
  ai_error: string | null;
  ai_last_generated_at: string | null;
  ai_followup_generated: boolean;
  ai_followup_question: string | null;
  created_at: string;
  completed_at: string | null;
  jobs: {
    title: string | null;
    company_name: string | null;
  } | null;
}

interface AnswerRow {
  id: string;
  question_key: string;
  question_text: string;
  answer_text: string;
  is_must_have: boolean;
  must_have_passed: boolean | null;
  score_delta: number;
  created_at: string;
}

interface NotificationRow {
  id: string;
  channel: 'dashboard' | 'email' | 'whatsapp';
  destination: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  last_error: string | null;
  created_at: string;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
}

function isMissingColumnErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('column') && lower.includes('does not exist');
}

function recommendationBadgeColor(value: string | null): string {
  if (value === 'strong_yes') return 'bg-green-600/20 text-green-300 border-green-500/40';
  if (value === 'review') return 'bg-yellow-600/20 text-yellow-300 border-yellow-500/40';
  if (value === 'reject') return 'bg-red-600/20 text-red-300 border-red-500/40';
  return 'bg-gray-700/40 text-gray-300 border-gray-600';
}

export default function WhatsAppScreeningDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [regeneratingAi, setRegeneratingAi] = useState(false);
  const [aiActionError, setAiActionError] = useState<string | null>(null);

  const fetchSessionRecord = useCallback(async (): Promise<SessionDetail | null> => {
    const baseSelect = `
      id,
      wa_phone,
      state,
      language_code,
      weighted_score,
      must_have_passed,
      result_label,
      must_have_fail_reasons,
      score_breakdown,
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
      ai_summary_text,
      ai_recommendation,
      ai_key_strengths,
      ai_key_risks,
      ai_model,
      ai_tokens_used,
      ai_error,
      ai_last_generated_at,
      ai_followup_generated,
      ai_followup_question
    `;

    let data: any = null;
    let error: { message?: string } | null = null;

    const primary = await supabase
      .from('wa_screening_sessions')
      .select(aiSelect)
      .eq('id', params.id)
      .maybeSingle();

    data = primary.data;
    error = primary.error;

    if (error && isMissingColumnErrorMessage(error.message)) {
      const fallback = await supabase
        .from('wa_screening_sessions')
        .select(baseSelect)
        .eq('id', params.id)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) {
      if (error) {
        console.error('Failed to load WhatsApp screening session:', error);
      }
      return null;
    }

    const row = data as Record<string, any>;
    return {
      ...(row as any),
      ai_summary_status: row.ai_summary_status ?? null,
      ai_summary_text: row.ai_summary_text ?? null,
      ai_recommendation: row.ai_recommendation ?? null,
      ai_key_strengths: Array.isArray(row.ai_key_strengths) ? row.ai_key_strengths : [],
      ai_key_risks: Array.isArray(row.ai_key_risks) ? row.ai_key_risks : [],
      ai_model: row.ai_model ?? null,
      ai_tokens_used: typeof row.ai_tokens_used === 'number' ? row.ai_tokens_used : null,
      ai_error: row.ai_error ?? null,
      ai_last_generated_at: row.ai_last_generated_at ?? null,
      ai_followup_generated: Boolean(row.ai_followup_generated),
      ai_followup_question: row.ai_followup_question ?? null,
      jobs: Array.isArray(row.jobs) ? row.jobs[0] || null : row.jobs || null,
    } as SessionDetail;
  }, [supabase, params.id]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace('/auth/login');
        return;
      }

      const [sessionRecord, answersRes, notificationsRes] = await Promise.all([
        fetchSessionRecord(),
        supabase
          .from('wa_screening_answers')
          .select('*')
          .eq('session_id', params.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('wa_screening_notifications')
          .select('id, channel, destination, status, attempt_count, last_error, created_at')
          .eq('session_id', params.id)
          .order('created_at', { ascending: true }),
      ]);

      if (!mounted) return;

      if (!sessionRecord) {
        router.replace('/dashboard/recruiter/whatsapp-applications');
        return;
      }

      if (answersRes.error) {
        console.error('Failed to load WhatsApp screening answers:', answersRes.error);
      }
      if (notificationsRes.error) {
        console.error('Failed to load WhatsApp screening notifications:', notificationsRes.error);
      }

      setSession(sessionRecord);
      setAnswers((answersRes.data || []) as AnswerRow[]);
      setNotifications((notificationsRes.data || []) as NotificationRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [supabase, router, params.id, fetchSessionRecord]);

  const handleRegenerateAiSummary = useCallback(async () => {
    if (!session || regeneratingAi) return;

    setRegeneratingAi(true);
    setAiActionError(null);

    try {
      const response = await fetch(`/api/whatsapp/screening/${params.id}/ai-summary`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as
        | { reason?: string; error?: string }
        | null;

      if (!response.ok) {
        setAiActionError(payload?.reason || payload?.error || 'Failed to regenerate AI summary');
        return;
      }

      const refreshedSession = await fetchSessionRecord();
      if (refreshedSession) {
        setSession(refreshedSession);
      }
    } catch (error) {
      setAiActionError(error instanceof Error ? error.message : 'Failed to regenerate AI summary');
    } finally {
      setRegeneratingAi(false);
    }
  }, [session, regeneratingAi, params.id, fetchSessionRecord]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/recruiter/whatsapp-applications"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Back to WhatsApp Screening
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2">Screening Session</h1>
          <p className="text-gray-400 mt-1">{session.jobs?.title || 'Unknown job'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-xs text-gray-400">Candidate</p>
          <p className="text-white mt-1">{maskPhone(session.wa_phone)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-xs text-gray-400">State</p>
          <p className="text-white mt-1">{session.state}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-xs text-gray-400">Result</p>
          <p className="text-white mt-1">{session.result_label || 'pending'}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-xs text-gray-400">Score</p>
          <p className="text-white mt-1">
            {session.weighted_score !== null ? `${session.weighted_score}/100` : '-'}
          </p>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg text-white font-semibold">AI Recruiter Summary</h2>
          <button
            onClick={handleRegenerateAiSummary}
            disabled={regeneratingAi || session.state !== 'completed'}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {regeneratingAi
              ? 'Generating...'
              : session.ai_summary_status === 'completed'
                ? 'Re-generate'
                : 'Generate'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
          <span className="inline-flex px-2 py-0.5 rounded border border-gray-600 bg-gray-700/40 text-gray-300">
            status: {session.ai_summary_status || 'n/a'}
          </span>
          {session.ai_recommendation && (
            <span
              className={`inline-flex px-2 py-0.5 rounded border ${recommendationBadgeColor(session.ai_recommendation)}`}
            >
              recommendation: {session.ai_recommendation}
            </span>
          )}
          {session.ai_last_generated_at && (
            <span className="text-gray-500">
              updated: {new Date(session.ai_last_generated_at).toLocaleString()}
            </span>
          )}
        </div>

        {aiActionError && (
          <p className="text-sm text-red-300 mb-3">{aiActionError}</p>
        )}

        {session.ai_summary_status === 'completed' && session.ai_summary_text ? (
          <div className="space-y-4">
            <p className="text-gray-200">{session.ai_summary_text}</p>

            {session.ai_key_strengths.length > 0 && (
              <div>
                <h3 className="text-sm text-green-300 font-medium mb-1">Strengths</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  {session.ai_key_strengths.map((item, index) => (
                    <li key={`${item}-${index}`}>- {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {session.ai_key_risks.length > 0 && (
              <div>
                <h3 className="text-sm text-yellow-300 font-medium mb-1">Risks / Follow-up</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  {session.ai_key_risks.map((item, index) => (
                    <li key={`${item}-${index}`}>- {item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-gray-500">
              model: {session.ai_model || 'unknown'} | tokens: {session.ai_tokens_used ?? '-'}
            </div>
          </div>
        ) : session.ai_summary_status === 'processing' || session.ai_summary_status === 'pending' ? (
          <p className="text-sm text-gray-300">AI summary is being generated.</p>
        ) : session.ai_summary_status === 'failed' ? (
          <p className="text-sm text-red-300">{session.ai_error || 'AI summary failed.'}</p>
        ) : session.ai_summary_status === 'skipped' ? (
          <p className="text-sm text-gray-400">
            AI summary skipped. Configure OpenAI and run generation again if needed.
          </p>
        ) : (
          <p className="text-sm text-gray-400">No AI summary generated yet.</p>
        )}

        {session.ai_followup_generated && session.ai_followup_question && (
          <div className="mt-4 rounded border border-gray-700 bg-gray-900/40 p-3">
            <p className="text-xs text-gray-400 mb-1">AI follow-up question asked</p>
            <p className="text-sm text-gray-200">{session.ai_followup_question}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4">
          AI output is assistive and should not be the sole basis for hiring decisions.
        </p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 className="text-lg text-white font-semibold mb-3">Answers</h2>
        {answers.length === 0 ? (
          <p className="text-gray-400">No answers captured yet.</p>
        ) : (
          <div className="space-y-3">
            {answers.map((answer) => (
              <div key={answer.id} className="rounded border border-gray-700 bg-gray-900/40 p-3">
                <p className="text-sm text-white font-medium">{answer.question_text}</p>
                <p className="text-sm text-gray-300 mt-1">{answer.answer_text}</p>
                <div className="flex gap-3 text-xs text-gray-400 mt-2">
                  <span>key: {answer.question_key}</span>
                  <span>score: {answer.score_delta}</span>
                  <span>must-have: {answer.is_must_have ? 'yes' : 'no'}</span>
                  {answer.is_must_have && (
                    <span>pass: {answer.must_have_passed ? 'yes' : 'no'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 className="text-lg text-white font-semibold mb-3">Notifications</h2>
        {notifications.length === 0 ? (
          <p className="text-gray-400">No notification records.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="flex flex-wrap items-center gap-3 rounded border border-gray-700 bg-gray-900/40 p-3 text-sm"
              >
                <span className="text-white">{notification.channel}</span>
                <span className="text-gray-300">{notification.status}</span>
                <span className="text-gray-400">{notification.destination || '-'}</span>
                <span className="text-gray-500">attempts: {notification.attempt_count}</span>
                {notification.last_error && (
                  <span className="text-red-300">error: {notification.last_error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
