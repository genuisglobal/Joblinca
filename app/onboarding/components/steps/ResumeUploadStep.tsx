'use client';

import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import FileUpload from '@/components/ui/FileUpload';

interface ResumeUploadStepProps {
  resumeFile: File | null;
  resumeUrl: string | null;
  onFileSelect: (file: File | null) => void;
}

export default function ResumeUploadStep({
  resumeFile,
  resumeUrl,
  onFileSelect,
}: ResumeUploadStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/20 flex items-center justify-center">
          <FileText className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Upload your resume
        </h2>
        <p className="text-gray-400 mt-2">
          Your CV helps employers understand your experience
        </p>
      </motion.div>

      {/* File upload */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <FileUpload
          value={resumeFile}
          onFileSelect={onFileSelect}
          accept=".pdf,.doc,.docx"
          maxSizeMB={5}
          label="Upload your resume"
          hint="PDF, DOC, or DOCX up to 5MB"
        />
      </motion.div>

      {/* Existing resume indicator */}
      {resumeUrl && !resumeFile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-gray-500"
        >
          You already have a resume uploaded. Upload a new one to replace it.
        </motion.div>
      )}

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800/50 rounded-lg p-4 mt-6"
      >
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          Resume tips:
        </h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>- Keep it concise (1-2 pages)</li>
          <li>- Include your contact information</li>
          <li>- Highlight relevant experience and skills</li>
          <li>- Use a clean, professional format</li>
        </ul>
      </motion.div>
    </div>
  );
}
