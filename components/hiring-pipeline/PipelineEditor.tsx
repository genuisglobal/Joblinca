'use client';

import { useEffect, useState } from 'react';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import type { HiringPipelineStage } from '@/lib/hiring-pipeline/types';
import { validatePipelineStageOrder } from '@/lib/hiring-pipeline/validation';

interface PipelineEditorProps {
  pipelineName: string;
  stages: HiringPipelineStage[];
  saving?: boolean;
  onSave: (payload: {
    name: string;
    stages: Array<{
      id: string;
      label: string;
      orderIndex: number;
      allowsFeedback: boolean;
    }>;
  }) => Promise<void> | void;
}

interface EditableStage {
  id: string;
  label: string;
  orderIndex: number;
  allowsFeedback: boolean;
  stageType: string;
}

export default function PipelineEditor({
  pipelineName,
  stages,
  saving = false,
  onSave,
}: PipelineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(pipelineName);
  const [stageDrafts, setStageDrafts] = useState<EditableStage[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    setNameDraft(pipelineName);
  }, [pipelineName]);

  useEffect(() => {
    setStageDrafts(
      stages
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((stage) => ({
          id: stage.id,
          label: stage.label,
          orderIndex: stage.orderIndex,
          allowsFeedback: stage.allowsFeedback,
          stageType: stage.stageType,
        }))
    );
  }, [stages]);

  const moveStage = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= stageDrafts.length) {
      return;
    }

    const reordered = [...stageDrafts];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, removed);

    setStageDrafts(
      reordered.map((stage, orderIndex) => ({
        ...stage,
        orderIndex: orderIndex + 1,
      }))
    );
  };

  const handleSave = async () => {
    const normalizedStages = stageDrafts.map((stage) => ({
      id: stage.id,
      label: stage.label.trim() || 'Untitled stage',
      stageType: stage.stageType,
      isTerminal: stage.stageType === 'hire' || stage.stageType === 'rejected',
      orderIndex: stage.orderIndex,
    }));
    const validation = validatePipelineStageOrder(normalizedStages);

    if (!validation.valid) {
      setStatus({
        type: 'error',
        message: validation.message || 'Invalid pipeline stage ordering.',
      });
      return;
    }

    try {
      await onSave({
        name: nameDraft.trim() || pipelineName,
        stages: stageDrafts.map((stage) => ({
          id: stage.id,
          label: stage.label.trim() || 'Untitled stage',
          orderIndex: stage.orderIndex,
          allowsFeedback: stage.allowsFeedback,
        })),
      });
      setStatus({
        type: 'success',
        message: 'Hiring pipeline saved.',
      });
      setEditing(false);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save hiring pipeline.',
      });
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setNameDraft(pipelineName);
    setStageDrafts(
      stages
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((stage) => ({
          id: stage.id,
          label: stage.label,
          orderIndex: stage.orderIndex,
          allowsFeedback: stage.allowsFeedback,
          stageType: stage.stageType,
        }))
    );
    setStatus(null);
  };

  if (!editing) {
    return (
      <div className="space-y-4">
        {status && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border-green-700/60 bg-green-900/20 text-green-300'
                : 'border-red-700/60 bg-red-900/20 text-red-300'
            }`}
          >
            {status.message}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Pipeline Name
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{pipelineName}</h3>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit Pipeline
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {stages
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((stage) => (
              <div
                key={stage.id}
                className="rounded-xl border border-gray-700 bg-gray-900/30 px-3 py-2"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                  Step {stage.orderIndex}
                </p>
                <div className="mt-1">
                  <StageBadge label={stage.label} stageType={stage.stageType} />
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-green-700/60 bg-green-900/20 text-green-300'
              : 'border-red-700/60 bg-red-900/20 text-red-300'
          }`}
        >
          {status.message}
        </div>
      )}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-400">
          Pipeline Name
        </label>
        <input
          type="text"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        {stageDrafts.map((stage, index) => (
          <div
            key={stage.id}
            className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[220px] flex-1">
                <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
                  Stage {stage.orderIndex}
                </label>
                <input
                  type="text"
                  value={stage.label}
                  onChange={(event) =>
                    setStageDrafts((prev) =>
                      prev.map((item) =>
                        item.id === stage.id
                          ? { ...item, label: event.target.value }
                          : item
                      )
                    )
                  }
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-2">
                  <StageBadge label={stage.label} stageType={stage.stageType} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={stage.allowsFeedback}
                    onChange={(event) =>
                      setStageDrafts((prev) =>
                        prev.map((item) =>
                          item.id === stage.id
                            ? { ...item, allowsFeedback: event.target.checked }
                            : item
                        )
                      )
                    }
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  Feedback
                </label>
                <button
                  onClick={() => moveStage(index, -1)}
                  disabled={index === 0}
                  className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-100 hover:bg-gray-600 disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  onClick={() => moveStage(index, 1)}
                  disabled={index === stageDrafts.length - 1}
                  className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-100 hover:bg-gray-600 disabled:opacity-40"
                >
                  Down
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg bg-gray-700 px-4 py-2 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Pipeline'}
        </button>
      </div>
    </div>
  );
}
