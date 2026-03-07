export interface QuizQuestion {
  question: string;
  question_fr?: string;
  options: string[];
  options_fr?: string[];
  correct_index: number;
  explanation?: string;
  explanation_fr?: string;
}

export interface LearningTrack {
  id: string;
  title: string;
  title_fr?: string;
  description?: string;
  description_fr?: string;
  slug: string;
  icon: string;
  target_roles: string[];
  display_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  course_count?: number;
  progress_percent?: number;
}

export interface LearningCourse {
  id: string;
  track_id: string;
  title: string;
  title_fr?: string;
  description?: string;
  description_fr?: string;
  slug: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_minutes: number;
  thumbnail_url?: string;
  partner_name?: string;
  partner_url?: string;
  display_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  module_count?: number;
  completed_count?: number;
  modules?: LearningModule[];
}

export interface LearningModule {
  id: string;
  course_id: string;
  title: string;
  title_fr?: string;
  content_type: 'video' | 'article' | 'external';
  video_url?: string;
  article_body?: string;
  article_body_fr?: string;
  external_url?: string;
  duration_minutes: number;
  quiz_questions: QuizQuestion[];
  display_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  progress?: LearningProgress | null;
}

export interface LearningProgress {
  id: string;
  user_id: string;
  module_id: string;
  status: 'in_progress' | 'completed';
  quiz_score: number | null;
  quiz_answers: number[] | null;
  started_at: string;
  completed_at: string | null;
}

export interface LearningStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  total_modules_completed: number;
  total_courses_completed: number;
  xp_points: number;
  created_at: string;
  updated_at: string;
}

export interface CourseRecommendation {
  course_slug: string;
  course_title: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Talent Challenges
// ---------------------------------------------------------------------------

export interface TalentChallenge {
  id: string;
  slug: string;
  title: string;
  title_fr?: string | null;
  description?: string | null;
  description_fr?: string | null;
  challenge_type: 'quiz' | 'project';
  domain?: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: 'draft' | 'active' | 'closed' | 'published';
  max_ranked_attempts: number;
  top_n: number;
  config: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TalentChallengeSubmission {
  id: string;
  challenge_id: string;
  user_id: string;
  attempt_no: number;
  answers: number[] | null;
  project_submission: Record<string, unknown> | null;
  auto_score: number | null;
  manual_score: number | null;
  final_score: number | null;
  completion_seconds: number | null;
  status: 'draft' | 'submitted' | 'graded' | 'disqualified';
  graded_by: string | null;
  graded_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TalentLeaderboardEntry {
  id: string;
  week_key: string;
  week_start: string;
  week_end: string;
  challenge_id: string;
  user_id: string;
  rank: number;
  score: number;
  tie_breaker: number;
  published_at: string;
  metadata: Record<string, unknown>;
}

export interface TalentAchievement {
  id: string;
  user_id: string;
  source_type: string;
  source_key: string;
  title: string;
  description: string | null;
  issuer: string;
  issued_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Skill Mapping & Gap Analysis
// ---------------------------------------------------------------------------

export interface SkillCategory {
  slug: string;
  label: string;
  label_fr: string;
  keywords: string[];
}

export interface SkillCategoryScore {
  slug: string;
  label: string;
  label_fr: string;
  userScore: number;       // 0-100 based on keyword matches + course completions
  marketDemand: number;    // 0-100 based on job listing keyword frequency
  gap: number;             // marketDemand - userScore (positive = gap)
}

export interface SkillProfile {
  userId: string;
  categories: SkillCategoryScore[];
  rawSkills: string[];
  completedCourses: string[];
  careerGoals: string[];
  topGaps: SkillCategoryScore[];     // top 3 gap categories
  topStrengths: SkillCategoryScore[]; // top 3 strength categories
}

// ---------------------------------------------------------------------------
// AI Career Counselor
// ---------------------------------------------------------------------------

export interface CounselorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CounselorSession {
  id: string;
  user_id: string;
  title: string;
  messages: CounselorMessage[];
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CounselorSessionSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

// ---------------------------------------------------------------------------
// Partner Courses
// ---------------------------------------------------------------------------

export interface PartnerCourse {
  id: string;
  partner_name: string;
  title: string;
  title_fr?: string;
  description?: string;
  description_fr?: string;
  url: string;
  duration_minutes?: number;
  level?: 'beginner' | 'intermediate' | 'advanced';
  cost_type?: 'free' | 'paid' | 'freemium';
  category?: string;
  referral_url?: string;
  featured: boolean;
  referral_clicks: number;
  created_at: string;
}
