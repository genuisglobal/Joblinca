'use client';

import StageBadge from '@/components/hiring-pipeline/StageBadge';
import type { ApplicationStageEventView } from '@/lib/hiring-pipeline/types';

interface StageTimelineProps {
  events: ApplicationStageEventView[];
}

export default function StageTimeline({ events }: StageTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
        No stage movement recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-400" />
            <div className="mt-2 h-full w-px bg-gray-700 last:hidden" />
          </div>
          <div className="flex-1 rounded-xl border border-gray-700 bg-gray-900/35 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {event.fromStage && (
                <>
                  <StageBadge
                    label={event.fromStage.label}
                    stageType={event.fromStage.stageType}
                  />
                  <span className="text-gray-500">to</span>
                </>
              )}
              {event.toStage && (
                <StageBadge label={event.toStage.label} stageType={event.toStage.stageType} />
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {new Date(event.createdAt).toLocaleString()}
            </p>
            {event.transitionReason && (
              <p className="mt-3 text-sm text-gray-300">{event.transitionReason}</p>
            )}
            {event.note && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-400">{event.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
