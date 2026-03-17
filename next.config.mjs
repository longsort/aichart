/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin dev requests (tunnel, LAN). Add your origin if you see the warning.
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://182.231.196.203:3000',
  ],
};
export default nextConfig;
