'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ResumeData, LanguageEntry, CertificationEntry } from '@/lib/resume';
import { createEmptyLanguage, createEmptyCertification } from '@/lib/resume';

interface ExtrasStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500';
const labelClass = 'block text-sm font-medium text-gray-300';

const proficiencyLevels = ['Beginner', 'Intermediate', 'Advanced', 'Fluent', 'Native'];

export default function ExtrasStep({ data, onChange }: ExtrasStepProps) {
  // Languages
  function updateLanguage(index: number, updates: Partial<LanguageEntry>) {
    const updated = [...data.languages];
    updated[index] = { ...updated[index], ...updates };
    onChange({ languages: updated });
  }

  function addLanguage() {
    onChange({ languages: [...data.languages, createEmptyLanguage()] });
  }

  function removeLanguage(index: number) {
    onChange({ languages: data.languages.filter((_, i) => i !== index) });
  }

  // Certifications
  function updateCert(index: number, updates: Partial<CertificationEntry>) {
    const updated = [...data.certifications];
    updated[index] = { ...updated[index], ...updates };
    onChange({ certifications: updated });
  }

  function addCert() {
    onChange({ certifications: [...data.certifications, createEmptyCertification()] });
  }

  function removeCert(index: number) {
    onChange({ certifications: data.certifications.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Extras (Optional)</h2>
        <p className="text-gray-400">Add languages and certifications to strengthen your resume.</p>
      </div>

      {/* Languages */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-200">Languages</h3>

        {data.languages.map((lang, index) => (
          <div key={index} className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelClass}>Language</label>
              <input
                type="text"
                value={lang.language}
                onChange={(e) => updateLanguage(index, { language: e.target.value })}
                className={inputClass}
                placeholder="French"
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Proficiency</label>
              <select
                value={lang.proficiency}
                onChange={(e) => updateLanguage(index, { proficiency: e.target.value })}
                className={inputClass}
              >
                {proficiencyLevels.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeLanguage(index)}
              className="text-red-400 hover:text-red-300 p-2 mb-0.5"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addLanguage}
          className="w-full py-2.5 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Language
        </button>
      </div>

      {/* Certifications */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-200">Certifications</h3>

        {data.certifications.map((cert, index) => (
          <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Certification {index + 1}</span>
              <button
                type="button"
                onClick={() => removeCert(index)}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={cert.name}
                  onChange={(e) => updateCert(index, { name: e.target.value })}
                  className={inputClass}
                  placeholder="AWS Certified Developer"
                />
              </div>
              <div>
                <label className={labelClass}>Issuer</label>
                <input
                  type="text"
                  value={cert.issuer}
                  onChange={(e) => updateCert(index, { issuer: e.target.value })}
                  className={inputClass}
                  placeholder="Amazon Web Services"
                />
              </div>
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="text"
                  value={cert.date}
                  onChange={(e) => updateCert(index, { date: e.target.value })}
                  className={inputClass}
                  placeholder="Mar 2023"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addCert}
          className="w-full py-2.5 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Certification
        </button>
      </div>
    </div>
  );
}
