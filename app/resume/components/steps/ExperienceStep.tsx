'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ResumeData, ExperienceEntry } from '@/lib/resume';
import { createEmptyExperience } from '@/lib/resume';
import AIButton from '../AIButton';

interface ExperienceStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500';
const labelClass = 'block text-sm font-medium text-gray-300';

export default function ExperienceStep({ data, onChange }: ExperienceStepProps) {
  function updateEntry(index: number, updates: Partial<ExperienceEntry>) {
    const updated = [...data.experience];
    updated[index] = { ...updated[index], ...updates };
    onChange({ experience: updated });
  }

  function addEntry() {
    onChange({ experience: [...data.experience, createEmptyExperience()] });
  }

  function removeEntry(index: number) {
    onChange({ experience: data.experience.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Work Experience</h2>
        <p className="text-gray-400">Add your work history, starting with the most recent position.</p>
      </div>

      {data.experience.map((exp, index) => (
        <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Position {index + 1}</h3>
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="text-red-400 hover:text-red-300 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Job Title *</label>
              <input
                type="text"
                value={exp.role}
                onChange={(e) => updateEntry(index, { role: e.target.value })}
                className={inputClass}
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <label className={labelClass}>Company *</label>
              <input
                type="text"
                value={exp.company}
                onChange={(e) => updateEntry(index, { company: e.target.value })}
                className={inputClass}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className={labelClass}>Start Date *</label>
              <input
                type="text"
                value={exp.startDate}
                onChange={(e) => updateEntry(index, { startDate: e.target.value })}
                className={inputClass}
                placeholder="Jan 2022"
              />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={exp.current ? '' : exp.endDate}
                  onChange={(e) => updateEntry(index, { endDate: e.target.value })}
                  className={inputClass}
                  placeholder="Dec 2023"
                  disabled={exp.current}
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-400 whitespace-nowrap mt-1">
                  <input
                    type="checkbox"
                    checked={exp.current}
                    onChange={(e) => updateEntry(index, { current: e.target.checked, endDate: '' })}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                  />
                  Current
                </label>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>Description</label>
              <AIButton
                field="experience"
                value={exp.description}
                onResult={(improved) => updateEntry(index, { description: improved as string })}
              />
            </div>
            <textarea
              value={exp.description}
              onChange={(e) => updateEntry(index, { description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 resize-y"
              placeholder="Led development of customer-facing features, increasing user engagement by 30%..."
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Experience
      </button>
    </div>
  );
}
