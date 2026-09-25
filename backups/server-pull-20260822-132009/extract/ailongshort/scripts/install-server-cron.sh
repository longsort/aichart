#!/usr/bin/env bash
# /root/ailongshort — 텔레 자동 알림 crontab 등록 (중복 방지)
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MARK="# ailongshort-telegram-auto-alert"
CRON_LINE="*/2 * * * * cd ${ROOT} && /usr/bin/bash scripts/telegram-auto-alert-run.sh >>/var/log/ailongshort-tg.log 2>&1 ${MARK}"

touch /var/log/ailongshort-tg.log 2>/dev/null || true

existing="$(crontab -l 2>/dev/null || true)"
if echo "$existing" | grep -Fq "$MARK"; then
  echo "[cron] telegram-auto-alert 이미 등록됨"
else
  {
    echo "$existing" | sed '/^$/d'
    echo "$CRON_LINE"
  } | crontab -
  echo "[cron] telegram-auto-alert 등록 (2분마다)"
fi

crontab -l | grep -F "$MARK" || true
