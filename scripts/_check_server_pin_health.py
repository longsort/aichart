#!/usr/bin/env python3
"""Check server health + whether overlay pinAbs is deployed."""
from __future__ import annotations

import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def run(ssh, cmd: str, timeout: int = 90) -> str:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    text = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if text.strip():
        out(text.rstrip()[:6000])
    if err.strip():
        out("ERR " + err.strip()[:1500])
    return text


def main() -> int:
    import paramiko

    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    try:
        run(ssh, "pm2 list")
        run(ssh, "curl -sS -m 15 -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/ || true")
        run(
            ssh,
            "curl -sS -m 25 -o /dev/null -w 'analyze=%{http_code}\\n' "
            "'http://127.0.0.1:3000/api/analyze?symbol=BTCUSDT&timeframe=1h' || true",
        )
        run(
            ssh,
            "grep -n 'pinAbsX\\|applyOverlayPinAbs\\|OverlayLabelOffset' "
            f"{REMOTE}/app/components/ChartView.tsx | head -20 || echo NO_PIN",
        )
        run(ssh, f"wc -l {REMOTE}/app/components/ChartView.tsx; ls -la {REMOTE}/.next/BUILD_ID 2>/dev/null || echo no_build")
        run(ssh, "pm2 logs ailongshort --lines 25 --nostream 2>/dev/null | tail -n 40 || true")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
