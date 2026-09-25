#!/usr/bin/env python3
"""Fix missing APP_SESSION_SECRET / INTERNAL_ANALYZE_SECRET on server."""
from __future__ import annotations

import importlib.util
import os
import secrets
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"


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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 120) -> str:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    text = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if text.strip():
        out(text.strip())
    if err.strip():
        out(err.strip())
    return text


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)

    # diagnose — key names only
    run(ssh, f"test -f {REMOTE_DIR}/.env.local && echo HAS_ENV_LOCAL || echo NO_ENV_LOCAL")
    run(
        ssh,
        f"grep -E '^(APP_SESSION_SECRET|INTERNAL_ANALYZE_SECRET|TELEGRAM_MULTITF_CRON_SECRET)=' "
        f"{REMOTE_DIR}/.env.local {REMOTE_DIR}/.env.production 2>/dev/null | cut -d= -f1 | sort -u || true",
    )

    secret = secrets.token_urlsafe(48)
    patch_py = f"""
import re
from pathlib import Path

root = Path('{REMOTE_DIR}')
env_local = root / '.env.local'
env_prod = root / '.env.production'
new_secret = '{secret}'

def read_lines(p):
    if not p.exists():
        return []
    return p.read_text(encoding='utf-8').splitlines()

def get_val(lines, key):
    for line in lines:
        if line.strip().startswith('#'):
            continue
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''

def set_or_append(path, key, value):
    lines = read_lines(path) if path.exists() else []
    out = []
    found = False
    for line in lines:
        if line.startswith(key + '='):
            if not line.split('=',1)[1].strip():
                out.append(f'{{key}}={{value}}')
            else:
                out.append(line)
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f'{{key}}={{value}}')
    path.write_text('\\n'.join(out).rstrip() + '\\n', encoding='utf-8')

# ensure .env.local exists
if not env_local.exists():
    env_local.write_text('# ailongshort production secrets\\n', encoding='utf-8')

lines = read_lines(env_local)
cron = get_val(lines, 'TELEGRAM_MULTITF_CRON_SECRET')
analyze = get_val(lines, 'INTERNAL_ANALYZE_SECRET')
session = get_val(lines, 'APP_SESSION_SECRET')

# propagate: use existing cron secret as master if present
master = cron or analyze or session or new_secret

if not cron:
    set_or_append(env_local, 'TELEGRAM_MULTITF_CRON_SECRET', master)
if not analyze:
    set_or_append(env_local, 'INTERNAL_ANALYZE_SECRET', master)
if not session:
    set_or_append(env_local, 'APP_SESSION_SECRET', master)

# empty values in .env.production can block — fill if blank
if env_prod.exists():
    plines = read_lines(env_prod)
    for key in ('APP_SESSION_SECRET', 'INTERNAL_ANALYZE_SECRET', 'TELEGRAM_MULTITF_CRON_SECRET'):
        v = get_val(plines, key)
        if v == '':
            set_or_append(env_prod, key, master)

env_local.chmod(0o600)
print('[secrets] patched .env.local (values not printed)')
print('[secrets] APP_SESSION_SECRET:', 'set' if get_val(read_lines(env_local), 'APP_SESSION_SECRET') else 'MISSING')
print('[secrets] INTERNAL_ANALYZE_SECRET:', 'set' if get_val(read_lines(env_local), 'INTERNAL_ANALYZE_SECRET') else 'MISSING')
print('[secrets] TELEGRAM_MULTITF_CRON_SECRET:', 'set' if get_val(read_lines(env_local), 'TELEGRAM_MULTITF_CRON_SECRET') else 'MISSING')
"""
    run(ssh, f"python3 - <<'PY'\n{patch_py}\nPY")
    run(ssh, "pm2 restart ailongshort && sleep 3 && pm2 list | sed -n '1,8p'")
    run(ssh, "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://127.0.0.1:3000/")
    # analyze should not return 503 for secret misconfig
    run(
        ssh,
        "curl -s -o /dev/null -w 'analyze %{http_code}\\n' "
        "'http://127.0.0.1:3000/api/analyze?symbol=BTCUSDT&timeframe=15m&collect=0' || true",
    )
    ssh.close()
    out("[done] secrets fixed — phone: hard refresh or re-login")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
