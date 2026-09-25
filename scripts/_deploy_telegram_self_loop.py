#!/usr/bin/env python3
"""Deploy server-side telegram self-loop (폭락존·SFP·기관밴드, 앱 미접속) → /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

FILES = [
    "instrumentation.ts",
    "next.config.mjs",
    "start.js",
    "lib/telegramAutoAlertSelfScheduler.ts",
    "lib/telegramSfpAlertRunner.ts",
    "lib/settings.ts",
    "app/api/cron/telegram-auto-alert/route.ts",
    "scripts/telegram-auto-alert-run.sh",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip()[:2000])
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    d = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST} → {REMOTE}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                raise FileNotFoundError(local)
            remote = f"{REMOTE}/{rel}"
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(ssh, f"chmod +x {REMOTE}/scripts/telegram-auto-alert-run.sh")
    finally:
        sftp.close()

    # settings + cron ensure
    run(
        ssh,
        "python3 - <<'PY'\n"
        "import json\n"
        "from pathlib import Path\n"
        "p = Path('/root/ailongshort/data/user-settings.json')\n"
        "if p.exists():\n"
        "  d = json.loads(p.read_text(encoding='utf-8'))\n"
        "  tfs = ['15m','1h','4h','1d','1w','1M']\n"
        "  for user, st in d.items():\n"
        "    if not isinstance(st, dict): continue\n"
        "    st['telegramMergedDeskAutoEnabled'] = True\n"
        "    st['telegramZoneTouchAlertEnabled'] = True\n"
        "    st['telegramPrecisionTouchEnabled'] = True\n"
        "    st['telegramMultiTfTimeframes'] = tfs\n"
        "    print('fixed', user)\n"
        "  p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')\n"
        "PY",
    )
    run(
        ssh,
        "(crontab -l 2>/dev/null | grep -v ailongshort-telegram-auto-alert; "
        "echo '*/2 * * * * cd /root/ailongshort && /usr/bin/bash scripts/telegram-auto-alert-run.sh "
        ">>/var/log/ailongshort-tg.log 2>&1 # ailongshort-telegram-auto-alert') | crontab -",
    )

    run(ssh, f"cd {REMOTE} && npm run build")
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, "sleep 8 && pm2 show ailongshort | head -n 25")
    out("[done] telegram self-loop deployed — wait ~60s for first self tick")
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
