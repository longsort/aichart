/**
 * PM2 — 환경변수는 start.js 가 .env.production / .env.local 을 읽습니다.
 * 배포: cd /root/ailongshort && bash scripts/vps-deploy.sh
 */
module.exports = {
  apps: [
    {
      name: 'ailongshort',
      script: 'start.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 50,
      exp_backoff_restart_delay: 2000,
      max_memory_restart: '5G',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        SERVER_PORT: '3001',
      },
    },
  ],
};
