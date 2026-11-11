'use client';

type OutreachRow = {
  company: string;
  job_title: string;
  contact_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  source: string;
  source_url: string;
  location: string;
  found_at: string;
  trust_score: number;
  scam_score: number;
  qualification: string;
  qualification_reason: string;
  status: string;
  assigned_admin: string;
  assigned_admin_id: string;
  follow_up_at: string;
  notes: string;
};

const COLUMNS: Array<[keyof OutreachRow, string]> = [
  ['company', 'Company'], ['job_title', 'Job title'], ['contact_name', 'Contact name'],
  ['email', 'Email'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'],
  ['source', 'Source'], ['source_url', 'Source URL'], ['location', 'Location'],
  ['found_at', 'Found at'], ['trust_score', 'Trust score'], ['scam_score', 'Scam score'],
  ['qualification', 'Qualification'], ['qualification_reason', 'Qualification reason'],
  ['status', 'Outreach status'], ['assigned_admin', 'Assigned admin'], ['assigned_admin_id', 'Assigned admin ID'],
  ['follow_up_at', 'Follow up date'], ['notes', 'Notes'],
];

function escapeCell(value: unknown, key: keyof OutreachRow): string {
  let text = String(value ?? '');
  if (key !== 'phone' && key !== 'whatsapp' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function OutreachExportButton({ rows }: { rows: OutreachRow[] }) {
  function download() {
    const content = [
      COLUMNS.map(([, label]) => escapeCell(label, 'company')).join(','),
      ...rows.map((row) => COLUMNS.map(([key]) => escapeCell(row[key], key)).join(',')),
    ].join('\r\n');
    const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `joblinca-recruiter-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Export {rows.length} rows to Sheets
    </button>
  );
}
