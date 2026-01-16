'use client';

import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import MultiSelectLocations from '@/components/ui/MultiSelectLocations';

interface LocationInterestStepProps {
  locationInterests: string[];
  onLocationInterestsChange: (value: string[]) => void;
}

export default function LocationInterestStep({
  locationInterests,
  onLocationInterestsChange,
}: LocationInterestStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/20 flex items-center justify-center">
          <Target className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Where do you want to work?
        </h2>
        <p className="text-gray-400 mt-2">
          Select locations where you&apos;re interested in finding jobs
        </p>
      </motion.div>

      {/* Location interests selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <MultiSelectLocations
          value={locationInterests}
          onChange={onLocationInterestsChange}
        />
      </motion.div>

      {/* Hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-sm text-gray-500 text-center mt-4"
      >
        You can select multiple locations. We&apos;ll use this to show you relevant job opportunities.
      </motion.p>
    </div>
  );
}
