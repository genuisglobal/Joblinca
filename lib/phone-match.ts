import { toE164 } from '@/lib/whatsapp';

type ProfileLookupDb = {
  from: (table: 'profiles') => {
    select: (columns: string) => any;
  };
};

interface ProfilePhoneRow {
  id: string;
  phone: string | null;
}

const FUZZY_MIN_CONFIDENCE_SCORE = 85;
const FUZZY_AMBIGUITY_GAP = 5;

export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\d]/g, '');
}

export function buildPhoneLookupCandidates(phone: string): string[] {
  const e164 = toE164(phone).trim();
  const digits = normalizePhoneDigits(e164);
  const candidates = new Set<string>();

  if (e164) candidates.add(e164);
  if (digits) {
    candidates.add(digits);
    candidates.add(`+${digits}`);
  }

  if (digits.startsWith('237') && digits.length > 3) {
    const local = digits.slice(3);
    candidates.add(local);
    if (!local.startsWith('0')) {
      candidates.add(`0${local}`);
    }
  }

  return Array.from(candidates).filter((value) => value.length >= 7);
}

export function scorePhoneDigitMatch(targetPhone: string, profilePhone: string | null): number {
  const targetDigits = normalizePhoneDigits(targetPhone);
  const profileDigits = normalizePhoneDigits(profilePhone);

  if (!targetDigits || !profileDigits) return 0;
  if (targetDigits === profileDigits) return 100;

  if (targetDigits.length >= 8 && profileDigits.length >= 8) {
    const targetTail8 = targetDigits.slice(-8);
    const profileTail8 = profileDigits.slice(-8);
    if (targetTail8 === profileTail8) return 90;
  }

  if (
    targetDigits.length >= 9 &&
    profileDigits.length >= 7 &&
    (targetDigits.endsWith(profileDigits) || profileDigits.endsWith(targetDigits))
  ) {
    return 80;
  }

  if (targetDigits.length >= 7 && profileDigits.length >= 7) {
    const targetTail7 = targetDigits.slice(-7);
    const profileTail7 = profileDigits.slice(-7);
    if (targetTail7 === profileTail7) return 70;
  }

  return 0;
}

export async function resolveProfileIdByPhone(
  db: ProfileLookupDb,
  phone: string
): Promise<string | null> {
  const e164 = toE164(phone);
  const candidates = buildPhoneLookupCandidates(e164);
  const exactMatches = new Set<string>();

  for (const candidate of candidates) {
    const { data } = await db
      .from('profiles')
      .select('id')
      .eq('phone', candidate)
      .limit(2);

    for (const row of ((data || []) as Array<{ id?: string | null }>)) {
      if (!row.id) continue;
      exactMatches.add(row.id);
    }

    if (exactMatches.size > 1) {
      return null;
    }
  }

  if (exactMatches.size === 1) {
    return Array.from(exactMatches)[0];
  }

  const digits = normalizePhoneDigits(e164);
  const fuzzyNeedles = Array.from(
    new Set([
      digits,
      digits.length >= 9 ? digits.slice(-9) : '',
      digits.length >= 8 ? digits.slice(-8) : '',
    ])
  ).filter((value) => value.length >= 7);

  const scoreById = new Map<string, number>();

  for (const needle of fuzzyNeedles) {
    const { data } = await db
      .from('profiles')
      .select('id, phone')
      .ilike('phone', `%${needle}%`)
      .limit(50);

    for (const row of ((data || []) as ProfilePhoneRow[])) {
      if (!row.id) continue;

      const score = scorePhoneDigitMatch(e164, row.phone);
      if (score <= 0) continue;

      const previous = scoreById.get(row.id) ?? 0;
      if (score > previous) {
        scoreById.set(row.id, score);
      }
    }
  }

  const ranked = Array.from(scoreById.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;

  const best = ranked[0];
  const second = ranked[1];

  if (best.score < FUZZY_MIN_CONFIDENCE_SCORE) {
    return null;
  }

  if (second && second.score >= best.score - FUZZY_AMBIGUITY_GAP) {
    return null;
  }

  return best.id;
}
