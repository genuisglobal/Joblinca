'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import CourseCard from '../../components/CourseCard';
import type { LearningTrack, LearningCourse } from '@/lib/skillup/types';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function TrackDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [track, setTrack] = useState<LearningTrack | null>(null);
  const [courses, setCourses] = useState<LearningCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrack() {
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (!user) return;

        // Fetch track
        const { data: trackData } = await supabaseBrowser
          .from('learning_tracks')
          .select('*')
          .eq('slug', slug)
          .eq('published', true)
          .single();

        if (!trackData) return;
        setTrack(trackData);

        // Fetch courses with module counts and progress
        const { data: coursesData } = await supabaseBrowser
          .from('learning_courses')
          .select(`
            *,
            learning_modules (
              id,
              learning_progress (
                id,
                status,
                user_id
              )
            )
          `)
          .eq('track_id', trackData.id)
          .eq('published', true)
          .order('display_order');

        if (coursesData) {
          const enriched = coursesData.map((course: any) => {
            const modules = course.learning_modules || [];
            const completed = modules.filter((m: any) =>
              (m.learning_progress || []).some(
                (p: any) => p.user_id === user.id && p.status === 'completed'
              )
            ).length;
            return {
              ...course,
              learning_modules: undefined,
              module_count: modules.length,
              completed_count: completed,
            };
          });
          setCourses(enriched);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    loadTrack();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-400">Track not found.</p>
        <Link href="/dashboard/skillup" className="text-blue-400 hover:underline mt-2 inline-block">
          Back to Skill Up
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/skillup" className="hover:text-white transition">
          Skill Up
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-white">{track.title}</span>
      </nav>

      {/* Track header */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">{track.title}</h1>
        <p className="text-gray-400">{track.description}</p>
      </div>

      {/* Courses grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {courses.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400">No courses available in this track yet.</p>
        </div>
      )}
    </div>
  );
}
