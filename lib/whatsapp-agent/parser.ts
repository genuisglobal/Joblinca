export type ParsedTimeFilter = '24h' | '7d' | '30d';
export type ParsedLocationScope = 'nationwide' | 'town';
export type ParsedRoleMode = 'all' | 'specific';

export interface ParsedApplyCommand {
  isApply: boolean;
  publicId: string | null;
}

export interface ParsedDetailsCommand {
  isDetails: boolean;
  publicId: string | null;
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function compact(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function normalizePublicJobId(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/([A-Z]{2,5})-(\d{1,10})$/, '$1$2');
  const match = cleaned.match(/^JL-?(\d{1,10})$/);
  if (!match) return null;
  return `JL-${match[1]}`;
}

function parsePublicJobIdFromCommand(input: string, command: 'apply' | 'postuler' | 'details' | 'detail' | 'info'): string | null {
  const value = compact(input);
  const pattern = new RegExp(`(?:^|\\b)${command}\\s+([a-z]{2,5}\\s*-?\\s*\\d{1,10})\\b`, 'i');
  const match = value.match(pattern);
  if (!match?.[1]) return null;
  return normalizePublicJobId(match[1]);
}

export function isGreeting(input: string): boolean {
  const value = normalize(input);
  return [
    'hi',
    'hello',
    'hey',
    'yo',
    '++',
    'menu',
    'start',
    'bonjour',
    'salut',
  ].includes(value);
}

export function isHelpMenu(input: string): boolean {
  const value = normalize(input);
  return ['help', 'menu', 'aide'].includes(value);
}

export function isNextCommand(input: string): boolean {
  return normalize(input) === 'next';
}

export function parseMenuChoice(input: string): 1 | 2 | 3 | 4 | null {
  const value = normalize(input);
  const numeric = value.match(/^\D*([1-4])\D*$/);
  if (!numeric) return null;
  if (numeric[1] === '1') return 1;
  if (numeric[1] === '2') return 2;
  if (numeric[1] === '3') return 3;
  if (numeric[1] === '4') return 4;
  return null;
}

export function parseApplyCommand(input: string): ParsedApplyCommand {
  const value = compact(input);
  const directId = normalizePublicJobId(value);
  if (directId) {
    return { isApply: true, publicId: directId };
  }

  const hasApplyKeyword = /(?:^|\b)(?:apply|postuler)\b/i.test(value);
  if (!hasApplyKeyword) {
    return { isApply: false, publicId: null };
  }

  const parsed =
    parsePublicJobIdFromCommand(value, 'apply') ??
    parsePublicJobIdFromCommand(value, 'postuler');

  return {
    isApply: true,
    publicId: parsed,
  };
}

export function parseDetailsCommand(input: string): ParsedDetailsCommand {
  const value = compact(input);
  const hasDetailsKeyword = /^(details?|info)\b/i.test(value);
  if (!hasDetailsKeyword) {
    return { isDetails: false, publicId: null };
  }

  const parsed =
    parsePublicJobIdFromCommand(value, 'details') ??
    parsePublicJobIdFromCommand(value, 'detail') ??
    parsePublicJobIdFromCommand(value, 'info');

  return {
    isDetails: true,
    publicId: parsed,
  };
}

export function parseTimeFilter(input: string): ParsedTimeFilter | null {
  const value = normalize(input);

  if (
    value === '1' ||
    value === '24h' ||
    value === '24hrs' ||
    value === '24hours' ||
    value.includes('24')
  ) {
    return '24h';
  }

  if (
    value === '2' ||
    value === '7d' ||
    value === '1w' ||
    value.includes('week')
  ) {
    return '7d';
  }

  if (
    value === '3' ||
    value === '30d' ||
    value === '1m' ||
    value.includes('month')
  ) {
    return '30d';
  }

  return null;
}

export function parseLocationScope(input: string): ParsedLocationScope | null {
  const value = normalize(input);
  if (
    value === '1' ||
    value === 'nationwide' ||
    value === 'national' ||
    value === 'all cameroon' ||
    value === 'countrywide' ||
    value === 'anywhere'
  ) {
    return 'nationwide';
  }

  if (
    value === '2' ||
    value === 'town' ||
    value === 'city' ||
    value === 'local town' ||
    value === 'specific town'
  ) {
    return 'town';
  }

  return null;
}

export function parseRoleMode(input: string): ParsedRoleMode | null {
  const value = normalize(input);
  if (
    value === '1' ||
    value === 'all' ||
    value === 'all jobs' ||
    value === 'any role'
  ) {
    return 'all';
  }

  if (
    value === '2' ||
    value === 'specific' ||
    value === 'specific role' ||
    value === 'role'
  ) {
    return 'specific';
  }

  return null;
}

export function isCreateAccountIntent(input: string): boolean {
  const value = normalize(input);
  return (
    value === '4' ||
    value === 'create account' ||
    value === 'register' ||
    value === 'signup' ||
    value === 'sign up' ||
    value === 'open account'
  );
}

export function looksLikeJobIntent(input: string): boolean {
  const value = normalize(input);
  const keywords = [
    'find job',
    'find work',
    'need work',
    'need a job',
    'looking for job',
    'looking for work',
    'job in',
    'work in',
    'emploi',
    'travail',
    'recherche emploi',
    'i need work',
    'i need a job',
  ];

  if (keywords.some((k) => value.includes(k))) {
    return true;
  }

  return /\b(job|work|emploi|travail)\b/.test(value) && /\b(in|at|near|douala|yaounde|buea|bamenda)\b/.test(value);
}

export function looksLikeInternshipIntent(input: string): boolean {
  const value = normalize(input);
  const keywords = [
    'internship',
    'intern',
    'stage',
    'trainee',
    'apprenticeship',
  ];
  return keywords.some((keyword) => value.includes(keyword));
}

export function extractLocationHint(input: string): string | null {
  const compactInput = compact(input);
  const match = compactInput.match(/\b(?:in|at|near)\s+([a-zA-Z][a-zA-Z\s'-]{1,40})$/i);
  if (!match) return null;
  return match[1].trim();
}

export function extractRoleKeywordsHint(input: string): string | null {
  const value = compact(input);
  const stripped = value
    .replace(/\b(i|am|need|a|an|looking|for|job|work|in|at|near|please|me|find)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped || stripped.length < 2) return null;
  return stripped.slice(0, 80);
}
