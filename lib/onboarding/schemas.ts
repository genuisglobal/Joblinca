// Zod validation schemas for Joblinca Onboarding

import { z } from 'zod';

// Basic Info Schema (Required step)
export const basicInfoSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'First name contains invalid characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Last name contains invalid characters'),
  phone: z
    .string()
    .regex(/^[0-9]{9}$/, 'Phone must be exactly 9 digits'),
});

// Profile Picture Schema (Optional)
export const profilePictureSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
});

// Location Schema (Optional)
export const locationSchema = z.object({
  residenceLocation: z.string().nullable().optional(),
  gender: z
    .enum(['male', 'female', 'other', 'prefer_not_to_say'])
    .nullable()
    .optional(),
});

// Resume Schema (Optional)
export const resumeSchema = z.object({
  resumeUrl: z.string().url().nullable().optional(),
});

// Location Interests Schema (Optional)
export const locationInterestsSchema = z.object({
  locationInterests: z.array(z.string()).default([]),
});

// Education Schema (Optional - Talent only)
export const educationSchema = z.object({
  schoolName: z.string().max(100, 'School name too long').optional().or(z.literal('')),
  graduationYear: z
    .number()
    .min(1950, 'Invalid year')
    .max(2040, 'Invalid year')
    .nullable()
    .optional(),
  fieldOfStudy: z.string().max(100, 'Field too long').optional().or(z.literal('')),
});

// Skills Schema (Optional - Talent only)
export const skillSchema = z.object({
  name: z.string().min(1, 'Skill name required').max(50, 'Skill name too long'),
  rating: z.number().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
});

export const skillsSchema = z.object({
  skills: z.array(skillSchema).default([]),
});

// Recruiter Type Schema (Required for recruiters)
export const recruiterTypeSchema = z.object({
  recruiterType: z.enum(['company_hr', 'agency', 'verified_individual', 'institution']),
});

// Company Info Schema (Optional - Recruiter only)
export const companyInfoSchema = z.object({
  companyName: z.string().max(100, 'Company name too long').optional().or(z.literal('')),
  companyLogoUrl: z.string().url().nullable().optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
});

// Complete Onboarding Data Schema
export const onboardingDataSchema = z.object({
  // Common
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
  residenceLocation: z.string().nullable().optional(),

  // Job Seeker / Talent
  resumeUrl: z.string().nullable().optional(),
  locationInterests: z.array(z.string()).optional(),

  // Talent
  schoolName: z.string().optional(),
  graduationYear: z.number().nullable().optional(),
  fieldOfStudy: z.string().optional(),
  skills: z.array(skillSchema).optional(),

  // Recruiter
  recruiterType: z.enum(['company_hr', 'agency', 'verified_individual', 'institution']).nullable().optional(),
  companyName: z.string().optional(),
  companyLogoUrl: z.string().nullable().optional(),
  contactEmail: z.string().optional(),
});

// Save Step Request Schema
export const saveStepRequestSchema = z.object({
  step: z.number().min(0),
  data: onboardingDataSchema,
});

// Type exports
export type BasicInfoData = z.infer<typeof basicInfoSchema>;
export type ProfilePictureData = z.infer<typeof profilePictureSchema>;
export type LocationData = z.infer<typeof locationSchema>;
export type ResumeData = z.infer<typeof resumeSchema>;
export type LocationInterestsData = z.infer<typeof locationInterestsSchema>;
export type EducationData = z.infer<typeof educationSchema>;
export type SkillData = z.infer<typeof skillSchema>;
export type SkillsData = z.infer<typeof skillsSchema>;
export type RecruiterTypeData = z.infer<typeof recruiterTypeSchema>;
export type CompanyInfoData = z.infer<typeof companyInfoSchema>;
export type OnboardingDataInput = z.infer<typeof onboardingDataSchema>;
export type SaveStepRequest = z.infer<typeof saveStepRequestSchema>;

// Validation functions
export function validateBasicInfo(data: unknown) {
  return basicInfoSchema.safeParse(data);
}

export function validateStep(stepId: string, data: unknown) {
  switch (stepId) {
    case 'basic-info':
      return basicInfoSchema.safeParse(data);
    case 'profile-picture':
      return profilePictureSchema.safeParse(data);
    case 'location':
      return locationSchema.safeParse(data);
    case 'resume':
      return resumeSchema.safeParse(data);
    case 'location-interests':
      return locationInterestsSchema.safeParse(data);
    case 'education':
      return educationSchema.safeParse(data);
    case 'skills':
      return skillsSchema.safeParse(data);
    case 'recruiter-type':
      return recruiterTypeSchema.safeParse(data);
    case 'company-info':
      return companyInfoSchema.safeParse(data);
    default:
      return { success: true, data };
  }
}
