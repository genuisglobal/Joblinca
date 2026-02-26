'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import type { SkillCategoryScore } from '@/lib/skillup/types';

export default function SkillRadar() {
  const [categories, setCategories] = useState<SkillCategoryScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skillup/skills')
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Skill Overview</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) return null;

  // Sort by gap descending so biggest gaps show first
  const sorted = [...categories].sort((a, b) => b.gap - a.gap);

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Skill Overview</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Your skills vs market demand. Gaps indicate high-demand areas to focus on.
      </p>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Your Skills
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-gray-600 inline-block" /> Market Demand
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-yellow-400" /> Gap
        </span>
      </div>

      <div className="space-y-3">
        {sorted.map((cat) => (
          <div key={cat.slug}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-300">{cat.label}</span>
              <div className="flex items-center gap-2">
                {cat.gap > 20 && (
                  <span className="flex items-center gap-1 text-xs text-yellow-400">
                    <AlertTriangle className="w-3 h-3" />
                    Gap
                  </span>
                )}
                {cat.userScore > 60 && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <TrendingUp className="w-3 h-3" />
                    Strong
                  </span>
                )}
              </div>
            </div>
            <div className="relative h-5 bg-gray-700 rounded-full overflow-hidden">
              {/* Market demand (background bar) */}
              <div
                className="absolute inset-y-0 left-0 bg-gray-600 rounded-full transition-all duration-700"
                style={{ width: `${cat.marketDemand}%` }}
              />
              {/* User score (foreground bar) */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                  cat.gap > 30
                    ? 'bg-yellow-500'
                    : cat.gap > 10
                      ? 'bg-blue-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${cat.userScore}%` }}
              />
              {/* Score labels */}
              <div className="absolute inset-0 flex items-center justify-between px-2">
                <span className="text-[10px] font-medium text-white drop-shadow-sm">
                  {cat.userScore}%
                </span>
                {cat.marketDemand > 0 && (
                  <span className="text-[10px] text-gray-300 drop-shadow-sm">
                    {cat.marketDemand}% demand
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
