#!/usr/bin/env python3
"""Write APP_SESSION_SECRET on VPS if missing (no rebuild). Values never printed."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
    cmd = r"""python3 - <<'PY'
from pathlib import Path
import os, secrets
root = Path('/root/ailongshort')
target = root / '.env.local'
BAD = {'', 'ailongshort-dev-session-secret', '랜덤-긴-문자열', '운영용-긴-랜덤'}

def real_secret(p: Path) -> bool:
    if not p.is_file():
        return False
    for line in p.read_text(encoding='utf-8', errors='replace').splitlines():
        s = line.strip()
        if s.startswith('#') or not s.startswith('APP_SESSION_SECRET='):
            continue
        v = s.split('=', 1)[1].strip().strip('"').strip("'")
        if v not in BAD:
            return True
    return False

ok = real_secret(target) or real_secret(root / '.env.production')
print('secret_present', 'YES' if ok else 'NO')
if not ok:
    prev = target.read_text(encoding='utf-8', errors='replace') if target.is_file() else ''
    lines = [ln for ln in prev.splitlines() if not ln.strip().startswith('APP_SESSION_SECRET=')]
    lines.append('APP_SESSION_SECRET=' + secrets.token_urlsafe(48))
    target.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
    os.chmod(target, 0o600)
    print('secret_wrote', 'YES')
else:
    print('secret_wrote', 'NO')
print('env_local', 'YES' if target.is_file() else 'NO')
PY"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    if err.strip():
        sys.stdout.buffer.write(("ERR: " + err[:500] + "\n").encode())
    ssh.close()
    return 0 if "secret_present" in out else 1


if __name__ == "__main__":
    raise SystemExit(main())
