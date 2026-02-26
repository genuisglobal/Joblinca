'use client';

import { useEffect, useState } from 'react';
import { Flame, Zap, Trophy } from 'lucide-react';
import type { LearningStreak } from '@/lib/skillup/types';

export default function StreakWidget() {
  const [streak, setStreak] = useState<LearningStreak | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skillup/progress')
      .then((r) => r.json())
      .then((data) => {
        setStreak(data.streak);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 animate-pulse">
        <div className="h-16 bg-gray-700 rounded" />
      </div>
    );
  }

  const s = streak || {
    current_streak: 0,
    longest_streak: 0,
    xp_points: 0,
    total_modules_completed: 0,
    total_courses_completed: 0,
  };

  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className={`w-5 h-5 ${s.current_streak > 0 ? 'text-orange-400' : 'text-gray-600'}`} />
            <span className="text-2xl font-bold text-white">{s.current_streak}</span>
          </div>
          <p className="text-xs text-gray-400">Day Streak</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="w-5 h-5 text-yellow-400" />
            <span className="text-2xl font-bold text-white">{s.xp_points}</span>
          </div>
          <p className="text-xs text-gray-400">XP Points</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold text-white">{s.total_modules_completed}</span>
          </div>
          <p className="text-xs text-gray-400">Modules Done</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="w-5 h-5 text-green-400" />
            <span className="text-2xl font-bold text-white">{s.total_courses_completed}</span>
          </div>
          <p className="text-xs text-gray-400">Courses Done</p>
        </div>
      </div>

      {s.current_streak >= 3 && (
        <div className="mt-3 text-center text-xs text-orange-400 bg-orange-500/10 rounded-lg py-1.5">
          Streak bonus active: +5 XP per module!
        </div>
      )}
    </div>
  );
}
