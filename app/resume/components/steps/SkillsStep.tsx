'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';
import AIButton from '../AIButton';

interface SkillsStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

export default function SkillsStep({ data, onChange }: SkillsStepProps) {
  const [input, setInput] = useState('');

  function addSkill(skill: string) {
    const trimmed = skill.trim();
    if (trimmed && !data.skills.includes(trimmed)) {
      onChange({ skills: [...data.skills, trimmed] });
    }
    setInput('');
  }

  function removeSkill(index: number) {
    onChange({ skills: data.skills.filter((_, i) => i !== index) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(input);
    }
  }

  function handleAISuggestions(suggestions: string | string[]) {
    const newSkills = Array.isArray(suggestions) ? suggestions : [suggestions];
    const merged = [...data.skills];
    for (const s of newSkills) {
      if (s && !merged.includes(s)) merged.push(s);
    }
    onChange({ skills: merged });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Skills</h2>
        <p className="text-gray-400">Add your technical and soft skills. Press Enter or comma to add each skill.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-300">Your Skills</label>
          <AIButton
            field="skills"
            value={data.title || 'professional'}
            context={data.experience.map(e => e.role).join(', ')}
            onResult={handleAISuggestions}
            label="Suggest Skills"
          />
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
            placeholder="Type a skill and press Enter"
          />
          <button
            type="button"
            onClick={() => addSkill(input)}
            disabled={!input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {data.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.skills.map((skill, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full text-sm"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(index)}
                  className="hover:text-red-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No skills added yet. Start typing or use AI suggestions.</p>
        )}
      </div>
    </div>
  );
}
