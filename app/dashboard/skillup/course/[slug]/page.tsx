'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight,
  PlayCircle,
  FileText,
  ExternalLink,
  CheckCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import QuizModal from '../../components/QuizModal';
import { difficultyColor } from '@/lib/skillup/helpers';
import type { LearningModule } from '@/lib/skillup/types';

interface CourseData {
  id: string;
  title: string;
  title_fr?: string;
  description?: string;
  description_fr?: string;
  slug: string;
  difficulty: string;
  estimated_minutes: number;
  partner_name?: string;
  partner_url?: string;
  track: { id: string; title: string; title_fr?: string; slug: string };
  modules: LearningModule[];
  module_count: number;
  completed_count: number;
}

export default function CoursePlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizModuleId, setQuizModuleId] = useState<string | null>(null);
  const [startingModule, setStartingModule] = useState<string | null>(null);

  const fetchCourse = () => {
    fetch(`/api/skillup/courses/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          setCourse(data);
          // Auto-select first incomplete or first module
          const firstIncomplete = data.modules.find(
            (m: LearningModule) => !m.progress || m.progress.status !== 'completed'
          );
          setActiveModuleId(firstIncomplete?.id || data.modules[0]?.id || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCourse();
  }, [slug]);

  const activeModule = course?.modules.find((m) => m.id === activeModuleId);

  const handleStartModule = async (moduleId: string) => {
    setStartingModule(moduleId);
    try {
      await fetch('/api/skillup/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      });
    } catch {
      // ignore
    }
    setStartingModule(null);
    setActiveModuleId(moduleId);
  };

  const handleQuizOpen = (moduleId: string) => {
    setQuizModuleId(moduleId);
    setQuizOpen(true);
  };

  const handleQuizComplete = () => {
    // Refresh course data to update progress
    fetchCourse();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-gray-800 rounded-xl animate-pulse" />
          <div className="lg:col-span-2 h-96 bg-gray-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <p className="text-gray-400">Course not found.</p>
        <Link href="/dashboard/skillup" className="text-blue-400 hover:underline mt-2 inline-block">
          Back to Skill Up
        </Link>
      </div>
    );
  }

  const contentIcon = {
    video: <PlayCircle className="w-4 h-4" />,
    article: <FileText className="w-4 h-4" />,
    external: <ExternalLink className="w-4 h-4" />,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
        <Link href="/dashboard/skillup" className="hover:text-white transition">
          Skill Up
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link
          href={`/dashboard/skillup/track/${course.track.slug}`}
          className="hover:text-white transition"
        >
          {course.track.title}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-white">{course.title}</span>
      </nav>

      {/* Course header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-white">{course.title}</h1>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${difficultyColor(course.difficulty)}`}>
          {course.difficulty}
        </span>
        <span className="text-xs text-gray-500">~{course.estimated_minutes} min</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module sidebar */}
        <div className="bg-gray-800 rounded-xl p-4 order-2 lg:order-1">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Modules ({course.completed_count}/{course.module_count})
          </h3>
          <div className="space-y-1">
            {course.modules.map((mod, index) => {
              const isActive = mod.id === activeModuleId;
              const isCompleted = mod.progress?.status === 'completed';
              return (
                <button
                  key={mod.id}
                  onClick={() => handleStartModule(mod.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 ${
                    isActive
                      ? 'bg-blue-500/20 ring-1 ring-blue-500/50'
                      : 'hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {startingModule === mod.id ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    ) : isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <span className="w-4 h-4 flex items-center justify-center text-xs text-gray-500 font-mono">
                        {index + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                      {mod.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {contentIcon[mod.content_type]}
                      <span>{mod.duration_minutes} min</span>
                      {isCompleted && mod.progress?.quiz_score != null && (
                        <span className="text-green-400">
                          Quiz: {mod.progress.quiz_score}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Partner link */}
          {course.partner_name && course.partner_url && (
            <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-300 mb-2">
                Continue learning with {course.partner_name}
              </p>
              <a
                href={course.partner_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                Visit {course.partner_name}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          {activeModule ? (
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              {/* Video embed */}
              {activeModule.content_type === 'video' && activeModule.video_url && (
                <div className="aspect-video bg-black">
                  <iframe
                    src={activeModule.video_url}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {/* External link */}
              {activeModule.content_type === 'external' && activeModule.external_url && (
                <div className="p-6 text-center">
                  <ExternalLink className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-400 mb-4">
                    This module links to an external resource.
                  </p>
                  <a
                    href={activeModule.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-flex items-center gap-2"
                  >
                    Open Resource
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}

              {/* Article content */}
              {activeModule.content_type === 'article' && (
                <div className="p-6">
                  <div
                    className="prose prose-invert prose-sm max-w-none
                      prose-headings:text-white prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                      prose-p:text-gray-300 prose-li:text-gray-300
                      prose-strong:text-white
                      prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded
                      prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700
                      prose-table:text-sm prose-th:text-gray-200 prose-td:text-gray-300
                      prose-th:border-gray-600 prose-td:border-gray-700"
                    dangerouslySetInnerHTML={{
                      __html: markdownToHtml(activeModule.article_body || ''),
                    }}
                  />
                </div>
              )}

              {/* Quiz trigger */}
              {activeModule.quiz_questions.length > 0 && (
                <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>{activeModule.quiz_questions.length} questions</span>
                  </div>
                  <button
                    onClick={() => handleQuizOpen(activeModule.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      activeModule.progress?.status === 'completed'
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {activeModule.progress?.status === 'completed'
                      ? `Retake Quiz (${activeModule.progress?.quiz_score}%)`
                      : 'Take Quiz'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-400">Select a module to begin learning.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quiz Modal */}
      {quizOpen && quizModuleId && (
        <QuizModal
          questions={
            course.modules.find((m) => m.id === quizModuleId)?.quiz_questions || []
          }
          moduleId={quizModuleId}
          onClose={() => setQuizOpen(false)}
          onComplete={handleQuizComplete}
        />
      )}
    </div>
  );
}

// Simple markdown to HTML converter for article content
function markdownToHtml(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Tables
  html = html.replace(
    /\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g,
    (_, header, body) => {
      const headers = header.split('|').map((h: string) => h.trim()).filter(Boolean);
      const rows = body.trim().split('\n').map((row: string) =>
        row.split('|').map((c: string) => c.trim()).filter(Boolean)
      );
      return `<table><thead><tr>${headers.map((h: string) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
  );

  // Lists (unordered)
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Checkboxes
  html = html.replace(/- \[ \] /g, '<li>');
  html = html.replace(/- \[x\] /g, '<li class="line-through">');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr \/>)/g, '$1');

  return html;
}
