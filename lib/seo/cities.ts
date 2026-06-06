export interface CityInfo {
  slug: string;
  name: string;
  region: { en: string; fr: string };
  description: { en: string; fr: string };
}

export const CITIES: Record<string, CityInfo> = {
  douala: {
    slug: 'douala',
    name: 'Douala',
    region: { en: 'Littoral', fr: 'Littoral' },
    description: {
      en: "Cameroon's economic capital and largest city. Hub for finance, logistics, industry, and tech startups.",
      fr: "Capitale economique du Cameroun et plus grande ville. Centre de finance, logistique, industrie et startups tech.",
    },
  },
  yaounde: {
    slug: 'yaounde',
    name: 'Yaounde',
    region: { en: 'Centre', fr: 'Centre' },
    description: {
      en: 'The political capital of Cameroon. Home to government institutions, universities, and a growing tech scene.',
      fr: 'Capitale politique du Cameroun. Elle abrite les institutions publiques, les universites et une scene tech en croissance.',
    },
  },
  bafoussam: {
    slug: 'bafoussam',
    name: 'Bafoussam',
    region: { en: 'West', fr: 'Ouest' },
    description: {
      en: 'Capital of the West Region. A commercial hub known for agriculture, trade, and entrepreneurship.',
      fr: "Capitale de la region de l'Ouest. Centre commercial reconnu pour l'agriculture, le commerce et l'entrepreneuriat.",
    },
  },
  limbe: {
    slug: 'limbe',
    name: 'Limbe',
    region: { en: 'South-West', fr: 'Sud-Ouest' },
    description: {
      en: 'Coastal city with a strong oil and gas sector, tourism, and marine industries.',
      fr: 'Ville cotiere avec un secteur petrolier fort, du tourisme et des activites maritimes.',
    },
  },
  buea: {
    slug: 'buea',
    name: 'Buea',
    region: { en: 'South-West', fr: 'Sud-Ouest' },
    description: {
      en: `Known as "Silicon Mountain" - Cameroon's tech startup capital at the foot of Mount Cameroon.`,
      fr: `Connue comme "Silicon Mountain", la capitale des startups tech du Cameroun au pied du Mont Cameroun.`,
    },
  },
  kribi: {
    slug: 'kribi',
    name: 'Kribi',
    region: { en: 'South', fr: 'Sud' },
    description: {
      en: 'Emerging port city with opportunities in logistics, construction, and hospitality.',
      fr: "Ville portuaire en pleine croissance avec des opportunites en logistique, construction et hotellerie.",
    },
  },
  bamenda: {
    slug: 'bamenda',
    name: 'Bamenda',
    region: { en: 'North-West', fr: 'Nord-Ouest' },
    description: {
      en: 'Capital of the North-West Region. Education hub with universities and a growing service sector.',
      fr: "Capitale de la region du Nord-Ouest. Pole educatif avec des universites et un secteur des services en croissance.",
    },
  },
  garoua: {
    slug: 'garoua',
    name: 'Garoua',
    region: { en: 'North', fr: 'Nord' },
    description: {
      en: 'Third-largest city in Cameroon. Key center for agriculture, cotton, and cross-border trade.',
      fr: "Troisieme plus grande ville du Cameroun. Centre important pour l'agriculture, le coton et le commerce transfrontalier.",
    },
  },
  maroua: {
    slug: 'maroua',
    name: 'Maroua',
    region: { en: 'Far North', fr: 'Extreme-Nord' },
    description: {
      en: 'Capital of the Far North. Important for NGO operations, agriculture, and public administration.',
      fr: "Capitale de l'Extreme-Nord. Importante pour les ONG, l'agriculture et l'administration publique.",
    },
  },
  bertoua: {
    slug: 'bertoua',
    name: 'Bertoua',
    region: { en: 'East', fr: 'Est' },
    description: {
      en: 'Gateway to the East Region. Growing opportunities in forestry, mining, and development projects.',
      fr: "Porte d'entree de la region de l'Est. Opportunites en croissance dans la foresterie, l'exploitation miniere et les projets de developpement.",
    },
  },
};

export const CITY_SLUGS = Object.keys(CITIES);

export function getCityBySlug(slug: string): CityInfo | undefined {
  return CITIES[slug.toLowerCase()];
}
