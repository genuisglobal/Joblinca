'use client';

import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import LocationDropdown from '@/components/ui/LocationDropdown';
import { GENDER_OPTIONS } from '@/lib/onboarding/constants';
import { Gender } from '@/lib/onboarding/types';

interface LocationStepProps {
  residenceLocation: string | null;
  gender: Gender | null;
  onLocationChange: (value: string | null) => void;
  onGenderChange: (value: Gender | null) => void;
}

export default function LocationStep({
  residenceLocation,
  gender,
  onLocationChange,
  onGenderChange,
}: LocationStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/20 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Where are you located?
        </h2>
        <p className="text-gray-400 mt-2">
          This helps match you with nearby opportunities
        </p>
      </motion.div>

      {/* Form fields */}
      <div className="space-y-6">
        {/* Location */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <label className="block text-sm font-medium text-gray-300 mb-2">
            City / Region
          </label>
          <LocationDropdown
            value={residenceLocation}
            onChange={onLocationChange}
            placeholder="Select your city"
          />
        </motion.div>

        {/* Gender */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Gender <span className="text-gray-500">(optional)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onGenderChange(
                    gender === option.value ? null : (option.value as Gender)
                  )
                }
                className={`
                  px-4 py-3 rounded-lg border text-sm font-medium
                  transition-all duration-200
                  ${
                    gender === option.value
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This information is kept private and is not shared with employers
          </p>
        </motion.div>
      </div>
    </div>
  );
}
