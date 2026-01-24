import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Briefcase, MapPin, Clock, Users, FileText, CheckCircle, ArrowRight, Building2, Globe, Zap } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  job_type: string | null;
  salary: number | null;
  created_at: string;
  is_remote: boolean | null;
}

export default async function HomePage() {
  const supabase = createServerSupabaseClient();
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, company, location, job_type, salary, created_at, is_remote')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(6);

  return (
    <main className="bg-neutral-950 text-neutral-100">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950" />

        {/* Africa-themed abstract pattern (subtle) */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id="africa-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1.5" fill="currentColor" />
            </pattern>
            <rect width="100" height="100" fill="url(#africa-pattern)" />
          </svg>
        </div>

        {/* Accent glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/60 border border-neutral-700/50 text-sm text-neutral-300 mb-8">
            <Globe className="w-4 h-4 text-accent-400" />
            <span>Africa's Growing Job Marketplace</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Find Jobs in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">
              Cameroon
            </span>{' '}
            and{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-400 to-accent-500">
              Remote Worldwide
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Joblinca connects African talent to local and remote job opportunities
            in tech, business, and professional roles. Your next career move starts here.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
            >
              <Briefcase className="w-5 h-5" />
              Browse Jobs
            </Link>
            <Link
              href="/recruiter/post-job"
              className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-8 py-4 rounded-lg font-semibold transition-all"
            >
              <Building2 className="w-5 h-5" />
              Post a Job
            </Link>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Free for Job Seekers</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-400" />
              <span>AI-Powered Matching</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-400" />
              <span>Local & Remote Opportunities</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Jobs Section */}
      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Latest Job Opportunities</h2>
              <p className="text-neutral-400">Discover your next role from top employers</p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              View All Jobs
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {jobs && jobs.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job: Job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 hover:border-primary-600/50 hover:bg-neutral-800 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-neutral-700/50 flex items-center justify-center">
                      <Briefcase className="w-6 h-6 text-primary-400" />
                    </div>
                    {job.is_remote && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-500/10 text-green-400 rounded-full">
                        Remote
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold mb-2 group-hover:text-primary-400 transition-colors">
                    {job.title}
                  </h3>

                  {job.company && (
                    <p className="text-neutral-400 text-sm mb-3">{job.company}</p>
                  )}

                  <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
                    {job.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{job.location}</span>
                      </div>
                    )}
                    {job.job_type && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{job.job_type}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-700/50">
                    <span className="text-primary-400 text-sm font-medium group-hover:underline">
                      View Details
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-neutral-800/30 rounded-xl border border-neutral-800">
              <Briefcase className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
              <p className="text-neutral-400 mb-4">New opportunities coming soon</p>
              <Link
                href="/auth/register?role=candidate"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
              >
                Get notified when jobs are posted
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* How Joblinca Works */}
      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">How Joblinca Works</h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              A simple, streamlined process to connect talent with opportunity
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: '01',
                title: 'Jobs Posted',
                description: 'Verified employers post opportunities across industries',
                icon: Building2,
              },
              {
                step: '02',
                title: 'Create Profile',
                description: 'Job seekers create profiles and upload their CVs',
                icon: Users,
              },
              {
                step: '03',
                title: 'Apply Directly',
                description: 'Apply to jobs or get matched with AI-powered recommendations',
                icon: FileText,
              },
              {
                step: '04',
                title: 'Get Hired',
                description: 'Access tools and resources to boost your employability',
                icon: CheckCircle,
              },
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className="text-5xl font-bold text-neutral-800 mb-4">{item.step}</div>
                <div className="w-12 h-12 rounded-lg bg-primary-600/10 border border-primary-600/20 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Job Seekers & Recruiters */}
      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Job Seekers */}
            <div className="bg-gradient-to-br from-primary-600/10 to-primary-600/5 border border-primary-600/20 rounded-2xl p-8">
              <div className="w-14 h-14 rounded-xl bg-primary-600/20 flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-primary-400" />
              </div>
              <h3 className="text-2xl font-bold mb-4">For Job Seekers & Talent</h3>
              <ul className="space-y-3 text-neutral-300 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Create a free account and apply to unlimited jobs</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Get matched to roles with AI-powered recommendations</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Receive job alerts via WhatsApp and email</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Build a professional CV with our free CV Builder</span>
                </li>
              </ul>
              <Link
                href="/auth/register?role=candidate"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Recruiters */}
            <div className="bg-gradient-to-br from-accent-500/10 to-accent-500/5 border border-accent-500/20 rounded-2xl p-8">
              <div className="w-14 h-14 rounded-xl bg-accent-500/20 flex items-center justify-center mb-6">
                <Building2 className="w-7 h-7 text-accent-400" />
              </div>
              <h3 className="text-2xl font-bold mb-4">For Recruiters & Employers</h3>
              <ul className="space-y-3 text-neutral-300 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Post jobs and reach qualified Cameroonian talent</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>AI-filtered candidates save you screening time</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Automated interview scheduling and communication</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Hire faster with streamlined hiring workflows</span>
                </li>
              </ul>
              <Link
                href="/recruiter/post-job"
                className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-neutral-900 px-6 py-3 rounded-lg font-semibold transition-all"
              >
                Post a Job
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CV Builder Lead Magnet */}
      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-gradient-to-r from-primary-600/20 via-primary-600/10 to-accent-500/20 border border-primary-600/30 rounded-2xl p-8 sm:p-12 overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <pattern id="cv-pattern" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="1" height="1" fill="currentColor" />
                </pattern>
                <rect width="100" height="100" fill="url(#cv-pattern)" />
              </svg>
            </div>

            <div className="relative z-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-600/30 border border-primary-600/40 flex items-center justify-center mx-auto mb-6">
                <FileText className="w-8 h-8 text-primary-400" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Create a Professional CV in Minutes
              </h2>
              <p className="text-neutral-300 max-w-lg mx-auto mb-8 leading-relaxed">
                Stand out from the crowd with a polished, ATS-friendly resume.
                Our free CV Builder helps you craft a professional CV that gets noticed by employers.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/auth/register?role=candidate&redirect=cv-builder"
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
                >
                  Build Your CV Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <p className="text-sm text-neutral-500 mt-4">
                Free for all registered members
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Partners & Trust Section */}
      <section className="py-16 px-6 bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-neutral-400 text-sm uppercase tracking-wider mb-8">
            Trusted by employers and partners across Africa
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
            <Image
              src="/partners/mtn.png"
              alt="MTN Cameroon"
              width={80}
              height={40}
              className="object-contain grayscale hover:grayscale-0 transition-all"
            />
            <Image
              src="/partners/orange.png"
              alt="Orange Cameroon"
              width={80}
              height={50}
              className="object-contain grayscale hover:grayscale-0 transition-all"
            />
            <span className="text-neutral-500 font-medium">JobGenuis</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Take the Next Step?
          </h2>
          <p className="text-neutral-400 text-lg mb-10 max-w-xl mx-auto">
            Join thousands of professionals building their careers through Joblinca.
            Your next opportunity is waiting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
            >
              <Briefcase className="w-5 h-5" />
              Find Jobs Now
            </Link>
            <Link
              href="/recruiter/post-job"
              className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-8 py-4 rounded-lg font-semibold transition-all"
            >
              <Building2 className="w-5 h-5" />
              Hire Talent
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-4">
                <Image
                  src="/joblinca-logo.png"
                  alt="JobLinca"
                  width={40}
                  height={40}
                />
                <span className="text-xl font-bold">Joblinca</span>
              </Link>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-sm">
                Africa's growing job marketplace connecting talented professionals
                with local and remote opportunities in tech, business, and beyond.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">Quick Links</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href="/jobs" className="text-neutral-400 hover:text-white transition-colors">
                    Find Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/recruiter/post-job" className="text-neutral-400 hover:text-white transition-colors">
                    Post a Job
                  </Link>
                </li>
                <li>
                  <Link href="/cv-builder" className="text-neutral-400 hover:text-white transition-colors">
                    CV Builder
                  </Link>
                </li>
                <li>
                  <Link href="/remote-jobs" className="text-neutral-400 hover:text-white transition-colors">
                    Remote Jobs
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">Company</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href="/about" className="text-neutral-400 hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-neutral-400 hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-neutral-400 hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-neutral-400 hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-neutral-500 text-sm">
              &copy; {new Date().getFullYear()} Joblinca. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <span>Made with purpose for African talent</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
