'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, PenLine, FileText, Pencil, Trash2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ResumeData } from '@/lib/resume';
import ResumeWizard from './components/ResumeWizard';

type View = 'landing' | 'upload' | 'scratch';

interface SavedResume {
  id: string;
  data: ResumeData;
  created_at: string;
  updated_at: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ResumePage() {
  const [view, setView] = useState<View>('landing');
  const [editing, setEditing] = useState<SavedResume | null>(null);
  const [savedResumes, setSavedResumes] = useState<SavedResume[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const res = await fetch('/api/resume/saved');
      if (res.ok) {
        const result = await res.json();
        setSavedResumes(Array.isArray(result.resumes) ? result.resumes : []);
      } else {
        // 401 (not signed in) or error — just hide the section
        setSavedResumes([]);
      }
    } catch {
      setSavedResumes([]);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/resume/saved/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedResumes((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      // keep the row; user can retry
    } finally {
      setDeletingId(null);
    }
  }

  function backToLanding() {
    setView('landing');
    setEditing(null);
    fetchSaved();
  }

  if (editing) {
    return (
      <main className="max-w-4xl mx-auto p-6 text-gray-100">
        <ResumeWizard
          path="scratch"
          onBack={backToLanding}
          initialData={editing.data}
          resumeId={editing.id}
        />
      </main>
    );
  }

  if (view === 'upload' || view === 'scratch') {
    return (
      <main className="max-w-4xl mx-auto p-6 text-gray-100">
        <ResumeWizard path={view} onBack={backToLanding} />
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 text-gray-100">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4">
          <FileText className="w-8 h-8 text-blue-400" />
          <h1 className="text-3xl font-bold">CV Builder</h1>
        </div>
        <p className="text-gray-400 max-w-lg mx-auto">
          Create a professional resume in minutes. Upload an existing one for AI-powered parsing, or build from scratch with our guided wizard.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setView('upload')}
          className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-left hover:border-blue-500/50 hover:bg-gray-800/80 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-blue-500/15 flex items-center justify-center mb-4 group-hover:bg-blue-500/25 transition-colors">
            <Upload className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Upload Existing Resume</h2>
          <p className="text-sm text-gray-400">
            Upload a PDF, DOCX, or TXT file. Our AI will parse it into structured fields for you to review and polish.
          </p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setView('scratch')}
          className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-left hover:border-green-500/50 hover:bg-gray-800/80 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-green-500/15 flex items-center justify-center mb-4 group-hover:bg-green-500/25 transition-colors">
            <PenLine className="w-6 h-6 text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Build From Scratch</h2>
          <p className="text-sm text-gray-400">
            Follow our guided step-by-step wizard to fill in each section of your resume with AI assistance.
          </p>
        </motion.button>
      </div>

      {/* My Resumes */}
      {loadingSaved ? (
        <div className="flex justify-center mt-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : savedResumes.length > 0 ? (
        <div className="mt-12 max-w-2xl mx-auto">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">My Resumes</h2>
          <div className="space-y-3">
            {savedResumes.map((resume) => (
              <div
                key={resume.id}
                className="flex items-center justify-between gap-4 bg-gray-800/50 border border-gray-700 rounded-xl p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-100 truncate">
                    {resume.data?.fullName || 'Untitled resume'}
                    {resume.data?.title && <span className="text-gray-400 font-normal"> — {resume.data.title}</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="capitalize">{resume.data?.template || 'professional'}</span> template · Updated {formatDate(resume.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(resume)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(resume.id)}
                    disabled={deletingId === resume.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors disabled:opacity-50 ${
                      confirmDeleteId === resume.id
                        ? 'text-white bg-red-600 border-red-600 hover:bg-red-700'
                        : 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                    }`}
                  >
                    {deletingId === resume.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    {confirmDeleteId === resume.id ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="text-center mt-8">
        <p className="text-xs text-gray-600">
          All features are free. Powered by AI for smart suggestions and improvements.
        </p>
      </div>
    </main>
  );
}
