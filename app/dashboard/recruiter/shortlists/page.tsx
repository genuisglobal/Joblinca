import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { addLocalePrefix } from '@/lib/i18n/locale';
import { getRequestLocale } from '@/lib/i18n/server';
import { formatXaf, PAY_PER_RESULT_PLAN_SLUG, SHORTLIST_PLAN_SLUG } from '@/lib/vetting/billing';
import { formatSlaRemaining, isOpenStatus } from '@/lib/vetting/queue';
import { listRecruiterShortlists, listShortlistableJobs } from '@/lib/vetting/service';
import { GetShortlist, PayFeeButton, type ShortlistPlan } from './ShortlistActions';

export const dynamic = 'force-dynamic';

const COPY = {
  en: {
    title: 'Shortlists',
    subtitle: 'Screened, ranked candidates from the Joblinca Shortlist Service.',
    empty: 'No shortlists yet.',
    inProgress: 'In progress',
    delivered: 'Delivered',
    expected: 'Expected',
    open: 'Open application',
    unknown: 'Candidate',
    paid: 'Payment received. Thank you.',
    getTitle: 'Get a shortlist',
    getSubtitle: 'We screen and rank candidates and deliver a shortlist within 72 hours. Pay up front, or pay a small deposit and the rest only if you hire.',
    job: 'For which job?',
    noJobs: 'Publish a job first, then come back to order a shortlist for it.',
    payPerResult: 'Pay only if you hire',
    hired: 'Hired',
    feeDue: 'Pay balance',
    feePaid: 'Paid',
    feeWaived: 'No fee',
    feeReview: 'Hired · we will confirm the fee',
    feeName: 'Hiring fee',
  },
  fr: {
    title: 'Présélections',
    subtitle: 'Candidats vérifiés et classés par le service de présélection Joblinca.',
    empty: "Aucune présélection pour l'instant.",
    inProgress: 'En cours',
    delivered: 'Livrée',
    expected: 'Prévue',
    open: 'Voir la candidature',
    unknown: 'Candidat',
    paid: 'Paiement reçu. Merci.',
    getTitle: 'Obtenir une présélection',
    getSubtitle: "Nous vérifions et classons les candidats et livrons une présélection sous 72 heures. Payez d'avance, ou un petit acompte et le reste seulement si vous recrutez.",
    job: 'Pour quelle offre ?',
    noJobs: 'Publiez d’abord une offre, puis revenez commander une présélection.',
    payPerResult: 'Payez seulement si vous recrutez',
    hired: 'Recruté',
    feeDue: 'Payer le solde',
    feePaid: 'Payé',
    feeWaived: 'Sans frais',
    feeReview: 'Recruté · nous confirmons les frais',
    feeName: 'Frais de recrutement',
  },
} as const;

export default async function RecruiterShortlistsPage({
  searchParams,
}: {
  searchParams?: { paid?: string };
}) {
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

  // Every query below is scoped to recruiter_id = the signed-in user.
  const service = createServiceSupabaseClient();
  const [shortlists, jobs, { data: planRows }] = await Promise.all([
    listRecruiterShortlists(service, user.id),
    listShortlistableJobs(service, user.id),
    service
      .from('pricing_plans')
      .select('id, slug, name, amount_xaf, duration_days, description')
      .in('slug', [SHORTLIST_PLAN_SLUG, PAY_PER_RESULT_PLAN_SLUG])
      .eq('is_active', true)
      .order('amount_xaf', { ascending: false }),
  ]);
  const plans = (planRows ?? []) as ShortlistPlan[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t.title}</h1>
        <p className="text-gray-400 mt-1">{t.subtitle}</p>
      </div>

      {searchParams?.paid && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">{t.paid}</div>
      )}

      <GetShortlist
        jobs={jobs}
        plans={plans}
        copy={{ title: t.getTitle, subtitle: t.getSubtitle, job: t.job, noJobs: t.noJobs }}
      />

      {shortlists.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">{t.empty}</div>
      ) : (
        shortlists.map((s) => {
          const open = isOpenStatus(s.status);
          return (
            <section key={s.id} className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{s.job?.title ?? '—'}</h2>
                  {s.billingModel === 'pay_per_result' && (
                    <p className="text-xs text-gray-400">{t.payPerResult}</p>
                  )}
                </div>
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
                    <li key={c.applicationId} className="flex flex-wrap items-start gap-3 rounded-lg bg-gray-900/60 p-3">
                      <span className="w-6 text-center font-semibold text-primary-300">{c.rank}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">
                          {c.fullName || t.unknown}
                          {c.location ? <span className="font-normal text-gray-400"> · {c.location}</span> : null}
                        </p>
                        {c.note && <p className="mt-1 text-sm text-gray-300">{c.note}</p>}
                        {c.hire && (
                          <p className="mt-1 text-xs text-gray-400">
                            {c.hire.status === 'paid'
                              ? `${t.hired} · ${t.feePaid}${c.hire.amountXaf ? ` ${formatXaf(c.hire.amountXaf)}` : ''}`
                              : c.hire.status === 'needs_review'
                                ? t.feeReview
                                : c.hire.status === 'due'
                                  ? t.hired
                                  : `${t.hired} · ${t.feeWaived}`}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {c.hire?.status === 'due' && c.hire.amountXaf ? (
                          <PayFeeButton
                            hireId={c.hire.id}
                            amountXaf={c.hire.amountXaf}
                            label={t.feeDue}
                            planName={t.feeName}
                          />
                        ) : null}
                        <Link
                          href={localize(`/dashboard/recruiter/applications/${c.applicationId}`)}
                          className="text-sm text-primary-300 hover:text-primary-200"
                        >
                          {t.open} →
                        </Link>
                      </div>
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
