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
    /** 개발: 너무 짧으면 Turbo 청크(async loader)가 증발해 Failed to load chunk 발생. 빌드는 기존과 동일 */
    maxInactiveAge: process.env.NODE_ENV === 'development' ? 3 * 60 * 1000 : 60 * 60 * 1000,
    pagesBufferLength: process.env.NODE_ENV === 'development' ? 4 : 8,
  },
  experimental: {
    webpackBuildWorker: process.env.NODE_ENV !== 'development',
    instrumentationHook: true,
    optimizePackageImports: ['lightweight-charts'],
    /** Next 14.2 — top-level serverExternalPackages 미지원 → experimental 키 사용 */
    serverComponentsExternalPackages: ['playwright', 'playwright-core'],
    turbo: {
      resolveAlias: {
        '@': root,
        /** turbo 클라이언트/스캔 시 playwright 에셋(.ttf) 오류 방지 — 실제 캡처는 createRequire */
        playwright: path.join(root, 'lib', 'stubs', 'emptyPlaywright.js'),
        'playwright-core': path.join(root, 'lib', 'stubs', 'emptyPlaywright.js'),
      },
    },
  },
  webpack: (config, { isServer, dev }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': root,
    };
    if (isServer) {
      const prev = config.externals;
      const extras = ['playwright', 'playwright-core'];
      if (Array.isArray(prev)) config.externals = [...prev, ...extras];
      else if (typeof prev === 'function') {
        config.externals = [
          prev,
          ({ request }, cb) => {
            if (request && extras.includes(request)) return cb(null, `commonjs ${request}`);
            cb();
          },
        ];
      } else if (prev) config.externals = [prev, ...extras];
      else config.externals = extras;
    }
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
        '**/backups/**',
        '**/docs/**',
        '**/data/virtual-store/**',
        '**/data/confirmed-signals/**',
        '**/playwright-report/**',
        '**/playwright/.cache/**',
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
