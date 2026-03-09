export type HiringDecisionStatus = 'active' | 'hired' | 'rejected' | 'withdrawn';

export type FeedbackRecommendation =
  | 'strong_yes'
  | 'yes'
  | 'mixed'
  | 'no'
  | 'strong_no';

export interface HiringPipelineStage {
  id: string;
  jobPipelineId: string;
  sourceTemplateStageId: string | null;
  stageKey: string;
  label: string;
  stageType: string;
  orderIndex: number;
  scoreWeight: number;
  isTerminal: boolean;
  allowsFeedback: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface HiringPipeline {
  id: string;
  jobId: string;
  templateId: string | null;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stages: HiringPipelineStage[];
}

export interface JobHiringRequirements {
  id: string;
  jobId: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  requiredLanguages: string[];
  educationRequirements: string[];
  minYearsExperience: number | null;
  locationRules: Record<string, unknown>;
  screeningRules: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationCurrentStage {
  id: string;
  stageKey: string;
  label: string;
  stageType: string;
  orderIndex: number;
  isTerminal: boolean;
  allowsFeedback: boolean;
}

export interface ApplicationStageEventView {
  id: string;
  applicationId: string;
  actorId: string | null;
  fromStageId: string | null;
  toStageId: string;
  transitionReason: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  fromStage: ApplicationCurrentStage | null;
  toStage: ApplicationCurrentStage | null;
}

export interface ApplicationStageFeedbackView {
  id: string;
  applicationId: string;
  reviewerId: string;
  stageId: string;
  scorecardId: string | null;
  score: number;
  recommendation: FeedbackRecommendation | null;
  summary: string | null;
  feedback: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stage: ApplicationCurrentStage | null;
  scorecard: {
    id: string;
    name: string;
    instructions: string | null;
  } | null;
}
