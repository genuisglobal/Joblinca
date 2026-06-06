import { ImageResponse } from 'next/og';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const runtime = 'edge';
export const alt = 'Job posting on Joblinca';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatSalary(job: {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary: number | null;
}): string | null {
  const min = job.salary_min ?? null;
  const max = job.salary_max ?? null;
  const legacy = job.salary ?? null;
  if (!min && !max && !legacy) return null;
  const currency = job.salary_currency || 'XAF';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const periodLabel: Record<string, string> = {
    HOUR: '/hr',
    DAY: '/day',
    WEEK: '/wk',
    MONTH: '/mo',
    YEAR: '/yr',
  };
  const suffix = periodLabel[(job.salary_period || 'MONTH').toUpperCase()] || '';
  let amount: string;
  if (min && max && min !== max) amount = `${formatter.format(min)} – ${formatter.format(max)}`;
  else if (min) amount = formatter.format(min);
  else if (max) amount = formatter.format(max);
  else amount = formatter.format(legacy!);
  return `${amount}${suffix}`;
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = createServiceSupabaseClient();
  const { data: job } = await supabase
    .from('jobs')
    .select(
      'title, company_name, location, work_type, job_type, salary, salary_min, salary_max, salary_currency, salary_period'
    )
    .eq('id', params.id)
    .maybeSingle();

  const title = truncate(job?.title || 'Job Opportunity', 80);
  const company = job?.company_name ? truncate(job.company_name, 50) : null;
  const location =
    job?.work_type === 'remote' ? 'Remote' : job?.location ? truncate(job.location, 30) : 'Cameroon';
  const salary = job ? formatSalary(job) : null;
  const employmentType = job?.job_type
    ? job.job_type.replace(/_/g, '-').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #0c1424 50%, #0a0a0a 100%)',
          padding: 64,
          color: '#fafafa',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Glow accents */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0) 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -160,
            left: -100,
            width: 520,
            height: 520,
            background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, rgba(168,85,247,0) 70%)',
            display: 'flex',
          }}
        />

        {/* Top bar: brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            J
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Joblinca</div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginTop: -2 }}>
              Cameroon&apos;s Job Marketplace
            </div>
          </div>
        </div>

        {/* Center: title + company */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
            marginTop: 8,
          }}
        >
          <div
            style={{
              fontSize: title.length > 50 ? 56 : 68,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: '#ffffff',
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {company && (
            <div
              style={{
                fontSize: 32,
                color: '#cbd5e1',
                marginTop: 18,
                fontWeight: 500,
              }}
            >
              at {company}
            </div>
          )}
        </div>

        {/* Chips row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <Chip emoji="📍" label={location} />
          {employmentType && <Chip emoji="🕒" label={employmentType} />}
          {salary && <Chip emoji="💰" label={salary} accent />}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 22,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ fontSize: 22, color: '#94a3b8' }}>joblinca.com</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              padding: '12px 24px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Apply on Joblinca →
          </div>
        </div>
      </div>
    ),
    size
  );
}

function Chip({ emoji, label, accent }: { emoji: string; label: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        borderRadius: 999,
        fontSize: 22,
        fontWeight: 500,
        background: accent ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
        border: accent ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.1)',
        color: accent ? '#86efac' : '#e2e8f0',
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </div>
  );
}
