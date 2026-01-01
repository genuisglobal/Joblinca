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
            priority
          />
          {/* subtle glows to reinforce brand colours */}
          <div className="absolute top-20 left-40 w-1/2 h-1/2 bg-blue-600 rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-yellow-500 rounded-full blur-3xl opacity-20" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 flex flex-col items-center w-full"
        >
          {/* Brand logo */}
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6 gap-4">
            <Image
              src="/assets/logo-icon.png"
              alt="JobLinca logo icon"
              width={120}
              height={120}
              priority
            />
            <Image
              src="/assets/logo-wordmark.png"
              alt="JobLinca wordmark"
              width={240}
              height={80}
              priority
            />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Find Jobs in Cameroon and Remote
          </h1>

          <p className="text-gray-300 max-w-2xl mb-8">
            Apply to verified local roles and global remote opportunities — all in one place.
          </p>

          <div className="w-full max-w-2xl mb-8">
            <SearchJobsBar />
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/jobs"
              className="bg-blue-600 px-5 py-3 rounded hover:bg-blue-700"
            >
              Browse Jobs
            </Link>

            <Link
              href="/auth/register"
              className="bg-gray-800 px-5 py-3 rounded hover:bg-gray-700"
            >
              Create Account
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
