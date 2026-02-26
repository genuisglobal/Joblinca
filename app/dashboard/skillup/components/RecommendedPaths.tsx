'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { CourseRecommendation } from '@/lib/skillup/types';

export default function RecommendedPaths() {
  const [recommendations, setRecommendations] = useState<CourseRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skillup/recommend')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecommendations(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (recommendations.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Recommended for You</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {recommendations.map((rec) => (
          <Link
            key={rec.course_slug}
            href={`/dashboard/skillup/course/${rec.course_slug}`}
            className="bg-gray-800 rounded-xl p-4 hover:bg-gray-750 hover:ring-1 hover:ring-purple-500/50 transition-all group"
          >
            <h4 className="text-sm font-semibold text-white group-hover:text-purple-400 transition-colors mb-1">
              {rec.course_title}
            </h4>
            <p className="text-xs text-gray-400 line-clamp-2">{rec.reason}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
