import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);

/** @type {import('next').NextConfig} */
const extraOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 8,
  },
  experimental: {
    webpackBuildWorker: true,
    optimizePackageImports: ['lightweight-charts'],
    turbo: {
      resolveAlias: {
        '@': root,
      },
    },
  },
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': root,
    };
    config.watchOptions = {
      ...(config.watchOptions || {}),
      aggregateTimeout: 400,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/assets/btccion/**',
        '**/assets/**/node_modules/**',
        '**/.agents/**',
        '**/.cursor/**',
        '**/data/virtual-store/**',
        '**/data/confirmed-signals/**',
      ],
    };
    if (dev) {
      config.cache = {
        type: 'filesystem',
        cacheDirectory: path.join(root, '.next', 'cache', 'webpack-dev'),
        buildDependencies: { config: [fileURLToPath(import.meta.url)] },
      };
    }
    return config;
  },
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://182.231.196.203:3000',
    'http://45.76.231.214:3000',
    'http://167.179.119.140:3000',
    ...extraOrigins,
  ],
};
export default nextConfig;
