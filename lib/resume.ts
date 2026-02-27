// Types and helper functions for resume building.
// This module defines the shape of resume data used throughout
// the application. It intentionally contains no React code or
// imports to keep the lib folder pure logic only.

export interface ExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  current: boolean;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: string;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  date: string;
}

export interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  languages: LanguageEntry[];
  certifications: CertificationEntry[];
  template: 'professional' | 'modern' | 'executive' | 'creative' | 'minimal' | 'compact';
}

export function createEmptyResume(): ResumeData {
  return {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    template: 'professional',
  };
}

export function createEmptyExperience(): ExperienceEntry {
  return {
    company: '',
    role: '',
    startDate: '',
    endDate: '',
    description: '',
    current: false,
  };
}

export function createEmptyEducation(): EducationEntry {
  return {
    institution: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
  };
}

export function createEmptyLanguage(): LanguageEntry {
  return { language: '', proficiency: 'Intermediate' };
}

export function createEmptyCertification(): CertificationEntry {
  return { name: '', issuer: '', date: '' };
}
