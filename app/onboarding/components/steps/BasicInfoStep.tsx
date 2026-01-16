'use client';

import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import PhoneInput from '@/components/ui/PhoneInput';

interface BasicInfoStepProps {
  firstName: string;
  lastName: string;
  phone: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  errors: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

const fieldVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.3 },
  }),
};

export default function BasicInfoStep({
  firstName,
  lastName,
  phone,
  onFirstNameChange,
  onLastNameChange,
  onPhoneChange,
  errors,
}: BasicInfoStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/20 flex items-center justify-center">
          <User className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          What&apos;s your name?
        </h2>
        <p className="text-gray-400 mt-2">
          This helps employers and recruiters identify you
        </p>
      </motion.div>

      {/* Form fields */}
      <div className="space-y-5">
        {/* First Name */}
        <motion.div
          custom={0}
          variants={fieldVariants}
          initial="hidden"
          animate="visible"
        >
          <label
            htmlFor="firstName"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            First Name <span className="text-red-400">*</span>
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            placeholder="Enter your first name"
            className={`
              w-full px-4 py-3 bg-gray-800 text-gray-100
              border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              placeholder-gray-500 transition-colors
              ${errors.firstName ? 'border-red-500' : 'border-gray-600'}
            `}
          />
          {errors.firstName && (
            <p className="mt-1 text-sm text-red-400">{errors.firstName}</p>
          )}
        </motion.div>

        {/* Last Name */}
        <motion.div
          custom={1}
          variants={fieldVariants}
          initial="hidden"
          animate="visible"
        >
          <label
            htmlFor="lastName"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Last Name <span className="text-red-400">*</span>
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
            placeholder="Enter your last name"
            className={`
              w-full px-4 py-3 bg-gray-800 text-gray-100
              border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              placeholder-gray-500 transition-colors
              ${errors.lastName ? 'border-red-500' : 'border-gray-600'}
            `}
          />
          {errors.lastName && (
            <p className="mt-1 text-sm text-red-400">{errors.lastName}</p>
          )}
        </motion.div>

        {/* Phone Number */}
        <motion.div
          custom={2}
          variants={fieldVariants}
          initial="hidden"
          animate="visible"
        >
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Phone Number <span className="text-red-400">*</span>
          </label>
          <PhoneInput
            value={phone}
            onChange={onPhoneChange}
            error={errors.phone}
          />
        </motion.div>
      </div>
    </div>
  );
}
