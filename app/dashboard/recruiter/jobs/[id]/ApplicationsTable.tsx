'use client';

import { useEffect, useMemo, useState } from 'react';
import { CustomQuestion, QuestionAnswer } from '@/lib/questions';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import PipelineProgress from '@/components/hiring-pipeline/PipelineProgress';
import EligibilityBadge from '@/components/applications/EligibilityBadge';
import RankingExplanation from '@/components/applications/RankingExplanation';
import type { ApplicationCurrentStage, HiringPipelineStage } from '@/lib/hiring-pipeline/types';

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  answers: QuestionAnswer[] | null;
  status: string;
  created_at: string;
  current_stage_id: string | null;
  stage_entered_at: string | null;
  decision_status: string | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  overall_stage_score: number | null;
  recruiter_rating?: number | null;
  ranking_score?: number | null;
  ranking_breakdown?: Record<string, number> | null;
  current_stage: ApplicationCurrentStage | null;
  profiles: Profile;
}

interface ApplicationsTableProps {
  applications: Application[];
  jobId: string;
  pipelineStages: HiringPipelineStage[];
  customQuestions?: CustomQuestion[] | null;
}

export default function ApplicationsTable({
  applications,
  pipelineStages,
  customQuestions,
}: ApplicationsTableProps) {
  const [appState, setAppState] = useState<
    Record<
      string,
      {
        status: string;
        currentStage: ApplicationCurrentStage | null;
        decisionStatus: string | null;
      }
    >
  >(
    Object.fromEntries(
      applications.map((app) => [
        app.id,
        {
          status: app.status,
          currentStage: app.current_stage,
          decisionStatus: app.decision_status,
        },
      ])
    )
  );
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [targetStageByApp, setTargetStageByApp] = useState<Record<string, string>>(
    Object.fromEntries(
      applications.map((app) => [app.id, app.current_stage?.id || pipelineStages[0]?.id || ''])
    )
  );

  const stageOptions = useMemo(
    () =>
      pipelineStages.map((stage) => ({
        value: stage.id,
        label: stage.label,
      })),
    [pipelineStages]
  );

  useEffect(() => {
    setAppState(
      Object.fromEntries(
        applications.map((app) => [
          app.id,
          {
            status: app.status,
            currentStage: app.current_stage,
            decisionStatus: app.decision_status,
          },
        ])
      )
    );

    setTargetStageByApp(
      Object.fromEntries(
        applications.map((app) => [
          app.id,
          app.current_stage?.id || pipelineStages[0]?.id || '',
        ])
      )
    );
  }, [applications, pipelineStages]);

  const moveStage = async (appId: string, stageId: string) => {
    setUpdating(appId);
    try {
      const response = await fetch(`/api/applications/${appId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });

      if (response.ok) {
        const result = await response.json();
        setAppState((prev) => ({
          ...prev,
          [appId]: {
            ...prev[appId],
            status: result.legacyStatus,
            currentStage: result.toStage
              ? {
                  id: result.toStage.id,
                  stageKey: result.toStage.stage_key,
                  label: result.toStage.label,
                  stageType: result.toStage.stage_type,
                  orderIndex: result.toStage.order_index,
                  isTerminal: result.toStage.is_terminal,
                  allowsFeedback: result.toStage.allows_feedback,
                }
              : prev[appId]?.currentStage || null,
          },
        }));
        setTargetStageByApp((prev) => ({
          ...prev,
          [appId]: result.toStage?.id || stageId,
        }));
      }
    } catch (error) {
      console.error('Failed to move stage:', error);
    } finally {
      setUpdating(null);
    }
  };

  const getCurrentStage = (app: Application) => appState[app.id]?.currentStage || app.current_stage;

  const getNextStage = (app: Application) => {
    const currentStage = getCurrentStage(app);
    if (!currentStage) {
      return pipelineStages[0] || null;
    }

    return (
      pipelineStages.find((stage) => stage.orderIndex > currentStage.orderIndex) || null
    );
  };

  const getApplicantName = (profile: Profile) => {
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  };

  if (applications.length === 0) {
    return (
      <div className="text-center py-12">
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-white mb-2">
          No applications yet
        </h3>
        <p className="text-gray-400">
          Applications will appear here once candidates start applying.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {applications.map((app) => (
        <div
          key={app.id}
          className="border border-gray-700 rounded-lg overflow-hidden"
        >
          <div
            className="flex items-center justify-between p-4 bg-gray-700/30 cursor-pointer hover:bg-gray-700/50"
            onClick={() =>
              setExpandedApp(expandedApp === app.id ? null : app.id)
            }
          >
            <div className="flex items-center gap-4">
              {app.profiles?.avatar_url ? (
                <img
                  src={app.profiles.avatar_url}
                  alt="Applicant"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                </div>
              )}
                <div>
                  <p className="font-medium text-white">
                    {getApplicantName(app.profiles)}
                  </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-gray-400">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>
                  <EligibilityBadge status={app.eligibility_status} compact />
                  {typeof app.overall_stage_score === 'number' && app.overall_stage_score > 0 && (
                    <span className="text-xs text-gray-500">
                      Stage score {app.overall_stage_score.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <RankingExplanation
                    compact
                    rankingScore={app.ranking_score}
                    rankingBreakdown={app.ranking_breakdown}
                    recruiterRating={app.recruiter_rating}
                    overallStageScore={app.overall_stage_score}
                    eligibilityStatus={app.eligibility_status}
                    decisionStatus={app.decision_status}
                    currentStageType={getCurrentStage(app)?.stageType || null}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <StageBadge
                label={getCurrentStage(app)?.label || 'Unassigned'}
                stageType={getCurrentStage(app)?.stageType || 'applied'}
              />
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedApp === app.id ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          {expandedApp === app.id && (
            <div className="p-4 border-t border-gray-700 space-y-4">
              {/* Cover Letter */}
              {app.cover_letter && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Cover Letter
                  </h4>
                  <p className="text-gray-300 whitespace-pre-wrap bg-gray-900 p-4 rounded-lg">
                    {app.cover_letter}
                  </p>
                </div>
              )}

              {/* Custom Answers */}
              {app.answers && app.answers.length > 0 && customQuestions && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Screening Questions
                  </h4>
                  <div className="bg-gray-900 p-4 rounded-lg space-y-4">
                    {app.answers.map((answerObj) => {
                      const question = customQuestions.find(
                        (q) => q.id === answerObj.questionId
                      );
                      if (!question) return null;

                      let displayAnswer: string;
                      if (typeof answerObj.answer === 'boolean') {
                        displayAnswer = answerObj.answer ? 'Yes' : 'No';
                      } else if (Array.isArray(answerObj.answer)) {
                        displayAnswer = answerObj.answer.join(', ');
                      } else {
                        displayAnswer = String(answerObj.answer);
                      }

                      return (
                        <div key={answerObj.questionId}>
                          <p className="text-sm text-gray-400 mb-1">
                            {question.question}
                            {question.required && (
                              <span className="text-red-400 ml-1">*</span>
                            )}
                          </p>
                          <p className="text-gray-300">{displayAnswer || '-'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status Update */}
              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-2">Stage Progress</h4>
                <PipelineProgress stages={pipelineStages} currentStage={getCurrentStage(app)} />
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Eligibility Snapshot</h4>
                <div className="flex flex-wrap items-center gap-3">
                  <EligibilityBadge status={app.eligibility_status} />
                  {typeof app.ranking_score === 'number' && app.ranking_score > 0 && (
                    <span className="text-sm text-gray-400">
                      Ranking {app.ranking_score.toFixed(1)}
                    </span>
                  )}
                  {typeof app.overall_stage_score === 'number' && app.overall_stage_score > 0 && (
                    <span className="text-sm text-gray-400">
                      Stage score {app.overall_stage_score.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <RankingExplanation
                    rankingScore={app.ranking_score}
                    rankingBreakdown={app.ranking_breakdown}
                    recruiterRating={app.recruiter_rating}
                    overallStageScore={app.overall_stage_score}
                    eligibilityStatus={app.eligibility_status}
                    decisionStatus={app.decision_status}
                    currentStageType={getCurrentStage(app)?.stageType || null}
                  />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-2">
                  Move Candidate
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={targetStageByApp[app.id] || getCurrentStage(app)?.id || ''}
                    onChange={(event) =>
                      setTargetStageByApp((prev) => ({
                        ...prev,
                        [app.id]: event.target.value,
                      }))
                    }
                    className="min-w-[220px] rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => moveStage(app.id, targetStageByApp[app.id])}
                    disabled={
                      updating === app.id ||
                      !targetStageByApp[app.id] ||
                      targetStageByApp[app.id] === getCurrentStage(app)?.id
                    }
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updating === app.id ? 'Moving...' : 'Move to stage'}
                  </button>
                  {getNextStage(app) && (
                    <button
                      onClick={() => moveStage(app.id, getNextStage(app)!.id)}
                      disabled={updating === app.id}
                      className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next: {getNextStage(app)!.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
