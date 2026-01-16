'use client';

import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import AvatarUpload from '@/components/ui/AvatarUpload';

interface ProfilePictureStepProps {
  avatarUrl: string | null;
  avatarFile: File | null;
  onFileSelect: (file: File | null) => void;
}

export default function ProfilePictureStep({
  avatarUrl,
  avatarFile,
  onFileSelect,
}: ProfilePictureStepProps) {
  // Create a preview URL from the file if available
  const previewUrl = avatarFile ? URL.createObjectURL(avatarFile) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/20 flex items-center justify-center">
          <Camera className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-100">
          Add a profile photo
        </h2>
        <p className="text-gray-400 mt-2">
          A photo helps people recognize you (optional)
        </p>
      </motion.div>

      {/* Avatar upload */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center"
      >
        <AvatarUpload
          value={avatarUrl}
          previewUrl={previewUrl}
          onFileSelect={onFileSelect}
          size="lg"
        />
      </motion.div>

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800/50 rounded-lg p-4 mt-8"
      >
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          Tips for a great photo:
        </h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>- Use a recent, clear photo of yourself</li>
          <li>- Make sure your face is visible</li>
          <li>- Good lighting makes a difference</li>
          <li>- Professional attire is recommended</li>
        </ul>
      </motion.div>
    </div>
  );
}
