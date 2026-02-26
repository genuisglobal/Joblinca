'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Clock, BookOpen } from 'lucide-react';
import type { PartnerCourse } from '@/lib/skillup/types';

const COST_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: 'Free', className: 'bg-green-500/20 text-green-400' },
  paid: { label: 'Paid', className: 'bg-yellow-500/20 text-yellow-400' },
  freemium: { label: 'Freemium', className: 'bg-blue-500/20 text-blue-400' },
};

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  beginner: { label: 'Beginner', className: 'bg-green-500/10 text-green-400' },
  intermediate: { label: 'Intermediate', className: 'bg-yellow-500/10 text-yellow-400' },
  advanced: { label: 'Advanced', className: 'bg-red-500/10 text-red-400' },
};

function formatDuration(minutes?: number): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export default function PartnerCourses() {
  const [courses, setCourses] = useState<PartnerCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skillup/partners')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCourses(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClick = (course: PartnerCourse) => {
    // Track referral click
    fetch('/api/skillup/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id }),
    }).catch(() => {});

    // Open referral URL or direct URL
    window.open(course.referral_url || course.url, '_blank', 'noopener');
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">
            Continue Learning with Our Partners
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (courses.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">
          Continue Learning with Our Partners
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => {
          const cost = COST_BADGE[course.cost_type || ''] || COST_BADGE.free;
          const level = LEVEL_BADGE[course.level || ''] || LEVEL_BADGE.beginner;

          return (
            <button
              key={course.id}
              onClick={() => handleClick(course)}
              className="bg-gray-800 rounded-xl p-5 text-left hover:bg-gray-750 hover:ring-1 hover:ring-purple-500/50 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium text-purple-400">
                  {course.partner_name}
                </span>
                {course.featured && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                    Featured
                  </span>
                )}
              </div>

              <h4 className="text-sm font-medium text-white mb-2 group-hover:text-purple-300 transition-colors line-clamp-2">
                {course.title}
              </h4>

              {course.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                  {course.description}
                </p>
              )}

              <div className="flex items-center flex-wrap gap-2 mt-auto">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${cost.className}`}>
                  {cost.label}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${level.className}`}>
                  {level.label}
                </span>
                {course.duration_minutes && (
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(course.duration_minutes)}
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-gray-500 ml-auto group-hover:text-purple-400 transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
