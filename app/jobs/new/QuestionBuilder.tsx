'use client';

import { useState } from 'react';
import {
  CustomQuestion,
  QuestionType,
  PREDEFINED_QUESTIONS,
  generateQuestionId,
  getQuestionTypeLabel,
  validateQuestion,
} from '@/lib/questions';

interface QuestionBuilderProps {
  questions: CustomQuestion[];
  onChange: (questions: CustomQuestion[]) => void;
  onOpenAIGenerator: () => void;
}

export default function QuestionBuilder({
  questions,
  onChange,
  onOpenAIGenerator,
}: QuestionBuilderProps) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customQuestion, setCustomQuestion] = useState({
    question: '',
    type: 'text' as QuestionType,
    required: false,
    options: '',
  });
  const [customError, setCustomError] = useState<string | null>(null);

  const addQuestion = (q: Omit<CustomQuestion, 'id'>) => {
    const newQuestion: CustomQuestion = {
      ...q,
      id: generateQuestionId(),
    };
    onChange([...questions, newQuestion]);
  };

  const removeQuestion = (id: string) => {
    onChange(questions.filter((q) => q.id !== id));
  };

  const handleAddCustom = () => {
    setCustomError(null);
    const optionsArray =
      customQuestion.type === 'select' || customQuestion.type === 'multiselect'
        ? customQuestion.options
            .split(',')
            .map((o) => o.trim())
            .filter((o) => o)
        : undefined;

    const newQuestion = {
      question: customQuestion.question,
      type: customQuestion.type,
      required: customQuestion.required,
      options: optionsArray,
    };

    const error = validateQuestion(newQuestion);
    if (error) {
      setCustomError(error);
      return;
    }

    addQuestion(newQuestion);
    setCustomQuestion({
      question: '',
      type: 'text',
      required: false,
      options: '',
    });
    setShowCustomForm(false);
  };

  const isQuestionAdded = (q: Omit<CustomQuestion, 'id'>) => {
    return questions.some((existing) => existing.question === q.question);
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Screening Questions</h2>
      <p className="text-sm text-gray-400 mb-4">
        Add questions to screen applicants. These will be shown when candidates apply.
      </p>

      {/* Questions List */}
      {questions.length > 0 && (
        <div className="space-y-3 mb-6">
          {questions.map((q, index) => (
            <div
              key={q.id}
              className="flex items-start gap-3 p-4 bg-gray-700/50 rounded-lg"
            >
              <span className="text-gray-500 text-sm font-medium">{index + 1}.</span>
              <div className="flex-1">
                <p className="text-white">
                  {q.question}
                  {q.required && <span className="text-red-400 ml-1">*</span>}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Type: {getQuestionTypeLabel(q.type)}
                  {q.options && ` (${q.options.join(', ')})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                className="text-gray-400 hover:text-red-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add from Library
        </button>
        <button
          type="button"
          onClick={() => setShowCustomForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
          Add Custom
        </button>
        <button
          type="button"
          onClick={onOpenAIGenerator}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Generate with AI
        </button>
      </div>

      {/* Library Modal */}
      {showLibrary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Question Library</h3>
                <button
                  type="button"
                  onClick={() => setShowLibrary(false)}
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
              <p className="text-sm text-gray-400 mt-1">
                Select questions to add to your job posting
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {PREDEFINED_QUESTIONS.map((q, index) => {
                  const added = isQuestionAdded(q);
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-4 p-4 rounded-lg ${
                        added ? 'bg-gray-700/30' : 'bg-gray-700/50 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex-1">
                        <p className={added ? 'text-gray-400' : 'text-white'}>
                          {q.question}
                          {q.required && <span className="text-red-400 ml-1">*</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {getQuestionTypeLabel(q.type)}
                          {q.options && ` - Options: ${q.options.join(', ')}`}
                        </p>
                      </div>
                      {added ? (
                        <span className="text-xs text-green-400 px-2 py-1 bg-green-900/30 rounded">
                          Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addQuestion(q)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 border-t border-gray-700">
              <button
                type="button"
                onClick={() => setShowLibrary(false)}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Question Form Modal */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Add Custom Question</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCustomForm(false);
                  setCustomError(null);
                }}
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

            {customError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm mb-4">
                {customError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Question
                </label>
                <input
                  type="text"
                  value={customQuestion.question}
                  onChange={(e) =>
                    setCustomQuestion({ ...customQuestion, question: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your question..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Answer Type
                </label>
                <select
                  value={customQuestion.type}
                  onChange={(e) =>
                    setCustomQuestion({
                      ...customQuestion,
                      type: e.target.value as QuestionType,
                    })
                  }
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Short Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="yesno">Yes/No</option>
                  <option value="select">Single Choice</option>
                  <option value="multiselect">Multiple Choice</option>
                </select>
              </div>

              {(customQuestion.type === 'select' ||
                customQuestion.type === 'multiselect') && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={customQuestion.options}
                    onChange={(e) =>
                      setCustomQuestion({ ...customQuestion, options: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Option 1, Option 2, Option 3..."
                  />
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customQuestion.required}
                  onChange={(e) =>
                    setCustomQuestion({ ...customQuestion, required: e.target.checked })
                  }
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-300">Required question</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCustomForm(false);
                  setCustomError(null);
                }}
                className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustom}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
