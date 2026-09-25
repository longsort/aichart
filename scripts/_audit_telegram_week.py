#!/usr/bin/env python3
"""Audit telegram cron + recent send logs on server."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    d = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    cmd = r"""
set -e
echo '=== crontab ==='
crontab -l 2>/dev/null | grep -i telegram || echo '(no telegram crontab)'
echo '=== env keys ==='
cd /root/ailongshort
(set -a; [ -f .env.local ] && . ./.env.local; [ -f .env.production ] && . ./.env.production; set +a;
  echo "BOT=${TELEGRAM_BOT_TOKEN:+set}"; echo "CHAT=${TELEGRAM_CHAT_ID:+set}"; echo "SECRET=${TELEGRAM_MULTITF_CRON_SECRET:+set}")
echo '=== recent pm2 telegram lines ==='
pm2 logs ailongshort --lines 400 --nostream 2>/dev/null | grep -iE 'telegram|precision|dump|zone-touch|dedup|skip|cron' | tail -n 80 || true
echo '=== precision/dump files ==='
ls -la lib/telegramPrecisionTouchRunner.ts lib/telegramSignalPlaybook.ts lib/telegramServerConfirmRunner.ts 2>&1 | head
echo '=== grep gates ==='
grep -n 'telegramPrecisionTouch\|dump\|cooldown\|skip\|1d\|1w\|1M\|1h\|4h' lib/telegramPrecisionTouchRunner.ts | head -40
"""
    _, o, e = ssh.exec_command(cmd, timeout=90)
    sys.stdout.buffer.write(o.read())
    err = e.read()
    if err.strip():
        sys.stdout.buffer.write(b"ERR " + err[:2000])
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
