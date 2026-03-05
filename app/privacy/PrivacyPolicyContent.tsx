import Link from 'next/link';

export default function PrivacyPolicyContent() {
  return (
    <main className="min-h-screen bg-gray-900 text-gray-100">
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          JobLinca Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-gray-400">Last updated: March 5, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-200 sm:text-base">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Overview</h2>
            <p className="mt-2">
              JobLinca is a hiring platform for job seekers, recruiters, and talent profiles.
              This Privacy Policy explains what information we collect, how we use it, and your
              choices when using our website and WhatsApp services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Account information such as name, email, phone number, and profile role.</li>
              <li>
                Professional information such as CV/resume data, skills, work history, education,
                projects, and portfolio details.
              </li>
              <li>
                WhatsApp interaction data including phone number, message content, timestamps,
                conversation state, search preferences, and usage counters.
              </li>
              <li>
                Talent lead details submitted through WhatsApp, including name, university or
                college, town, course or major, and CV/projects.
              </li>
              <li>
                Technical and analytics data such as device/browser data, IP address, and app
                usage logs for security and service reliability.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. How We Use Information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Provide job search, job posting, and talent profile services.</li>
              <li>Process applications and route candidates to recruiter workflows.</li>
              <li>Operate the WhatsApp Job Agent and respond to user commands.</li>
              <li>Enforce free/subscription limits and anti-abuse controls.</li>
              <li>Send relevant job alerts and platform notifications.</li>
              <li>Improve platform quality, reliability, and fraud/security protections.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. WhatsApp-Specific Notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                We store inbound WhatsApp numbers as leads and conversation records unless you
                register a full website account.
              </li>
              <li>
                We do not create full website accounts automatically from WhatsApp messages.
              </li>
              <li>
                Subscription payments are handled on the JobLinca website only, not inside
                WhatsApp.
              </li>
              <li>
                You can stop marketing or proactive WhatsApp updates by replying STOP, and opt in
                again by replying START.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Sharing of Information</h2>
            <p className="mt-2">
              We may share data with trusted infrastructure and communications providers needed to
              operate the service, including hosting, database, and WhatsApp delivery partners.
              We may also share candidate data with recruiters for job application processing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
            <p className="mt-2">
              We retain personal data only as long as needed for platform operation, legal
              compliance, and security. We may retain limited records for dispute prevention,
              fraud detection, and audit trails.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Security</h2>
            <p className="mt-2">
              We use reasonable technical and organizational safeguards to protect personal data.
              No system is perfectly secure, but we continuously work to reduce risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Your Rights</h2>
            <p className="mt-2">
              Subject to applicable law, you may request access, correction, deletion, or
              restriction of your data. You may also object to certain processing activities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Contact</h2>
            <p className="mt-2">
              For privacy requests or questions, contact JobLinca through our official website:{' '}
              <Link href="https://joblinca.com" className="text-blue-400 hover:text-blue-300">
                https://joblinca.com
              </Link>
              .
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
