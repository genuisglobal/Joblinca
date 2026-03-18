'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  InterviewPrepAnswerFeedback,
  InterviewPrepChatMessage,
  InterviewPrepSession,
  InterviewPrepSessionSummary,
} from '@/lib/ai/interviewPrep';

export interface InterviewPrepApplicationOption {
  id: string;
  jobTitle: string;
  companyName: string | null;
  jobLocation: string | null;
  workType: string | null;
  createdAt: string;
  interviewAt: string | null;
  interviewTimezone: string | null;
  interviewMode: string | null;
}

interface GenerateInterviewPrepResponse {
  session: InterviewPrepSession;
  generatedAt: string;
  subscriptionPlan: string | null;
  error?: string;
}

interface InterviewPrepChatResponse {
  message: InterviewPrepChatMessage;
  session: InterviewPrepSession;
  modelUsed: string;
  tokensUsed: number;
  error?: string;
}

interface InterviewPrepClientProps {
  applications: InterviewPrepApplicationOption[];
  subscriptionPlanName: string | null;
  initialApplicationId?: string | null;
  suggestedApplicationId?: string | null;
  suggestedReason?: 'scheduled_interview' | 'application' | null;
}

function formatDateLabel(value: string | null, timezone?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function formatModeLabel(value: string | null): string {
  if (!value) {
    return 'Interview';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getContextString(
  session: InterviewPrepSession | null,
  key: string
): string | null {
  if (!session) {
    return null;
  }

  const value = session.contextSnapshot[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isErrorResponse(value: unknown): value is { error?: string } {
  return Boolean(value && typeof value === 'object' && 'error' in (value as Record<string, unknown>));
}

function getLatestFeedback(session: InterviewPrepSession | null): InterviewPrepAnswerFeedback | null {
  if (!session) {
    return null;
  }

  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message.role === 'assistant' && message.feedback) {
      return message.feedback;
    }
  }

  return null;
}

function getScoreTone(score: number) {
  if (score >= 80) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  }

  if (score >= 60) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }

  return 'border-red-500/30 bg-red-500/10 text-red-100';
}

function getReadinessTrendLabel(trend: 'improving' | 'steady' | 'needs_work' | null) {
  if (trend === 'improving') {
    return 'Improving';
  }

  if (trend === 'needs_work') {
    return 'Needs work';
  }

  if (trend === 'steady') {
    return 'Steady';
  }

  return null;
}

function getFeedbackMetricCards(feedback: InterviewPrepAnswerFeedback) {
  return [
    { label: 'Relevance', metric: feedback.rubric.relevance },
    { label: 'Specificity', metric: feedback.rubric.specificity },
    { label: 'Structure', metric: feedback.rubric.structure },
    { label: 'Confidence', metric: feedback.rubric.confidence },
  ];
}

export default function InterviewPrepClient({
  applications,
  subscriptionPlanName,
  initialApplicationId,
  suggestedApplicationId,
  suggestedReason,
}: InterviewPrepClientProps) {
  const [selectedApplicationId, setSelectedApplicationId] = useState(() => {
    if (initialApplicationId && applications.some((application) => application.id === initialApplicationId)) {
      return initialApplicationId;
    }

    return applications[0]?.id || '';
  });
  const [sessions, setSessions] = useState<InterviewPrepSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<InterviewPrepSession | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isSendingChat, startChatTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedApplication =
    applications.find((item) => item.id === selectedApplicationId) || applications[0] || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  useEffect(() => {
    if (!applications.some((application) => application.id === selectedApplicationId)) {
      if (initialApplicationId && applications.some((application) => application.id === initialApplicationId)) {
        setSelectedApplicationId(initialApplicationId);
        return;
      }

      setSelectedApplicationId(applications[0]?.id || '');
    }
  }, [applications, initialApplicationId, selectedApplicationId]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const response = await fetch('/api/interview-prep/sessions');
        const data = (await response.json().catch(() => [])) as
          | InterviewPrepSessionSummary[]
          | { error?: string };

        if (!mounted) {
          return;
        }

        if (!response.ok || !Array.isArray(data)) {
          setError(
            !Array.isArray(data) && data?.error
              ? data.error
              : 'Failed to load saved interview prep sessions.'
          );
          return;
        }

        setSessions(data);
        if (data[0]) {
          await loadSession(data[0].id, mounted);
        }
      } catch {
        if (mounted) {
          setError('Failed to load saved interview prep sessions.');
        }
      } finally {
        if (mounted) {
          setLoadingSessions(false);
        }
      }
    }

    void initialize();

    return () => {
      mounted = false;
    };
  }, []);

  async function refreshSessions() {
    const response = await fetch('/api/interview-prep/sessions');
    const data = (await response.json().catch(() => [])) as
      | InterviewPrepSessionSummary[]
      | { error?: string };

    if (!response.ok || !Array.isArray(data)) {
      throw new Error(
        !Array.isArray(data) && data?.error ? data.error : 'Failed to refresh sessions.'
      );
    }

    setSessions(data);
  }

  async function loadSession(sessionId: string, stillMounted = true) {
    if (!sessionId) {
      return;
    }

    setLoadingSession(true);
    try {
      const response = await fetch(`/api/interview-prep/sessions/${sessionId}`);
      const data = (await response.json().catch(() => null)) as
        | InterviewPrepSession
        | { error?: string }
        | null;

      if (!stillMounted) {
        return;
      }

      if (!response.ok || !data || isErrorResponse(data)) {
        setError(isErrorResponse(data) && data.error ? data.error : 'Failed to load session.');
        return;
      }

      setActiveSession(data as InterviewPrepSession);
      setError(null);
    } catch {
      if (stillMounted) {
        setError('Failed to load session.');
      }
    } finally {
      if (stillMounted) {
        setLoadingSession(false);
      }
    }
  }

  async function generatePrep(applicationId: string) {
    try {
      setError(null);

      const response = await fetch('/api/interview-prep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId }),
      });

      const data = (await response.json().catch(() => null)) as
        | GenerateInterviewPrepResponse
        | null;

      if (!response.ok || !data?.session) {
        setError(data?.error || 'Failed to generate interview prep.');
        return;
      }

      setActiveSession(data.session);
      setChatInput('');
      await refreshSessions();
    } catch {
      setError('Network error while generating interview prep.');
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      const response = await fetch(`/api/interview-prep/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || 'Failed to delete session.');
        return;
      }

      const remainingSessions = sessions.filter((session) => session.id !== sessionId);
      setSessions(remainingSessions);

      if (activeSession?.id === sessionId) {
        if (remainingSessions[0]) {
          await loadSession(remainingSessions[0].id);
        } else {
          setActiveSession(null);
        }
      }
    } catch {
      setError('Failed to delete session.');
    }
  }

  async function sendChatMessage(sessionId: string, message: string) {
    try {
      setError(null);

      const response = await fetch('/api/interview-prep/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, message }),
      });

      const data = (await response.json().catch(() => null)) as
        | InterviewPrepChatResponse
        | { error?: string }
        | null;

      if (!response.ok || !data || isErrorResponse(data)) {
        setError(isErrorResponse(data) && data.error ? data.error : 'Failed to send message.');
        return;
      }

      setActiveSession((data as InterviewPrepChatResponse).session);
      setChatInput('');
      await refreshSessions();
    } catch {
      setError('Network error while sending interview follow-up.');
    }
  }

  function handleGenerate() {
    if (!selectedApplicationId) {
      return;
    }

    startGenerateTransition(() => {
      void generatePrep(selectedApplicationId);
    });
  }

  function handleSendChat() {
    if (!activeSession || !chatInput.trim()) {
      return;
    }

    const message = chatInput.trim();
    startChatTransition(() => {
      void sendChatMessage(activeSession.id, message);
    });
  }

  const sessionJobTitle = getContextString(activeSession, 'jobTitle');
  const sessionCompanyName = getContextString(activeSession, 'companyName');
  const sessionJobLocation = getContextString(activeSession, 'jobLocation');
  const sessionWorkType = getContextString(activeSession, 'workType');
  const sessionInterviewAt = getContextString(activeSession, 'interviewAt');
  const sessionInterviewTimezone = getContextString(activeSession, 'interviewTimezone');
  const sessionInterviewMode = getContextString(activeSession, 'interviewMode');
  const latestFeedback = getLatestFeedback(activeSession);
  const isSuggestedSelection = Boolean(
    selectedApplication && suggestedApplicationId && selectedApplication.id === suggestedApplicationId
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
      <section className="space-y-6 rounded-2xl border border-gray-700 bg-gray-800/90 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/15 p-3 text-blue-300">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">
              Premium Tool
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">Interview Prep</h2>
            <p className="mt-2 text-sm text-gray-400">
              Generate prep packs from real applications, then continue with saved mock Q and A.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            Included in {subscriptionPlanName || 'your active plan'}
          </div>
          <p className="mt-2 text-sm text-emerald-100/80">
            The prep pack and mock Q and A are advisory only. They help you rehearse stronger
            answers, but they do not guarantee interview outcomes.
          </p>
        </div>

        <div>
          <label htmlFor="application" className="text-sm font-medium text-gray-200">
            Choose an application
          </label>
          <select
            id="application"
            value={selectedApplicationId}
            onChange={(event) => {
              setSelectedApplicationId(event.target.value);
              setError(null);
            }}
            className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
          >
            {applications.map((application) => {
              const interviewLabel = formatDateLabel(
                application.interviewAt,
                application.interviewTimezone
              );
              return (
                <option key={application.id} value={application.id}>
                  {application.jobTitle}
                  {application.companyName ? ` - ${application.companyName}` : ''}
                  {interviewLabel ? ` - Interview ${interviewLabel}` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {selectedApplication && (
          <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{selectedApplication.jobTitle}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {selectedApplication.companyName || 'Organization'}
                </p>
              </div>
              <Briefcase className="h-5 w-5 text-gray-500" />
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-300">
              {selectedApplication.jobLocation && <p>{selectedApplication.jobLocation}</p>}
              {selectedApplication.workType && (
                <p className="capitalize">{selectedApplication.workType}</p>
              )}
              <p>Applied {new Date(selectedApplication.createdAt).toLocaleDateString()}</p>
              {selectedApplication.interviewAt && (
                <p className="text-blue-300">
                  {formatModeLabel(selectedApplication.interviewMode)} interview{' '}
                  {formatDateLabel(
                    selectedApplication.interviewAt,
                    selectedApplication.interviewTimezone
                  )}
                </p>
              )}
            </div>

            {isSuggestedSelection && (
              <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-50">
                {suggestedReason === 'scheduled_interview'
                  ? 'A scheduled interview was detected for this application. Generate the prep session while the recruiter context is still fresh.'
                  : 'This application was preselected so you can generate prep without searching for it again.'}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!selectedApplicationId || isGenerating}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating prep session...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate new prep session
            </>
          )}
        </button>

        <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            What it uses
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-300">
            <li>Your cover letter and saved application answers</li>
            <li>The job title, description, and recruiter screening questions</li>
            <li>Any scheduled interview timing and notes already in Joblinca</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Saved Sessions
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Reopen older prep packs and continue mock follow-up from where you left off.
              </p>
            </div>
            {loadingSessions && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
          </div>

          <div className="mt-4 space-y-2">
            {!loadingSessions && sessions.length === 0 ? (
              <p className="text-sm text-gray-500">No saved sessions yet.</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-xl border p-3 transition ${
                    activeSession?.id === session.id
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-gray-700 bg-gray-950/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void loadSession(session.id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-white">{session.title}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {session.jobTitle || 'Interview prep session'}
                        {session.companyName ? ` - ${session.companyName}` : ''}
                      </p>
                      {session.readiness && (
                        <p className="mt-2 text-xs text-gray-300">
                          Readiness {session.readiness.latestScore}/100 - {session.readiness.attemptCount}{' '}
                          scored answer{session.readiness.attemptCount === 1 ? '' : 's'}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        Updated {new Date(session.updatedAt).toLocaleString()} - {session.messageCount}{' '}
                        messages
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSession(session.id)}
                      className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-800 hover:text-red-300"
                      aria-label="Delete session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="flex items-start gap-2 text-sm text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p>{error}</p>
                {error.toLowerCase().includes('subscription') && (
                  <Link
                    href="/pricing?role=job_seeker&from=interview-prep"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-red-100 hover:text-white"
                  >
                    Upgrade plan
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6">
        {loadingSession ? (
          <div className="flex min-h-[480px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading session...
            </div>
          </div>
        ) : activeSession ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">
                  Saved Prep Session
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {sessionJobTitle || activeSession.title}
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  {sessionCompanyName || 'Organization'}
                  {sessionJobLocation ? ` - ${sessionJobLocation}` : ''}
                  {sessionWorkType ? ` - ${sessionWorkType}` : ''}
                </p>
              </div>

              <div className="space-y-2 text-right text-xs text-gray-400">
                <p>Updated {new Date(activeSession.updatedAt).toLocaleString()}</p>
                {sessionInterviewAt && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-100">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>
                      {formatModeLabel(sessionInterviewMode)}{' '}
                      {formatDateLabel(sessionInterviewAt, sessionInterviewTimezone)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5">
              <p className="text-sm leading-7 text-blue-50">{activeSession.prep.summary}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr),minmax(280px,0.9fr)]">
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Readiness Progress
                </p>
                {activeSession.readiness ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-3xl font-semibold text-white">
                          {activeSession.readiness.latestScore}/100
                        </p>
                        <p className="mt-2 text-sm text-gray-300">
                          Latest scored answer. Average {activeSession.readiness.averageScore}/100 across{' '}
                          {activeSession.readiness.attemptCount} answer
                          {activeSession.readiness.attemptCount === 1 ? '' : 's'}.
                        </p>
                      </div>
                      {getReadinessTrendLabel(activeSession.readiness.trend) && (
                        <div
                          className={`rounded-full border px-3 py-1 text-sm font-medium ${getScoreTone(
                            activeSession.readiness.latestScore || 0
                          )}`}
                        >
                          {getReadinessTrendLabel(activeSession.readiness.trend)}
                        </div>
                      )}
                    </div>
                    {activeSession.readiness.weakestAreaLabel && (
                      <p className="mt-4 text-sm text-gray-400">
                        Weakest area: {activeSession.readiness.weakestAreaLabel}
                        {activeSession.readiness.weakestAreaAverage !== null
                          ? ` (${activeSession.readiness.weakestAreaAverage}/5)`
                          : ''}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-gray-400">
                    No readiness score yet. Answer the current mock question and Joblinca will start
                    tracking progress across your scored responses.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Recent Attempts
                </p>
                {activeSession.recentAttempts.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {activeSession.recentAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="rounded-xl border border-gray-700 bg-gray-950/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-white">
                            {attempt.question || 'Mock answer'}
                          </p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getScoreTone(
                              attempt.overallScore
                            )}`}
                          >
                            {attempt.overallScore}/100
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(attempt.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-gray-400">
                    Your scored answer history will appear here after the first mock response.
                  </p>
                )}
              </div>
            </div>

            {activeSession.prep.modelUsed === 'rule_based_v1' && (
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                AI generation was unavailable for this session, so Joblinca built the prep pack
                from deterministic application rules instead.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  60-Second Intro
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-100">
                  {activeSession.prep.elevatorPitch}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Focus Areas
                </p>
                <ul className="mt-3 space-y-3 text-sm text-gray-200">
                  {activeSession.prep.focusAreas.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Likely Questions
              </p>
              <div className="mt-4 space-y-4">
                {activeSession.prep.likelyQuestions.map((item) => (
                  <div
                    key={item.question}
                    className="rounded-xl border border-gray-700 bg-gray-950/50 p-4"
                  >
                    <p className="text-sm font-semibold text-white">{item.question}</p>
                    <p className="mt-2 text-sm text-gray-400">{item.whyItMatters}</p>
                    <ul className="mt-3 space-y-2 text-sm text-gray-200">
                      {item.talkingPoints.map((point) => (
                        <li key={point} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-300" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Stories To Prepare
                </p>
                <div className="mt-4 space-y-4">
                  {activeSession.prep.storiesToPrepare.map((item) => (
                    <div
                      key={item.theme}
                      className="rounded-xl border border-gray-700 bg-gray-950/50 p-4"
                    >
                      <p className="text-sm font-semibold text-white">{item.theme}</p>
                      <p className="mt-2 text-sm text-gray-300">{item.prompt}</p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-400">
                        {item.proofPoints.map((point) => (
                          <li key={point} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-300" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Questions To Ask
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-gray-200">
                    {activeSession.prep.questionsToAsk.map((item) => (
                      <li key={item} className="flex gap-2">
                        <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Risks To Address
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-gray-200">
                    {activeSession.prep.risksToAddress.map((item) => (
                      <li key={item} className="flex gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Final Checklist
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-gray-200">
                    {activeSession.prep.checklist.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Mock Q and A
                  </p>
                  <p className="mt-2 text-sm text-gray-400">
                    Continue the saved practice thread. You can answer the current mock question or
                    ask for a tougher follow-up.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setChatInput('Ask me the next mock question for this interview.')}
                    className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                  >
                    Next question
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatInput('Give feedback on my Tell me about yourself answer.')}
                    className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                  >
                    Feedback on intro
                  </button>
                </div>
              </div>

              {latestFeedback && (
                <div className="mt-5 rounded-2xl border border-gray-700 bg-gray-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Latest Answer Score
                      </p>
                      <p className="mt-2 text-sm text-gray-300">{latestFeedback.summary}</p>
                    </div>
                    <div
                      className={`rounded-full border px-3 py-1 text-sm font-semibold ${getScoreTone(
                        latestFeedback.overallScore
                      )}`}
                    >
                      {latestFeedback.overallScore}/100
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    {getFeedbackMetricCards(latestFeedback).map(({ label, metric }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-gray-800 bg-gray-900/80 p-3"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {label}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {metric.score}/5
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          {metric.note}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        What Worked
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-200">
                        {latestFeedback.strengths.length > 0 ? (
                          latestFeedback.strengths.map((item) => (
                            <li key={item} className="flex gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                              <span>{item}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-gray-400">The coach has not identified standout strengths yet.</li>
                        )}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Improve Next
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-200">
                        {latestFeedback.improvements.length > 0 ? (
                          latestFeedback.improvements.map((item) => (
                            <li key={item} className="flex gap-2">
                              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                              <span>{item}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-gray-400">No follow-up improvements were saved for this answer.</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {latestFeedback.rewrittenAnswer && (
                    <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
                        Stronger Version
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-blue-50">
                        {latestFeedback.rewrittenAnswer}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 space-y-4">
                {activeSession.messages.map((message, index) => (
                  <div
                    key={`${message.timestamp}-${index}`}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-100'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-300">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Mock Interview Coach
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-sm leading-7">
                        {message.content}
                      </div>
                      {message.role === 'assistant' && message.feedback && (
                        <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                              Scored Feedback
                            </p>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getScoreTone(
                                message.feedback.overallScore
                              )}`}
                            >
                              {message.feedback.overallScore}/100
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {getFeedbackMetricCards(message.feedback).map(({ label, metric }) => (
                              <div
                                key={label}
                                className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs text-gray-300"
                              >
                                {label}: {metric.score}/5
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="mt-2 text-[10px] opacity-60">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}

                {isSendingChat && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-gray-800 px-4 py-3 text-sm text-gray-300">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Working on feedback and the next question...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-5 border-t border-gray-700 pt-4">
                <div className="flex gap-3">
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Answer the current mock question or ask for a different one..."
                    rows={3}
                    className="min-h-[96px] flex-1 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                    disabled={isSendingChat}
                  />
                  <button
                    type="button"
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || isSendingChat}
                    className="inline-flex items-center justify-center self-end rounded-2xl bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSendingChat ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
            <div className="rounded-2xl bg-blue-500/10 p-4 text-blue-300">
              <Sparkles className="h-10 w-10" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-white">
              Generate a prep session or reopen a saved one
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-gray-400">
              Each prep session stores the full pack plus the follow-up mock Q and A thread for a
              real Joblinca application.
            </p>

            <div className="mt-8 grid w-full max-w-3xl gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 text-left">
                <p className="text-sm font-semibold text-white">Saved history</p>
                <p className="mt-2 text-sm text-gray-400">
                  Every generated prep pack becomes its own reusable session tied to one
                  application.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 text-left">
                <p className="text-sm font-semibold text-white">Mock follow-up</p>
                <p className="mt-2 text-sm text-gray-400">
                  Keep practicing from the same context instead of starting a new prompt each time.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 text-left">
                <p className="text-sm font-semibold text-white">Job-linked output</p>
                <p className="mt-2 text-sm text-gray-400">
                  The session stays grounded in the exact role, application answers, and interview
                  timing you already saved.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
