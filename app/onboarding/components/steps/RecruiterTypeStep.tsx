'use client';

import { motion } from 'framer-motion';
import { Building2, Users, User, Rocket, Check } from 'lucide-react';
import { RECRUITER_TYPES } from '@/lib/onboarding/constants';
import { RecruiterType } from '@/lib/onboarding/types';

interface RecruiterTypeStepProps {
  recruiterType: RecruiterType | null;
  onRecruiterTypeChange: (value: RecruiterType) => void;
  error?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  company_hr: <Building2 className="w-6 h-6" />,
  agency: <Users className="w-6 h-6" />,
  verified_individual: <User className="w-6 h-6" />,
  institution: <Rocket className="w-6 h-6" />,
};

export default function RecruiterTypeStep({
  recruiterType,
  onRecruiterTypeChange,
  error,
}: RecruiterTypeStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Building2 className="w-8 h-8 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          What type of recruiter are you?
        </h2>
        <p className="text-gray-400 mt-2">
          This helps us customize your experience
        </p>
      </motion.div>

      {/* Recruiter type options */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        {RECRUITER_TYPES.map((type, index) => {
          const isSelected = recruiterType === type.value;

          return (
            <motion.button
              key={type.value}
              type="button"
              onClick={() => onRecruiterTypeChange(type.value as RecruiterType)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`
                w-full flex items-start gap-4 p-4 rounded-lg border
                text-left transition-all duration-200
                ${
                  isSelected
                    ? 'bg-yellow-500/10 border-yellow-500 ring-2 ring-yellow-500/30'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }
              `}
            >
              {/* Icon */}
              <div
                className={`
                  p-2 rounded-lg flex-shrink-0
                  ${isSelected ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'}
                `}
              >
                {iconMap[type.value]}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium ${isSelected ? 'text-yellow-400' : 'text-gray-200'}`}>
                  {type.label}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {type.description}
                </p>
              </div>

              {/* Check indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex-shrink-0 text-yellow-400"
                >
                  <Check className="w-5 h-5" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
