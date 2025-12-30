import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Smartphone, BadgeCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Learn More for Job Seekers | JobLinca',
  description:
    'Discover how JobLinca empowers job seekers with AI matching, mobile convenience and access to local and global opportunities.',
};

export default function JobSeekersLearnMore() {
  return (
    <main className="bg-gray-900 text-gray-100">
      {/* Hero Section */}
      <section className="relative isolate py-20 px-4 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-16 -left-32 w-1/2 h-1/2 bg-blue-600 rounded-full blur-3xl opacity-30"></div>
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-yellow-500 rounded-full blur-3xl opacity-20"></div>
        </div>
        <h1 className="text-4xl font-bold mb-4">Your Path to Opportunity Starts Here</h1>
        <p className="max-w-3xl mx-auto text-lg text-gray-300">
          Create your profile, discover local &amp; global roles, and take control of your career journey with JobLinca.
        </p>
        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <Link
            href="/auth/register?role=candidate"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            Create Free Account
          </Link>
          <Link
            href="/jobs"
            className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
          >
            Browse Jobs
          </Link>
        </div>
      </section>
      {/* Features Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose JobLinca?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Sparkles className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI Matched Opportunities</h3>
              <p className="text-sm text-gray-300">
                Let our algorithms surface roles tailored to your skills and goals, including international remote jobs.
              </p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Smartphone className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">WhatsApp &amp; Mobile Friendly</h3>
              <p className="text-sm text-gray-300">
                Apply, chat with recruiters and track your progress right from your phone — no heavy apps required.
              </p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <BadgeCheck className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Free &amp; Accessible</h3>
              <p className="text-sm text-gray-300">
                Enjoy unlimited applications and personalized alerts at no cost, available in English and French.
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <ol className="max-w-3xl mx-auto space-y-6 text-gray-300">
            <li>
              <span className="text-yellow-500 mr-2">1.</span>
              Create your free profile, upload your CV and tell us about your skills.
            </li>
            <li>
              <span className="text-yellow-500 mr-2">2.</span>
              Receive curated job alerts via WhatsApp and browse open roles in our marketplace.
            </li>
            <li>
              <span className="text-yellow-500 mr-2">3.</span>
              Apply in one tap, track your progress and get hired faster with AI support.
            </li>
          </ol>
        </div>
      </section>
      {/* Additional Info Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-2xl font-semibold mb-4">Access International Remote Jobs</h3>
            <p className="text-sm text-gray-300">
              Broaden your horizons beyond local markets. We aggregate verified remote roles from trusted global sources, giving you exposure to a world of opportunities.
            </p>
          </div>
          <div>
            <h3 className="text-2xl font-semibold mb-4">Vetted Employers &amp; Secure Platform</h3>
            <p className="text-sm text-gray-300">
              Your safety matters. All employers are verified and our platform uses bank‑grade security to protect your data, ensuring you can focus on your career.
            </p>
          </div>
        </div>
      </section>
      {/* Final CTA */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to start your journey?</h2>
          <p className="mb-8 text-sm text-gray-300">
            Join thousands of Cameroonians finding meaningful work through JobLinca.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/auth/register?role=candidate"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
            >
              Create Free Account
            </Link>
            <Link
              href="/jobs"
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
            >
              Browse Jobs
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}