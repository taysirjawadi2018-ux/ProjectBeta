import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile copies .next/standalone; without this the runtime stage
  // would need the full node_modules tree.
  output: 'standalone',
  // Pin the trace root to this directory. Next infers the workspace root from
  // the nearest lockfile and there is an unrelated package-lock.json further up
  // the tree (the repo lives under a user home directory), so the inferred root
  // was outside the project. Standalone tracing then walks the wrong tree and
  // the produced server is missing its dependencies.
  outputFileTracingRoot: here,
  reactStrictMode: true,
  poweredByHeader: false,
  // The BFF renders per-request — session, locale and theme all come from
  // cookies — so nothing here is statically prerenderable. Being explicit stops
  // a build from silently caching a signed-in page.
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
