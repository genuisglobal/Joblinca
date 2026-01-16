'use client';

import { useState, useEffect } from 'react';
import { CAMEROON_PHONE_CODE } from '@/lib/onboarding/constants';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function PhoneInput({
  value,
  onChange,
  error,
  disabled = false,
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Format the display value with spaces: XXX XXX XXX
  useEffect(() => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    setDisplayValue(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove all non-digits
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    onChange(digits);
  };

  return (
    <div className="w-full">
      <div className="flex">
        {/* Country code badge */}
        <div className="flex items-center justify-center px-4 bg-gray-700 border border-r-0 border-gray-600 rounded-l-lg text-gray-300 font-medium select-none">
          {CAMEROON_PHONE_CODE}
        </div>
        {/* Phone number input */}
        <input
          type="tel"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder="6XX XXX XXX"
          className={`
            flex-1 px-4 py-3 bg-gray-800 text-gray-100
            border border-gray-600 rounded-r-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            placeholder-gray-500 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
          `}
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        Enter your 9-digit phone number without the country code
      </p>
    </div>
  );
}
