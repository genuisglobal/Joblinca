'use client';

import Link from 'next/link';
import { difficultyColor } from '@/lib/skillup/helpers';
import type { LearningCourse } from '@/lib/skillup/types';
import { ExternalLink } from 'lucide-react';

interface CourseCardProps {
  course: LearningCourse;
  locale?: string;
}

export default function CourseCard({ course, locale = 'en' }: CourseCardProps) {
  const title = locale === 'fr' && course.title_fr ? course.title_fr : course.title;
  const description =
    locale === 'fr' && course.description_fr
      ? course.description_fr
      : course.description;

  const completedCount = course.completed_count || 0;
  const moduleCount = course.module_count || 0;
  const progressPercent =
    moduleCount > 0 ? Math.round((completedCount / moduleCount) * 100) : 0;

  return (
    <Link
      href={`/dashboard/skillup/course/${course.slug}`}
      className="block bg-gray-800 rounded-xl p-5 hover:bg-gray-750 hover:ring-1 hover:ring-blue-500/50 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${difficultyColor(course.difficulty)}`}
        >
          {course.difficulty}
        </span>
        <span className="text-xs text-gray-500">
          ~{course.estimated_minutes} min
        </span>
      </div>

      <h4 className="text-base font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
        {title}
      </h4>
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{description}</p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>
            {completedCount}/{moduleCount} modules
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {course.partner_name && (
        <div className="flex items-center gap-1 text-xs text-purple-400">
          <ExternalLink className="w-3 h-3" />
          <span>Partner: {course.partner_name}</span>
        </div>
      )}
    </Link>
  );
}
