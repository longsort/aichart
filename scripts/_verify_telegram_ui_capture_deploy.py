#!/usr/bin/env python3
"""Verify telegram UI capture on server."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    cmds = [
        "test -f /root/ailongshort/lib/telegramMergedDeskUiCapture.ts && echo OK_capture_lib",
        "test -d /root/ailongshort/app/telegram-merged-capture && echo OK_capture_page",
        "ls /root/.cache/ms-playwright/chromium_headless_shell-* 2>/dev/null | head -1 || echo NO_CHROMIUM",
        "grep -l telegramMergedDeskUiCaptureEnabled /root/ailongshort/data/user-settings.json && echo OK_settings_key",
        "cd /root/ailongshort && timeout 90 bash scripts/telegram-auto-alert-run.sh 2>&1 | tail -20",
    ]
    for c in cmds:
        out(f"$ {c}")
        _, stdout, stderr = ssh.exec_command(c, timeout=120)
        out(stdout.read().decode("utf-8", errors="replace"))
        err = stderr.read().decode("utf-8", errors="replace")
        if err.strip():
            out(err.strip())
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
