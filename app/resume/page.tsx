'use client';

import { useState } from 'react';
import { Upload, PenLine, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import ResumeWizard from './components/ResumeWizard';

type View = 'landing' | 'upload' | 'scratch';

export default function ResumePage() {
  const [view, setView] = useState<View>('landing');

  if (view === 'upload' || view === 'scratch') {
    return (
      <main className="max-w-4xl mx-auto p-6 text-gray-100">
        <ResumeWizard path={view} onBack={() => setView('landing')} />
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

      <div className="text-center mt-8">
        <p className="text-xs text-gray-600">
          All features are free. Powered by AI for smart suggestions and improvements.
        </p>
      </div>
    </main>
  );
}
