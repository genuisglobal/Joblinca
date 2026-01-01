"use client";

import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <main className="bg-gray-900 text-gray-100 overflow-hidden">
      <section className="relative isolate flex flex-col items-center justify-center min-h-[85vh] px-4 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center w-full max-w-4xl"
        >
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Find Jobs in Cameroon and Remote Worldwide
          </h1>

          <p className="mt-5 text-lg md:text-xl text-gray-300">
            JobLinca helps job seekers discover opportunities and helps recruiters find verified talent.
          </p>

          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <a
              href="/jobs"
              className="px-6 py-3 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Browse Jobs
            </a>

            <a
              href="/learn-more/jobseekers"
              className="px-6 py-3 rounded-md bg-gray-800 text-gray-100 hover:bg-gray-700 transition-colors"
            >
              Learn More
            </a>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
