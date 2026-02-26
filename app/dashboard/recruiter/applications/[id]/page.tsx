'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '../../../components/StatusBadge';
import BadgeGrid from '@/app/dashboard/skillup/components/BadgeGrid';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  location: string | null;
  recruiter_id: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  answers: unknown[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  resume_url: string | null;
  contact_info: { email?: string; phone?: string } | null;
  recruiter_rating: number | null;
  tags: string[];
  viewed_at: string | null;
  is_pinned: boolean;
  is_hidden: boolean;
  ranking_score: number;
  ranking_breakdown: Record<string, number>;
  jobs: Job;
  profiles: Profile;
}

interface Note {
  id: string;
  application_id: string;
  recruiter_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  application_id: string;
  actor_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface AIInsights {
  id: string;
  match_score: number | null;
  strengths: string[];
  gaps: string[];
  reasoning: string | null;
  parsed_profile: Record<string, unknown>;
  status: string;
  error_message: string | null;
}

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'shortlisted', label: 'Shortlisted', color: 'yellow' },
  { value: 'interviewed', label: 'Interviewed', color: 'purple' },
  { value: 'hired', label: 'Hired', color: 'green' },
  { value: 'rejected', label: 'Rejected', color: 'red' },
];

export default function ApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<Application | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);

  const [applicantBadges, setApplicantBadges] = useState<any[]>([]);

  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingRating, setUpdatingRating] = useState(false);
  const [analyzingAI, setAnalyzingAI] = useState(false);

  // Load application data
  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace('/auth/login');
        return;
      }

      // Fetch application with related data
      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(
          `
          *,
          jobs:job_id (
            id,
            title,
            company_name,
            description,
            location,
            recruiter_id
          ),
          profiles:applicant_id (
            id,
            full_name,
            first_name,
            last_name,
            avatar_url,
            phone
          )
        `
        )
        .eq('id', params.id)
        .single();

      if (appError || !appData) {
        console.error('Application not found:', appError);
        router.replace('/dashboard/recruiter/applications');
        return;
      }

      // Verify ownership
      if (appData.jobs?.recruiter_id !== user.id) {
        console.error('Not authorized to view this application');
        router.replace('/dashboard/recruiter/applications');
        return;
      }

      setApplication(appData as Application);

      // Mark as viewed if not already
      if (!appData.viewed_at) {
        await supabase
          .from('applications')
          .update({ viewed_at: new Date().toISOString() })
          .eq('id', params.id);
      }

      // Fetch notes
      const { data: notesData } = await supabase
        .from('application_notes')
        .select('*')
        .eq('application_id', params.id)
        .order('created_at', { ascending: false });

      setNotes(notesData || []);

      // Fetch activity
      const { data: activityData } = await supabase
        .from('application_activity')
        .select('*')
        .eq('application_id', params.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setActivities(activityData || []);

      // Fetch AI insights
      const { data: aiData } = await supabase
        .from('ai_application_insights')
        .select('*')
        .eq('application_id', params.id)
        .single();

      setAiInsights(aiData);

      // Fetch applicant learning badges
      const { data: badgesData } = await supabase
        .from('user_badges')
        .select('id, badge_type, badge_name, course_slug, issued_at, metadata')
        .eq('user_id', appData.applicant_id)
        .order('issued_at', { ascending: false });

      setApplicantBadges(badgesData || []);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load application:', err);
      setLoading(false);
    }
  }, [supabase, router, params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update status
  const handleStatusUpdate = async (newStatus: string) => {
    if (!application || updatingStatus) return;

    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/applications/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setApplication({ ...application, status: newStatus });
        // Reload activities
        const { data: activityData } = await supabase
          .from('application_activity')
          .select('*')
          .eq('application_id', params.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setActivities(activityData || []);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Update rating
  const handleRatingUpdate = async (rating: number) => {
    if (!application || updatingRating) return;

    setUpdatingRating(true);
    try {
      await supabase
        .from('applications')
        .update({ recruiter_rating: rating })
        .eq('id', params.id);

      setApplication({ ...application, recruiter_rating: rating });
    } catch (err) {
      console.error('Failed to update rating:', err);
    } finally {
      setUpdatingRating(false);
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim() || addingNote) return;

    setAddingNote(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: noteData, error } = await supabase
        .from('application_notes')
        .insert({
          application_id: params.id,
          recruiter_id: user.id,
          content: newNote.trim(),
        })
        .select()
        .single();

      if (noteData && !error) {
        setNotes([noteData, ...notes]);
        setNewNote('');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Toggle pinned
  const handleTogglePin = async () => {
    if (!application) return;

    const newPinned = !application.is_pinned;
    await supabase
      .from('applications')
      .update({ is_pinned: newPinned })
      .eq('id', params.id);

    setApplication({ ...application, is_pinned: newPinned });
  };

  // Trigger AI analysis
  const handleAIAnalysis = async () => {
    if (analyzingAI) return;

    setAnalyzingAI(true);
    try {
      const response = await fetch('/api/ai/analyze-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: params.id }),
      });

      if (response.ok) {
        // Reload AI insights
        const { data: aiData } = await supabase
          .from('ai_application_insights')
          .select('*')
          .eq('application_id', params.id)
          .single();

        setAiInsights(aiData);
      }
    } catch (err) {
      console.error('AI analysis failed:', err);
    } finally {
      setAnalyzingAI(false);
    }
  };

  // Helper functions
  function getApplicantName(profile: Profile | null): string {
    if (!profile) return 'Unknown';
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  }

  function formatActivityAction(activity: Activity): string {
    switch (activity.action) {
      case 'created':
        return 'Application submitted';
      case 'status_changed':
        return `Status changed from ${activity.old_value} to ${activity.new_value}`;
      case 'note_added':
        return 'Note added';
      case 'rating_changed':
        return `Rating changed to ${activity.new_value} stars`;
      case 'viewed':
        return 'Application viewed';
      case 'pinned':
        return 'Application pinned';
      case 'unpinned':
        return 'Application unpinned';
      case 'ai_analyzed':
        return 'AI analysis completed';
      default:
        return activity.action;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading application...</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/recruiter/applications"
            className="text-gray-400 hover:text-white text-sm mb-2 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Applications
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">
              {getApplicantName(application.profiles)}
            </h1>
            <StatusBadge status={application.status} />
          </div>
          <p className="text-gray-400 mt-1">
            Applied for {application.jobs?.title} on{' '}
            {new Date(application.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePin}
            className={`p-2 rounded-lg transition-colors ${
              application.is_pinned
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title={application.is_pinned ? 'Unpin' : 'Pin'}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
          {application.resume_url && (
            <a
              href={application.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View CV
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applicant Info */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Applicant Information</h2>
            <div className="flex items-start gap-4">
              {application.profiles?.avatar_url ? (
                <img
                  src={application.profiles.avatar_url}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                  {getApplicantName(application.profiles).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-xl font-medium text-white">
                  {getApplicantName(application.profiles)}
                </h3>
                <div className="mt-2 space-y-1 text-gray-400">
                  {application.contact_info?.email && (
                    <p className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {application.contact_info.email}
                    </p>
                  )}
                  {(application.contact_info?.phone || application.profiles?.phone) && (
                    <p className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {application.contact_info?.phone || application.profiles?.phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Applicant Learning Badges */}
          {applicantBadges.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Learning Badges</h2>
              <BadgeGrid badges={applicantBadges} compact />
              <p className="text-xs text-gray-500 mt-3">
                Badges earned through Joblinca&apos;s Skill Up learning hub.
              </p>
            </div>
          )}

          {/* Cover Letter */}
          {application.cover_letter && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cover Letter</h2>
              <p className="text-gray-300 whitespace-pre-wrap">{application.cover_letter}</p>
            </div>
          )}

          {/* Custom Answers */}
          {application.answers && application.answers.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Screening Answers</h2>
              <div className="space-y-4">
                {application.answers.map((answer: any, index: number) => (
                  <div key={index} className="border-b border-gray-700 pb-4 last:border-0">
                    <p className="text-sm text-gray-400 mb-1">
                      {answer.question || `Question ${index + 1}`}
                    </p>
                    <p className="text-white">
                      {typeof answer.answer === 'boolean'
                        ? answer.answer ? 'Yes' : 'No'
                        : Array.isArray(answer.answer)
                          ? answer.answer.join(', ')
                          : String(answer.answer || '-')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">AI Analysis</h2>
              <button
                onClick={handleAIAnalysis}
                disabled={analyzingAI}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {analyzingAI ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Analyzing...
                  </>
                ) : aiInsights?.status === 'completed' ? (
                  'Re-analyze'
                ) : (
                  'Analyze with AI'
                )}
              </button>
            </div>

            {aiInsights?.status === 'completed' ? (
              <div className="space-y-4">
                {/* Match Score */}
                {aiInsights.match_score !== null && (
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-4xl font-bold ${
                        aiInsights.match_score >= 80
                          ? 'text-green-400'
                          : aiInsights.match_score >= 60
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {aiInsights.match_score}%
                    </div>
                    <p className="text-gray-400">Match Score</p>
                  </div>
                )}

                {/* Strengths */}
                {aiInsights.strengths && aiInsights.strengths.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-green-400 mb-2">Strengths</h3>
                    <ul className="space-y-1">
                      {aiInsights.strengths.map((s, i) => (
                        <li key={i} className="text-gray-300 flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Gaps */}
                {aiInsights.gaps && aiInsights.gaps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-yellow-400 mb-2">Areas to Consider</h3>
                    <ul className="space-y-1">
                      {aiInsights.gaps.map((g, i) => (
                        <li key={i} className="text-gray-300 flex items-start gap-2">
                          <svg className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Reasoning */}
                {aiInsights.reasoning && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Analysis</h3>
                    <p className="text-gray-300">{aiInsights.reasoning}</p>
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-4">
                  AI suggestions are assistive only and should not be used as the sole basis for hiring decisions.
                </p>
              </div>
            ) : aiInsights?.status === 'failed' ? (
              <div className="text-center py-8">
                <p className="text-red-400 mb-2">Analysis failed</p>
                <p className="text-sm text-gray-400">{aiInsights.error_message}</p>
              </div>
            ) : aiInsights?.status === 'processing' ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-400">Analysis in progress...</p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p>No AI analysis yet.</p>
                <p className="text-sm mt-1">Click the button above to analyze this application.</p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Notes</h2>

            {/* Add Note Form */}
            <div className="mb-6">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note about this candidate..."
                rows={3}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes List */}
            {notes.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No notes yet.</p>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="border-l-2 border-blue-500 pl-4 py-2">
                    <p className="text-gray-300 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Update Status</h2>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusUpdate(opt.value)}
                  disabled={updatingStatus || application.status === opt.value}
                  className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                    application.status === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  } ${updatingStatus ? 'opacity-50' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Your Rating</h2>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRatingUpdate(star)}
                  disabled={updatingRating}
                  className={`p-1 transition-colors ${updatingRating ? 'opacity-50' : ''}`}
                >
                  <svg
                    className={`w-8 h-8 ${
                      star <= (application.recruiter_rating || 0)
                        ? 'text-yellow-400'
                        : 'text-gray-600 hover:text-yellow-400'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Ranking Score */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Ranking Score</h2>
            <div className="text-3xl font-bold text-blue-400 mb-4">
              {application.ranking_score?.toFixed(1) || 0}
            </div>
            {application.ranking_breakdown && Object.keys(application.ranking_breakdown).length > 0 && (
              <div className="space-y-2 text-sm">
                {Object.entries(application.ranking_breakdown).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-gray-400">
                    <span className="capitalize">{key.replace('_', ' ')}</span>
                    <span className="text-white">{typeof value === 'number' ? value.toFixed(1) : value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Job Info */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Job Details</h2>
            <div className="space-y-2">
              <p className="text-white font-medium">{application.jobs?.title}</p>
              {application.jobs?.company_name && (
                <p className="text-gray-400">{application.jobs.company_name}</p>
              )}
              {application.jobs?.location && (
                <p className="text-gray-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {application.jobs.location}
                </p>
              )}
              <Link
                href={`/dashboard/recruiter/jobs/${application.job_id}`}
                className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-1 mt-2"
              >
                View Job
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Activity</h2>
            {activities.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="border-l-2 border-gray-700 pl-3 py-1">
                    <p className="text-sm text-gray-300">
                      {formatActivityAction(activity)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
