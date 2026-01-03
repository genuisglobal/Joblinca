"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import SearchJobsBar from "@/components/SearchJobsBar";
import { BrainCircuit, PhoneCall, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="bg-gray-900 text-gray-100 overflow-hidden">
      {/* Hero Section */}
      <section className="relative isolate flex flex-col items-center justify-center min-h-[85vh] px-4 py-24 text-center">
        {/* Background illustration */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <Image
            src="/assets/hero-illustration.png"
            alt="Cameroonian professionals illustration"
            fill
            className="object-cover object-center opacity-30"
          />
          {/* subtle glows to reinforce brand colours */}
          <div className="absolute -top-20 -left-40 w-1/2 h-1/2 bg-blue-600 rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-yellow-500 rounded-full blur-3xl opacity-20" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="relative z-10 flex flex-col items-center w-full">
            {/* Brand logo text only on homepage. Remove the separate icon for a cleaner hero. */}
            <div className="flex items-center justify-center mb-8">
              <Image
                src="/assets/logo-wordmark.png"
                alt="JobLinca"
                width={280}
                height={80}
                priority
                className="object-contain"
              />
            </div>

            {/* Hero headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 max-w-4xl mx-auto leading-tight">
              Find Jobs in Cameroon and Remote Worldwide
            </h1>

            {/* Tagline with icons */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-base sm:text-lg text-gray-300 mb-6 max-w-3xl">
              <span className="flex items-center space-x-2">
                <BrainCircuit size={20} className="text-blue-500" />
                <span>AI-powered matching</span>
              </span>
              <span className="flex items-center space-x-2">
                <PhoneCall size={20} className="text-green-400" />
                <span>WhatsApp apply</span>
              </span>
              <span className="flex items-center space-x-2">
                <ShieldCheck size={20} className="text-yellow-400" />
                <span>Secure platform</span>
              </span>
            </div>

            {/* Search bar */}
            <SearchJobsBar />

            {/* Primary CTAs */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/jobs"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors font-medium"
              >
                Find Jobs
              </Link>
              <Link
                href="/recruiter/post-job"
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors font-medium"
              >
                Post a Job
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Who it’s for Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Who is JobLinca for?
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Job Seekers Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="bg-gray-800 rounded-lg p-8 shadow-lg flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-semibold mb-4">For Job Seekers</h3>
                  <ul className="space-y-2 text-sm">
                    <li>Free account creation</li>
                    <li>Apply to jobs for free</li>
                    <li>Get matched faster with AI</li>
                    <li>WhatsApp job alerts</li>
                  </ul>
                </div>

                <div className="mt-6">
                  <Link
                    href="/learn-more/jobseekers"
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors font-medium"
                  >
                    Learn More
                  </Link>
                </div>
              </div>
            </motion.div>

            {/* Recruiters Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="bg-gray-800 rounded-lg p-8 shadow-lg flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-semibold mb-4">For Recruiters</h3>
                  <ul className="space-y-2 text-sm">
                    <li>Post jobs easily</li>
                    <li>Get AI-filtered candidates</li>
                    <li>Interview less, hire faster</li>
                    <li>WhatsApp recruiter automation</li>
                  </ul>
                </div>

                <div className="mt-6">
                  <Link
                    href="/learn-more/recruiters"
                    className="inline-block bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-4 py-2 rounded-md transition-colors font-medium"
                  >
                    Learn More
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI & ATS Power Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            AI &amp; ATS Power
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="bg-gray-900 p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-3">AI Resume Scanning</h3>
                <p className="text-sm text-gray-300">
                  Identify top talent instantly by letting our AI scan and highlight relevant experience.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="bg-gray-900 p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-3">Automated Candidate Ranking</h3>
                <p className="text-sm text-gray-300">
                  Save time by receiving a ranked shortlist based on skill fit, experience and culture match.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="bg-gray-900 p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-3">AI Interview Screening</h3>
                <p className="text-sm text-gray-300">
                  Reduce bias and standardize first-round interviews with AI-powered video and chat assessments.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* WhatsApp Automation Teaser */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-600 via-blue-500 to-yellow-500 rounded-lg p-6 text-center">
          <p className="text-lg sm:text-xl font-medium text-gray-900">
            Manage job applications directly from WhatsApp &mdash; coming fully automated.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-semibold mb-4">For Job Seekers</h3>
              <ol className="space-y-3 text-sm list-decimal list-inside">
                <li>Create your free account</li>
                <li>Apply to jobs</li>
                <li>Get hired</li>
              </ol>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">For Recruiters</h3>
              <ol className="space-y-3 text-sm list-decimal list-inside">
                <li>Post a job</li>
                <li>Receive AI-screened candidates</li>
                <li>Hire with confidence</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Trusted by leading technology and telecom partners
          </h2>

          <div className="flex flex-wrap justify-center items-center gap-8 mt-8">
            <div className="h-12 flex items-center justify-center">
              <span className="text-lg font-semibold text-gray-300">JobGenuis</span>
            </div>

            <Image src="/partners/mtn.png" alt="MTN Cameroon" width={120} height={60} />
            <Image src="/partners/orange.png" alt="Orange Cameroon" width={120} height={80} />
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="mb-8 text-sm sm:text-base text-gray-300">
            Create your free account or post your first job today to unlock Cameroon’s leading AI-powered talent platform.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/auth/register?role=candidate"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
            >
              Create Free Account
            </Link>

            <Link
              href="/recruiter/post-job"
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
            >
              Post a Job
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
