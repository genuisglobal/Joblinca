'use client';

import { ExternalLink } from 'lucide-react';

const partners = [
  {
    name: 'DataGenius Academy',
    description: 'Advanced data skills for Africa',
    url: 'https://datacamp.com',
    color: 'from-blue-600 to-blue-800',
  },
  {
    name: 'Coursera',
    description: 'World-class courses from top universities',
    url: 'https://www.coursera.org',
    color: 'from-indigo-600 to-indigo-800',
  },
  {
    name: 'edX',
    description: 'Free courses from Harvard, MIT & more',
    url: 'https://www.edx.org',
    color: 'from-red-600 to-red-800',
  },
  {
    name: 'freeCodeCamp',
    description: 'Learn to code for free',
    url: 'https://www.freecodecamp.org',
    color: 'from-green-600 to-green-800',
  },
];

export default function PartnerBanner() {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">
        Continue Learning with Our Partners
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {partners.map((partner) => (
          <a
            key={partner.name}
            href={partner.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`block rounded-xl p-4 bg-gradient-to-br ${partner.color} hover:opacity-90 transition-opacity group`}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">{partner.name}</h4>
              <ExternalLink className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
            </div>
            <p className="text-xs text-white/70">{partner.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
