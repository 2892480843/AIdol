const createNextIntlPlugin = require('next-intl/plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
    // Disable automatic static optimization for pages using client-side context
    missingSuspenseWithCSRBailout: false,
  },
  images: {
    unoptimized: true,
  },
  // /api/v1/* is proxied by app/api/v1/[...path]/route.ts rather than a rewrite here, because
  // rewrites() is serialized into routes-manifest.json at build time and so cannot honor a
  // runtime BACKEND_URL in the prebuilt image.
};

const withNextIntl = createNextIntlPlugin();
module.exports = withNextIntl(nextConfig);
