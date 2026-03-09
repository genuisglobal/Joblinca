import type { FeedbackRecommendation } from '@/lib/hiring-pipeline/types';

type Tone = {
  bg: string;
  text: string;
  border: string;
  ring: string;
};

const DEFAULT_TONE: Tone = {
  bg: 'bg-gray-700/40',
  text: 'text-gray-200',
  border: 'border-gray-600',
  ring: 'ring-gray-500/30',
};

const STAGE_TYPE_TONES: Record<string, Tone> = {
  applied: {
    bg: 'bg-sky-900/40',
    text: 'text-sky-300',
    border: 'border-sky-700/60',
    ring: 'ring-sky-500/20',
  },
  screening: {
    bg: 'bg-cyan-900/35',
    text: 'text-cyan-300',
    border: 'border-cyan-700/60',
    ring: 'ring-cyan-500/20',
  },
  review: {
    bg: 'bg-amber-900/35',
    text: 'text-amber-300',
    border: 'border-amber-700/60',
    ring: 'ring-amber-500/20',
  },
  interview: {
    bg: 'bg-violet-900/35',
    text: 'text-violet-300',
    border: 'border-violet-700/60',
    ring: 'ring-violet-500/20',
  },
  offer: {
    bg: 'bg-emerald-900/30',
    text: 'text-emerald-300',
    border: 'border-emerald-700/60',
    ring: 'ring-emerald-500/20',
  },
  hire: {
    bg: 'bg-green-900/40',
    text: 'text-green-300',
    border: 'border-green-700/60',
    ring: 'ring-green-500/20',
  },
  rejected: {
    bg: 'bg-rose-900/35',
    text: 'text-rose-300',
    border: 'border-rose-700/60',
    ring: 'ring-rose-500/20',
  },
};

const RECOMMENDATION_LABELS: Record<FeedbackRecommendation, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  mixed: 'Mixed',
  no: 'No',
  strong_no: 'Strong no',
};

export function getStageTone(stageType: string | null | undefined): Tone {
  if (!stageType) {
    return DEFAULT_TONE;
  }

  return STAGE_TYPE_TONES[stageType] || DEFAULT_TONE;
}

export function getRecommendationLabel(
  recommendation: FeedbackRecommendation | null | undefined
) {
  if (!recommendation) {
    return null;
  }

  return RECOMMENDATION_LABELS[recommendation] || recommendation;
}

export function getDecisionTone(decisionStatus: string | null | undefined) {
  switch (decisionStatus) {
    case 'hired':
      return STAGE_TYPE_TONES.hire;
    case 'rejected':
      return STAGE_TYPE_TONES.rejected;
    case 'withdrawn':
      return {
        bg: 'bg-slate-800/60',
        text: 'text-slate-300',
        border: 'border-slate-600',
        ring: 'ring-slate-500/20',
      };
    case 'active':
    default:
      return {
        bg: 'bg-blue-900/30',
        text: 'text-blue-300',
        border: 'border-blue-700/60',
        ring: 'ring-blue-500/20',
      };
  }
}

export function formatDecisionLabel(decisionStatus: string | null | undefined) {
  if (!decisionStatus) {
    return 'Active';
  }

  return decisionStatus.charAt(0).toUpperCase() + decisionStatus.slice(1);
}
