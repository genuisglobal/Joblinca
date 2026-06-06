import { ImageResponse } from 'next/og';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const runtime = 'edge';
export const alt = 'Joblinca — Cameroon\'s Job Marketplace';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  let totalJobCount = 0;
  try {
    const supabase = createServiceSupabaseClient();
    const { count } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('published', true)
      .eq('approval_status', 'approved')
      .eq('lifecycle_status', 'live');
    totalJobCount = count || 0;
  } catch {
    totalJobCount = 0;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #050505 0%, #0c1424 50%, #050505 100%)',
          padding: 80,
          color: '#fafafa',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 520,
            height: 520,
            background: 'radial-gradient(circle, rgba(14,165,233,0.22) 0%, rgba(14,165,233,0) 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -180,
            left: -120,
            width: 560,
            height: 560,
            background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0) 70%)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            J
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>Joblinca</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            Find your next job
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              background: 'linear-gradient(90deg, #38bdf8 0%, #a855f7 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            in Cameroon
          </div>
          <div
            style={{
              fontSize: 30,
              color: '#cbd5e1',
              marginTop: 28,
              maxWidth: 880,
              lineHeight: 1.35,
            }}
          >
            Jobs, internships and gigs. Free for job seekers. MTN &amp; Orange Mobile Money.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 28,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: '#22c55e',
                display: 'flex',
              }}
            />
            <div style={{ fontSize: 26, color: '#e2e8f0', fontWeight: 600 }}>
              {totalJobCount > 0 ? `${totalJobCount} live jobs` : 'Live jobs daily'}
            </div>
          </div>
          <div style={{ fontSize: 24, color: '#94a3b8' }}>joblinca.com</div>
        </div>
      </div>
    ),
    size
  );
}
