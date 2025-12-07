/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  i18n: {
    // Support both English and French. English is default.
    locales: ['en', 'fr'],
    defaultLocale: 'en'
  }
};

module.exports = nextConfig;