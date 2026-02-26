'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ResumeData, EducationEntry } from '@/lib/resume';
import { createEmptyEducation } from '@/lib/resume';

interface EducationStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500';
const labelClass = 'block text-sm font-medium text-gray-300';

export default function EducationStep({ data, onChange }: EducationStepProps) {
  function updateEntry(index: number, updates: Partial<EducationEntry>) {
    const updated = [...data.education];
    updated[index] = { ...updated[index], ...updates };
    onChange({ education: updated });
  }

  function addEntry() {
    onChange({ education: [...data.education, createEmptyEducation()] });
  }

  function removeEntry(index: number) {
    onChange({ education: data.education.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Education</h2>
        <p className="text-gray-400">Add your educational background.</p>
      </div>

      {data.education.map((edu, index) => (
        <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Education {index + 1}</h3>
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="text-red-400 hover:text-red-300 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Institution *</label>
              <input
                type="text"
                value={edu.institution}
                onChange={(e) => updateEntry(index, { institution: e.target.value })}
                className={inputClass}
                placeholder="University of Douala"
              />
            </div>
            <div>
              <label className={labelClass}>Degree *</label>
              <input
                type="text"
                value={edu.degree}
                onChange={(e) => updateEntry(index, { degree: e.target.value })}
                className={inputClass}
                placeholder="Bachelor of Science"
              />
            </div>
            <div>
              <label className={labelClass}>Field of Study</label>
              <input
                type="text"
                value={edu.field}
                onChange={(e) => updateEntry(index, { field: e.target.value })}
                className={inputClass}
                placeholder="Computer Science"
              />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input
                type="text"
                value={edu.startDate}
                onChange={(e) => updateEntry(index, { startDate: e.target.value })}
                className={inputClass}
                placeholder="Sep 2018"
              />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <input
                type="text"
                value={edu.endDate}
                onChange={(e) => updateEntry(index, { endDate: e.target.value })}
                className={inputClass}
                placeholder="Jun 2022"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Education
      </button>
    </div>
  );
}
