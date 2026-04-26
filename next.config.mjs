import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const extraOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  webpack: (config) => {
    const root = path.resolve(__dirname);
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': root,
    };
    return config;
  },
  // next dev: tunnel·LAN·고정 IP 접속 시 Cross-Origin 경고 완화 (쉼표로 추가 가능)
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
