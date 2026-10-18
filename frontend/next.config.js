const createNextIntlPlugin = require('next-intl/plugin');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join, relative } = require('node:path');

// Content-versioned URLs keep the original GLBs cacheable without serving old model bytes.
const avatarRoot = join(__dirname, 'public/models/avatar');
const avatarHash = createHash('sha256');
function hashAvatarDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hashAvatarDirectory(path);
    else if (entry.name.endsWith('.glb')) {
      avatarHash.update(relative(avatarRoot, path));
      avatarHash.update(readFileSync(path));
    }
  }
}
hashAvatarDirectory(avatarRoot);
const avatarRevision = avatarHash.digest('hex');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: { NEXT_PUBLIC_AVATAR_ASSET_REVISION: avatarRevision },
  async headers() {
    return [{
      source: '/models/avatar/:path*',
      has: [{ type: 'query', key: 'v', value: avatarRevision }],
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }];
  },
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
