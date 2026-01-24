import Link from 'next/link';
import { FileText, CheckCircle, ArrowRight, Sparkles, Download, Layout, Shield, Zap, Users } from 'lucide-react';

export const metadata = {
  title: 'Free CV Builder - Create Professional Resume | Joblinca',
  description: 'Build a professional, ATS-friendly CV in minutes. Our free CV builder helps you create a resume that gets noticed by employers.',
};

export default function CVBuilderPage() {
  const features = [
    {
      icon: Layout,
      title: 'Professional Templates',
      description: 'Choose from modern, ATS-optimized templates designed to impress recruiters.',
    },
    {
      icon: Sparkles,
      title: 'AI-Powered Suggestions',
      description: 'Get intelligent recommendations to improve your CV content and structure.',
    },
    {
      icon: Download,
      title: 'Multiple Formats',
      description: 'Download your CV as PDF, Word, or share a live link with employers.',
    },
    {
      icon: Shield,
      title: 'ATS-Friendly',
      description: 'Optimized formatting ensures your CV passes applicant tracking systems.',
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Create Account',
      description: 'Sign up for free to access the CV builder and all its features.',
    },
    {
      number: '02',
      title: 'Fill Your Details',
      description: 'Enter your work experience, education, skills, and achievements.',
    },
    {
      number: '03',
      title: 'Choose Template',
      description: 'Select from professional templates that match your industry.',
    },
    {
      number: '04',
      title: 'Download & Apply',
      description: 'Export your CV and start applying to jobs with confidence.',
    },
  ];

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-600/10 via-neutral-950 to-neutral-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-600/10 border border-primary-600/20 text-sm text-primary-400 mb-8">
              <Sparkles className="w-4 h-4" />
              <span>Free for all Joblinca members</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Create a{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">
                Professional CV
              </span>{' '}
              in Minutes
            </h1>

            <p className="text-lg sm:text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
              Stand out from the crowd with a polished, ATS-friendly resume.
              Our free CV builder helps you craft a CV that gets noticed by employers.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                href="/auth/register?role=candidate&redirect=cv-builder"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
              >
                <FileText className="w-5 h-5" />
                Start Building Your CV
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-neutral-400 hover:text-white font-medium transition-colors"
              >
                Already have an account? Log in
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>100% Free</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>No Credit Card Required</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary-400" />
                <span>Trusted by thousands</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Everything You Need to Create a Winning CV
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              Our CV builder comes packed with features to help you create a professional resume that stands out.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 hover:border-primary-600/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-600/10 border border-primary-600/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-neutral-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              Create your professional CV in four simple steps.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="text-5xl font-bold text-neutral-800 mb-4">{step.number}</div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-primary-600/20 via-primary-600/10 to-accent-500/20 border border-primary-600/30 rounded-2xl p-8 sm:p-12">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Why Use Joblinca CV Builder?
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Increase Interview Chances</h4>
                  <p className="text-neutral-400 text-sm">A well-structured CV can increase your chances of landing interviews by up to 40%.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Pass ATS Screening</h4>
                  <p className="text-neutral-400 text-sm">Our templates are optimized to pass applicant tracking systems used by employers.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Save Time</h4>
                  <p className="text-neutral-400 text-sm">Create a professional CV in minutes, not hours. Focus on applying to jobs instead.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Apply Directly</h4>
                  <p className="text-neutral-400 text-sm">Once your CV is ready, apply to jobs on Joblinca with one click.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-600/20 border border-primary-600/30 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-primary-400" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Build Your CV?
          </h2>
          <p className="text-neutral-400 text-lg mb-10 max-w-xl mx-auto">
            Join thousands of job seekers who have created professional CVs with Joblinca.
            Get started for free today.
          </p>
          <Link
            href="/auth/register?role=candidate&redirect=cv-builder"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
          >
            Create Your CV Free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-sm text-neutral-500 mt-4">
            Free forever. No hidden fees.
          </p>
        </div>
      </section>
    </main>
  );
}
