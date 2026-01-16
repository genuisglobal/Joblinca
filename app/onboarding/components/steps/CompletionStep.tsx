'use client';

import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { Role } from '@/lib/onboarding/types';

interface CompletionStepProps {
  role: Role;
  firstName: string;
  onComplete: () => void;
  isLoading: boolean;
}

const roleMessages = {
  job_seeker: {
    title: "You're all set!",
    message: "Your profile is ready. Start exploring job opportunities tailored for you.",
    cta: "Find Jobs",
    features: [
      "Browse jobs in Cameroon",
      "Apply with one click",
      "Get matched with opportunities",
    ],
  },
  talent: {
    title: "Profile complete!",
    message: "Your skills are showcased. Connect with internships and projects.",
    cta: "Explore Opportunities",
    features: [
      "Discover internships",
      "Showcase your portfolio",
      "Connect with recruiters",
    ],
  },
  recruiter: {
    title: "Ready to hire!",
    message: "Your company profile is set. Start posting jobs and finding talent.",
    cta: "Post Your First Job",
    features: [
      "Post unlimited jobs",
      "AI-powered screening",
      "Access top talent",
    ],
  },
};

export default function CompletionStep({
  role,
  firstName,
  onComplete,
  isLoading,
}: CompletionStepProps) {
  const config = roleMessages[role] || roleMessages.job_seeker;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center text-center py-8"
    >
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="relative"
      >
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-12 h-12 text-green-400" />
        </div>
        {/* Sparkle decorations */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute -top-2 -right-2"
        >
          <Sparkles className="w-6 h-6 text-yellow-400" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-3xl font-bold text-gray-100 mt-6 mb-2"
      >
        {config.title}
      </motion.h1>

      {/* Personalized greeting */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-xl text-gray-300 mb-2"
      >
        Welcome, {firstName || 'there'}!
      </motion.p>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-gray-400 mb-8 max-w-md"
      >
        {config.message}
      </motion.p>

      {/* Features list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col gap-2 mb-8"
      >
        {config.features.map((feature, index) => (
          <motion.div
            key={feature}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            className="flex items-center gap-2 text-gray-300"
          >
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>{feature}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* CTA Button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onComplete}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-lg
          transition-colors
          ${
            role === 'recruiter'
              ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isLoading ? (
          <>
            <span className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
            <span>Setting up...</span>
          </>
        ) : (
          <>
            <span>{config.cta}</span>
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
