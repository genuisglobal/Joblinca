import type { SkillCategory, SkillCategoryScore } from './types';

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    slug: 'web-development',
    label: 'Web Development',
    label_fr: 'Développement Web',
    keywords: [
      'javascript', 'typescript', 'react', 'nextjs', 'next.js', 'angular',
      'vue', 'html', 'css', 'tailwind', 'node', 'nodejs', 'express',
      'php', 'laravel', 'django', 'flask', 'ruby', 'rails', 'frontend',
      'backend', 'fullstack', 'full-stack', 'web', 'api', 'rest', 'graphql',
    ],
  },
  {
    slug: 'data-analysis',
    label: 'Data Analysis',
    label_fr: 'Analyse de Données',
    keywords: [
      'excel', 'sql', 'python', 'pandas', 'numpy', 'tableau', 'power-bi',
      'powerbi', 'statistics', 'data', 'analytics', 'visualization',
      'reporting', 'spreadsheet', 'r-language', 'r programming', 'spss',
    ],
  },
  {
    slug: 'cloud',
    label: 'Cloud & DevOps',
    label_fr: 'Cloud & DevOps',
    keywords: [
      'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes',
      'devops', 'ci/cd', 'terraform', 'ansible', 'linux', 'server',
      'deployment', 'infrastructure', 'cloud', 'heroku', 'vercel',
    ],
  },
  {
    slug: 'communication',
    label: 'Communication',
    label_fr: 'Communication',
    keywords: [
      'writing', 'public-speaking', 'public speaking', 'presentation',
      'negotiation', 'interpersonal', 'storytelling', 'persuasion',
      'verbal', 'written', 'communication', 'english', 'french', 'bilingual',
    ],
  },
  {
    slug: 'leadership',
    label: 'Leadership',
    label_fr: 'Leadership',
    keywords: [
      'management', 'team-lead', 'team lead', 'mentoring', 'strategy',
      'leadership', 'coaching', 'delegation', 'decision-making',
      'conflict-resolution', 'people-management', 'supervision',
    ],
  },
  {
    slug: 'project-management',
    label: 'Project Management',
    label_fr: 'Gestion de Projet',
    keywords: [
      'agile', 'scrum', 'kanban', 'planning', 'jira', 'trello', 'asana',
      'project-management', 'pmp', 'prince2', 'gantt', 'risk-management',
      'budgeting', 'stakeholder', 'sprint', 'milestone',
    ],
  },
  {
    slug: 'design',
    label: 'Design',
    label_fr: 'Design',
    keywords: [
      'figma', 'adobe', 'photoshop', 'illustrator', 'ui', 'ux',
      'graphic-design', 'graphic design', 'user-experience', 'user-interface',
      'wireframe', 'prototype', 'sketch', 'canva', 'indesign', 'branding',
    ],
  },
  {
    slug: 'marketing',
    label: 'Marketing',
    label_fr: 'Marketing',
    keywords: [
      'seo', 'social-media', 'social media', 'content', 'advertising',
      'marketing', 'digital-marketing', 'google-ads', 'facebook-ads',
      'email-marketing', 'copywriting', 'brand', 'campaign', 'analytics',
    ],
  },
  {
    slug: 'finance',
    label: 'Finance',
    label_fr: 'Finance',
    keywords: [
      'accounting', 'budgeting', 'financial-analysis', 'financial analysis',
      'audit', 'finance', 'bookkeeping', 'tax', 'payroll', 'quickbooks',
      'sage', 'invoicing', 'reconciliation', 'financial-reporting',
    ],
  },
  {
    slug: 'ai-ml',
    label: 'AI & Machine Learning',
    label_fr: 'IA & Machine Learning',
    keywords: [
      'machine-learning', 'machine learning', 'deep-learning', 'deep learning',
      'nlp', 'natural-language-processing', 'tensorflow', 'pytorch',
      'ai', 'artificial-intelligence', 'neural-network', 'computer-vision',
      'chatgpt', 'llm', 'generative-ai', 'data-science',
    ],
  },
];

/**
 * Maps raw skill strings to category slugs using fuzzy keyword matching.
 */
export function mapSkillsToCategories(skills: string[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const cat of SKILL_CATEGORIES) {
    scores[cat.slug] = 0;
  }

  const normalised = skills.map((s) => s.toLowerCase().trim());

  for (const skill of normalised) {
    for (const cat of SKILL_CATEGORIES) {
      for (const kw of cat.keywords) {
        if (skill.includes(kw) || kw.includes(skill)) {
          scores[cat.slug] += 1;
          break; // one match per category per skill
        }
      }
    }
  }

  return scores;
}

/**
 * Extracts demanded skill categories from job listing text.
 * Returns category slug → count of occurrences.
 */
export function extractDemandedSkills(jobTexts: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cat of SKILL_CATEGORIES) {
    counts[cat.slug] = 0;
  }

  for (const text of jobTexts) {
    const lower = text.toLowerCase();
    for (const cat of SKILL_CATEGORIES) {
      for (const kw of cat.keywords) {
        // Count each keyword occurrence once per job text
        if (lower.includes(kw)) {
          counts[cat.slug] += 1;
          break;
        }
      }
    }
  }

  return counts;
}

/**
 * Produces scored categories with user strength, market demand, and gap.
 */
export function analyzeSkillGaps(
  userSkillCounts: Record<string, number>,
  completedCourseCategories: string[],
  demandCounts: Record<string, number>,
): SkillCategoryScore[] {
  // Normalise user scores: each skill match = 15 points, each completed course in category = 20, cap 100
  const courseCatCounts: Record<string, number> = {};
  for (const cat of completedCourseCategories) {
    courseCatCounts[cat] = (courseCatCounts[cat] || 0) + 1;
  }

  // Find max demand for normalisation
  const maxDemand = Math.max(1, ...Object.values(demandCounts));

  return SKILL_CATEGORIES.map((cat) => {
    const rawUser =
      (userSkillCounts[cat.slug] || 0) * 15 +
      (courseCatCounts[cat.slug] || 0) * 20;
    const userScore = Math.min(100, rawUser);
    const marketDemand = Math.round(
      ((demandCounts[cat.slug] || 0) / maxDemand) * 100,
    );

    return {
      slug: cat.slug,
      label: cat.label,
      label_fr: cat.label_fr,
      userScore,
      marketDemand,
      gap: Math.max(0, marketDemand - userScore),
    };
  });
}
