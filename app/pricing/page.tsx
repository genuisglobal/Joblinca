'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PaymentModal from '@/app/components/PaymentModal';

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  role: string;
  plan_type: string;
  amount_xaf: number;
  duration_days: number | null;
  features: string[];
  sort_order: number;
}

type DurationFilter = 'monthly' | 'quarterly' | 'biannual';

export default function PricingPage() {
  const [plans, setPlans] = useState<Record<string, Plan[]>>({});
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState<DurationFilter>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    fetch('/api/pricing-plans')
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.plans || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const durationMap: Record<DurationFilter, number> = {
    monthly: 30,
    quarterly: 90,
    biannual: 180,
  };

  function filterByDuration(planList: Plan[]): Plan[] {
    return planList.filter(
      (p) => p.plan_type === 'subscription' && p.duration_days === durationMap[duration]
    );
  }

  function handleSubscribe(plan: Plan) {
    setSelectedPlan(plan);
    setShowPayment(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading plans...</div>
      </div>
    );
  }

  const jobSeekerPlans = filterByDuration(plans.job_seeker || []);
  const talentPlans = filterByDuration(plans.talent || []);
  const recruiterPlans = (plans.recruiter || []).filter(
    (p) => p.plan_type !== 'per_job'
  );
  const jobTierPlans = (plans.recruiter || []).filter(
    (p) => p.plan_type === 'per_job'
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Joblinca
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Go to Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Choose the plan that fits your needs. Pay securely with MTN MoMo or Orange Money.
          </p>
        </div>

        {/* Duration Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-gray-800 rounded-lg p-1 flex gap-1">
            {(['monthly', 'quarterly', 'biannual'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  duration === d
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {d === 'monthly' ? '1 Month' : d === 'quarterly' ? '3 Months' : '6 Months'}
              </button>
            ))}
          </div>
        </div>

        {/* Job Seekers Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">For Job Seekers</h2>
          <p className="text-gray-400 mb-6">
            Boost your job search with AI-powered tools and premium visibility.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {jobSeekerPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={() => handleSubscribe(plan)}
              />
            ))}
            {jobSeekerPlans.length === 0 && (
              <p className="text-gray-500 col-span-3">No plans available for this duration.</p>
            )}
          </div>
        </section>

        {/* Talents Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">For Talents</h2>
          <p className="text-gray-400 mb-6">
            Accelerate your skills and showcase your portfolio.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {talentPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={() => handleSubscribe(plan)}
              />
            ))}
            {talentPlans.length === 0 && (
              <p className="text-gray-500 col-span-3">No plans available for this duration.</p>
            )}
          </div>
        </section>

        {/* Recruiters Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">For Recruiters</h2>
          <p className="text-gray-400 mb-6">
            Verification tiers that unlock recruitment tools and trust.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recruiterPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={() => handleSubscribe(plan)}
                highlight={plan.slug === 'recruiter_trusted'}
              />
            ))}
          </div>
        </section>

        {/* Per-Job Tiers */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Per-Job Hiring Support</h2>
          <p className="text-gray-400 mb-6">
            Pay per job posting. Choose the level of support you need.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {jobTierPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={() => handleSubscribe(plan)}
                compact
              />
            ))}
          </div>
        </section>
      </div>

      {/* Payment Modal */}
      {showPayment && selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          onClose={() => {
            setShowPayment(false);
            setSelectedPlan(null);
          }}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onSubscribe,
  highlight,
  compact,
}: {
  plan: Plan;
  onSubscribe: () => void;
  highlight?: boolean;
  compact?: boolean;
}) {
  const features = Array.isArray(plan.features) ? plan.features : [];

  return (
    <div
      className={`rounded-lg border p-6 flex flex-col ${
        highlight
          ? 'border-blue-500 bg-blue-900/20 ring-1 ring-blue-500/30'
          : 'border-gray-700 bg-gray-800'
      } ${compact ? '' : ''}`}
    >
      {highlight && (
        <span className="text-xs font-semibold text-blue-400 uppercase mb-2">
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
      <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
      <div className="mb-4">
        <span className="text-3xl font-bold">
          {plan.amount_xaf.toLocaleString()}
        </span>
        <span className="text-gray-400 text-sm ml-1">CFA</span>
        {plan.duration_days && (
          <span className="text-gray-500 text-sm ml-1">
            / {plan.duration_days} days
          </span>
        )}
      </div>
      <ul className="space-y-2 mb-6 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
            <svg
              className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <button
        onClick={onSubscribe}
        className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
          highlight
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
      >
        {plan.plan_type === 'per_job' ? 'Select' : 'Subscribe'}
      </button>
    </div>
  );
}
