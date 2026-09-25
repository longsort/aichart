#!/usr/bin/env python3
"""List which secret keys exist in remote .env.local (names only)."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    cmd = (
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        "p=Path('/root/ailongshort/.env.local')\n"
        "keys=[]\n"
        "for line in p.read_text(encoding='utf-8', errors='replace').splitlines():\n"
        "  s=line.strip()\n"
        "  if not s or s.startswith('#') or '=' not in s: continue\n"
        "  k=s.split('=',1)[0].strip()\n"
        "  if any(x in k.upper() for x in ('SECRET','PASS','TOKEN','KEY','AUTH')):\n"
        "    keys.append(k)\n"
        "print('secretish_keys=', sorted(set(keys)))\n"
        "print('total_lines=', sum(1 for _ in p.read_text(encoding='utf-8', errors='replace').splitlines()))\n"
        "PY"
    )
    _, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    sys.stdout.buffer.write(stdout.read())
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stdout.buffer.write(("ERR: " + err).encode())
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
