'use client';

import {
  summarizeRankingExplanation,
  type ApplicationEligibilityStatus,
} from '@/lib/applications/ranking';
import ExplanationPills from '@/components/applications/ExplanationPills';
import { useTranslation } from '@/lib/i18n/context';
import {
  translateRankingSignalLabel,
  translateRankingSummaryLabel,
} from '@/lib/i18n/recruiter-presentation';

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
  const { t } = useTranslation();
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

  const localizedSignals = explanation.signals.map((signal) => ({
    ...signal,
    label: translateRankingSignalLabel(t, signal.label),
  }));

  return (
    <ExplanationPills
      label={translateRankingSummaryLabel(t, explanation.label)}
      tone={explanation.tone}
      signals={localizedSignals}
      compact={compact}
    />
  );
}
