'use client';

import {
  summarizeRankingExplanation,
  type ApplicationEligibilityStatus,
} from '@/lib/applications/ranking';
import ExplanationPills from '@/components/applications/ExplanationPills';

type RankingBreakdown = Record<string, number> | null | undefined;

interface RankingExplanationProps {
  rankingScore?: number | null;
  rankingBreakdown?: RankingBreakdown;
  recruiterRating?: number | null;
  overallStageScore?: number | null;
  eligibilityStatus?: ApplicationEligibilityStatus;
  decisionStatus?: string | null;
  currentStageType?: string | null;
  compact?: boolean;
}

export default function RankingExplanation({
  rankingScore,
  rankingBreakdown,
  recruiterRating,
  overallStageScore,
  eligibilityStatus,
  decisionStatus,
  currentStageType,
  compact = false,
}: RankingExplanationProps) {
  const explanation = summarizeRankingExplanation({
    rankingScore,
    rankingBreakdown,
    recruiterRating,
    overallStageScore,
    eligibilityStatus,
    decisionStatus,
    currentStageType,
  });

  if (explanation.signals.length === 0) {
    return null;
  }

  return (
    <ExplanationPills
      label={explanation.label}
      tone={explanation.tone}
      signals={explanation.signals}
      compact={compact}
    />
  );
}
