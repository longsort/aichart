#!/usr/bin/env python3
"""서버 텔레 자동알림 상태 점검 — crontab, env, 로그, 수동 크론 1회."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh, cmd: str, timeout: int = 200) -> str:
    out(f"\n=== $ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    chunks = []
    while True:
        if stdout.channel.recv_ready():
            data = stdout.channel.recv(65536).decode("utf-8", errors="replace")
            chunks.append(data)
            sys.stdout.buffer.write(data.encode("utf-8", errors="replace"))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read().decode("utf-8", errors="replace")
    if rest:
        chunks.append(rest)
        sys.stdout.buffer.write(rest.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(f"[stderr] {err.strip()}")
    return "".join(chunks)


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    try:
        run(ssh, "pm2 list | sed -n '1,8p'")
        run(ssh, "crontab -l 2>/dev/null | grep -F telegram-auto-alert || echo '[cron] NOT REGISTERED'")
        run(
            ssh,
            "for f in /root/ailongshort/.env.production /root/ailongshort/.env.local; do "
            "echo \"--- $f ---\"; "
            "grep -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|TELEGRAM_MULTITF_CRON_SECRET|INTERNAL_ANALYZE_SECRET)=' \"$f\" 2>/dev/null | "
            "sed 's/=.*/=***set***/' || echo '(missing or empty)'; "
            "done",
        )
        run(ssh, "test -f /var/log/ailongshort-tg.log && tail -25 /var/log/ailongshort-tg.log || echo '[log] no /var/log/ailongshort-tg.log'")
        run(ssh, "pm2 logs ailongshort --nostream --lines 40 2>/dev/null | grep -i telegram | tail -15 || echo '[pm2] no telegram lines'")
        run(ssh, f"cd {REMOTE} && bash scripts/telegram-auto-alert-run.sh", timeout=200)
        run(
            ssh,
            "python3 - <<'PY'\n"
            "import json\n"
            "from pathlib import Path\n"
            "p = Path('/root/ailongshort/data/user-settings.json')\n"
            "if not p.exists():\n"
            "    print('[settings] file missing')\n"
            "else:\n"
            "    d = json.loads(p.read_text(encoding='utf-8'))\n"
            "    keys = ['telegramMergedDeskAutoEnabled','telegramZoneTouchAlertEnabled',"
            "'telegramPrecisionTouchEnabled','telegramConfirmChartImageEnabled','telegramMultiTfTimeframes']\n"
            "    if any(isinstance(v, dict) for v in d.values()):\n"
            "        for user, st in d.items():\n"
            "            if not isinstance(st, dict): continue\n"
            "            print(f'--- user: {user} ---')\n"
            "            for k in keys:\n"
            "                if k in st: print(f'  {k}: {st[k]}')\n"
            "    else:\n"
            "        print('[settings] legacy root format')\n"
            "        for k in keys:\n"
            "            if k in d: print(f'  {k}: {d[k]}')\n"
            "PY",
        )
        out("\n[done] server telegram check")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
