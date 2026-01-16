// Types for custom screening questions in job postings

export type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'yesno';

export interface CustomQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  options?: string[];
}

export interface QuestionAnswer {
  questionId: string;
  answer: string | string[] | boolean;
}

// Pre-defined question library organized by category
export const PREDEFINED_QUESTIONS: Omit<CustomQuestion, 'id'>[] = [
  // Availability
  {
    question: 'When can you start?',
    type: 'text',
    required: true,
  },
  {
    question: 'Are you willing to relocate?',
    type: 'yesno',
    required: false,
  },
  {
    question: 'Are you available to work full-time?',
    type: 'yesno',
    required: true,
  },
  {
    question: 'Can you work on weekends if required?',
    type: 'yesno',
    required: false,
  },

  // Experience
  {
    question: 'How many years of experience do you have in this field?',
    type: 'text',
    required: true,
  },
  {
    question: 'Describe your most relevant project or experience.',
    type: 'textarea',
    required: false,
  },
  {
    question: 'What tools or technologies are you most proficient in?',
    type: 'textarea',
    required: false,
  },

  // Salary & Work
  {
    question: 'What are your salary expectations (XAF per month)?',
    type: 'text',
    required: false,
  },
  {
    question: 'What is your preferred work arrangement?',
    type: 'select',
    required: false,
    options: ['Onsite', 'Remote', 'Hybrid', 'Flexible'],
  },

  // Legal/Eligibility
  {
    question: 'Are you legally authorized to work in Cameroon?',
    type: 'yesno',
    required: true,
  },
  {
    question: 'Do you have a valid work permit (if applicable)?',
    type: 'yesno',
    required: false,
  },

  // Education
  {
    question: 'What is your highest level of education?',
    type: 'select',
    required: false,
    options: ['High School', "Bachelor's Degree", "Master's Degree", 'PhD', 'Other'],
  },
  {
    question: 'What was your field of study?',
    type: 'text',
    required: false,
  },

  // Skills & Qualifications
  {
    question: 'Do you have any relevant certifications?',
    type: 'textarea',
    required: false,
  },
  {
    question: 'What programming languages are you proficient in?',
    type: 'multiselect',
    required: false,
    options: ['JavaScript', 'Python', 'Java', 'C++', 'PHP', 'Go', 'Ruby', 'Other'],
  },
  {
    question: 'Rate your proficiency in English.',
    type: 'select',
    required: false,
    options: ['Basic', 'Intermediate', 'Fluent', 'Native'],
  },
  {
    question: 'Rate your proficiency in French.',
    type: 'select',
    required: false,
    options: ['Basic', 'Intermediate', 'Fluent', 'Native'],
  },
];

// Generate a unique ID for questions
export function generateQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Validate a question object
export function validateQuestion(question: Partial<CustomQuestion>): string | null {
  if (!question.question || question.question.trim().length === 0) {
    return 'Question text is required';
  }
  if (!question.type) {
    return 'Question type is required';
  }
  if (!['text', 'textarea', 'select', 'multiselect', 'yesno'].includes(question.type)) {
    return 'Invalid question type';
  }
  if ((question.type === 'select' || question.type === 'multiselect') &&
      (!question.options || question.options.length < 2)) {
    return 'Select questions require at least 2 options';
  }
  return null;
}

// Get type label for display
export function getQuestionTypeLabel(type: QuestionType): string {
  const labels: Record<QuestionType, string> = {
    text: 'Short Text',
    textarea: 'Long Text',
    select: 'Single Choice',
    multiselect: 'Multiple Choice',
    yesno: 'Yes/No',
  };
  return labels[type] || type;
}
