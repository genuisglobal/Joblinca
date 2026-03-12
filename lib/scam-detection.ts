/**
 * Basic scam detection for job postings.
 *
 * Returns a score 0-100 where higher = more suspicious.
 * Jobs scoring >= 60 are auto-flagged for manual review.
 */

const SCAM_PHRASES = [
  // Money-first language
  'wire transfer',
  'western union',
  'money order',
  'send money',
  'pay upfront',
  'advance fee',
  'processing fee',
  'registration fee',
  'pay to apply',
  'invest to start',
  'buy equipment',
  'purchase supplies',

  // Too-good-to-be-true
  'earn \\$?\\d{4,}.*per (day|week)',
  'guaranteed income',
  'unlimited earning',
  'get rich',
  'make money fast',
  'no experience needed.*\\$',
  'work from home.*\\$\\d{4,}',

  // Personal info harvesting
  'send your id',
  'send passport',
  'bank account details',
  'credit card',
  'social security',
  'national id number',

  // Pressure tactics
  'act now',
  'limited spots',
  'apply immediately.*expires',
  'urgent.*hiring.*today',

  // Suspicious contact
  'contact.*whatsapp only',
  'contact.*telegram only',
  'gmail\\.com.*official',
  'yahoo\\.com.*official',
];

const SUSPICIOUS_PATTERNS = [
  // ALL CAPS title (more than 60% uppercase)
  { test: (title: string) => {
    const letters = title.replace(/[^a-zA-Z]/g, '');
    return letters.length > 5 && (letters.replace(/[^A-Z]/g, '').length / letters.length) > 0.6;
  }, score: 15, label: 'excessive_caps' },

  // Salary absurdly high for Cameroon market (> 5M XAF/month mentioned in text)
  { test: (_title: string, desc: string) => {
    const match = desc.match(/(\d[\d,. ]*)\s*(xaf|cfa|fcfa)/i);
    if (match) {
      const amount = parseFloat(match[1].replace(/[, ]/g, ''));
      return amount > 5_000_000;
    }
    return false;
  }, score: 20, label: 'unrealistic_salary' },

  // Very short description (< 50 chars)
  { test: (_title: string, desc: string) => desc.length < 50, score: 10, label: 'short_description' },

  // No company name
  { test: (_title: string, _desc: string, company: string | null) => !company || company.trim().length < 2, score: 15, label: 'missing_company' },
];

export interface ScamCheckResult {
  score: number;
  flags: string[];
  isSuspicious: boolean;
}

export function checkJobForScam(
  title: string,
  description: string,
  companyName: string | null
): ScamCheckResult {
  const flags: string[] = [];
  let score = 0;

  const combinedText = `${title} ${description}`.toLowerCase();

  // Check scam phrases
  for (const phrase of SCAM_PHRASES) {
    const regex = new RegExp(phrase, 'i');
    if (regex.test(combinedText)) {
      score += 15;
      flags.push(`phrase:${phrase.slice(0, 30)}`);
    }
  }

  // Check structural patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(title, description, companyName)) {
      score += pattern.score;
      flags.push(pattern.label);
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  return {
    score,
    flags,
    isSuspicious: score >= 60,
  };
}
