/**
 * Bilingual synonym groups for the /jobs search box. When a query matches a
 * term in a group, the other terms are searched too, so an English query
 * ("housewife") also surfaces French-titled posts ("aide menagere") and
 * vice versa. Keep terms specific — generic single words (e.g. bare
 * "bonne", "aide") are deliberately excluded because they collide with
 * unrelated French vocabulary ("bonne ambiance", "aide comptable").
 */

interface SynonymGroup {
  id: string;
  terms: string[];
}

const SYNONYM_GROUPS: SynonymGroup[] = [
  {
    id: 'domestic-worker',
    terms: [
      'housewife',
      'house wife',
      'housekeeper',
      'house keeper',
      'domestic worker',
      'domestic help',
      'domestic servant',
      'house help',
      'house maid',
      'housemaid',
      'maid',
      'cleaning lady',
      'cleaner',
      'nanny',
      'femme de menage',
      'femme au foyer',
      'aide menagere',
      'menagere',
      'domestique',
      'bonne a tout faire',
      'gouvernante',
      'employee de maison',
      "garde d'enfants",
      'nounou',
    ],
  },
];

const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryContainsWholeTerm(normalizedQuery: string, normalizedTerm: string): boolean {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}($|\\s)`);
  return pattern.test(normalizedQuery);
}

/**
 * Returns the other terms in whichever synonym group matches `query`
 * (excluding terms identical to the normalized query itself), or an empty
 * array if the query doesn't match a known group.
 */
export function expandSearchSynonyms(query: string): string[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [];
  }

  for (const group of SYNONYM_GROUPS) {
    const matched = group.terms.some((term) => {
      const normalizedTerm = normalize(term);
      return (
        normalizedQuery === normalizedTerm ||
        queryContainsWholeTerm(normalizedQuery, normalizedTerm)
      );
    });

    if (matched) {
      const seen = new Set<string>();
      return group.terms.filter((term) => {
        const normalizedTerm = normalize(term);
        if (normalizedTerm === normalizedQuery || seen.has(normalizedTerm)) {
          return false;
        }
        seen.add(normalizedTerm);
        return true;
      });
    }
  }

  return [];
}
