#!/usr/bin/env bash
# =============================================================================
# ARES 텔레그램 자동 알림 (서버 단독 — 앱 접속 불필요)
#
#   /api/cron/telegram-auto-alert
#     · telegramMergedDeskAutoEnabled → 통합·분석 스윙중투 ENTER·★타점·TP·무효 + PNG (기본 ON)
#     · telegramMoneyEntryTouchEnabled → 롱/숏 진입자리 · $$$$ 돈구간 터치 + PNG (기본 ON) ★핵심
#     · telegramZoneTouchAlertEnabled → 기관밴드·HotZone·안착구간 터치 + PNG (기본 ON)
#     · telegramHqZoneTouchEnabled    → 통합텔레 ON 시 되돌림 존 보조 / OFF시 단독 HQ
#     · telegramConfirmEnabled        → 레거시 확정·타점 (통합텔레·HQ OFF일 때만)
#     · telegramMultiTfEnabled        → 레거시 HTF (통합텔레·HQ OFF일 때만)
#
#   /api/cron/mtf-board-telegram (선택, telegramMtfBoardImageEnabled ON 시)
#     · MTF 보드 카드 PNG
#
# 서버 경로: /root/ailongshort
#
# crontab 예 (2분마다):
#   */2 * * * * cd /root/ailongshort && bash scripts/telegram-auto-alert-run.sh >>/var/log/ailongshort-tg.log 2>&1
#
# 필수 env (.env.production):
#   TELEGRAM_MULTITF_CRON_SECRET
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_CHAT_ID
#   INTERNAL_ANALYZE_SECRET (권장)
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
  echo "[오류] TELEGRAM_MULTITF_CRON_SECRET 비어 있음"
  exit 1
fi

PORT="$(echo "${PORT:-3000}" | tr -d '\r')"
BASE="$(echo "${INTERNAL_API_BASE_URL:-http://127.0.0.1:$PORT}" | tr -d '\r')"
BASE="${BASE%/}"
AUTH=(-H "Authorization: Bearer ${SECRET}")

echo "[telegram-auto-alert] $(date -Iseconds 2>/dev/null || date)"
curl -fsS -m 180 "${AUTH[@]}" "$BASE/api/cron/telegram-auto-alert"
echo ""

echo "[mtf-board-telegram] $(date -Iseconds 2>/dev/null || date)"
curl -fsS -m 180 "${AUTH[@]}" "$BASE/api/cron/mtf-board-telegram" || echo "[warn] mtf-board skipped or failed"
echo ""
