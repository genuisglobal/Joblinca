/**
 * Keyword map used to find jobs whose title looks like a match for one of the
 * 7 launch challenge domains. This is intentionally narrow and curated rather
 * than fuzzy — we'd rather skip a borderline job than auto-intro a candidate
 * into something irrelevant.
 *
 * Add entries here when admin opens a new launch domain.
 */
export const DOMAIN_JOB_KEYWORDS: Record<string, string[]> = {
  teacher: ['teacher', 'enseignant', 'professeur', 'instructor', 'tutor'],
  accountant: ['accountant', 'comptable', 'accounting', 'bookkeeper'],
  admin_assistant: [
    'admin assistant',
    'administrative assistant',
    'assistant administratif',
    'office assistant',
    'secretary',
    'secrétaire',
  ],
  cashier: ['cashier', 'caissier', 'caissière', 'till operator'],
  nurse: ['nurse', 'infirmier', 'infirmière', 'aide-soignant', 'healthcare assistant'],
  customer_service: [
    'customer service',
    'service client',
    'conseiller clientèle',
    'call center',
    'centre d\'appel',
  ],
  field_officer: [
    'field officer',
    'field agent',
    'agent de terrain',
    'animateur communautaire',
    'community agent',
  ],
};

export function keywordsForDomain(domain: string | null | undefined): string[] {
  if (!domain) return [];
  return DOMAIN_JOB_KEYWORDS[domain] ?? [];
}
