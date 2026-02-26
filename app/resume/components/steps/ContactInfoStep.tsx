'use client';

import type { ResumeData } from '@/lib/resume';

interface ContactInfoStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500';
const labelClass = 'block text-sm font-medium text-gray-300';

export default function ContactInfoStep({ data, onChange }: ContactInfoStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Contact Information</h2>
        <p className="text-gray-400">Let employers know how to reach you.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Full Name *</label>
          <input
            type="text"
            value={data.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
            className={inputClass}
            placeholder="John Doe"
          />
        </div>
        <div>
          <label className={labelClass}>Job Title</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={inputClass}
            placeholder="Software Engineer"
          />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className={labelClass}>Phone *</label>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={inputClass}
            placeholder="(+237) 6xx xxx xxx"
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Location</label>
          <input
            type="text"
            value={data.location}
            onChange={(e) => onChange({ location: e.target.value })}
            className={inputClass}
            placeholder="Douala, Cameroon"
          />
        </div>
      </div>
    </div>
  );
}
