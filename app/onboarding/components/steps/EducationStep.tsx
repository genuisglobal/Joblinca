'use client';

import { motion } from 'framer-motion';
import { GraduationCap, ChevronDown } from 'lucide-react';
import { FIELDS_OF_STUDY, GRADUATION_YEARS } from '@/lib/onboarding/constants';

interface EducationStepProps {
  schoolName: string;
  graduationYear: number | null;
  fieldOfStudy: string;
  onSchoolNameChange: (value: string) => void;
  onGraduationYearChange: (value: number | null) => void;
  onFieldOfStudyChange: (value: string) => void;
}

export default function EducationStep({
  schoolName,
  graduationYear,
  fieldOfStudy,
  onSchoolNameChange,
  onGraduationYearChange,
  onFieldOfStudyChange,
}: EducationStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-600/20 flex items-center justify-center">
          <GraduationCap className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Tell us about your education
        </h2>
        <p className="text-gray-400 mt-2">
          Your academic background helps employers understand your qualifications
        </p>
      </motion.div>

      {/* Form fields */}
      <div className="space-y-5">
        {/* School Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <label
            htmlFor="schoolName"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            School / University
          </label>
          <input
            id="schoolName"
            type="text"
            value={schoolName}
            onChange={(e) => onSchoolNameChange(e.target.value)}
            placeholder="e.g., University of Buea"
            className="
              w-full px-4 py-3 bg-gray-800 text-gray-100
              border border-gray-600 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              placeholder-gray-500 transition-colors
            "
          />
        </motion.div>

        {/* Field of Study */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label
            htmlFor="fieldOfStudy"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Field of Study
          </label>
          <div className="relative">
            <select
              id="fieldOfStudy"
              value={fieldOfStudy}
              onChange={(e) => onFieldOfStudyChange(e.target.value)}
              className="
                w-full px-4 py-3 appearance-none
                bg-gray-800 text-gray-100
                border border-gray-600 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-colors cursor-pointer
              "
            >
              <option value="" className="text-gray-500">
                Select your field
              </option>
              {FIELDS_OF_STUDY.map((field) => (
                <option key={field} value={field} className="text-gray-100 bg-gray-800">
                  {field}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <ChevronDown className="w-5 h-5 text-gray-500" />
            </div>
          </div>
        </motion.div>

        {/* Graduation Year */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <label
            htmlFor="graduationYear"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Graduation Year
          </label>
          <div className="relative">
            <select
              id="graduationYear"
              value={graduationYear || ''}
              onChange={(e) =>
                onGraduationYearChange(e.target.value ? parseInt(e.target.value) : null)
              }
              className="
                w-full px-4 py-3 appearance-none
                bg-gray-800 text-gray-100
                border border-gray-600 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-colors cursor-pointer
              "
            >
              <option value="" className="text-gray-500">
                Select year
              </option>
              {GRADUATION_YEARS.map((year) => (
                <option key={year.value} value={year.value} className="text-gray-100 bg-gray-800">
                  {year.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <ChevronDown className="w-5 h-5 text-gray-500" />
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Select expected year if still studying
          </p>
        </motion.div>
      </div>
    </div>
  );
}
