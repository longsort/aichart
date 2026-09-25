#!/usr/bin/env bash
# =============================================================================
# 무엇을 하나요?
#   브라우저로 앱을 열지 않아도, 이 스크립트가 서버에서 주기적으로 돌면
#   /api/cron/telegram-multi-tf 가 설정(data/user-settings.json)을 읽고
#   조건이 맞을 때 텔레그램으로 알림을 보냅니다.
#
# 어디서 실행?
#   프로젝트 규칙: 서버 경로는 /root/ailongshort 만 사용합니다.
#   cd /root/ailongshort && bash scripts/telegram-multitf-cron-run.sh
#
# 크론 등록 예 (5분마다):
#   crontab -e
#   */5 * * * * cd /root/ailongshort && /usr/bin/bash scripts/telegram-multitf-cron-run.sh >>/var/log/ailongshort-cron.log 2>&1
#
# 필요한 환경변수 (.env.production 등에 넣고, 아래에서 자동 로드):
#   TELEGRAM_MULTITF_CRON_SECRET  (필수)
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (텔레 전송)
#   INTERNAL_API_BASE_URL (선택, 없으면 http://127.0.0.1:$PORT)
#   PORT (선택, 기본 3000)
# =============================================================================
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

for envf in .env.production .env.local .env; do
  if [ -f "$envf" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$envf"
    set +a
    break
  fi
done

SECRET="$(echo "${TELEGRAM_MULTITF_CRON_SECRET:-}" | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
if [ -z "$SECRET" ]; then
  echo "[오류] TELEGRAM_MULTITF_CRON_SECRET 가 비어 있습니다. $ROOT/.env.production 등에 설정하세요."
  exit 1
fi

PORT="$(echo "${PORT:-3000}" | tr -d '\r')"
BASE="$(echo "${INTERNAL_API_BASE_URL:-http://127.0.0.1:$PORT}" | tr -d '\r')"
BASE="${BASE%/}"
URL="$BASE/api/cron/telegram-multi-tf"

if ! command -v curl >/dev/null 2>&1; then
  echo "[오류] curl 이 필요합니다."
  exit 1
fi

# -f: HTTP 오류 시 비정상 종료 → 크론에서 실패로 보이게
curl -fsS -m 120 -H "Authorization: Bearer ${SECRET}" "$URL"
echo ""
