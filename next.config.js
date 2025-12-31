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
  }
};

module.exports = nextConfig;