'use client';

import Link from 'next/link';
import { GraduationCap, ChevronRight } from 'lucide-react';
import CounselorChat from '../components/CounselorChat';

export default function CounselorPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link
          href="/dashboard/skillup"
          className="hover:text-white transition flex items-center gap-1"
        >
          <GraduationCap className="w-4 h-4" />
          Skill Up
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-white">AI Career Counselor</span>
      </nav>

      {/* Chat Interface */}
      <CounselorChat />
    </div>
  );
}
