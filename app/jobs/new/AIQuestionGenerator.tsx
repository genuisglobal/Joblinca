'use client';

import { useState } from 'react';
import { CustomQuestion, generateQuestionId, getQuestionTypeLabel } from '@/lib/questions';

interface AIQuestionGeneratorProps {
  jobTitle: string;
  jobDescription: string;
  onClose: () => void;
  onAddQuestions: (questions: CustomQuestion[]) => void;
}

interface GeneratedQuestion {
  type: CustomQuestion['type'];
  question: string;
  required: boolean;
  options?: string[];
}

export default function AIQuestionGenerator({
  jobTitle,
  jobDescription,
  onClose,
  onAddQuestions,
}: AIQuestionGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (!jobTitle.trim()) {
      setError('Please enter a job title first');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedQuestions([]);
    setSelectedIndices(new Set());

    try {
      const response = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          jobDescription: jobDescription.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate questions');
      }

      const data = await response.json();
      if (data.questions && Array.isArray(data.questions)) {
        setGeneratedQuestions(data.questions);
        // Select all by default
        setSelectedIndices(new Set(data.questions.map((_: unknown, i: number) => i)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelection = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const handleAddSelected = () => {
    const questionsToAdd: CustomQuestion[] = [];
    selectedIndices.forEach((index) => {
      const q = generatedQuestions[index];
      if (q) {
        questionsToAdd.push({
          id: generateQuestionId(),
          type: q.type,
          question: q.question,
          required: q.required,
          options: q.options,
        });
      }
    });
    onAddQuestions(questionsToAdd);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">AI Question Generator</h3>
                <p className="text-sm text-gray-400">
                  Generate screening questions based on your job posting
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 mb-4">
              {error}
            </div>
          )}

          {generatedQuestions.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <p className="text-gray-400 mb-2">
                AI will analyze your job posting and suggest relevant screening questions.
              </p>
              <p className="text-sm text-gray-500">
                {jobTitle
                  ? `Generating questions for: "${jobTitle}"`
                  : 'Enter a job title first to generate questions'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400 mb-4">
                Select the questions you want to add ({selectedIndices.size} of{' '}
                {generatedQuestions.length} selected)
              </p>
              {generatedQuestions.map((q, index) => (
                <label
                  key={index}
                  className={`flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-colors ${
                    selectedIndices.has(index)
                      ? 'bg-blue-600/20 border border-blue-600'
                      : 'bg-gray-700/50 border border-transparent hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIndices.has(index)}
                    onChange={() => toggleSelection(index)}
                    className="mt-1 w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-white">
                      {q.question}
                      {q.required && <span className="text-red-400 ml-1">*</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {getQuestionTypeLabel(q.type)}
                      {q.options && ` - Options: ${q.options.join(', ')}`}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-700">
          {generatedQuestions.length === 0 ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !jobTitle.trim()}
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating Questions...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Generate Questions
                </>
              )}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleAddSelected}
                disabled={selectedIndices.size === 0}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {selectedIndices.size} Selected Question
                {selectedIndices.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
