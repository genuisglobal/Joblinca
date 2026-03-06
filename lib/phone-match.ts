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

  for (const candidate of candidates) {
    const { data } = await db
      .from('profiles')
      .select('id')
      .eq('phone', candidate)
      .limit(1)
      .maybeSingle();

    if ((data as { id?: string } | null)?.id) {
      return (data as { id: string }).id;
    }
  }

  const digits = normalizePhoneDigits(e164);
  const fuzzyNeedles = Array.from(
    new Set([
      digits,
      digits.length >= 9 ? digits.slice(-9) : '',
      digits.length >= 8 ? digits.slice(-8) : '',
    ])
  ).filter((value) => value.length >= 7);

  let bestMatch: { id: string; score: number } | null = null;
  const seenIds = new Set<string>();

  for (const needle of fuzzyNeedles) {
    const { data } = await db
      .from('profiles')
      .select('id, phone')
      .ilike('phone', `%${needle}%`)
      .limit(50);

    for (const row of ((data || []) as ProfilePhoneRow[])) {
      if (!row.id || seenIds.has(row.id)) continue;
      seenIds.add(row.id);

      const score = scorePhoneDigitMatch(e164, row.phone);
      if (score <= 0) continue;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: row.id, score };
      }
    }
  }

  return bestMatch?.id ?? null;
}
