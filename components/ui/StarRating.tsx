'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  showLabel?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

const labelMap: Record<number, string> = {
  1: 'Beginner',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

export default function StarRating({
  value,
  onChange,
  maxStars = 5,
  size = 'md',
  disabled = false,
  showLabel = true,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);

  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: maxStars }, (_, i) => i + 1).map((starValue) => (
          <motion.button
            key={starValue}
            type="button"
            onClick={() => !disabled && onChange(starValue)}
            onMouseEnter={() => !disabled && setHoverValue(starValue)}
            onMouseLeave={() => setHoverValue(0)}
            disabled={disabled}
            whileHover={disabled ? {} : { scale: 1.15 }}
            whileTap={disabled ? {} : { scale: 0.95 }}
            className={`
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              focus:ring-offset-gray-900 rounded
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
          >
            <Star
              className={`
                ${sizeClasses[size]}
                transition-colors duration-150
                ${
                  starValue <= displayValue
                    ? 'fill-yellow-500 text-yellow-500'
                    : 'fill-transparent text-gray-600'
                }
              `}
            />
          </motion.button>
        ))}
      </div>
      {showLabel && displayValue > 0 && (
        <span className="text-sm text-gray-400 min-w-[80px]">
          {labelMap[displayValue]}
        </span>
      )}
    </div>
  );
}
