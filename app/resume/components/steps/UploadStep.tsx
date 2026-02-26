'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';

interface UploadStepProps {
  onParsed: (data: ResumeData) => void;
}

export default function UploadStep({ onParsed }: UploadStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        onParsed(data);
      } else {
        setError('Failed to parse resume. Please try a different file.');
      }
    } catch {
      setError('Failed to upload file. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onParsed]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Upload Your Resume</h2>
        <p className="text-gray-400">
          Upload a PDF, DOCX, or TXT file and our AI will extract the details into structured fields for you to review and edit.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-400'
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-gray-300">Parsing your resume with AI...</p>
            <p className="text-sm text-gray-500">This may take a few seconds</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {fileName ? (
              <FileText className="w-10 h-10 text-green-400" />
            ) : (
              <Upload className="w-10 h-10 text-gray-400" />
            )}
            <div>
              <p className="text-gray-200 font-medium">
                {fileName || 'Drag and drop your resume here'}
              </p>
              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-gray-500">Supports PDF, DOCX, and TXT files</p>
          </div>
        )}
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
