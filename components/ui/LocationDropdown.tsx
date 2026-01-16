'use client';

import { ChevronDown, MapPin } from 'lucide-react';
import { RESIDENCE_LOCATIONS } from '@/lib/onboarding/constants';

interface LocationDropdownProps {
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function LocationDropdown({
  value,
  onChange,
  error,
  disabled = false,
  placeholder = 'Select your city',
}: LocationDropdownProps) {
  return (
    <div className="w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <MapPin className="w-5 h-5 text-gray-500" />
        </div>
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className={`
            w-full pl-10 pr-10 py-3 appearance-none
            bg-gray-800 text-gray-100
            border border-gray-600 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors cursor-pointer
            ${!value ? 'text-gray-500' : ''}
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
          `}
        >
          <option value="" className="text-gray-500">
            {placeholder}
          </option>
          {RESIDENCE_LOCATIONS.map((location) => (
            <option
              key={location.value}
              value={location.value}
              className="text-gray-100 bg-gray-800"
            >
              {location.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <ChevronDown className="w-5 h-5 text-gray-500" />
        </div>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
