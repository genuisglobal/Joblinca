'use client';

import { useState, useRef } from 'react';
import { Upload, File, X, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileUploadProps {
  value: File | null;
  onFileSelect: (file: File | null) => void;
  onUploadComplete?: (url: string) => void;
  uploadUrl?: string;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  error?: string;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function FileUpload({
  value,
  onFileSelect,
  onUploadComplete,
  uploadUrl,
  accept = '.pdf,.doc,.docx',
  maxSizeMB = 5,
  label = 'Upload a file',
  hint = 'PDF, DOC, or DOCX up to 5MB',
  disabled = false,
  error: externalError,
}: FileUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = (file: File): string | null => {
    if (file.size > maxSizeBytes) {
      return `File size must be less than ${maxSizeMB}MB`;
    }

    const allowedTypes = accept.split(',').map((t) => t.trim().toLowerCase());
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;

    if (!allowedTypes.some((type) => fileExtension === type || file.type.includes(type.replace('.', '')))) {
      return 'Invalid file type';
    }

    return null;
  };

  const handleFileChange = async (file: File | null) => {
    setError(null);
    setUploadState('idle');
    setUploadProgress(0);

    if (!file) {
      onFileSelect(null);
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    onFileSelect(file);

    // If upload URL is provided, upload the file
    if (uploadUrl && onUploadComplete) {
      setUploadState('uploading');

      try {
        const formData = new FormData();
        formData.append('file', file);

        // Simulate progress for UX (actual progress would need XMLHttpRequest)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90));
        }, 200);

        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        setUploadProgress(100);
        setUploadState('success');
        onUploadComplete(data.url || data.publicUrl);
      } catch (err) {
        setUploadState('error');
        setError('Failed to upload file. Please try again.');
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = () => {
    onFileSelect(null);
    setUploadState('idle');
    setUploadProgress(0);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const displayError = externalError || error;

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        disabled={disabled}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {!value ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !disabled && inputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8
              flex flex-col items-center justify-center gap-3
              transition-all duration-200
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}
              ${displayError ? 'border-red-500' : ''}
            `}
          >
            <div
              className={`
              p-3 rounded-full
              ${isDragging ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}
            `}
            >
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-gray-200 font-medium">{label}</p>
              <p className="text-sm text-gray-500 mt-1">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-gray-600 mt-1">{hint}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`
              relative border rounded-lg p-4
              flex items-center gap-4
              ${uploadState === 'error' ? 'border-red-500 bg-red-500/10' : 'border-gray-600 bg-gray-800'}
            `}
          >
            <div
              className={`
              p-2 rounded-lg
              ${uploadState === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}
            `}
            >
              <File className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-200 font-medium truncate">{value.name}</p>
              <p className="text-sm text-gray-500">
                {(value.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {uploadState === 'uploading' && (
                <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {uploadState === 'success' && (
                <span className="text-green-400">
                  <Check className="w-5 h-5" />
                </span>
              )}
              {uploadState === 'error' && (
                <span className="text-red-400">
                  <AlertCircle className="w-5 h-5" />
                </span>
              )}
              <button
                type="button"
                onClick={removeFile}
                disabled={disabled || uploadState === 'uploading'}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {displayError && (
        <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {displayError}
        </p>
      )}
    </div>
  );
}
