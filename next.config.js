const { withSentryConfig } = require("@sentry/nextjs");

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // Remove deprecated experimental.appDir. Next.js 14 uses the App Router by default.
  i18n: {
    // Support both English and French. English is default.
    locales: ['en', 'fr'],
    defaultLocale: 'en'
  },
  images: {
    // Allow Next.js Image component to load from Supabase Storage
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set
  silent: true,
  // Hide source maps from client bundles
  hideSourceMaps: true,
});
