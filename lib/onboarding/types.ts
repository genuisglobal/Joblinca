// Onboarding Types for Joblinca

export type Role = 'job_seeker' | 'talent' | 'recruiter';

export type RecruiterType = 'company_hr' | 'agency' | 'verified_individual' | 'institution';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface Skill {
  name: string;
  rating: number; // 1-5
}

export interface OnboardingData {
  // Common fields
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
  gender: Gender | null;
  residenceLocation: string | null;

  // Job Seeker / Talent fields
  resumeUrl: string | null;
  locationInterests: string[];

  // Talent-specific fields
  schoolName: string;
  graduationYear: number | null;
  fieldOfStudy: string;
  skills: Skill[];

  // Recruiter-specific fields
  recruiterType: RecruiterType | null;
  companyName: string;
  companyLogoUrl: string | null;
  contactEmail: string;
}

export interface OnboardingState extends OnboardingData {
  // Navigation
  currentStep: number;
  totalSteps: number;
  role: Role | null;
  userId: string | null;

  // File states (for upload previews)
  avatarFile: File | null;
  resumeFile: File | null;
  logoFile: File | null;

  // Meta
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  lastSavedStep: number;
}

export interface OnboardingStatus {
  role: Role;
  currentStep: number;
  totalSteps: number;
  isCompleted: boolean;
  isSkipped: boolean;
  savedData: Partial<OnboardingData>;
}

export interface StepConfig {
  id: string;
  title: string;
  description: string;
  component: string;
  required: boolean;
  roles: Role[]; // Which roles see this step
}

export interface SaveStepRequest {
  step: number;
  data: Partial<OnboardingData>;
}

export interface SaveStepResponse {
  success: boolean;
  nextStep: number;
  error?: string;
}

// Step definitions by role
export const JOB_SEEKER_STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started', component: 'WelcomeStep', required: true, roles: ['job_seeker'] },
  { id: 'basic-info', title: 'Basic Info', description: 'Your name and phone', component: 'BasicInfoStep', required: true, roles: ['job_seeker'] },
  { id: 'profile-picture', title: 'Profile Picture', description: 'Add a photo', component: 'ProfilePictureStep', required: false, roles: ['job_seeker'] },
  { id: 'location', title: 'Location', description: 'Where you live', component: 'LocationStep', required: false, roles: ['job_seeker'] },
  { id: 'resume', title: 'Resume', description: 'Upload your CV', component: 'ResumeUploadStep', required: false, roles: ['job_seeker'] },
  { id: 'location-interests', title: 'Job Locations', description: 'Where to work', component: 'LocationInterestStep', required: false, roles: ['job_seeker'] },
  { id: 'completion', title: 'Complete', description: 'All done!', component: 'CompletionStep', required: true, roles: ['job_seeker'] },
];

export const TALENT_STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started', component: 'WelcomeStep', required: true, roles: ['talent'] },
  { id: 'basic-info', title: 'Basic Info', description: 'Your name and phone', component: 'BasicInfoStep', required: true, roles: ['talent'] },
  { id: 'profile-picture', title: 'Profile Picture', description: 'Add a photo', component: 'ProfilePictureStep', required: false, roles: ['talent'] },
  { id: 'location', title: 'Location', description: 'Where you live', component: 'LocationStep', required: false, roles: ['talent'] },
  { id: 'resume', title: 'Resume', description: 'Upload your CV', component: 'ResumeUploadStep', required: false, roles: ['talent'] },
  { id: 'location-interests', title: 'Job Locations', description: 'Where to work', component: 'LocationInterestStep', required: false, roles: ['talent'] },
  { id: 'education', title: 'Education', description: 'Your studies', component: 'EducationStep', required: false, roles: ['talent'] },
  { id: 'skills', title: 'Skills', description: 'What you know', component: 'SkillsStep', required: false, roles: ['talent'] },
  { id: 'completion', title: 'Complete', description: 'All done!', component: 'CompletionStep', required: true, roles: ['talent'] },
];

export const RECRUITER_STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started', component: 'WelcomeStep', required: true, roles: ['recruiter'] },
  { id: 'basic-info', title: 'Basic Info', description: 'Your name and phone', component: 'BasicInfoStep', required: true, roles: ['recruiter'] },
  { id: 'profile-picture', title: 'Profile Picture', description: 'Add a photo', component: 'ProfilePictureStep', required: false, roles: ['recruiter'] },
  { id: 'location', title: 'Location', description: 'Where you are', component: 'LocationStep', required: false, roles: ['recruiter'] },
  { id: 'recruiter-type', title: 'Recruiter Type', description: 'How you recruit', component: 'RecruiterTypeStep', required: true, roles: ['recruiter'] },
  { id: 'company-info', title: 'Company', description: 'Your organization', component: 'CompanyInfoStep', required: false, roles: ['recruiter'] },
  { id: 'completion', title: 'Complete', description: 'All done!', component: 'CompletionStep', required: true, roles: ['recruiter'] },
];

export function getStepsForRole(role: Role): StepConfig[] {
  switch (role) {
    case 'job_seeker':
      return JOB_SEEKER_STEPS;
    case 'talent':
      return TALENT_STEPS;
    case 'recruiter':
      return RECRUITER_STEPS;
    default:
      return JOB_SEEKER_STEPS;
  }
}
