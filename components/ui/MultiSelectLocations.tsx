'use client';

import { Check, Home, MapPin, Globe, Plane } from 'lucide-react';
import { motion } from 'framer-motion';
import { LOCATION_INTERESTS } from '@/lib/onboarding/constants';

interface MultiSelectLocationsProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  Home: <Home className="w-4 h-4" />,
  MapPin: <MapPin className="w-4 h-4" />,
  Globe: <Globe className="w-4 h-4" />,
  Plane: <Plane className="w-4 h-4" />,
};

export default function MultiSelectLocations({
  value,
  onChange,
  disabled = false,
}: MultiSelectLocationsProps) {
  const toggleLocation = (locationValue: string) => {
    if (disabled) return;

    if (value.includes(locationValue)) {
      onChange(value.filter((v) => v !== locationValue));
    } else {
      onChange([...value, locationValue]);
    }
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {LOCATION_INTERESTS.map((location) => {
          const isSelected = value.includes(location.value);
          const Icon = iconMap[location.icon] || <MapPin className="w-4 h-4" />;

          return (
            <motion.button
              key={location.value}
              type="button"
              onClick={() => toggleLocation(location.value)}
              disabled={disabled}
              whileHover={disabled ? {} : { scale: 1.02 }}
              whileTap={disabled ? {} : { scale: 0.98 }}
              className={`
                relative flex items-center gap-2 px-3 py-2.5 rounded-lg
                border transition-all duration-200
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                    : location.highlight
                    ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }
              `}
            >
              <span className={isSelected ? 'text-blue-400' : 'text-gray-500'}>
                {Icon}
              </span>
              <span className="text-sm font-medium truncate flex-1 text-left">
                {location.label}
              </span>
              {isSelected && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-blue-400"
                >
                  <Check className="w-4 h-4" />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="mt-2 text-sm text-gray-500">
          {value.length} location{value.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
