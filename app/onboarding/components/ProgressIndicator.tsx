'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { StepConfig } from '@/lib/onboarding/types';

interface ProgressIndicatorProps {
  steps: StepConfig[];
  currentStep: number;
}

export default function ProgressIndicator({
  steps,
  currentStep,
}: ProgressIndicatorProps) {
  // Calculate progress percentage (exclude welcome and completion)
  const progressSteps = steps.filter(
    (s) => s.id !== 'welcome' && s.id !== 'completion'
  );
  const adjustedCurrent = Math.max(0, currentStep - 1);
  const progress = progressSteps.length > 0
    ? Math.min((adjustedCurrent / progressSteps.length) * 100, 100)
    : 0;

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Step indicators (desktop only) */}
      <div className="hidden md:flex justify-between mt-4">
        {steps
          .filter((s) => s.id !== 'welcome' && s.id !== 'completion')
          .map((step, index) => {
            const stepNumber = index + 1;
            const isCompleted = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;

            return (
              <div key={step.id} className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    text-sm font-medium transition-colors duration-300
                    ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-500/30'
                        : 'bg-gray-700 text-gray-400'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    stepNumber
                  )}
                </motion.div>
                <span
                  className={`
                    mt-2 text-xs font-medium truncate max-w-[80px]
                    ${isCurrent ? 'text-blue-400' : 'text-gray-500'}
                  `}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
      </div>

      {/* Mobile step counter */}
      <div className="md:hidden flex justify-between items-center mt-3">
        <span className="text-sm text-gray-400">
          Step {Math.min(currentStep, steps.length - 1)} of {steps.length - 2}
        </span>
        <span className="text-sm text-blue-400 font-medium">
          {steps[currentStep]?.title || ''}
        </span>
      </div>
    </div>
  );
}
