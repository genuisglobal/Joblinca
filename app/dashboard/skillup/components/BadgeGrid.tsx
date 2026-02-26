'use client';

import { Award, Star, Shield } from 'lucide-react';

interface Badge {
  id: string;
  badge_type: string;
  badge_name: string;
  course_slug?: string;
  issued_at?: string;
  metadata?: Record<string, unknown>;
}

interface BadgeGridProps {
  badges: Badge[];
  compact?: boolean;
}

function getBadgeIcon(badgeType: string) {
  switch (badgeType) {
    case 'course_completion':
      return <Award className="w-5 h-5" />;
    case 'track_completion':
      return <Star className="w-5 h-5" />;
    case 'streak':
      return <Shield className="w-5 h-5" />;
    default:
      return <Award className="w-5 h-5" />;
  }
}

function getBadgeColor(badgeType: string) {
  switch (badgeType) {
    case 'course_completion':
      return 'from-blue-500/20 to-blue-600/20 text-blue-400 border-blue-500/30';
    case 'track_completion':
      return 'from-yellow-500/20 to-yellow-600/20 text-yellow-400 border-yellow-500/30';
    case 'streak':
      return 'from-orange-500/20 to-orange-600/20 text-orange-400 border-orange-500/30';
    default:
      return 'from-gray-500/20 to-gray-600/20 text-gray-400 border-gray-500/30';
  }
}

export default function BadgeGrid({ badges, compact = false }: BadgeGridProps) {
  if (badges.length === 0) {
    return (
      <p className="text-sm text-gray-500">No learning badges yet.</p>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge.id}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-gradient-to-r ${getBadgeColor(badge.badge_type)}`}
            title={badge.badge_name}
          >
            {getBadgeIcon(badge.badge_type)}
            {badge.badge_name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {badges.map((badge) => (
        <div
          key={badge.id}
          className={`flex flex-col items-center gap-2 p-3 rounded-lg border bg-gradient-to-br ${getBadgeColor(badge.badge_type)}`}
        >
          <div className="p-2 rounded-full bg-black/20">
            {getBadgeIcon(badge.badge_type)}
          </div>
          <span className="text-xs font-medium text-center leading-tight">
            {badge.badge_name}
          </span>
          {badge.issued_at && (
            <span className="text-[10px] text-gray-500">
              {new Date(badge.issued_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
