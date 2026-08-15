/**
 * Bilingual synonym groups for the /jobs search box. When a query matches a
 * term in a group, the other terms are searched too, so an English query
 * ("housewife") also surfaces French-titled posts ("aide menagere") and
 * vice versa. Keep terms specific — generic single words (e.g. bare
 * "bonne", "aide") are deliberately excluded because they collide with
 * unrelated French vocabulary ("bonne ambiance", "aide comptable").
 *
 * Terms are stored unaccented. normalize() strips diacritics from both the
 * query and the term, and the SQL side compares through immutable_unaccent(),
 * so "menagere" here still matches a job titled "Aide Ménagère".
 *
 * Two invariants, both enforced by tests/search-synonyms.test.js:
 *   1. No term may appear in more than one group. expandSearchSynonyms returns
 *      the first matching group, so a shared term would make the winner depend
 *      on array order.
 *   2. Matching is whole-term, so a term that is a common French or English
 *      word on its own ("chef", "agent", "commercial", "conducteur") must not
 *      be listed bare — it would fire on "chef de projet", "agent de change",
 *      "conducteur de travaux". Qualify it instead ("chef cuisinier").
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
  {
    id: 'driver-delivery',
    terms: [
      'driver',
      'chauffeur',
      'taxi driver',
      'truck driver',
      'delivery driver',
      'dispatch rider',
      'courier',
      'chauffeur de taxi',
      'chauffeur poids lourd',
      'chauffeur livreur',
      'livreur',
      'coursier',
      'moto taxi',
      'motocycliste',
    ],
  },
  {
    id: 'security-guard',
    terms: [
      'security guard',
      'security officer',
      'watchman',
      'night watchman',
      'gardien',
      'gardien de nuit',
      'vigile',
      'agent de securite',
      'veilleur de nuit',
    ],
  },
  {
    id: 'sales-retail',
    terms: [
      'salesperson',
      'sales representative',
      'sales agent',
      'shop assistant',
      'shopkeeper',
      'cashier',
      'agent commercial',
      'attache commercial',
      'representant commercial',
      'commercial terrain',
      'vendeur',
      'vendeuse',
      'caissier',
      'caissiere',
    ],
  },
  {
    id: 'teacher-trainer',
    terms: [
      'teacher',
      'tutor',
      'lecturer',
      'instructor',
      'enseignant',
      'enseignante',
      'professeur',
      'instituteur',
      'institutrice',
      'repetiteur',
      'formateur',
      'formatrice',
    ],
  },
  {
    id: 'accounting-finance',
    terms: [
      'accountant',
      'bookkeeper',
      'accounting clerk',
      'comptable',
      'aide comptable',
      'chef comptable',
      'expert comptable',
      'agent comptable',
    ],
  },
  {
    id: 'secretary-admin',
    terms: [
      'secretary',
      'receptionist',
      'administrative assistant',
      'office assistant',
      'front desk officer',
      'secretaire',
      'secretaire de direction',
      'receptionniste',
      'assistant administratif',
      'assistante administrative',
      "hotesse d'accueil",
      "agent d'accueil",
    ],
  },
  {
    id: 'cook-kitchen',
    terms: [
      'cook',
      'chef cuisinier',
      'chef de cuisine',
      'kitchen assistant',
      'baker',
      'pastry chef',
      'cuisinier',
      'cuisiniere',
      'aide cuisinier',
      'commis de cuisine',
      'patissier',
      'patissiere',
      'boulanger',
      'boulangere',
    ],
  },
  {
    id: 'waiter-bar',
    terms: [
      'waiter',
      'waitress',
      'barman',
      'barmaid',
      'bartender',
      'serveur',
      'serveuse',
      'garcon de salle',
    ],
  },
  {
    id: 'nursing-care',
    terms: [
      'nurse',
      'nursing assistant',
      'caregiver',
      'midwife',
      'infirmier',
      'infirmiere',
      'aide soignant',
      'aide soignante',
      'sage femme',
      'auxiliaire de vie',
    ],
  },
  {
    id: 'construction-mason',
    terms: [
      'mason',
      'bricklayer',
      'construction worker',
      'builder',
      'macon',
      'ouvrier btp',
      'ouvrier de chantier',
      'manoeuvre',
      'coffreur',
      'ferrailleur',
      'chef de chantier',
    ],
  },
  {
    id: 'electrician',
    terms: [
      'electrician',
      'electrical technician',
      'electricien',
      'electricien batiment',
      'technicien electricien',
    ],
  },
  {
    id: 'plumber',
    terms: ['plumber', 'plumbing technician', 'plombier', 'plombier sanitaire'],
  },
  {
    id: 'mechanic',
    terms: [
      'mechanic',
      'auto mechanic',
      'vehicle technician',
      'mecanicien',
      'mecanicien auto',
      'garagiste',
      'tolier',
    ],
  },
  {
    id: 'welder',
    terms: ['welder', 'welding technician', 'soudeur', 'soudeur industriel'],
  },
  {
    id: 'tailor-fashion',
    terms: [
      'tailor',
      'seamstress',
      'dressmaker',
      'couturier',
      'couturiere',
      'tailleur',
      'styliste modeliste',
    ],
  },
  {
    id: 'hairdresser-beauty',
    terms: [
      'hairdresser',
      'hair stylist',
      'barber',
      'beautician',
      'coiffeur',
      'coiffeuse',
      'barbier',
      'estheticienne',
      'tresseuse',
    ],
  },
  {
    id: 'agriculture',
    terms: [
      'farmer',
      'farm worker',
      'agronomist',
      'agricultural technician',
      'agriculteur',
      'ouvrier agricole',
      'agronome',
      'planteur',
      'technicien agricole',
    ],
  },
  {
    id: 'software-it',
    terms: [
      'software developer',
      'software engineer',
      'programmer',
      'web developer',
      'backend developer',
      'frontend developer',
      'developpeur',
      'developpeuse',
      'programmeur',
      'informaticien',
      'ingenieur logiciel',
    ],
  },
  {
    id: 'warehouse-logistics',
    terms: [
      'warehouse worker',
      'storekeeper',
      'stock controller',
      'logistics assistant',
      'magasinier',
      'manutentionnaire',
      'agent logistique',
      'gestionnaire de stock',
    ],
  },
  {
    id: 'call-center',
    terms: [
      'call center agent',
      'call centre agent',
      'customer service agent',
      'customer support',
      'telemarketer',
      'teleconseiller',
      'teleconseillere',
      "agent centre d'appel",
      'service client',
    ],
  },
  {
    id: 'translation',
    terms: ['translator', 'interpreter', 'traducteur', 'traductrice', 'interprete'],
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

/** Exposed for tests that assert the cross-group invariants. */
export const __SYNONYM_GROUPS_FOR_TESTS: ReadonlyArray<{ id: string; terms: readonly string[] }> =
  SYNONYM_GROUPS;
