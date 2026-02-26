'use client';

import Link from 'next/link';
import ProgressRing from './ProgressRing';
import type { LearningTrack } from '@/lib/skillup/types';
import { BookOpen, Rocket, Users, Star } from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  foundation: <BookOpen className="w-6 h-6" />,
  rocket: <Rocket className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  star: <Star className="w-6 h-6" />,
  book: <BookOpen className="w-6 h-6" />,
};

interface TrackCardProps {
  track: LearningTrack;
  locale?: string;
}

export default function TrackCard({ track, locale = 'en' }: TrackCardProps) {
  const title = locale === 'fr' && track.title_fr ? track.title_fr : track.title;
  const description =
    locale === 'fr' && track.description_fr
      ? track.description_fr
      : track.description;

  return (
    <Link
      href={`/dashboard/skillup/track/${track.slug}`}
      className="block bg-gray-800 rounded-xl p-6 hover:bg-gray-750 hover:ring-1 hover:ring-blue-500/50 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
          {iconMap[track.icon] || iconMap.book}
        </div>
        <ProgressRing percent={track.progress_percent || 0} size={44} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
        {title}
      </h3>
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{description}</p>
      <div className="text-xs text-gray-500">
        {track.course_count} {track.course_count === 1 ? 'course' : 'courses'}
      </div>
    </Link>
  );
}
