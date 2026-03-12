'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import type { ApplicationCurrentStage } from '@/lib/hiring-pipeline/types';

type Applicant = {
  id: string;
  name: string;
  email: string | null;
};

type Job = {
  id: string;
  title: string;
  companyName: string;
};

type StageOption = {
  id: string;
  stageKey: string;
  label: string;
  stageType: string;
  orderIndex: number;
};

type ApplicationRow = {
  id: string;
  status: string;
  decisionStatus: string | null;
  createdAt: string;
  applicant: Applicant;
  job: Job | null;
  currentStage: ApplicationCurrentStage | null;
};

type CandidateNotification = {
  channel: 'whatsapp';
  status: 'template' | 'text' | 'skipped' | 'failed';
  reason: string | null;
  message: string;
} | null;

function statusClass(status: string): string {
  if (status === 'hired') return 'bg-green-900/30 border-green-700 text-green-300';
  if (status === 'rejected') return 'bg-red-900/30 border-red-700 text-red-300';
  if (status === 'shortlisted' || status === 'interviewed') {
    return 'bg-blue-900/30 border-blue-700 text-blue-300';
  }
  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

function decisionLabel(value: string | null): string | null {
  if (!value || value === 'active') return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildInitialSelectedStage(
  app: ApplicationRow,
  stageOptions: StageOption[]
): string {
  const currentStage = app.currentStage;
  if (!currentStage) {
    return stageOptions[0]?.id || '';
  }

  const nextStage =
    stageOptions.find((stage) => stage.orderIndex > currentStage.orderIndex) || null;

  return nextStage?.id || currentStage.id;
}

function nextStageIdAfter(
  currentStageId: string | null,
  stageOptions: StageOption[]
): string {
  const currentIndex = stageOptions.findIndex((stage) => stage.id === currentStageId);
  if (currentIndex === -1) {
    return currentStageId || stageOptions[0]?.id || '';
  }

  return stageOptions[currentIndex + 1]?.id || currentStageId || '';
}

export default function AdminApplicationsClient({
  initialApplications,
  stageOptionsByJobId,
  loadError,
}: {
  initialApplications: ApplicationRow[];
  stageOptionsByJobId: Record<string, StageOption[]>;
  loadError: string | null;
}) {
  const [applications, setApplications] = useState<ApplicationRow[]>(initialApplications);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedbackById, setFeedbackById] = useState<
    Record<string, { tone: 'success' | 'warning' | 'error'; message: string }>
  >({});
  const [selectedStageById, setSelectedStageById] = useState<Record<string, string>>({});

  useEffect(() => {
    setApplications(initialApplications);
    setSelectedStageById(
      Object.fromEntries(
        initialApplications.map((app) => [
          app.id,
          buildInitialSelectedStage(app, stageOptionsByJobId[app.job?.id || ''] || []),
        ])
      )
    );
  }, [initialApplications, stageOptionsByJobId]);

  const rows = useMemo(() => applications, [applications]);

  async function moveApplication(appId: string) {
    const application = rows.find((row) => row.id === appId);
    if (!application) return;

    const targetStageId = selectedStageById[appId];
    if (!targetStageId) return;

    setUpdatingId(appId);
    setFeedbackById((prev) => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });

    try {
      const response = await fetch(`/api/applications/${appId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: targetStageId }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to move application');
      }

      const nextStage = payload?.toStage
        ? {
            id: payload.toStage.id,
            stageKey: payload.toStage.stage_key,
            label: payload.toStage.label,
            stageType: payload.toStage.stage_type,
            orderIndex: payload.toStage.order_index,
            isTerminal: payload.toStage.is_terminal,
            allowsFeedback: payload.toStage.allows_feedback,
          }
        : application.currentStage;

      setApplications((prev) =>
        prev.map((row) =>
          row.id === appId
            ? {
                ...row,
                status: payload?.legacyStatus || row.status,
                decisionStatus: payload?.application?.decision_status ?? row.decisionStatus,
                currentStage: nextStage,
              }
            : row
        )
      );

      const stageOptions = stageOptionsByJobId[application.job?.id || ''] || [];
      setSelectedStageById((prev) => ({
        ...prev,
        [appId]: nextStageIdAfter(nextStage?.id || null, stageOptions),
      }));

      const notification = (payload?.candidateNotification || null) as CandidateNotification;
      const tone =
        notification?.status === 'failed'
          ? 'error'
          : notification?.status === 'skipped'
            ? 'warning'
            : 'success';
      const baseMessage = nextStage ? `Moved to ${nextStage.label}.` : 'Application updated.';

      setFeedbackById((prev) => ({
        ...prev,
        [appId]: {
          tone,
          message: notification?.message ? `${baseMessage} ${notification.message}` : baseMessage,
        },
      }));
    } catch (error) {
      setFeedbackById((prev) => ({
        ...prev,
        [appId]: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Failed to move application',
        },
      }));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      {loadError && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load applications: {loadError}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Applicant</th>
              <th className="p-4 text-left text-gray-400 font-medium">Job</th>
              <th className="p-4 text-left text-gray-400 font-medium">Stage</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Applied</th>
              <th className="p-4 text-left text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const stageOptions = stageOptionsByJobId[row.job?.id || ''] || [];
              const selectedStageId = selectedStageById[row.id] || '';
              const stageMessage = feedbackById[row.id] || null;
              const isUpdating = updatingId === row.id;
              const currentStageId = row.currentStage?.id || null;
              const canMove =
                Boolean(selectedStageId) && selectedStageId !== currentStageId && !isUpdating;

              return (
                <tr key={row.id} className="border-b border-gray-700/50 align-top hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{row.applicant.name}</p>
                    <p className="text-gray-400 text-sm">{row.applicant.email ?? row.id}</p>
                  </td>
                  <td className="p-4">
                    {row.job ? (
                      <>
                        <Link
                          href={`/admin/jobs/${row.job.id}`}
                          className="text-gray-200 hover:text-white"
                        >
                          {row.job.title}
                        </Link>
                        <p className="text-gray-400 text-sm">{row.job.companyName}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-200">Unknown job</p>
                        <p className="text-gray-400 text-sm">Job record unavailable</p>
                      </>
                    )}
                  </td>
                  <td className="p-4">
                    {row.currentStage ? (
                      <div className="space-y-2">
                        <StageBadge
                          label={row.currentStage.label}
                          stageType={row.currentStage.stageType}
                        />
                        {decisionLabel(row.decisionStatus) && (
                          <p className="text-xs text-gray-500">
                            Decision: {decisionLabel(row.decisionStatus)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Unassigned</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full border text-xs ${statusClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 hidden lg:table-cell">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 min-w-[280px]">
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 xl:flex-row">
                        <select
                          value={selectedStageId}
                          onChange={(event) =>
                            setSelectedStageById((prev) => ({
                              ...prev,
                              [row.id]: event.target.value,
                            }))
                          }
                          disabled={stageOptions.length === 0 || isUpdating}
                          className="min-w-[180px] rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {stageOptions.length === 0 ? (
                            <option value="">No pipeline stages</option>
                          ) : (
                            stageOptions.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.label}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => moveApplication(row.id)}
                          disabled={!canMove}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUpdating ? 'Updating...' : 'Move candidate'}
                        </button>
                      </div>
                      {stageMessage && (
                        <p
                          className={`text-xs ${
                            stageMessage.tone === 'error'
                              ? 'text-red-300'
                              : stageMessage.tone === 'warning'
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {stageMessage.message}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
