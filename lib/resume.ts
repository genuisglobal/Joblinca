// Types and helper functions for resume building and optimisation.
// This module defines the shape of resume data used throughout
// the application.  It intentionally contains no React code or
// imports to keep the lib folder pure logic only.

export interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
}

/**
 * Returns an empty resume data object.  Use this to initialise
 * state in client components.
 */
export function createEmptyResume(): ResumeData {
  return {
    fullName: '',
    email: '',
    phone: '',
    summary: '',
    experience: '',
    education: '',
    skills: '',
  };
}

/**
 * Basic helper that attempts to derive a resume from a chunk of
 * text.  It splits the text on line breaks and assigns the first
 * non‑empty line as the full name, the second as summary and the
 * remainder to experience.  This is a naive approach intended
 * solely as a starting point when parsing uploaded resumes.
 *
 * @param text Raw plain text extracted from an uploaded resume
 */
export function deriveResumeFromText(text: string): ResumeData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const [fullName = '', summary = '', ...rest] = lines;
  return {
    fullName,
    email: '',
    phone: '',
    summary,
    experience: rest.join('\n'),
    education: '',
    skills: '',
  };
}