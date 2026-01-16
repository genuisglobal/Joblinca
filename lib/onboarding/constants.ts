// Constants for Joblinca Onboarding

export const CAMEROON_PHONE_CODE = '+237';

export const CAMEROON_REGIONS = [
  { value: 'adamawa', label: 'Adamawa' },
  { value: 'centre', label: 'Centre' },
  { value: 'east', label: 'East' },
  { value: 'far_north', label: 'Far North' },
  { value: 'littoral', label: 'Littoral' },
  { value: 'north', label: 'North' },
  { value: 'northwest', label: 'Northwest' },
  { value: 'west', label: 'West' },
  { value: 'south', label: 'South' },
  { value: 'southwest', label: 'Southwest' },
] as const;

export const CAMEROON_CITIES = [
  { value: 'douala', label: 'Douala', region: 'littoral' },
  { value: 'yaounde', label: 'Yaoundé', region: 'centre' },
  { value: 'bamenda', label: 'Bamenda', region: 'northwest' },
  { value: 'bafoussam', label: 'Bafoussam', region: 'west' },
  { value: 'garoua', label: 'Garoua', region: 'north' },
  { value: 'maroua', label: 'Maroua', region: 'far_north' },
  { value: 'ngaoundere', label: 'Ngaoundéré', region: 'adamawa' },
  { value: 'bertoua', label: 'Bertoua', region: 'east' },
  { value: 'ebolowa', label: 'Ebolowa', region: 'south' },
  { value: 'buea', label: 'Buea', region: 'southwest' },
  { value: 'limbe', label: 'Limbe', region: 'southwest' },
  { value: 'kribi', label: 'Kribi', region: 'south' },
  { value: 'kumba', label: 'Kumba', region: 'southwest' },
  { value: 'nkongsamba', label: 'Nkongsamba', region: 'littoral' },
  { value: 'edea', label: 'Edéa', region: 'littoral' },
  { value: 'dschang', label: 'Dschang', region: 'west' },
  { value: 'foumban', label: 'Foumban', region: 'west' },
  { value: 'sangmelima', label: 'Sangmélima', region: 'south' },
  { value: 'mbalmayo', label: 'Mbalmayo', region: 'centre' },
  { value: 'kousseri', label: 'Kousseri', region: 'far_north' },
] as const;

// Combined residence locations (cities with their regions)
export const RESIDENCE_LOCATIONS = [
  { value: 'douala', label: 'Douala (Littoral)' },
  { value: 'yaounde', label: 'Yaoundé (Centre)' },
  { value: 'bamenda', label: 'Bamenda (Northwest)' },
  { value: 'bafoussam', label: 'Bafoussam (West)' },
  { value: 'buea', label: 'Buea (Southwest)' },
  { value: 'limbe', label: 'Limbe (Southwest)' },
  { value: 'garoua', label: 'Garoua (North)' },
  { value: 'maroua', label: 'Maroua (Far North)' },
  { value: 'ngaoundere', label: 'Ngaoundéré (Adamawa)' },
  { value: 'bertoua', label: 'Bertoua (East)' },
  { value: 'ebolowa', label: 'Ebolowa (South)' },
  { value: 'kribi', label: 'Kribi (South)' },
  { value: 'kumba', label: 'Kumba (Southwest)' },
  { value: 'nkongsamba', label: 'Nkongsamba (Littoral)' },
  { value: 'edea', label: 'Edéa (Littoral)' },
  { value: 'dschang', label: 'Dschang (West)' },
  { value: 'foumban', label: 'Foumban (West)' },
  { value: 'other', label: 'Other' },
] as const;

// Location interests for job seekers/talents
export const LOCATION_INTERESTS = [
  { value: 'remote', label: 'Remote / Work from Home', icon: 'Home', highlight: true },
  { value: 'douala', label: 'Douala', icon: 'MapPin', highlight: false },
  { value: 'yaounde', label: 'Yaoundé', icon: 'MapPin', highlight: false },
  { value: 'bamenda', label: 'Bamenda', icon: 'MapPin', highlight: false },
  { value: 'bafoussam', label: 'Bafoussam', icon: 'MapPin', highlight: false },
  { value: 'buea', label: 'Buea', icon: 'MapPin', highlight: false },
  { value: 'limbe', label: 'Limbe', icon: 'MapPin', highlight: false },
  { value: 'kribi', label: 'Kribi', icon: 'MapPin', highlight: false },
  { value: 'anywhere_cameroon', label: 'Anywhere in Cameroon', icon: 'Globe', highlight: true },
  { value: 'international', label: 'International / Abroad', icon: 'Plane', highlight: true },
] as const;

export const RECRUITER_TYPES = [
  { value: 'company_hr', label: 'Company HR Department', description: 'Hiring for your own company' },
  { value: 'agency', label: 'Recruiting Agency', description: 'Hiring for multiple clients' },
  { value: 'verified_individual', label: 'Independent Recruiter', description: 'Freelance recruiting' },
  { value: 'institution', label: 'Institution / Organization', description: 'Schools, NGOs, government' },
] as const;

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

// Popular skills for suggestions (with categories)
export const POPULAR_SKILLS = {
  technical: [
    'JavaScript',
    'TypeScript',
    'Python',
    'Java',
    'C++',
    'C#',
    'PHP',
    'Ruby',
    'Go',
    'Rust',
    'Swift',
    'Kotlin',
    'React',
    'Vue.js',
    'Angular',
    'Node.js',
    'Django',
    'Laravel',
    'Spring Boot',
    'SQL',
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'Redis',
    'AWS',
    'Azure',
    'Google Cloud',
    'Docker',
    'Kubernetes',
    'Git',
    'Linux',
    'REST APIs',
    'GraphQL',
    'Machine Learning',
    'Data Science',
    'Cybersecurity',
    'DevOps',
    'CI/CD',
  ],
  design: [
    'Figma',
    'Adobe Photoshop',
    'Adobe Illustrator',
    'Adobe XD',
    'Sketch',
    'UI/UX Design',
    'Graphic Design',
    'Web Design',
    'Mobile Design',
    'Prototyping',
    'Wireframing',
    'Brand Design',
    'Video Editing',
    'Motion Graphics',
    'After Effects',
    'Premiere Pro',
  ],
  business: [
    'Microsoft Excel',
    'Microsoft Word',
    'Microsoft PowerPoint',
    'Google Workspace',
    'Project Management',
    'Agile/Scrum',
    'Data Analysis',
    'Financial Analysis',
    'Business Development',
    'Sales',
    'Marketing',
    'Digital Marketing',
    'SEO/SEM',
    'Content Writing',
    'Copywriting',
    'Social Media Management',
    'Customer Service',
    'Human Resources',
    'Accounting',
    'QuickBooks',
  ],
  soft: [
    'Communication',
    'Leadership',
    'Problem Solving',
    'Critical Thinking',
    'Teamwork',
    'Time Management',
    'Adaptability',
    'Creativity',
    'Attention to Detail',
    'Public Speaking',
    'Negotiation',
    'Conflict Resolution',
  ],
  languages: [
    'English',
    'French',
    'German',
    'Spanish',
    'Chinese',
    'Arabic',
  ],
} as const;

// Flat list of all skills for easy searching
export const ALL_SKILLS = [
  ...POPULAR_SKILLS.technical,
  ...POPULAR_SKILLS.design,
  ...POPULAR_SKILLS.business,
  ...POPULAR_SKILLS.soft,
  ...POPULAR_SKILLS.languages,
];

// Fields of study
export const FIELDS_OF_STUDY = [
  'Computer Science',
  'Software Engineering',
  'Information Technology',
  'Data Science',
  'Cybersecurity',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Business Administration',
  'Economics',
  'Finance',
  'Accounting',
  'Marketing',
  'Human Resources',
  'Law',
  'Medicine',
  'Nursing',
  'Pharmacy',
  'Public Health',
  'Psychology',
  'Sociology',
  'Communication',
  'Journalism',
  'Graphic Design',
  'Architecture',
  'Education',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Agriculture',
  'Environmental Science',
  'Other',
] as const;

// Graduation years (past 20 years to future 6 years)
export const GRADUATION_YEARS = Array.from(
  { length: 27 },
  (_, i) => {
    const year = new Date().getFullYear() - 20 + i;
    return { value: year, label: year.toString() };
  }
);

// File upload constraints
export const FILE_CONSTRAINTS = {
  resume: {
    maxSize: 5 * 1024 * 1024, // 5MB
    acceptedTypes: ['.pdf', '.doc', '.docx'],
    acceptedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  avatar: {
    maxSize: 2 * 1024 * 1024, // 2MB
    acceptedTypes: ['.jpg', '.jpeg', '.png', '.webp'],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  logo: {
    maxSize: 2 * 1024 * 1024, // 2MB
    acceptedTypes: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
} as const;
