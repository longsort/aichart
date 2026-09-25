#!/usr/bin/env python3
"""Fix server telegram cron: env script + user settings + re-test."""
from __future__ import annotations

import importlib.util
import json
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
    out(f"\n=== $ {cmd[:120]}...")
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
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        local = os.path.join(ROOT, "scripts", "telegram-auto-alert-run.sh")
        sftp.put(local, f"{REMOTE}/scripts/telegram-auto-alert-run.sh")
        run(ssh, f"chmod +x {REMOTE}/scripts/telegram-auto-alert-run.sh")

        run(
            ssh,
            "python3 - <<'PY'\n"
            "from pathlib import Path\n"
            "p = Path('/root/ailongshort/.env.local')\n"
            "text = p.read_text(encoding='utf-8') if p.exists() else ''\n"
            "lines = text.splitlines()\n"
            "vals = {}\n"
            "for line in lines:\n"
            "    if '=' not in line or line.strip().startswith('#'): continue\n"
            "    k, _, v = line.partition('=')\n"
            "    vals[k.strip()] = v.strip().strip('\"').strip(\"'\")\n"
            "if not vals.get('TELEGRAM_MULTITF_CRON_SECRET') and vals.get('INTERNAL_ANALYZE_SECRET'):\n"
            "    if 'TELEGRAM_MULTITF_CRON_SECRET=' not in text:\n"
            "        lines.append('TELEGRAM_MULTITF_CRON_SECRET=' + vals['INTERNAL_ANALYZE_SECRET'])\n"
            "        p.write_text('\\n'.join(lines) + '\\n', encoding='utf-8')\n"
            "        print('[env] added TELEGRAM_MULTITF_CRON_SECRET from INTERNAL_ANALYZE_SECRET')\n"
            "    else:\n"
            "        print('[env] TELEGRAM_MULTITF_CRON_SECRET key exists but empty? check manually')\n"
            "elif vals.get('TELEGRAM_MULTITF_CRON_SECRET'):\n"
            "    print('[env] TELEGRAM_MULTITF_CRON_SECRET already set')\n"
            "else:\n"
            "    print('[env] WARN: no SECRET and no INTERNAL_ANALYZE_SECRET')\n"
            "PY",
        )

        run(
            ssh,
            "python3 - <<'PY'\n"
            "import json\n"
            "from pathlib import Path\n"
            "p = Path('/root/ailongshort/data/user-settings.json')\n"
            "d = json.loads(p.read_text(encoding='utf-8'))\n"
            "tfs = ['15m', '1h', '4h', '1d', '1w', '1M']\n"
            "for user, st in d.items():\n"
            "    if not isinstance(st, dict): continue\n"
            "    st['telegramMergedDeskAutoEnabled'] = True\n"
            "    st['telegramZoneTouchAlertEnabled'] = True\n"
            "    st['telegramPrecisionTouchEnabled'] = True\n"
            "    st['telegramConfirmChartImageEnabled'] = True\n"
            "    st['telegramMultiTfTimeframes'] = tfs\n"
            "    print(f'[settings] fixed {user}')\n"
            "p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')\n"
            "PY",
        )

        run(ssh, f"cd {REMOTE} && bash scripts/telegram-auto-alert-run.sh", timeout=200)
        run(ssh, "tail -5 /var/log/ailongshort-tg.log 2>/dev/null || true")
        out("\n[done] fix + retest")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
