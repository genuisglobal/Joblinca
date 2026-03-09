'use client';

import StageBadge from '@/components/hiring-pipeline/StageBadge';
import type { ApplicationCurrentStage, HiringPipelineStage } from '@/lib/hiring-pipeline/types';

interface PipelineProgressProps {
  stages: HiringPipelineStage[];
  currentStage: ApplicationCurrentStage | null;
  className?: string;
}

export default function PipelineProgress({
  stages,
  currentStage,
  className = '',
}: PipelineProgressProps) {
  if (stages.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {stages.map((stage) => {
        const isActive = currentStage?.id === stage.id;

        return (
          <div
            key={stage.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              isActive
                ? 'border-blue-500/60 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900/40'
            }`}
          >
            <span
              className={`text-[11px] font-semibold ${
                isActive ? 'text-blue-300' : 'text-gray-500'
              }`}
            >
              {stage.orderIndex}
            </span>
            <StageBadge label={stage.label} stageType={stage.stageType} />
          </div>
        );
      })}
    </div>
  );
}
