#!/usr/bin/env python3
"""Re-write APP_SESSION_SECRET after deploy, rebuild middleware, restart PM2."""
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
    out("$ " + cmd[:120])
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
        out(err.strip()[:500])
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
        # Diagnose why secret vanished (names only, never values)
        run(
            ssh,
            r"""python3 - <<'PY'
from pathlib import Path
root = Path('/root/ailongshort')
for name in ('.env.local', '.env.production', '.env'):
    p = root / name
    print(name, 'exists' if p.is_file() else 'missing', 'bytes', p.stat().st_size if p.is_file() else 0)
    if not p.is_file():
        continue
    keys = []
    for line in p.read_text(encoding='utf-8', errors='replace').splitlines():
        s = line.strip().replace('\r','')
        if not s or s.startswith('#') or '=' not in s:
            continue
        k = s.split('=',1)[0].strip()
        if 'SECRET' in k.upper() or k in ('PASSWORD','TOKEN'):
            keys.append(k)
    print(name, 'secret_keys', keys)
PY""",
        )
        run(
            ssh,
            r"""python3 - <<'PY'
from pathlib import Path
import os, secrets
root = Path('/root/ailongshort')
target = root / '.env.local'
BAD = {'', 'ailongshort-dev-session-secret', '랜덤-긴-문자열', '운영용-긴-랜덤'}

def read_secret(p: Path):
    if not p.is_file():
        return None
    for line in p.read_text(encoding='utf-8', errors='replace').splitlines():
        s = line.strip().replace('\r','')
        if s.startswith('APP_SESSION_SECRET='):
            v = s.split('=',1)[1].strip().strip('"').strip("'")
            if v not in BAD:
                return v
    return None

existing = read_secret(target) or read_secret(root/'.env.production')
val = existing or secrets.token_urlsafe(48)
prev = target.read_text(encoding='utf-8', errors='replace') if target.is_file() else ''
lines = [ln for ln in prev.splitlines() if not ln.strip().replace('\r','').startswith('APP_SESSION_SECRET=')]
lines.append('APP_SESSION_SECRET=' + val)
# also ensure INTERNAL if missing (optional fallback for resolve)
has_internal = any(ln.strip().replace('\r','').startswith('INTERNAL_ANALYZE_SECRET=') for ln in lines)
if not has_internal:
    lines.append('INTERNAL_ANALYZE_SECRET=' + secrets.token_urlsafe(32))
target.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
os.chmod(target, 0o600)
print('wrote_app_session', 'YES')
print('len_ok', 'YES' if len(val) >= 24 else 'NO')
# verify readback
print('readback', 'YES' if read_secret(target) else 'NO')
PY""",
        )
        # Middleware Edge inlines env at build — must rebuild
        run(ssh, f"cd {REMOTE} && rm -rf .next && npm run build", timeout=7200)
        run(
            ssh,
            "cd /root/ailongshort && pm2 restart ailongshort --update-env && sleep 4 && "
            "curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/ && "
            "curl -s -o /dev/null -w 'api_market=%{http_code}\\n' "
            "'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent' && "
            "curl -s 'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent' | head -c 160; echo && "
            "pm2 list | sed -n '1,8p'",
        )
        out("[done] secret+rebuild OK — expect api_market=401 (login) not 503")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
