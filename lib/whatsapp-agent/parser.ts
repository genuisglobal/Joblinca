export type ParsedTimeFilter = '24h' | '7d' | '30d';

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
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = cleaned.match(/^JL-?(\d{1,10})$/);
  if (!match) return null;
  return `JL-${match[1]}`;
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
  return ['help', 'menu', 'aide', '4'].includes(value);
}

export function isNextCommand(input: string): boolean {
  return normalize(input) === 'next';
}

export function parseMenuChoice(input: string): 1 | 2 | 3 | 4 | null {
  const value = normalize(input);
  if (value === '1') return 1;
  if (value === '2') return 2;
  if (value === '3') return 3;
  if (value === '4') return 4;
  return null;
}

export function parseApplyCommand(input: string): ParsedApplyCommand {
  const value = compact(input);
  const directId = normalizePublicJobId(value);
  if (directId) {
    return { isApply: true, publicId: directId };
  }

  const match = value.match(/^(apply|postuler)\s+([a-z]{2,5}-?\d{1,10})$/i);
  if (!match) {
    return { isApply: false, publicId: null };
  }

  return {
    isApply: true,
    publicId: normalizePublicJobId(match[2]),
  };
}

export function parseDetailsCommand(input: string): ParsedDetailsCommand {
  const value = compact(input);
  const match = value.match(/^(details?|info)\s+([a-z]{2,5}-?\d{1,10})$/i);
  if (!match) {
    return { isDetails: false, publicId: null };
  }

  return {
    isDetails: true,
    publicId: normalizePublicJobId(match[2]),
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

