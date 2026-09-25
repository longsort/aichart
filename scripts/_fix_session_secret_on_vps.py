#!/usr/bin/env python3
"""Ensure APP_SESSION_SECRET on /root/ailongshort without wiping the app."""
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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> str:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    chunks: list[str] = []
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
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return "".join(chunks)


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    try:
        run(
            ssh,
            r"""python3 - <<'PY'
from pathlib import Path
import os, secrets, re
root = Path('/root/ailongshort')
files = [root/'.env.local', root/'.env.production']
print('env.local', 'YES' if (root/'.env.local').is_file() else 'NO')
print('env.production', 'YES' if (root/'.env.production').is_file() else 'NO')

def has_real_secret(p: Path) -> bool:
    if not p.is_file():
        return False
    t = p.read_text(encoding='utf-8', errors='replace')
    for line in t.splitlines():
        s = line.strip()
        if s.startswith('#') or not s.startswith('APP_SESSION_SECRET='):
            continue
        v = s.split('=', 1)[1].strip().strip('"').strip("'")
        if v and v not in ('ailongshort-dev-session-secret', '랜덤-긴-문자열', '운영용-긴-랜덤'):
            return True
    return False

ok = any(has_real_secret(p) for p in files)
print('secret_present', 'YES' if ok else 'NO')
if not ok:
    target = root/'.env.local'
    val = secrets.token_urlsafe(48)
    prev = target.read_text(encoding='utf-8', errors='replace') if target.is_file() else ''
    lines = [ln for ln in prev.splitlines() if not ln.strip().startswith('APP_SESSION_SECRET=')]
    lines.append(f'APP_SESSION_SECRET={val}')
    target.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
    os.chmod(target, 0o600)
    print('secret_wrote', 'YES')
else:
    print('secret_wrote', 'NO')
PY""",
        )
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(
            ssh,
            "cd /root/ailongshort && pm2 restart ailongshort --update-env && sleep 3 && "
            "curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/ && "
            "curl -s -o /dev/null -w 'api=%{http_code}\\n' http://127.0.0.1:3000/api/user-settings && "
            "pm2 list | sed -n '1,8p'",
        )
        out("[done] session secret ensured")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
