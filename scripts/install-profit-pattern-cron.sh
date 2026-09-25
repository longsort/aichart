#!/usr/bin/env bash
# 수익패턴 서버 무접속 cron 등록 예시 (VPS)
#   bash scripts/install-profit-pattern-cron.sh
set -euo pipefail
SECRET="${PROFIT_PATTERN_CRON_SECRET:-${TELEGRAM_MULTITF_CRON_SECRET:-}}"
BASE="${PP_CRON_BASE:-http://127.0.0.1:3000}"
if [ -z "$SECRET" ]; then
  echo "PROFIT_PATTERN_CRON_SECRET 또는 TELEGRAM_MULTITF_CRON_SECRET 필요"
  exit 1
fi
LINE="*/2 * * * * curl -fsS -X POST -H \"Authorization: Bearer ${SECRET}\" ${BASE}/api/cron/profit-pattern-auto >/tmp/pp-cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'profit-pattern-auto' ; echo "$LINE" ) | crontab -
echo "installed: $LINE"
echo "test: curl -s -X POST -H \"Authorization: Bearer \$SECRET\" ${BASE}/api/cron/profit-pattern-auto?dry=1"
