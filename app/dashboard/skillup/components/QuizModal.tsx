'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import type { QuizQuestion } from '@/lib/skillup/types';

interface QuizModalProps {
  questions: QuizQuestion[];
  moduleId: string;
  locale?: string;
  onClose: () => void;
  onComplete: (result: {
    quiz_score: number;
    xp_earned: number;
    streak: number;
    course_completed: boolean;
    badge_awarded: boolean;
  }) => void;
}

export default function QuizModal({
  questions,
  moduleId,
  locale = 'en',
  onClose,
  onComplete,
}: QuizModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const q = questions[currentIndex];
  const questionText =
    locale === 'fr' && q?.question_fr ? q.question_fr : q?.question;
  const options =
    locale === 'fr' && q?.options_fr ? q.options_fr : q?.options;
  const explanation =
    locale === 'fr' && q?.explanation_fr ? q.explanation_fr : q?.explanation;

  const handleSelect = (optionIndex: number) => {
    if (showFeedback) return;
    setSelectedOption(optionIndex);
    setShowFeedback(true);
  };

  const handleNext = async () => {
    const newAnswers = [...answers, selectedOption!];
    setAnswers(newAnswers);
    setSelectedOption(null);
    setShowFeedback(false);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Submit quiz
      setSubmitting(true);
      try {
        const res = await fetch('/api/skillup/progress/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId, quizAnswers: newAnswers }),
        });
        const data = await res.json();
        setResult(data);
        onComplete(data);
      } catch {
        setResult({ quiz_score: 0, xp_earned: 0, streak: 0, course_completed: false, badge_awarded: false });
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            {result ? 'Quiz Complete!' : `Question ${currentIndex + 1} of ${questions.length}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {result ? (
            /* Results Screen */
            <div className="text-center space-y-4">
              <div className="text-5xl font-bold text-white">{result.quiz_score}%</div>
              <p className="text-gray-400">
                {result.quiz_score >= 70 ? 'Great job!' : 'Keep practicing!'}
              </p>
              <div className="flex justify-center gap-6 text-sm">
                <div>
                  <span className="text-yellow-400 font-semibold">+{result.xp_earned}</span>
                  <span className="text-gray-500 ml-1">XP</span>
                </div>
                <div>
                  <span className="text-orange-400 font-semibold">{result.streak}</span>
                  <span className="text-gray-500 ml-1">day streak</span>
                </div>
              </div>
              {result.course_completed && (
                <div className="bg-green-500/20 text-green-400 rounded-lg p-3 text-sm">
                  Course completed! {result.badge_awarded && 'Badge earned!'}
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Continue
              </button>
            </div>
          ) : (
            /* Question Screen */
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-white text-base mb-6">{questionText}</p>

                <div className="space-y-3">
                  {options?.map((option, i) => {
                    const isSelected = selectedOption === i;
                    const isCorrect = i === q.correct_index;
                    let borderColor = 'border-gray-700 hover:border-gray-500';
                    if (showFeedback) {
                      if (isCorrect) borderColor = 'border-green-500 bg-green-500/10';
                      else if (isSelected && !isCorrect) borderColor = 'border-red-500 bg-red-500/10';
                      else borderColor = 'border-gray-700 opacity-50';
                    } else if (isSelected) {
                      borderColor = 'border-blue-500';
                    }

                    return (
                      <button
                        key={i}
                        onClick={() => handleSelect(i)}
                        disabled={showFeedback}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${borderColor}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400 font-mono w-6">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-sm text-gray-200 flex-1">{option}</span>
                          {showFeedback && isCorrect && (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          )}
                          {showFeedback && isSelected && !isCorrect && (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {showFeedback && explanation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-4 p-3 bg-gray-700/50 rounded-lg text-sm text-gray-300"
                  >
                    {explanation}
                  </motion.div>
                )}

                {showFeedback && (
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleNext}
                      disabled={submitting}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {submitting
                        ? 'Submitting...'
                        : currentIndex < questions.length - 1
                          ? 'Next'
                          : 'Finish'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Progress dots */}
        {!result && (
          <div className="flex justify-center gap-1.5 pb-4">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i < currentIndex
                    ? 'bg-blue-500'
                    : i === currentIndex
                      ? 'bg-blue-400'
                      : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
