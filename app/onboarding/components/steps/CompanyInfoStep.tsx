'use client';

import { motion } from 'framer-motion';
import { Building, Mail, Image } from 'lucide-react';
import AvatarUpload from '@/components/ui/AvatarUpload';

interface CompanyInfoStepProps {
  companyName: string;
  contactEmail: string;
  companyLogoUrl: string | null;
  logoFile: File | null;
  onCompanyNameChange: (value: string) => void;
  onContactEmailChange: (value: string) => void;
  onLogoFileSelect: (file: File | null) => void;
  errors: {
    companyName?: string;
    contactEmail?: string;
  };
}

export default function CompanyInfoStep({
  companyName,
  contactEmail,
  companyLogoUrl,
  logoFile,
  onCompanyNameChange,
  onContactEmailChange,
  onLogoFileSelect,
  errors,
}: CompanyInfoStepProps) {
  const logoPreviewUrl = logoFile ? URL.createObjectURL(logoFile) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Building className="w-8 h-8 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Tell us about your company
        </h2>
        <p className="text-gray-400 mt-2">
          This information will be shown on your job postings
        </p>
      </motion.div>

      {/* Form fields */}
      <div className="space-y-6">
        {/* Company Logo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center"
        >
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Company Logo <span className="text-gray-500">(optional)</span>
          </label>
          <AvatarUpload
            value={companyLogoUrl}
            previewUrl={logoPreviewUrl}
            onFileSelect={onLogoFileSelect}
            size="md"
          />
        </motion.div>

        {/* Company Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label
            htmlFor="companyName"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Company Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Building className="w-5 h-5 text-gray-500" />
            </div>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder="e.g., TechCorp Cameroon"
              className={`
                w-full pl-10 pr-4 py-3 bg-gray-800 text-gray-100
                border rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder-gray-500 transition-colors
                ${errors.companyName ? 'border-red-500' : 'border-gray-600'}
              `}
            />
          </div>
          {errors.companyName && (
            <p className="mt-1 text-sm text-red-400">{errors.companyName}</p>
          )}
        </motion.div>

        {/* Contact Email */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <label
            htmlFor="contactEmail"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Contact Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Mail className="w-5 h-5 text-gray-500" />
            </div>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => onContactEmailChange(e.target.value)}
              placeholder="hr@company.com"
              className={`
                w-full pl-10 pr-4 py-3 bg-gray-800 text-gray-100
                border rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder-gray-500 transition-colors
                ${errors.contactEmail ? 'border-red-500' : 'border-gray-600'}
              `}
            />
          </div>
          {errors.contactEmail && (
            <p className="mt-1 text-sm text-red-400">{errors.contactEmail}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            This email will receive notifications about applications
          </p>
        </motion.div>
      </div>
    </div>
  );
}
