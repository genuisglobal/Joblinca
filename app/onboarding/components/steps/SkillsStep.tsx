'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import SkillInput from '@/components/ui/SkillInput';
import { Skill } from '@/lib/onboarding/types';
import { useTranslation } from '@/lib/i18n/context';

interface SkillsStepProps {
  skills: Skill[];
  onSkillsChange: (skills: Skill[]) => void;
}

export default function SkillsStep({
  skills,
  onSkillsChange,
}: SkillsStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Zap className="w-8 h-8 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          {t('onboarding.skills.title')}
        </h2>
        <p className="text-gray-400 mt-2">
          {t('onboarding.skills.subtitle')}
        </p>
      </motion.div>

      {/* Skill input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <SkillInput
          value={skills}
          onChange={onSkillsChange}
          maxSkills={15}
        />
      </motion.div>

      {/* Rating guide */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800/50 rounded-lg p-4 mt-6"
      >
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          {t('onboarding.skills.ratingGuide')}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
          <div>{t('onboarding.skills.rating1')}</div>
          <div>{t('onboarding.skills.rating2')}</div>
          <div>{t('onboarding.skills.rating3')}</div>
          <div>{t('onboarding.skills.rating4')}</div>
          <div className="col-span-2">{t('onboarding.skills.rating5')}</div>
        </div>
      </motion.div>
    </div>
  );
}
