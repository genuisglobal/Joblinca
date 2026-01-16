'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ALL_SKILLS, POPULAR_SKILLS } from '@/lib/onboarding/constants';
import StarRating from './StarRating';
import { Skill } from '@/lib/onboarding/types';

interface SkillInputProps {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  maxSkills?: number;
  disabled?: boolean;
}

export default function SkillInput({
  value,
  onChange,
  maxSkills = 15,
  disabled = false,
}: SkillInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on search query
  const filteredSuggestions = searchQuery
    ? ALL_SKILLS.filter(
        (skill) =>
          skill.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !value.some((s) => s.name.toLowerCase() === skill.toLowerCase())
      ).slice(0, 8)
    : [];

  // Get skills for selected category
  const categorySkills = selectedCategory
    ? (POPULAR_SKILLS[selectedCategory as keyof typeof POPULAR_SKILLS] || []).filter(
        (skill) => !value.some((s) => s.name.toLowerCase() === skill.toLowerCase())
      )
    : [];

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addSkill = (skillName: string) => {
    if (value.length >= maxSkills) return;
    if (value.some((s) => s.name.toLowerCase() === skillName.toLowerCase())) return;

    onChange([...value, { name: skillName, rating: 3 }]);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const removeSkill = (skillName: string) => {
    onChange(value.filter((s) => s.name !== skillName));
  };

  const updateSkillRating = (skillName: string, rating: number) => {
    onChange(
      value.map((s) => (s.name === skillName ? { ...s, rating } : s))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      // If there are filtered suggestions, add the first one
      if (filteredSuggestions.length > 0) {
        addSkill(filteredSuggestions[0]);
      } else {
        // Otherwise add custom skill
        addSkill(searchQuery.trim());
      }
    }
  };

  const categories = [
    { key: 'technical', label: 'Technical' },
    { key: 'design', label: 'Design' },
    { key: 'business', label: 'Business' },
    { key: 'soft', label: 'Soft Skills' },
    { key: 'languages', label: 'Languages' },
  ];

  return (
    <div ref={containerRef} className="w-full space-y-4">
      {/* Search input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="w-5 h-5 text-gray-500" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSuggestions(true);
            setSelectedCategory(null);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled || value.length >= maxSkills}
          placeholder={
            value.length >= maxSkills
              ? `Maximum ${maxSkills} skills reached`
              : 'Search or type a skill...'
          }
          className={`
            w-full pl-10 pr-4 py-3 bg-gray-800 text-gray-100
            border border-gray-600 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            placeholder-gray-500 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        />

        {/* Suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && (searchQuery || selectedCategory) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="
                absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600
                rounded-lg shadow-lg max-h-60 overflow-auto
              "
            >
              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => addSkill(skill)}
                    className="
                      w-full px-4 py-2 text-left text-gray-200
                      hover:bg-gray-700 transition-colors
                      flex items-center gap-2
                    "
                  >
                    <Plus className="w-4 h-4 text-gray-500" />
                    {skill}
                  </button>
                ))
              ) : selectedCategory && categorySkills.length > 0 ? (
                categorySkills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => addSkill(skill)}
                    className="
                      w-full px-4 py-2 text-left text-gray-200
                      hover:bg-gray-700 transition-colors
                      flex items-center gap-2
                    "
                  >
                    <Plus className="w-4 h-4 text-gray-500" />
                    {skill}
                  </button>
                ))
              ) : searchQuery && filteredSuggestions.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addSkill(searchQuery.trim())}
                  className="
                    w-full px-4 py-2 text-left text-gray-200
                    hover:bg-gray-700 transition-colors
                    flex items-center gap-2
                  "
                >
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span>Add &quot;{searchQuery.trim()}&quot;</span>
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Category filters */}
      {!searchQuery && value.length < maxSkills && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                setSelectedCategory(selectedCategory === cat.key ? null : cat.key);
                setShowSuggestions(true);
              }}
              className={`
                px-3 py-1.5 text-sm rounded-full transition-colors
                ${
                  selectedCategory === cat.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Selected skills with ratings */}
      {value.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Your skills ({value.length}/{maxSkills})
          </p>
          <AnimatePresence mode="popLayout">
            {value.map((skill) => (
              <motion.div
                key={skill.name}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="
                  flex items-center justify-between gap-4 p-3
                  bg-gray-800 border border-gray-700 rounded-lg
                "
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-gray-200 font-medium truncate">
                    {skill.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StarRating
                    value={skill.rating}
                    onChange={(rating) => updateSkillRating(skill.name, rating)}
                    size="sm"
                    showLabel={false}
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    onClick={() => removeSkill(skill.name)}
                    disabled={disabled}
                    className="
                      p-1 text-gray-500 hover:text-red-400
                      transition-colors disabled:opacity-50
                    "
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
