'use client';

import { useState, useRef } from 'react';
import { Camera, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AvatarUploadProps {
  value: string | null;
  onFileSelect: (file: File | null) => void;
  previewUrl?: string | null;
  disabled?: boolean;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-20 h-20',
  md: 'w-28 h-28',
  lg: 'w-36 h-36',
};

const iconSizes = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

export default function AvatarUpload({
  value,
  onFileSelect,
  previewUrl,
  disabled = false,
  error,
  size = 'lg',
}: AvatarUploadProps) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = localPreview || previewUrl || value;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      onFileSelect(null);
      setLocalPreview(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return;
    }

    // Create local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLocalPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    onFileSelect(file);
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    setLocalPreview(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
      />

      <motion.button
        type="button"
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
        className={`
          relative rounded-full overflow-hidden
          ${sizeClasses[size]}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${error ? 'ring-2 ring-red-500' : ''}
          transition-all duration-200
          group
        `}
      >
        <AnimatePresence mode="wait">
          {displayUrl ? (
            <motion.div
              key="image"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-full"
            >
              <img
                src={displayUrl}
                alt="Profile"
                className="w-full h-full object-cover"
              />
              {/* Hover overlay */}
              <div
                className="
                  absolute inset-0 bg-black/60 opacity-0
                  group-hover:opacity-100 transition-opacity
                  flex items-center justify-center
                "
              >
                <Camera className="w-6 h-6 text-white" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="
                w-full h-full bg-gray-700 border-2 border-dashed border-gray-600
                flex items-center justify-center
                group-hover:border-gray-500 transition-colors
              "
            >
              <User className={`${iconSizes[size]} text-gray-500`} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Remove button */}
        {displayUrl && !disabled && (
          <button
            type="button"
            onClick={removeImage}
            className="
              absolute -top-1 -right-1 p-1 bg-red-500 rounded-full
              text-white hover:bg-red-600 transition-colors
              shadow-lg z-10
            "
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.button>

      <div className="text-center">
        <p className="text-sm text-gray-400">
          {displayUrl ? 'Click to change photo' : 'Upload a photo'}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          JPG, PNG or WebP, max 2MB
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
