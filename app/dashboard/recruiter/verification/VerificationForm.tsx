'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerificationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [employerReference, setEmployerReference] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!idDocument || !selfie) {
      setError('Please upload both ID document and selfie');
      setIsSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('idDocument', idDocument);
      formData.append('selfie', selfie);
      if (employerReference) {
        formData.append('employerReference', employerReference);
      }

      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to submit verification');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* ID Document Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          ID Document *
        </label>
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-gray-500 transition-colors">
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
            className="hidden"
            id="id-document"
          />
          <label htmlFor="id-document" className="cursor-pointer">
            {idDocument ? (
              <div className="text-green-400">
                <svg
                  className="w-8 h-8 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm">{idDocument.name}</p>
              </div>
            ) : (
              <div className="text-gray-400">
                <svg
                  className="w-8 h-8 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm">Click to upload ID document</p>
                <p className="text-xs text-gray-500 mt-1">
                  PDF, PNG, or JPG (max 5MB)
                </p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Selfie Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Selfie with ID *
        </label>
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-gray-500 transition-colors">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSelfie(e.target.files?.[0] || null)}
            className="hidden"
            id="selfie"
          />
          <label htmlFor="selfie" className="cursor-pointer">
            {selfie ? (
              <div className="text-green-400">
                <svg
                  className="w-8 h-8 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm">{selfie.name}</p>
              </div>
            ) : (
              <div className="text-gray-400">
                <svg
                  className="w-8 h-8 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="text-sm">Click to upload selfie</p>
                <p className="text-xs text-gray-500 mt-1">
                  Take a photo holding your ID (max 5MB)
                </p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Employer Reference */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Employer Reference (Optional)
        </label>
        <textarea
          value={employerReference}
          onChange={(e) => setEmployerReference(e.target.value)}
          className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Company website, LinkedIn, or any reference to verify your employer"
          rows={3}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !idDocument || !selfie}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Submitting...
          </>
        ) : (
          'Submit for Verification'
        )}
      </button>
    </form>
  );
}
