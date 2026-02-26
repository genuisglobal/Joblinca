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
