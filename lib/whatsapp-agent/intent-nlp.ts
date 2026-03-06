import type { ParsedTimeFilter } from '@/lib/whatsapp-agent/parser';
import { parseTimeFilter } from '@/lib/whatsapp-agent/parser';

export type WaDetectedIntent =
  | 'jobseeker'
  | 'recruiter'
  | 'talent'
  | 'menu'
  | 'unknown';

export interface IntentParseResult {
  intent: WaDetectedIntent;
  locationHint: string | null;
  roleKeywordsHint: string | null;
  timeFilterHint: ParsedTimeFilter | null;
}

const KNOWN_TOWNS = [
  'douala',
  'yaounde',
  'buea',
  'bamenda',
  'limbe',
  'garoua',
  'maroua',
  'ngaoundere',
  'kribi',
  'edea',
];

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalize(value: string): string {
  return compact(value).toLowerCase();
}

function hasAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function detectIntent(value: string): WaDetectedIntent {
  const compactValue = compact(value);
  const menuCommand =
    /^(menu|help|aide|start)(\s+(menu|help|aide))?$/i.test(compactValue);

  const recruiterIntent = hasAny(value, [
    'post a job',
    'post job',
    'hire',
    'hiring',
    'recruit',
    'recruitment',
    'looking for candidates',
    'need candidate',
    'need staff',
  ]);

  const talentIntent = hasAny(value, [
    'talent profile',
    'student profile',
    'i am a student',
    'internship profile',
    'campus profile',
    'create profile',
  ]);

  const jobIntent = hasAny(value, [
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
    'cherche emploi',
    'search job',
  ]);

  if (recruiterIntent && !jobIntent) return 'recruiter';
  if (talentIntent && !jobIntent) return 'talent';
  if (jobIntent) return 'jobseeker';
  if (menuCommand) return 'menu';
  if (recruiterIntent) return 'recruiter';
  if (talentIntent) return 'talent';
  return 'unknown';
}

export function extractLocationFromText(input: string): string | null {
  const value = compact(input);
  const pattern =
    /\b(?:in|at|near|around|within)\s+([a-zA-Z][a-zA-Z\s'-]{1,40}?)(?:\b(?:for|as|role|position|last|week|month|today|24h)\b|$)/i;
  const regexMatch = value.match(pattern);
  if (regexMatch?.[1]) {
    return compact(regexMatch[1]);
  }

  const lower = normalize(value);
  const known = KNOWN_TOWNS.find((town) => lower.includes(town));
  if (!known) return null;
  return known
    .split(' ')
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
}

export function extractRoleKeywordsFromText(input: string): string | null {
  const value = normalize(input)
    .replace(/\b(i|am|need|a|an|looking|for|job|work|emploi|travail|in|at|near|around|within|please|me|find)\b/g, ' ')
    .replace(/\b(last|today|week|month|24h|7d|30d)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value || value.length < 2) return null;
  return value.slice(0, 80);
}

export function parseIntentFromFreeText(input: string): IntentParseResult {
  const raw = compact(input);
  const normalized = normalize(raw);
  const timeFilterHint = parseTimeFilter(normalized);
  const locationHint = extractLocationFromText(raw);
  const roleKeywordsHint = extractRoleKeywordsFromText(raw);
  const intent = detectIntent(normalized);

  return {
    intent,
    locationHint,
    roleKeywordsHint,
    timeFilterHint,
  };
}
