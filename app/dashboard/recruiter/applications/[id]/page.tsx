'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BadgeGrid from '@/app/dashboard/skillup/components/BadgeGrid';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import PipelineProgress from '@/components/hiring-pipeline/PipelineProgress';
import StageTimeline from '@/components/hiring-pipeline/StageTimeline';
import RankingExplanation from '@/components/applications/RankingExplanation';
import InterviewCalendarActions from '@/components/interview-scheduling/InterviewCalendarActions';
import {
  formatDecisionLabel,
  getDecisionTone,
  getRecommendationLabel,
} from '@/lib/hiring-pipeline/presentation';
import type {
  ApplicationCurrentStage,
  ApplicationStageEventView,
  ApplicationStageFeedbackView,
  FeedbackRecommendation,
  HiringPipelineStage,
} from '@/lib/hiring-pipeline/types';
import type {
  ApplicationInterviewSlotView,
  ApplicationInterviewView,
} from '@/lib/interview-scheduling/types';
import {
  DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS,
  findInterviewSlotTemplate,
  formatBlackoutDateSummary,
  formatWeeklyAvailabilitySummary,
  type JobInterviewSelfScheduleSettings,
} from '@/lib/interview-scheduling/self-schedule';
import {
  formatInterviewDateTimeLabel,
  getInterviewModeLabel,
  getInterviewResponseStatusLabel,
  getInterviewSlotStatusLabel,
  getInterviewStatusLabel,
} from '@/lib/interview-scheduling/utils';

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
  current_stage_id: string | null;
  stage_entered_at: string | null;
  decision_status: string | null;
  disposition_reason: string | null;
  overall_stage_score: number | null;
  created_at: string;
  updated_at: string;
  resume_url: string | null;
  candidate_snapshot: Record<string, unknown> | null;
  contact_info: { email?: string; phone?: string } | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  eligibility_reasons: {
    blockingReasons?: string[];
    missingProfileFields?: string[];
    recommendedProfileUpdates?: string[];
    matchedSignals?: string[];
  } | null;
  recruiter_rating: number | null;
  tags: string[];
  viewed_at: string | null;
  is_pinned: boolean;
  is_hidden: boolean;
  ranking_score: number;
  ranking_breakdown: Record<string, number>;
  jobs: Job;
  profiles: Profile;
  current_stage: ApplicationCurrentStage | null;
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

interface InterviewSelfScheduleResponse {
  settings: JobInterviewSelfScheduleSettings;
}

const FEEDBACK_RECOMMENDATION_OPTIONS: {
  value: FeedbackRecommendation;
  label: string;
}[] = [
  { value: 'strong_yes', label: 'Strong yes' },
  { value: 'yes', label: 'Yes' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'no', label: 'No' },
  { value: 'strong_no', label: 'Strong no' },
];

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapCurrentStage(value: any): ApplicationCurrentStage | null {
  const stage = normalizeRelation(value);
  if (!stage) return null;

  return {
    id: stage.id,
    stageKey: stage.stage_key,
    label: stage.label,
    stageType: stage.stage_type,
    orderIndex: stage.order_index,
    isTerminal: stage.is_terminal,
    allowsFeedback: stage.allows_feedback,
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeEligibilityReasons(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      blockingReasons: [] as string[],
      missingProfileFields: [] as string[],
      recommendedProfileUpdates: [] as string[],
      matchedSignals: [] as string[],
    };
  }

  const record = value as Record<string, unknown>;

  return {
    blockingReasons: normalizeStringList(record.blockingReasons),
    missingProfileFields: normalizeStringList(record.missingProfileFields),
    recommendedProfileUpdates: normalizeStringList(record.recommendedProfileUpdates),
    matchedSignals: normalizeStringList(record.matchedSignals),
  };
}

function hasResumeAttachment(application: Application) {
  const resumePath = application.candidate_snapshot?.resumePath;
  return Boolean(application.resume_url || (typeof resumePath === 'string' && resumePath.trim()));
}

function getEligibilityTone(status: Application['eligibility_status']) {
  switch (status) {
    case 'eligible':
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-100',
        label: 'Eligible at submission',
      };
    case 'needs_review':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-100',
        label: 'Eligible, but profile gaps were detected',
      };
    case 'ineligible':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-100',
        label: 'Submitted against an ineligible profile',
      };
    default:
      return {
        bg: 'bg-gray-700/40',
        border: 'border-gray-700',
        text: 'text-gray-200',
        label: 'No eligibility snapshot captured',
      };
  }
}

function getInterviewStatusTone(status: ApplicationInterviewView['status']) {
  switch (status) {
    case 'scheduled':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-100';
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    case 'cancelled':
      return 'border-red-500/30 bg-red-500/10 text-red-100';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
}

function getInterviewResponseTone(
  status: ApplicationInterviewView['candidateResponseStatus']
) {
  switch (status) {
    case 'confirmed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    case 'declined':
      return 'border-red-500/30 bg-red-500/10 text-red-100';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
}

function getInterviewSlotStatusTone(status: ApplicationInterviewSlotView['status']) {
  switch (status) {
    case 'booked':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    case 'cancelled':
      return 'border-red-500/30 bg-red-500/10 text-red-100';
    default:
      return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100';
  }
}

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
  const [pipelineStages, setPipelineStages] = useState<HiringPipelineStage[]>([]);
  const [stageEvents, setStageEvents] = useState<ApplicationStageEventView[]>([]);
  const [stageFeedback, setStageFeedback] = useState<ApplicationStageFeedbackView[]>([]);
  const [interviews, setInterviews] = useState<ApplicationInterviewView[]>([]);
  const [interviewSlots, setInterviewSlots] = useState<ApplicationInterviewSlotView[]>([]);
  const [selfScheduleSettings, setSelfScheduleSettings] =
    useState<JobInterviewSelfScheduleSettings>(
      DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS
    );

  const [applicantBadges, setApplicantBadges] = useState<any[]>([]);
  const [applicantAchievements, setApplicantAchievements] = useState<any[]>([]);

  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [updatingRating, setUpdatingRating] = useState(false);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState('');
  const [feedbackScore, setFeedbackScore] = useState('');
  const [feedbackSummary, setFeedbackSummary] = useState('');
  const [feedbackRecommendation, setFeedbackRecommendation] = useState<
    FeedbackRecommendation | ''
  >('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [decisionReason, setDecisionReason] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [interviewDateTime, setInterviewDateTime] = useState('');
  const [slotRangeStartDate, setSlotRangeStartDate] = useState('');
  const [slotRangeEndDate, setSlotRangeEndDate] = useState('');
  const [interviewMode, setInterviewMode] = useState<'video' | 'phone' | 'onsite' | 'other'>(
    'video'
  );
  const [interviewLocation, setInterviewLocation] = useState('');
  const [interviewMeetingUrl, setInterviewMeetingUrl] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [scheduleNotifications, setScheduleNotifications] = useState(true);
  const [moveToInterviewStage, setMoveToInterviewStage] = useState(true);
  const [schedulingInterview, setSchedulingInterview] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [selectedSlotTemplateId, setSelectedSlotTemplateId] = useState('');
  const [updatingInterviewId, setUpdatingInterviewId] = useState<string | null>(null);
  const [updatingSlotId, setUpdatingSlotId] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const recruiterTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

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
          current_stage:current_stage_id (
            id,
            stage_key,
            label,
            stage_type,
            order_index,
            is_terminal,
            allows_feedback
          ),
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
      const job = normalizeRelation(appData.jobs);
      if (!job || job.recruiter_id !== user.id) {
        console.error('Not authorized to view this application');
        router.replace('/dashboard/recruiter/applications');
        return;
      }

      setApplication({
        ...(appData as Application),
        jobs: job,
        profiles: normalizeRelation(appData.profiles) as Profile,
        current_stage: mapCurrentStage((appData as any).current_stage),
      });

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

      const [
        pipelineResponse,
        feedbackResponse,
        interviewsResponse,
        slotsResponse,
        selfScheduleResponse,
        eventsResult,
      ] =
        await Promise.all([
        fetch(`/api/jobs/${appData.job_id}/pipeline`, { credentials: 'include' }),
        fetch(`/api/applications/${params.id}/feedback`, { credentials: 'include' }),
        fetch(`/api/applications/${params.id}/interviews`, { credentials: 'include' }),
        fetch(`/api/applications/${params.id}/interview-slots`, { credentials: 'include' }),
        fetch(`/api/jobs/${appData.job_id}/interview-self-schedule`, {
          credentials: 'include',
        }),
        supabase
          .from('application_stage_events')
          .select(
            `
            id,
            application_id,
            actor_id,
            from_stage_id,
            to_stage_id,
            transition_reason,
            note,
            metadata,
            created_at,
            from_stage:from_stage_id (
              id,
              stage_key,
              label,
              stage_type,
              order_index,
              is_terminal,
              allows_feedback
            ),
            to_stage:to_stage_id (
              id,
              stage_key,
              label,
              stage_type,
              order_index,
              is_terminal,
              allows_feedback
            )
          `
          )
          .eq('application_id', params.id)
          .order('created_at', { ascending: false }),
        ]);

      if (pipelineResponse.ok) {
        const pipelineData = await pipelineResponse.json();
        setPipelineStages(pipelineData.pipeline?.stages || []);
        const currentStageId = (appData as any).current_stage_id as string | null;
        setSelectedStageId(currentStageId || pipelineData.pipeline?.stages?.[0]?.id || '');
      }

      if (feedbackResponse.ok) {
        const feedbackData = await feedbackResponse.json();
        setStageFeedback(feedbackData.feedback || []);
      }

      if (interviewsResponse.ok) {
        const interviewsData = await interviewsResponse.json();
        setInterviews(interviewsData.interviews || []);
      }

      if (slotsResponse.ok) {
        const slotsData = await slotsResponse.json();
        setInterviewSlots(slotsData.slots || []);
      }

      if (selfScheduleResponse.ok) {
        const selfScheduleData =
          (await selfScheduleResponse.json()) as InterviewSelfScheduleResponse;
        setSelfScheduleSettings(
          selfScheduleData.settings || DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS
        );
      }

      if (!eventsResult.error) {
        const normalizedEvents = (eventsResult.data || []).map((event: any) => ({
          id: event.id,
          applicationId: event.application_id,
          actorId: event.actor_id,
          fromStageId: event.from_stage_id,
          toStageId: event.to_stage_id,
          transitionReason: event.transition_reason,
          note: event.note,
          metadata: event.metadata || {},
          createdAt: event.created_at,
          fromStage: mapCurrentStage(event.from_stage),
          toStage: mapCurrentStage(event.to_stage),
        }));
        setStageEvents(normalizedEvents as ApplicationStageEventView[]);
      }

      // Fetch applicant learning badges
      const { data: badgesData } = await supabase
        .from('user_badges')
        .select('id, badge_type, badge_name, course_slug, issued_at, metadata')
        .eq('user_id', appData.applicant_id)
        .order('issued_at', { ascending: false });

      setApplicantBadges(badgesData || []);

      const { data: achievementsData } = await supabase
        .from('talent_achievements')
        .select('id, title, description, issued_at, metadata')
        .eq('user_id', appData.applicant_id)
        .order('issued_at', { ascending: false })
        .limit(8);

      setApplicantAchievements(achievementsData || []);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load application:', err);
      setLoading(false);
    }
  }, [supabase, router, params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStageMove = async (stageId: string) => {
    if (!application || movingStage || !stageId) return;

    setMovingStage(true);
    try {
      const response = await fetch(`/api/applications/${params.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });

      if (response.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Failed to move stage:', err);
    } finally {
      setMovingStage(false);
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

  const handleFeedbackSubmit = async () => {
    if (!application || savingFeedback) return;

    const parsedScore = feedbackScore.trim() ? Number(feedbackScore) : null;
    if (
      parsedScore !== null &&
      (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100)
    ) {
      return;
    }

    setSavingFeedback(true);
    try {
      const response = await fetch(`/api/applications/${params.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: application.current_stage?.id || null,
          score: parsedScore,
          recommendation: feedbackRecommendation || null,
          summary: feedbackSummary.trim() || null,
          feedback: {
            source: 'recruiter_application_detail',
          },
        }),
      });

      if (response.ok) {
        setFeedbackScore('');
        setFeedbackRecommendation('');
        setFeedbackSummary('');
        await loadData();
      }
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleDecision = async (decisionStatus: 'active' | 'hired' | 'rejected') => {
    if (!application || savingDecision) return;

    setSavingDecision(true);
    try {
      const response = await fetch(`/api/applications/${params.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionStatus,
          dispositionReason: decisionReason.trim() || null,
          note: decisionReason.trim() || null,
        }),
      });

      if (response.ok) {
        if (decisionStatus === 'active') {
          setDecisionReason('');
        }
        await loadData();
      }
    } catch (err) {
      console.error('Failed to record decision:', err);
    } finally {
      setSavingDecision(false);
    }
  };

  const handleScheduleInterview = async () => {
    if (!application || schedulingInterview || !interviewDateTime) return;

    setSchedulingInterview(true);
    setScheduleMessage(null);

    try {
      const response = await fetch(`/api/applications/${params.id}/interviews`, {
        method: editingInterviewId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: editingInterviewId,
          action: editingInterviewId ? 'reschedule' : undefined,
          scheduledAt: new Date(interviewDateTime).toISOString(),
          timezone: recruiterTimezone,
          mode: interviewMode,
          location: interviewLocation.trim() || null,
          meetingUrl: interviewMeetingUrl.trim() || null,
          notes: interviewNotes.trim() || null,
          sendNotifications: scheduleNotifications,
          moveToInterviewStage,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setScheduleMessage({
          type: 'error',
          text:
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to schedule interview',
        });
        return;
      }

      setInterviewDateTime('');
      setInterviewMode('video');
      setInterviewLocation('');
      setInterviewMeetingUrl('');
      setInterviewNotes('');
      setSelectedSlotTemplateId('');
      setEditingInterviewId(null);
      setScheduleMessage({
        type: 'success',
        text: payload.notifications?.delivered
          ? editingInterviewId
            ? 'Interview rescheduled and candidate notifications sent.'
            : 'Interview scheduled and candidate notifications sent.'
          : editingInterviewId
            ? 'Interview rescheduled. No delivery channel was available for the candidate yet.'
            : 'Interview scheduled. No delivery channel was available for the candidate yet.',
      });
      await loadData();
    } catch (err) {
      console.error('Failed to schedule interview:', err);
      setScheduleMessage({
        type: 'error',
        text: 'Failed to schedule interview',
      });
    } finally {
      setSchedulingInterview(false);
    }
  };

  const handleEditInterview = (interview: ApplicationInterviewView) => {
    const date = new Date(interview.scheduledAt);
    const localDateTime = Number.isNaN(date.getTime())
      ? ''
      : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);

    setEditingInterviewId(interview.id);
    setInterviewDateTime(localDateTime);
    setInterviewMode(interview.mode);
    setInterviewLocation(interview.location || '');
    setInterviewMeetingUrl(interview.meetingUrl || '');
    setInterviewNotes(interview.notes || '');
    setSelectedSlotTemplateId('');
    setScheduleNotifications(true);
    setScheduleMessage(null);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedSlotTemplateId(templateId);
    const template = findInterviewSlotTemplate(selfScheduleSettings, templateId);

    if (!template) {
      return;
    }

    setInterviewMode(template.mode);
    setInterviewLocation(template.location || '');
    setInterviewMeetingUrl(template.meetingUrl || '');
    setInterviewNotes(template.notes || '');
  };

  const handleCreateInterviewSlot = async () => {
    if (!interviewDateTime || schedulingInterview) return;

    setSchedulingInterview(true);
    setScheduleMessage(null);

    try {
      const slotPayload = {
        scheduledAt: new Date(interviewDateTime).toISOString(),
        timezone: recruiterTimezone,
        mode: interviewMode,
        location: interviewLocation.trim() || null,
        meetingUrl: interviewMeetingUrl.trim() || null,
        notes: interviewNotes.trim() || null,
        sendInvitation: scheduleNotifications,
      };

      const response = await fetch(`/api/applications/${params.id}/interview-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotPayload),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setScheduleMessage({
          type: 'error',
          text:
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to create interview slot',
        });
        return;
      }

      setInterviewDateTime('');
      setInterviewMode('video');
      setInterviewLocation('');
      setInterviewMeetingUrl('');
      setInterviewNotes('');
      setSelectedSlotTemplateId('');
      setEditingInterviewId(null);
      setScheduleMessage({
        type: 'success',
        text: payload.notifications?.delivered
          ? 'Self-schedule slot created and candidate invitation sent.'
          : 'Self-schedule slot created.',
      });
      await loadData();
    } catch (err) {
      console.error('Failed to create interview slot:', err);
      setScheduleMessage({
        type: 'error',
        text: 'Failed to create interview slot',
      });
    } finally {
      setSchedulingInterview(false);
    }
  };

  const handleGenerateInterviewSlots = async () => {
    if (!selectedSlotTemplateId || !slotRangeStartDate || !slotRangeEndDate || generatingSlots) {
      return;
    }

    setGeneratingSlots(true);
    setScheduleMessage(null);

    try {
      const response = await fetch(
        `/api/applications/${params.id}/interview-slots/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedSlotTemplateId,
            startDate: slotRangeStartDate,
            endDate: slotRangeEndDate,
            sendInvitation: scheduleNotifications,
          }),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setScheduleMessage({
          type: 'error',
          text:
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to generate interview slots',
        });
        return;
      }

      const createdCount = Number(payload.createdCount || 0);
      const skippedCount = Array.isArray(payload.skippedDates) ? payload.skippedDates.length : 0;
      const deliveredCount = Number(payload.notificationDeliveries || 0);

      setScheduleMessage({
        type: 'success',
        text: createdCount === 0
          ? 'No new self-schedule slots were created.'
          : `${createdCount} self-schedule slot${createdCount === 1 ? '' : 's'} created${scheduleNotifications ? `, ${deliveredCount} invitation${deliveredCount === 1 ? '' : 's'} sent` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped because they were already occupied` : ''}.`,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to generate interview slots:', err);
      setScheduleMessage({
        type: 'error',
        text: 'Failed to generate interview slots',
      });
    } finally {
      setGeneratingSlots(false);
    }
  };

  const resetInterviewForm = () => {
    setEditingInterviewId(null);
    setInterviewDateTime('');
    setSlotRangeStartDate('');
    setSlotRangeEndDate('');
    setInterviewMode('video');
    setInterviewLocation('');
    setInterviewMeetingUrl('');
    setInterviewNotes('');
    setSelectedSlotTemplateId('');
    setScheduleNotifications(true);
    setScheduleMessage(null);
  };

  const handleInterviewLifecycleAction = async (
    interviewId: string,
    action: 'cancel' | 'complete' | 'no_show'
  ) => {
    if (updatingInterviewId) return;

    setUpdatingInterviewId(interviewId);
    setScheduleMessage(null);

    try {
      const response = await fetch(`/api/applications/${params.id}/interviews`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId,
          action,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScheduleMessage({
          type: 'error',
          text:
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to update interview',
        });
        return;
      }

      if (editingInterviewId === interviewId) {
        resetInterviewForm();
      }

      const actionLabel =
        action === 'cancel'
          ? 'cancelled'
          : action === 'complete'
            ? 'marked as completed'
            : 'marked as no-show';

      setScheduleMessage({
        type: 'success',
        text:
          action === 'cancel' && payload.notifications?.delivered
            ? 'Interview cancelled and candidate notifications sent.'
            : action === 'complete' && payload.notifications?.delivered
              ? 'Interview marked completed and follow-up sent.'
              : action === 'no_show' && payload.notifications?.delivered
                ? 'Interview marked as no-show and follow-up sent.'
            : `Interview ${actionLabel}.`,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to update interview:', err);
      setScheduleMessage({
        type: 'error',
        text: 'Failed to update interview',
      });
    } finally {
      setUpdatingInterviewId(null);
    }
  };

  const handleCancelInterviewSlot = async (slotId: string) => {
    if (updatingSlotId) return;

    setUpdatingSlotId(slotId);
    setScheduleMessage(null);

    try {
      const response = await fetch(`/api/applications/${params.id}/interview-slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId,
          action: 'cancel',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScheduleMessage({
          type: 'error',
          text:
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to update interview slot',
        });
        return;
      }

      setScheduleMessage({
        type: 'success',
        text: 'Interview slot cancelled.',
      });
      await loadData();
    } catch (err) {
      console.error('Failed to update interview slot:', err);
      setScheduleMessage({
        type: 'error',
        text: 'Failed to update interview slot',
      });
    } finally {
      setUpdatingSlotId(null);
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
      case 'stage_changed':
        return `Stage changed from ${activity.old_value || 'Unknown'} to ${activity.new_value}`;
      case 'note_added':
        return 'Note added';
      case 'feedback_submitted':
        return 'Structured stage feedback submitted';
      case 'scorecard_completed':
        return 'Scorecard completed';
      case 'decision_recorded':
        return `Decision updated to ${activity.new_value}`;
      case 'interview_scheduled':
        return `Interview scheduled for ${activity.new_value || 'candidate'}`;
      case 'interview_rescheduled':
        return `Interview rescheduled to ${activity.new_value || 'candidate'}`;
      case 'interview_cancelled':
        return 'Interview cancelled';
      case 'interview_completed':
        return 'Interview marked as completed';
      case 'interview_no_show':
        return 'Candidate marked as no-show';
      case 'interview_confirmation_sent':
        return 'Interview confirmation sent';
      case 'interview_reschedule_sent':
        return 'Interview reschedule notice sent';
      case 'interview_cancel_notice_sent':
        return 'Interview cancellation notice sent';
      case 'interview_reminder_sent':
        return 'Interview reminder sent';
      case 'interview_candidate_confirmed':
        return 'Candidate confirmed interview attendance';
      case 'interview_candidate_declined':
        return 'Candidate declined the interview slot';
      case 'interview_completion_followup_sent':
        return 'Completed interview follow-up sent';
      case 'interview_no_show_followup_sent':
        return 'No-show follow-up sent';
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

  const currentStage = application.current_stage;
  const nextStage =
    pipelineStages.find((stage) => stage.orderIndex > (currentStage?.orderIndex || 0)) || null;
  const decisionTone = getDecisionTone(application.decision_status || 'active');
  const eligibilityReasons = normalizeEligibilityReasons(application.eligibility_reasons);
  const eligibilityTone = getEligibilityTone(application.eligibility_status);
  const upcomingInterviews = interviews.filter((item) => item.status === 'scheduled');
  const openInterviewSlots = interviewSlots.filter((slot) => slot.status === 'available');

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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white">
              {getApplicantName(application.profiles)}
            </h1>
            <StageBadge
              label={currentStage?.label || 'Unassigned'}
              stageType={currentStage?.stageType || 'applied'}
            />
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${decisionTone.bg} ${decisionTone.text} ${decisionTone.border}`}
            >
              Decision: {formatDecisionLabel(application.decision_status || 'active')}
            </span>
          </div>
          <p className="text-gray-400 mt-1">
            Applied for {application.jobs?.title} on{' '}
            {new Date(application.created_at).toLocaleDateString()}
          </p>
          {application.stage_entered_at && (
            <p className="mt-1 text-xs text-gray-500">
              Current stage since {new Date(application.stage_entered_at).toLocaleString()}
            </p>
          )}
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
          {hasResumeAttachment(application) && (
            <a
              href={`/api/applications/${application.id}/resume`}
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

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Eligibility Snapshot</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Stored from the candidate&apos;s submission so recruiters can see profile gaps and strong signals immediately.
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${eligibilityTone.bg} ${eligibilityTone.border} ${eligibilityTone.text}`}
              >
                {eligibilityTone.label}
              </span>
            </div>

            <div
              className={`mt-5 rounded-xl border p-4 ${eligibilityTone.bg} ${eligibilityTone.border} ${eligibilityTone.text}`}
            >
              <p className="text-sm">
                {application.eligibility_status
                  ? `Eligibility status recorded as ${application.eligibility_status.replace('_', ' ')} when the candidate submitted this application.`
                  : 'This application predates the new eligibility capture flow or was submitted without eligibility diagnostics.'}
              </p>
            </div>

            {(eligibilityReasons.blockingReasons.length > 0 ||
              eligibilityReasons.missingProfileFields.length > 0 ||
              eligibilityReasons.recommendedProfileUpdates.length > 0 ||
              eligibilityReasons.matchedSignals.length > 0) ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {eligibilityReasons.blockingReasons.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <h3 className="text-sm font-medium text-red-200">Blocking reasons</h3>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-100/90">
                      {eligibilityReasons.blockingReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {eligibilityReasons.missingProfileFields.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <h3 className="text-sm font-medium text-amber-200">Missing profile fields</h3>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100/90">
                      {eligibilityReasons.missingProfileFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {eligibilityReasons.recommendedProfileUpdates.length > 0 && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <h3 className="text-sm font-medium text-blue-200">Recommended updates</h3>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-blue-100/90">
                      {eligibilityReasons.recommendedProfileUpdates.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {eligibilityReasons.matchedSignals.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h3 className="text-sm font-medium text-emerald-200">Matched signals</h3>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-emerald-100/90">
                      {eligibilityReasons.matchedSignals.map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                No detailed eligibility reasons were stored for this application.
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Hiring Pipeline</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Current stage, pipeline progress, and movement history.
                </p>
              </div>
              {currentStage && (
                <StageBadge label={currentStage.label} stageType={currentStage.stageType} />
              )}
            </div>
            <PipelineProgress
              stages={pipelineStages}
              currentStage={currentStage}
              className="mt-5"
            />
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Stage Timeline</h3>
              <StageTimeline events={stageEvents} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {editingInterviewId ? 'Interview Reschedule' : 'Interview Scheduling'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Schedule interviews, move candidates into the interview stage, and send confirmations from the ATS.
                </p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-900/40 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Recruiter timezone
                </p>
                <p className="mt-2 text-sm font-medium text-gray-200">{recruiterTimezone}</p>
              </div>
            </div>

            {scheduleMessage && (
              <div
                className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                  scheduleMessage.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                    : 'border-red-500/30 bg-red-500/10 text-red-100'
                }`}
              >
                {scheduleMessage.text}
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Interview date and time
                </label>
                <input
                  type="datetime-local"
                  value={interviewDateTime}
                  onChange={(event) => setInterviewDateTime(event.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Slot template
                </label>
                <select
                  value={selectedSlotTemplateId}
                  onChange={(event) => handleTemplateSelect(event.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">No template</option>
                  {selfScheduleSettings.slotTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  Templates prefill mode, meeting link, and candidate instructions.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Interview mode
                </label>
                <select
                  value={interviewMode}
                  onChange={(event) =>
                    setInterviewMode(
                      event.target.value as 'video' | 'phone' | 'onsite' | 'other'
                    )
                  }
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="video">Video call</option>
                  <option value="phone">Phone call</option>
                  <option value="onsite">On-site</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Location or call notes
                </label>
                <input
                  type="text"
                  value={interviewLocation}
                  onChange={(event) => setInterviewLocation(event.target.value)}
                  placeholder="Office address, room, or call instructions"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Meeting URL
                </label>
                <input
                  type="url"
                  value={interviewMeetingUrl}
                  onChange={(event) => setInterviewMeetingUrl(event.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/35 p-4 text-sm text-gray-300">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Self-schedule policy
              </p>
              <p className="mt-2">
                Timezone:{' '}
                <span className="font-medium text-white">
                  {selfScheduleSettings.timezone}
                </span>
              </p>
              <p className="mt-1">
                Minimum notice:{' '}
                <span className="font-medium text-white">
                  {selfScheduleSettings.minimumNoticeHours} hours
                </span>
              </p>
              <p className="mt-1">
                Slot interval:{' '}
                <span className="font-medium text-white">
                  {selfScheduleSettings.slotIntervalMinutes} minutes
                </span>
              </p>
              <p className="mt-1 text-gray-400">
                {formatWeeklyAvailabilitySummary(selfScheduleSettings)}
              </p>
              <p className="mt-1 text-gray-400">
                {formatBlackoutDateSummary(selfScheduleSettings)}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-indigo-100">
                    Generate slots from range
                  </h3>
                  <p className="mt-1 text-sm text-indigo-100/80">
                    Creates one slot per enabled day in the selected range using the template and weekly start times.
                  </p>
                </div>
                <span className="rounded-full border border-indigo-400/30 px-3 py-1 text-xs font-medium text-indigo-100">
                  Policy-driven
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Range start
                  </label>
                  <input
                    type="date"
                    value={slotRangeStartDate}
                    onChange={(event) => setSlotRangeStartDate(event.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Range end
                  </label>
                  <input
                    type="date"
                    value={slotRangeEndDate}
                    onChange={(event) => setSlotRangeEndDate(event.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleGenerateInterviewSlots}
                  disabled={
                    generatingSlots ||
                    !selectedSlotTemplateId ||
                    !slotRangeStartDate ||
                    !slotRangeEndDate
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingSlots ? 'Generating...' : 'Generate range slots'}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-400">
                Candidate instructions
              </label>
              <textarea
                value={interviewNotes}
                onChange={(event) => setInterviewNotes(event.target.value)}
                rows={3}
                placeholder="Anything the candidate should prepare or bring"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={scheduleNotifications}
                  onChange={(event) => setScheduleNotifications(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-white">Send confirmation now</span>
                  Email and WhatsApp are sent when channels are available.
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={moveToInterviewStage}
                  onChange={(event) => setMoveToInterviewStage(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-white">Move candidate to interview stage</span>
                  Uses the first interview stage configured on this job.
                </span>
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="flex gap-2">
                {editingInterviewId && (
                  <button
                    onClick={resetInterviewForm}
                    className="rounded-lg bg-gray-700 px-4 py-2 text-gray-100 hover:bg-gray-600"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  onClick={handleCreateInterviewSlot}
                  disabled={!interviewDateTime || schedulingInterview || Boolean(editingInterviewId)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {schedulingInterview ? 'Saving...' : 'Add self-schedule slot'}
                </button>
                <button
                  onClick={handleScheduleInterview}
                  disabled={!interviewDateTime || schedulingInterview}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {schedulingInterview
                    ? editingInterviewId
                      ? 'Saving...'
                      : 'Scheduling...'
                    : editingInterviewId
                      ? 'Save interview changes'
                      : 'Schedule interview'}
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-gray-300">Interview history</h3>
                <span className="text-xs text-gray-500">
                  {upcomingInterviews.length} upcoming
                </span>
              </div>
              {interviews.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                  No interviews scheduled yet.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {interviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {formatInterviewDateTimeLabel(
                              interview.scheduledAt,
                              interview.timezone
                            )}
                          </p>
                          <p className="mt-1 text-sm text-gray-400">
                            {getInterviewModeLabel(interview.mode)}
                            {interview.location ? ` · ${interview.location}` : ''}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getInterviewStatusTone(interview.status)}`}
                        >
                          {getInterviewStatusLabel(interview.status)}
                        </span>
                      </div>
                      {interview.meetingUrl && (
                        <a
                          href={interview.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex text-sm text-blue-400 hover:text-blue-300"
                        >
                          Open meeting link
                        </a>
                      )}
                      {interview.status === 'scheduled' && (
                        <InterviewCalendarActions
                          interviewId={interview.id}
                          scheduledAt={interview.scheduledAt}
                          jobTitle={application?.jobs?.title}
                          companyName={application?.jobs?.company_name}
                          modeLabel={getInterviewModeLabel(interview.mode)}
                          location={interview.location}
                          meetingUrl={interview.meetingUrl}
                          notes={interview.notes}
                        />
                      )}
                      {interview.notes && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">
                          {interview.notes}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>
                          Last notice:{' '}
                          {interview.confirmationSentAt
                            ? new Date(interview.confirmationSentAt).toLocaleString()
                            : 'pending'}
                        </span>
                        <span>
                          Reminder:{' '}
                          {interview.reminderSentAt
                            ? new Date(interview.reminderSentAt).toLocaleString()
                            : 'pending'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getInterviewResponseTone(interview.candidateResponseStatus)}`}
                        >
                          Candidate: {getInterviewResponseStatusLabel(interview.candidateResponseStatus)}
                        </span>
                        {interview.candidateRespondedAt && (
                          <span className="text-xs text-gray-500">
                            Updated {new Date(interview.candidateRespondedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {interview.candidateResponseNote && (
                        <p className="mt-3 rounded-lg bg-gray-950/50 p-3 text-sm text-gray-300">
                          {interview.candidateResponseNote}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {interview.status === 'scheduled' && (
                          <>
                            <button
                              onClick={() => handleEditInterview(interview)}
                              className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-600"
                            >
                              Edit / reschedule
                            </button>
                            <button
                              onClick={() =>
                                handleInterviewLifecycleAction(interview.id, 'complete')
                              }
                              disabled={updatingInterviewId === interview.id}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Mark completed
                            </button>
                            <button
                              onClick={() =>
                                handleInterviewLifecycleAction(interview.id, 'no_show')
                              }
                              disabled={updatingInterviewId === interview.id}
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              Mark no-show
                            </button>
                            <button
                              onClick={() =>
                                handleInterviewLifecycleAction(interview.id, 'cancel')
                              }
                              disabled={updatingInterviewId === interview.id}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Cancel interview
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-gray-300">Self-schedule slots</h3>
                <span className="text-xs text-gray-500">
                  {openInterviewSlots.length} open
                </span>
              </div>
              {interviewSlots.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                  No self-schedule slots created yet.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {interviewSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {formatInterviewDateTimeLabel(slot.scheduledAt, slot.timezone)}
                          </p>
                          <p className="mt-1 text-sm text-gray-400">
                            {getInterviewModeLabel(slot.mode)}
                            {slot.location ? ` | ${slot.location}` : ''}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getInterviewSlotStatusTone(slot.status)}`}
                        >
                          {getInterviewSlotStatusLabel(slot.status)}
                        </span>
                      </div>

                      {slot.meetingUrl && (
                        <a
                          href={slot.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex text-sm text-blue-400 hover:text-blue-300"
                        >
                          Open meeting link
                        </a>
                      )}

                      {slot.notes && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">
                          {slot.notes}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>
                          Invitation:{' '}
                          {slot.invitationSentAt
                            ? new Date(slot.invitationSentAt).toLocaleString()
                            : 'pending'}
                        </span>
                        {slot.bookedInterviewId && (
                          <span>Interview created</span>
                        )}
                      </div>

                      {slot.status === 'available' && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleCancelInterviewSlot(slot.id)}
                            disabled={updatingSlotId === slot.id}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {updatingSlotId === slot.id ? 'Cancelling...' : 'Cancel slot'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

          {applicantAchievements.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Challenge Highlights
              </h2>
              <div className="space-y-3">
                {applicantAchievements.map((item) => {
                  const metadata =
                    item.metadata && typeof item.metadata === 'object'
                      ? (item.metadata as Record<string, unknown>)
                      : {};
                  const rank =
                    typeof metadata.rank === 'number' ? `Rank #${metadata.rank}` : null;
                  const week =
                    typeof metadata.week_key === 'string'
                      ? metadata.week_key
                      : null;
                  return (
                    <div key={item.id} className="p-3 rounded-lg bg-gray-700/40">
                      <p className="text-white text-sm font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {[rank, week].filter(Boolean).join(' | ') || 'Challenge achievement'}
                      </p>
                    </div>
                  );
                })}
              </div>
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

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Stage Feedback</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Capture structured recruiter feedback for the current stage.
                </p>
              </div>
              {currentStage && (
                <StageBadge label={currentStage.label} stageType={currentStage.stageType} />
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Stage Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={feedbackScore}
                  onChange={(event) => setFeedbackScore(event.target.value)}
                  placeholder="0 - 100"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Recommendation
                </label>
                <select
                  value={feedbackRecommendation}
                  onChange={(event) =>
                    setFeedbackRecommendation(
                      event.target.value as FeedbackRecommendation | ''
                    )
                  }
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select recommendation</option>
                  {FEEDBACK_RECOMMENDATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-900/35 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Overall stage score
                </p>
                <p className="mt-2 text-3xl font-bold text-blue-300">
                  {application.overall_stage_score?.toFixed(1) || '0.0'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-400">
                Feedback Summary
              </label>
              <textarea
                value={feedbackSummary}
                onChange={(event) => setFeedbackSummary(event.target.value)}
                rows={4}
                placeholder="What did you observe at this stage?"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleFeedbackSubmit}
                disabled={savingFeedback}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingFeedback ? 'Saving...' : 'Save Stage Feedback'}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Feedback History</h3>
              {stageFeedback.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
                  No structured feedback submitted yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {stageFeedback.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {item.stage && (
                          <StageBadge
                            label={item.stage.label}
                            stageType={item.stage.stageType}
                          />
                        )}
                        {typeof item.score === 'number' && (
                          <span className="text-sm font-semibold text-blue-300">
                            Score {item.score.toFixed(1)}
                          </span>
                        )}
                        {item.recommendation && (
                          <span className="text-sm text-gray-300">
                            {getRecommendationLabel(item.recommendation)}
                          </span>
                        )}
                      </div>
                      {item.summary && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">
                          {item.summary}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
          {/* Stage Controls */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Stage Controls</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Current Stage
                </p>
                <div className="mt-2">
                  <StageBadge
                    label={currentStage?.label || 'Unassigned'}
                    stageType={currentStage?.stageType || 'applied'}
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Move to stage
                </label>
                <select
                  value={selectedStageId}
                  onChange={(event) => setSelectedStageId(event.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {pipelineStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.orderIndex}. {stage.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => handleStageMove(selectedStageId)}
                disabled={
                  movingStage ||
                  !selectedStageId ||
                  selectedStageId === currentStage?.id
                }
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {movingStage ? 'Moving...' : 'Move Candidate'}
              </button>
              {nextStage && (
                <button
                  onClick={() => handleStageMove(nextStage.id)}
                  disabled={movingStage}
                  className="w-full rounded-lg bg-gray-700 px-4 py-2 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
                >
                  Quick advance to {nextStage.label}
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Decision</h2>
            <div
              className={`rounded-xl border p-3 ${decisionTone.bg} ${decisionTone.text} ${decisionTone.border}`}
            >
              {formatDecisionLabel(application.decision_status || 'active')}
            </div>
            <textarea
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              rows={3}
              placeholder="Optional decision note or reason"
              className="mt-4 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
            {application.disposition_reason && (
              <p className="mt-3 text-sm text-gray-400">
                Current reason: {application.disposition_reason}
              </p>
            )}
            <div className="mt-4 grid gap-2">
              <button
                onClick={() => handleDecision('hired')}
                disabled={savingDecision}
                className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Mark as hired
              </button>
              <button
                onClick={() => handleDecision('rejected')}
                disabled={savingDecision}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Mark as rejected
              </button>
              <button
                onClick={() => handleDecision('active')}
                disabled={savingDecision}
                className="rounded-lg bg-gray-700 px-4 py-2 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
              >
                Reopen decision
              </button>
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
            <div className="mb-4">
              <RankingExplanation
                rankingScore={application.ranking_score}
                rankingBreakdown={application.ranking_breakdown}
                recruiterRating={application.recruiter_rating}
                overallStageScore={application.overall_stage_score}
                eligibilityStatus={application.eligibility_status}
                decisionStatus={application.decision_status}
                currentStageType={application.current_stage?.stageType || null}
              />
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
