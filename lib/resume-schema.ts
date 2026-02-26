import { z } from 'zod';

export const contactInfoSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(1, 'Phone number is required'),
  location: z.string().optional(),
  title: z.string().optional(),
});

export const summarySchema = z.object({
  summary: z.string().min(10, 'Summary should be at least 10 characters'),
});

export const experienceEntrySchema = z.object({
  company: z.string().min(1, 'Company name is required'),
  role: z.string().min(1, 'Role is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string(),
  description: z.string(),
  current: z.boolean(),
});

export const educationEntrySchema = z.object({
  institution: z.string().min(1, 'Institution is required'),
  degree: z.string().min(1, 'Degree is required'),
  field: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export const skillsSchema = z.object({
  skills: z.array(z.string()).min(1, 'Add at least one skill'),
});

export const languageEntrySchema = z.object({
  language: z.string().min(1, 'Language is required'),
  proficiency: z.string().min(1, 'Proficiency is required'),
});

export const certificationEntrySchema = z.object({
  name: z.string().min(1, 'Certification name is required'),
  issuer: z.string(),
  date: z.string(),
});

export const templateSchema = z.object({
  template: z.enum(['professional', 'modern']),
});
