'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Bot, ArrowRight } from 'lucide-react';
import TrackCard from './components/TrackCard';
import StreakWidget from './components/StreakWidget';
import RecommendedPaths from './components/RecommendedPaths';
import SkillRadar from './components/SkillRadar';
import PartnerCourses from './components/PartnerCourses';
import type { LearningTrack } from '@/lib/skillup/types';

export default function SkillUpPage() {
  const [tracks, setTracks] = useState<LearningTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skillup/tracks')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTracks(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GraduationCap className="w-8 h-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Skill Up</h1>
          <p className="text-sm text-gray-400">
            Microlearning modules to boost your career
          </p>
        </div>
      </div>

      {/* Streak Widget */}
      <StreakWidget />

      {/* Skill Overview */}
      <SkillRadar />

      {/* AI Recommendations */}
      <RecommendedPaths />

      {/* AI Career Counselor Link Card */}
      <Link
        href="/dashboard/skillup/counselor"
        className="block bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-purple-500/50 transition-all group"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/20 rounded-xl">
            <Bot className="w-8 h-8 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">
              AI Career Counselor
            </h3>
            <p className="text-sm text-gray-400 mb-3">
              Get personalized career guidance powered by AI. Discuss your skill
              gaps, career paths, and get course recommendations based on market
              demand.
            </p>
            <span className="inline-flex items-center gap-1 text-sm text-purple-400 group-hover:text-purple-300 transition">
              Start a conversation
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </Link>

      {/* Learning Tracks */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Learning Tracks</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-400">
              No learning tracks available yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        )}
      </div>

      {/* Partner Courses (DB-driven, replaces static PartnerBanner) */}
      <PartnerCourses />
    </div>
  );
}
