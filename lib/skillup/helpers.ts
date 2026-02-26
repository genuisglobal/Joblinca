import { QuizQuestion } from './types';

export function gradeQuiz(questions: QuizQuestion[], answers: number[]): number {
  if (questions.length === 0) return 100;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correct_index) {
      correct++;
    }
  }
  return Math.round((correct / questions.length) * 100);
}

export function calculateXP(baseXP: number, currentStreak: number): number {
  const bonus = currentStreak >= 3 ? 5 : 0;
  return baseXP + bonus;
}

export function computeStreakUpdate(lastActivityDate: string | null): {
  action: 'increment' | 'reset' | 'none';
} {
  if (!lastActivityDate) return { action: 'reset' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastActivityDate);
  last.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - last.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { action: 'none' };
  if (diffDays === 1) return { action: 'increment' };
  return { action: 'reset' };
}

export function progressPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function difficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'beginner': return 'bg-green-500/20 text-green-400';
    case 'intermediate': return 'bg-yellow-500/20 text-yellow-400';
    case 'advanced': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}
