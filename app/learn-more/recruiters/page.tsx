import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Filter, Smartphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Learn More for Recruiters | JobLinca',
  description:
    'Explore how JobLinca helps recruiters hire faster with AI screening, candidate ranking and flexible vetting services.',
};

export default function RecruitersLearnMore() {
  return (
    <main className="bg-gray-900 text-gray-100">
      {/* Hero Section */}
      <section className="relative isolate py-20 px-4 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-16 -left-32 w-1/2 h-1/2 bg-yellow-500 rounded-full blur-3xl opacity-25"></div>
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-600 rounded-full blur-3xl opacity-30"></div>
        </div>
        <h1 className="text-4xl font-bold mb-4">Find Qualified Talent Fast</h1>
        <p className="max-w-3xl mx-auto text-lg text-gray-300">
          Post your open roles, let our AI do the heavy lifting, and make better hires in less time.
        </p>
        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <Link
            href="/recruiter/post-job"
            className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
          >
            Post a Job
          </Link>
          <Link
            href="/jobs"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            Explore Talent
          </Link>
        </div>
      </section>
      {/* Features Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why Hire with JobLinca?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Filter className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI Screening &amp; Ranking</h3>
              <p className="text-sm text-gray-300">
                Receive pre‑ranked candidate lists based on your requirements, saving you hours of manual sorting.
              </p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Users className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Diverse Talent Pool</h3>
              <p className="text-sm text-gray-300">
                Tap into a broad network of local and global professionals ready to contribute to your mission.
              </p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Smartphone className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">WhatsApp Automation</h3>
              <p className="text-sm text-gray-300">
                Manage candidate communications, schedule interviews and provide updates right from WhatsApp.
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
              Create your recruiter account and verify your company.
            </li>
            <li>
              <span className="text-yellow-500 mr-2">2.</span>
              Post your roles with optional screening questions and choose a vetting package.
            </li>
            <li>
              <span className="text-yellow-500 mr-2">3.</span>
              Receive shortlisted candidates, interview and hire with confidence.
            </li>
          </ol>
        </div>
      </section>
      {/* Vetting & Security Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-2xl font-semibold mb-4">Flexible Vetting Services</h3>
            <p className="text-sm text-gray-300">
              Choose from Basic (CV screening), Standard (screening + online test) or Premium (screening + test + interview) packages to suit your hiring needs. Our experienced officers handle the heavy lifting while you focus on your business.
            </p>
          </div>
          <div>
            <h3 className="text-2xl font-semibold mb-4">Trusted &amp; Secure Platform</h3>
            <p className="text-sm text-gray-300">
              Our platform enforces strict Row Level Security and encrypted storage, ensuring your data and candidate information remains private and protected.
            </p>
          </div>
        </div>
      </section>
      {/* Final CTA */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to hire smarter?</h2>
          <p className="mb-8 text-sm text-gray-300">
            Join forward‑thinking companies using JobLinca to find and hire talent 5× faster.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/recruiter/post-job"
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
            >
              Post a Job
            </Link>
            <Link
              href="/jobs"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
            >
              Explore Talent
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}