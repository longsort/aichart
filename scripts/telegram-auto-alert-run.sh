#!/usr/bin/env bash
# =============================================================================
# ARES 텔레그램 자동 알림 (서버 단독 — 앱 접속 불필요)
#
# 기본 경로: Next instrumentation 자체 루프(lib/telegramAutoAlertSelfScheduler.ts)
# 보조 경로: 이 스크립트(crontab) → /api/cron/telegram-auto-alert (동일 엔진·파일 락)
#
#   /api/cron/telegram-auto-alert
#     · telegramMergedDeskAutoEnabled → 통합·분석 스윙중투 ENTER·★타점·TP·무효 + PNG (기본 ON)
#     · telegramMoneyEntryTouchEnabled → 롱/숏 진입자리 · $$$$ 돈구간 터치 + PNG (기본 ON)
#     · telegramPrecisionTouchEnabled → 폭락존 · 정밀E · 2차 (15m·1h·4h·1d·1w·1M)
#     · telegramZoneTouchAlertEnabled → 기관밴드·HotZone·안착구간 터치 + PNG (기본 ON)
#     · SFP↑/SFP↓ → 1m~1M (요청 TF 포함)
#     · telegramHqZoneTouchEnabled    → 통합텔레 ON 시 되돌림 존 보조 / OFF시 단독 HQ
#     · telegramConfirmEnabled        → 레거시 확정·타점 (통합텔레·HQ OFF일 때만)
#     · telegramMultiTfEnabled        → 레거시 HTF (통합텔레·HQ OFF일 때만)
#
#   /api/cron/mtf-board-telegram (선택, telegramMtfBoardImageEnabled ON 시)
#     · MTF 보드 카드 PNG
#
# 서버 경로: /root/ailongshort
#
# crontab 예 (보조, 2분마다 — 자체 루프와 중복돼도 락으로 1회만 실행):
#   */2 * * * * cd /root/ailongshort && bash scripts/telegram-auto-alert-run.sh >>/var/log/ailongshort-tg.log 2>&1
#
# 필수 env (.env.production):
#   TELEGRAM_MULTITF_CRON_SECRET
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_CHAT_ID
#   INTERNAL_ANALYZE_SECRET (권장)
#   TELEGRAM_AUTO_ALERT_SELF_LOOP=1 (기본, Next 기동 시 자체 루프)
# =============================================================================
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# PM2 start.js 와 동일 — .env.production 후 .env.local 덮어쓰기 (크론만 .env.production 읽고 SECRET 빠지는 문제 방지)
for envf in .env.production .env.local .env; do
  if [ -f "$envf" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$envf"
    set +a
  fi
done

# SECRET 없으면 INTERNAL_ANALYZE_SECRET 폴백 (기존 서버 호환)
if [ -z "${TELEGRAM_MULTITF_CRON_SECRET:-}" ] && [ -n "${INTERNAL_ANALYZE_SECRET:-}" ]; then
  export TELEGRAM_MULTITF_CRON_SECRET="$INTERNAL_ANALYZE_SECRET"
fi

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
# 폭락·SFP·기관밴드×멀티TF 분석은 3분 넘을 수 있음 — 자체 루프와 락으로 중복 방지
curl -fsS -m 360 "${AUTH[@]}" "$BASE/api/cron/telegram-auto-alert"
echo ""

echo "[mtf-board-telegram] $(date -Iseconds 2>/dev/null || date)"
curl -fsS -m 180 "${AUTH[@]}" "$BASE/api/cron/mtf-board-telegram" || echo "[warn] mtf-board skipped or failed"
echo ""
