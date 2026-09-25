#!/usr/bin/env bash
# 서버에서만 실행: cron secret 보정 + 전체 배포
set -euo pipefail
cd /root/ailongshort

fix_cron_secret() {
  if grep -q '^TELEGRAM_MULTITF_CRON_SECRET=$' .env.local 2>/dev/null; then
    sed -i '/^TELEGRAM_MULTITF_CRON_SECRET=$/d' .env.local
    sed -i '/^INTERNAL_ANALYZE_SECRET=$/d' .env.local
  fi
  if ! grep -q '^TELEGRAM_MULTITF_CRON_SECRET=.\+' .env.local 2>/dev/null; then
    SEC="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    echo "TELEGRAM_MULTITF_CRON_SECRET=${SEC}" >> .env.local
    echo "INTERNAL_ANALYZE_SECRET=${SEC}" >> .env.local
    echo "[env] TELEGRAM_MULTITF_CRON_SECRET / INTERNAL_ANALYZE_SECRET 생성"
  else
    echo "[env] cron secret OK"
  fi
}

fix_cron_secret
chmod +x scripts/*.sh
bash scripts/vps-deploy.sh
