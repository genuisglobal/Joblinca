import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { addLocalePrefix } from '@/lib/i18n/locale';
import { getRequestLocale } from '@/lib/i18n/server';
import { formatSlaRemaining, isOpenStatus } from '@/lib/vetting/queue';
import { listRecruiterShortlists } from '@/lib/vetting/service';

export const dynamic = 'force-dynamic';

const COPY = {
  en: {
    title: 'Shortlists',
    subtitle: 'Screened, ranked candidates from the Joblinca Shortlist Service.',
    empty: 'No shortlists yet. Choose the Shortlist Service when you post a job and we deliver ranked candidates within 72 hours.',
    inProgress: 'In progress',
    delivered: 'Delivered',
    expected: 'Expected',
    open: 'Open application',
    unknown: 'Candidate',
  },
  fr: {
    title: 'Présélections',
    subtitle: 'Candidats vérifiés et classés par le service de présélection Joblinca.',
    empty: "Aucune présélection pour l'instant. Choisissez le service de présélection en publiant une offre : nous livrons des candidats classés sous 72 heures.",
    inProgress: 'En cours',
    delivered: 'Livrée',
    expected: 'Prévue',
    open: 'Voir la candidature',
    unknown: 'Candidat',
  },
} as const;

export default async function RecruiterShortlistsPage() {
  const locale = getRequestLocale();
  const t = COPY[locale === 'fr' ? 'fr' : 'en'];
  const localize = (href: string) => addLocalePrefix(href, locale);

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`${localize('/auth/login')}?redirect=${encodeURIComponent(localize('/dashboard/recruiter/shortlists'))}`);
  }

  // Scoped to recruiter_id = the signed-in user, so the service client only
  // ever returns this recruiter's own requests.
  const shortlists = await listRecruiterShortlists(createServiceSupabaseClient(), user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t.title}</h1>
        <p className="text-gray-400 mt-1">{t.subtitle}</p>
      </div>

      {shortlists.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">{t.empty}</div>
      ) : (
        shortlists.map((s) => {
          const open = isOpenStatus(s.status);
          return (
            <section key={s.id} className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{s.job?.title ?? '—'}</h2>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    open
                      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                      : 'border-green-500/30 bg-green-500/10 text-green-300'
                  }`}
                >
                  {open
                    ? `${t.inProgress} · ${t.expected}: ${formatSlaRemaining(s.dueAt)}`
                    : `${t.delivered}${s.deliveredAt ? ` · ${new Date(s.deliveredAt).toLocaleDateString(locale)}` : ''}`}
                </span>
              </div>

              {!open && s.candidates.length > 0 && (
                <ol className="mt-4 space-y-2">
                  {s.candidates.map((c) => (
                    <li key={c.applicationId} className="flex items-start gap-3 rounded-lg bg-gray-900/60 p-3">
                      <span className="w-6 text-center font-semibold text-primary-300">{c.rank}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">
                          {c.fullName || t.unknown}
                          {c.location ? <span className="font-normal text-gray-400"> · {c.location}</span> : null}
                        </p>
                        {c.note && <p className="mt-1 text-sm text-gray-300">{c.note}</p>}
                      </div>
                      <Link
                        href={localize(`/dashboard/recruiter/applications/${c.applicationId}`)}
                        className="shrink-0 text-sm text-primary-300 hover:text-primary-200"
                      >
                        {t.open} →
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
