'use client';

import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import LocationDropdown from '@/components/ui/LocationDropdown';
import { GENDER_OPTIONS } from '@/lib/onboarding/constants';
import { Gender } from '@/lib/onboarding/types';
import { useTranslation } from '@/lib/i18n/context';

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
  const { t } = useTranslation();

  const getGenderLabel = (value: string) => {
    switch (value) {
      case 'male':
        return t('onboarding.location.gender.male');
      case 'female':
        return t('onboarding.location.gender.female');
      case 'other':
        return t('onboarding.location.gender.other');
      case 'prefer_not_to_say':
        return t('onboarding.location.gender.preferNotToSay');
      default:
        return value;
    }
  };

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
          {t('onboarding.location.title')}
        </h2>
        <p className="text-gray-400 mt-2">
          {t('onboarding.location.subtitle')}
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
            {t('onboarding.location.cityRegion')}
          </label>
          <LocationDropdown
            value={residenceLocation}
            onChange={onLocationChange}
            placeholder={t('onboarding.location.selectCity')}
          />
        </motion.div>

        {/* Gender */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {t('onboarding.location.genderLabel')} <span className="text-gray-500">({t('onboarding.optional')})</span>
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
                {getGenderLabel(option.value)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {t('onboarding.location.privacyNote')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
