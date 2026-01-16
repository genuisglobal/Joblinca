'use client';

import { useState, useEffect } from 'react';
import { CustomQuestion, QuestionAnswer } from '@/lib/questions';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  custom_questions: CustomQuestion[] | null;
}

interface ApplicationFormProps {
  job: Job;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ApplicationForm({
  job,
  onClose,
  onSuccess,
}: ApplicationFormProps) {
  const [coverLetter, setCoverLetter] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const questions = job.custom_questions || [];

  // Initialize answers with empty values
  useEffect(() => {
    const initialAnswers: Record<string, string | string[] | boolean> = {};
    questions.forEach((q) => {
      if (q.type === 'multiselect') {
        initialAnswers[q.id] = [];
      } else if (q.type === 'yesno') {
        initialAnswers[q.id] = '';
      } else {
        initialAnswers[q.id] = '';
      }
    });
    setAnswers(initialAnswers);
  }, [questions]);

  const updateAnswer = (questionId: string, value: string | string[] | boolean) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[questionId]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];
        return newErrors;
      });
    }
  };

  const handleMultiselectChange = (questionId: string, option: string, checked: boolean) => {
    const current = (answers[questionId] as string[]) || [];
    if (checked) {
      updateAnswer(questionId, [...current, option]);
    } else {
      updateAnswer(questionId, current.filter((o) => o !== option));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    questions.forEach((q) => {
      if (q.required) {
        const answer = answers[q.id];
        if (q.type === 'multiselect') {
          if (!answer || (answer as string[]).length === 0) {
            errors[q.id] = 'This question is required';
          }
        } else if (q.type === 'yesno') {
          if (answer === '' || answer === undefined) {
            errors[q.id] = 'This question is required';
          }
        } else {
          if (!answer || (typeof answer === 'string' && !answer.trim())) {
            errors[q.id] = 'This question is required';
          }
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAutofill = async () => {
    setIsLoadingProfile(true);
    try {
      const response = await fetch('/api/profile/autofill');
      if (response.ok) {
        const profile = await response.json();

        // Try to match profile data to questions
        const newAnswers = { ...answers };

        questions.forEach((q) => {
          const questionLower = q.question.toLowerCase();

          // Education
          if (
            questionLower.includes('education') ||
            questionLower.includes('degree') ||
            questionLower.includes('highest level')
          ) {
            if (profile.fieldOfStudy) {
              if (q.type === 'text' || q.type === 'textarea') {
                newAnswers[q.id] = profile.fieldOfStudy;
              }
            }
          }

          // Field of study
          if (questionLower.includes('field of study') || questionLower.includes('major')) {
            if (profile.fieldOfStudy && (q.type === 'text' || q.type === 'textarea')) {
              newAnswers[q.id] = profile.fieldOfStudy;
            }
          }

          // Skills/Technologies
          if (
            questionLower.includes('skill') ||
            questionLower.includes('technology') ||
            questionLower.includes('proficient') ||
            questionLower.includes('programming')
          ) {
            if (profile.skills && profile.skills.length > 0) {
              const skillNames = profile.skills.map((s: { name: string }) => s.name);
              if (q.type === 'multiselect' && q.options) {
                const matchingOptions = q.options.filter((opt) =>
                  skillNames.some((skill: string) =>
                    skill.toLowerCase().includes(opt.toLowerCase()) ||
                    opt.toLowerCase().includes(skill.toLowerCase())
                  )
                );
                if (matchingOptions.length > 0) {
                  newAnswers[q.id] = matchingOptions;
                }
              } else if (q.type === 'text' || q.type === 'textarea') {
                newAnswers[q.id] = skillNames.join(', ');
              }
            }
          }

          // Experience years (calculate from graduation year)
          if (
            questionLower.includes('years of experience') ||
            questionLower.includes('how many years')
          ) {
            if (profile.graduationYear) {
              const currentYear = new Date().getFullYear();
              const yearsExp = currentYear - profile.graduationYear;
              if (yearsExp > 0 && (q.type === 'text' || q.type === 'textarea')) {
                newAnswers[q.id] = `${yearsExp} years`;
              }
            }
          }

          // School/University
          if (
            questionLower.includes('school') ||
            questionLower.includes('university') ||
            questionLower.includes('institution')
          ) {
            if (profile.schoolName && (q.type === 'text' || q.type === 'textarea')) {
              newAnswers[q.id] = profile.schoolName;
            }
          }

          // Work authorization
          if (
            questionLower.includes('authorized to work') ||
            questionLower.includes('work permit')
          ) {
            if (q.type === 'yesno') {
              // Default to true for local candidates
              newAnswers[q.id] = true;
            }
          }
        });

        setAnswers(newAnswers);
      }
    } catch (err) {
      console.error('Failed to load profile for autofill:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Convert answers to QuestionAnswer format
      const formattedAnswers: QuestionAnswer[] = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id],
      }));

      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          coverLetter: coverLetter || null,
          answers: formattedAnswers.length > 0 ? formattedAnswers : null,
        }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to submit application');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: CustomQuestion) => {
    const hasError = validationErrors[question.id];

    switch (question.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(answers[question.id] as string) || ''}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              hasError ? 'border-red-500' : 'border-gray-600'
            }`}
            placeholder="Your answer..."
          />
        );

      case 'textarea':
        return (
          <textarea
            value={(answers[question.id] as string) || ''}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            rows={3}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              hasError ? 'border-red-500' : 'border-gray-600'
            }`}
            placeholder="Your answer..."
          />
        );

      case 'yesno':
        return (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={answers[question.id] === true}
                onChange={() => updateAnswer(question.id, true)}
                className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
              />
              <span className="text-white">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={answers[question.id] === false}
                onChange={() => updateAnswer(question.id, false)}
                className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
              />
              <span className="text-white">No</span>
            </label>
          </div>
        );

      case 'select':
        return (
          <select
            value={(answers[question.id] as string) || ''}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              hasError ? 'border-red-500' : 'border-gray-600'
            }`}
          >
            <option value="">Select an option...</option>
            {question.options?.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {question.options?.map((option, index) => (
              <label key={index} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={((answers[question.id] as string[]) || []).includes(option)}
                  onChange={(e) =>
                    handleMultiselectChange(question.id, option, e.target.checked)
                  }
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-white">{option}</span>
              </label>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Apply to {job.title}
              </h2>
              <p className="text-gray-400">{job.company_name || 'Company'}</p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 mb-6">
              {error}
            </div>
          )}

          {/* Cover Letter */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Cover Letter (Optional)
            </label>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tell the employer why you're a great fit for this role..."
            />
          </div>

          {/* Screening Questions */}
          {questions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Screening Questions</h3>
                <button
                  type="button"
                  onClick={handleAutofill}
                  disabled={isLoadingProfile}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isLoadingProfile ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
                      Loading...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      Autofill from Profile
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-6">
                {questions.map((question) => (
                  <div key={question.id}>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {question.question}
                      {question.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {renderQuestion(question)}
                    {validationErrors[question.id] && (
                      <p className="text-red-400 text-sm mt-1">
                        {validationErrors[question.id]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
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
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
