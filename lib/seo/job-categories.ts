/**
 * Programmatic SEO categories. Each entry powers a /jobs-in/{city}/{slug}
 * landing page. Keep keyword arrays specific enough that ILIKE matches don't
 * pull in unrelated roles.
 */

export interface JobCategory {
  slug: string;
  name: { en: string; fr: string };
  keywords: string[];
  description: { en: string; fr: string };
  skills?: string[];
}

export const JOB_CATEGORIES: JobCategory[] = [
  {
    slug: 'developer',
    name: { en: 'Developer', fr: 'Developpeur' },
    keywords: [
      'developer',
      'developpeur',
      'programmer',
      'software engineer',
      'fullstack',
      'full-stack',
      'frontend',
      'backend',
      'mobile developer',
      'web developer',
    ],
    description: {
      en: 'Software engineering and programming roles across web, mobile, and backend stacks.',
      fr: 'Postes en genie logiciel et programmation pour le web, le mobile et le back-end.',
    },
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'PHP'],
  },
  {
    slug: 'marketing',
    name: { en: 'Marketing', fr: 'Marketing' },
    keywords: [
      'marketing',
      'digital marketing',
      'growth',
      'brand',
      'community manager',
      'community',
      'seo',
      'social media',
    ],
    description: {
      en: 'Marketing, brand, growth and community-management opportunities.',
      fr: 'Opportunites en marketing, marque, croissance et gestion de communaute.',
    },
    skills: ['Social media', 'SEO', 'Content', 'Analytics', 'Branding'],
  },
  {
    slug: 'sales',
    name: { en: 'Sales', fr: 'Commercial' },
    keywords: [
      'sales',
      'commercial',
      'commerciale',
      'business development',
      'account executive',
      'account manager',
      'agent commercial',
    ],
    description: {
      en: 'Sales, business development and account-management roles.',
      fr: 'Postes commerciaux, developpement des affaires et gestion de comptes.',
    },
    skills: ['Negotiation', 'CRM', 'Prospecting', 'Pipeline management'],
  },
  {
    slug: 'accounting',
    name: { en: 'Accounting', fr: 'Comptabilite' },
    keywords: [
      'accountant',
      'comptable',
      'comptabilite',
      'accounting',
      'bookkeeper',
      'audit',
      'auditor',
    ],
    description: {
      en: 'Accounting, audit and bookkeeping positions for verified employers.',
      fr: 'Postes en comptabilite, audit et tenue de livres chez des employeurs verifies.',
    },
    skills: ['IFRS', 'SYSCOHADA', 'Reporting', 'Excel'],
  },
  {
    slug: 'customer-service',
    name: { en: 'Customer Service', fr: 'Service client' },
    keywords: [
      'customer service',
      'customer support',
      'support client',
      'service client',
      'call center',
      "centre d'appel",
      'helpdesk',
    ],
    description: {
      en: 'Customer support and call-center roles, on-site and remote.',
      fr: "Postes en support client et centre d'appel, sur site ou a distance.",
    },
    skills: ['Communication', 'CRM', 'Patience', 'Problem solving'],
  },
  {
    slug: 'design',
    name: { en: 'Design', fr: 'Design' },
    keywords: [
      'designer',
      'graphic designer',
      'ux',
      'ui',
      'product designer',
      'graphiste',
      'infographiste',
    ],
    description: {
      en: 'Visual, product and UX/UI design roles.',
      fr: 'Postes en design visuel, produit et UX/UI.',
    },
    skills: ['Figma', 'Adobe', 'Prototyping', 'Typography'],
  },
  {
    slug: 'finance',
    name: { en: 'Finance', fr: 'Finance' },
    keywords: [
      'finance',
      'financial analyst',
      'analyste financier',
      'controller',
      'controleur',
      'treasury',
      'cfo',
    ],
    description: {
      en: 'Financial analysis, control and treasury opportunities.',
      fr: 'Opportunites en analyse financiere, controle et tresorerie.',
    },
    skills: ['Modeling', 'Excel', 'IFRS', 'Reporting'],
  },
  {
    slug: 'hr',
    name: { en: 'Human Resources', fr: 'Ressources humaines' },
    keywords: [
      'human resources',
      'hr',
      'ressources humaines',
      'rh',
      'recruiter',
      'recruteur',
      'talent',
      'people operations',
    ],
    description: {
      en: 'Talent, recruitment, and people-operations roles.',
      fr: 'Postes en talent, recrutement et gestion du personnel.',
    },
    skills: ['Recruiting', 'Onboarding', 'Payroll', 'Labor law'],
  },
  {
    slug: 'operations',
    name: { en: 'Operations', fr: 'Operations' },
    keywords: [
      'operations',
      'logistics',
      'logistique',
      'supply chain',
      "chaine d'approvisionnement",
      'project manager',
      'chef de projet',
    ],
    description: {
      en: 'Operations, logistics and project-management positions.',
      fr: 'Postes en operations, logistique et gestion de projet.',
    },
    skills: ['Planning', 'KPI tracking', 'Process improvement'],
  },
  {
    slug: 'engineering',
    name: { en: 'Engineering', fr: 'Ingenierie' },
    keywords: [
      'civil engineer',
      'mechanical engineer',
      'electrical engineer',
      'ingenieur civil',
      'ingenieur mecanique',
      'ingenieur electrique',
      'engineering',
    ],
    description: {
      en: 'Civil, mechanical and electrical engineering opportunities.',
      fr: 'Opportunites en genie civil, mecanique et electrique.',
    },
    skills: ['AutoCAD', 'Project planning', 'Quality control'],
  },
  {
    slug: 'education',
    name: { en: 'Education', fr: 'Education' },
    keywords: [
      'teacher',
      'professeur',
      'instructor',
      'formateur',
      'tutor',
      'tuteur',
      'lecturer',
      'enseignant',
      'education',
    ],
    description: {
      en: 'Teaching, training and instructional roles.',
      fr: 'Postes en enseignement, formation et instruction.',
    },
    skills: ['Lesson planning', 'Curriculum design', 'Pedagogy'],
  },
  {
    slug: 'healthcare',
    name: { en: 'Healthcare', fr: 'Sante' },
    keywords: [
      'nurse',
      'infirmier',
      'infirmiere',
      'doctor',
      'medecin',
      'pharmacist',
      'pharmacien',
      'medical',
      'sante',
      'healthcare',
    ],
    description: {
      en: 'Medical, nursing and pharmaceutical roles for the health sector.',
      fr: 'Postes medicaux, infirmiers et pharmaceutiques pour le secteur de la sante.',
    },
    skills: ['Patient care', 'Diagnostics', 'Pharmacology'],
  },
];

export const CATEGORY_SLUGS = JOB_CATEGORIES.map((c) => c.slug);

export function getCategoryBySlug(slug: string): JobCategory | undefined {
  return JOB_CATEGORIES.find((c) => c.slug === slug);
}
