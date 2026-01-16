'use client';

import { motion } from 'framer-motion';
import { Briefcase, GraduationCap, Building2, ArrowRight, Sparkles } from 'lucide-react';
import { Role } from '@/lib/onboarding/types';

interface WelcomeStepProps {
  role: Role;
  onNext: () => void;
}

const roleConfig = {
  job_seeker: {
    icon: Briefcase,
    title: 'Welcome, Job Seeker!',
    description: "Let's set up your profile to help you land your dream job in Cameroon.",
    color: 'blue',
  },
  talent: {
    icon: GraduationCap,
    title: 'Welcome, Talent!',
    description: "Let's build your profile to showcase your skills and connect with opportunities.",
    color: 'purple',
  },
  recruiter: {
    icon: Building2,
    title: 'Welcome, Recruiter!',
    description: "Let's set up your profile to start finding the best candidates.",
    color: 'yellow',
  },
};

export default function WelcomeStep({ role, onNext }: WelcomeStepProps) {
  const config = roleConfig[role] || roleConfig.job_seeker;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-8"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className={`
          w-24 h-24 rounded-full flex items-center justify-center mb-6
          ${
            config.color === 'blue'
              ? 'bg-blue-600/20'
              : config.color === 'purple'
              ? 'bg-purple-600/20'
              : 'bg-yellow-500/20'
          }
        `}
      >
        <Icon
          className={`w-12 h-12 ${
            config.color === 'blue'
              ? 'text-blue-400'
              : config.color === 'purple'
              ? 'text-purple-400'
              : 'text-yellow-400'
          }`}
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-3xl font-bold text-gray-100 mb-3"
      >
        {config.title}
      </motion.h1>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-gray-400 text-lg mb-8 max-w-md"
      >
        {config.description}
      </motion.p>

      {/* Features list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col gap-3 mb-8 text-left"
      >
        {role === 'job_seeker' && (
          <>
            <Feature text="Upload your resume for quick applications" />
            <Feature text="Set your preferred work locations" />
            <Feature text="Get matched with relevant opportunities" />
          </>
        )}
        {role === 'talent' && (
          <>
            <Feature text="Showcase your skills with ratings" />
            <Feature text="Add your education background" />
            <Feature text="Connect with internships and projects" />
          </>
        )}
        {role === 'recruiter' && (
          <>
            <Feature text="Set up your company profile" />
            <Feature text="Post jobs and reach candidates" />
            <Feature text="Use AI to screen applicants" />
          </>
        )}
      </motion.div>

      {/* CTA Button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onNext}
        className={`
          flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-lg
          transition-colors
          ${
            config.color === 'blue'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : config.color === 'purple'
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
          }
        `}
      >
        Let&apos;s Get Started
        <ArrowRight className="w-5 h-5" />
      </motion.button>

      {/* Time estimate */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-4 text-sm text-gray-500"
      >
        Takes about 2-3 minutes
      </motion.p>
    </motion.div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-300">
      <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}
