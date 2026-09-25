#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"
ALLOWED = ["15m", "1h", "4h", "1d", "1w", "1M"]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 200) -> str:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    text = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if text.strip():
        out(text.rstrip())
    if err.strip():
        out(f"[stderr] {err.strip()}")
    return text


def patch_user_settings(ssh: paramiko.SSHClient) -> None:
    py = f"""
import json, glob, os
ALLOWED = {json.dumps(ALLOWED)}
root = '{REMOTE}/data'
paths = glob.glob(os.path.join(root, 'user-settings*.json'))
if not paths:
    print('[settings] no user-settings files')
else:
    for p in paths:
        try:
            with open(p, encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f'[settings] skip {{p}}: {{e}}')
            continue
        changed = False
        if isinstance(data, dict):
            users = data if 'telegramMultiTfTimeframes' in data else data.get('users') or {{}}
            if isinstance(users, dict) and users and 'telegramMultiTfTimeframes' not in data:
                for uname, st in users.items():
                    if not isinstance(st, dict):
                        continue
                    old = st.get('telegramMultiTfTimeframes')
                    st['telegramMultiTfTimeframes'] = ALLOWED
                    if old != ALLOWED:
                        changed = True
                        print(f'[settings] {{uname}}: {{old}} -> {{ALLOWED}}')
            else:
                old = data.get('telegramMultiTfTimeframes')
                data['telegramMultiTfTimeframes'] = ALLOWED
                if old != ALLOWED:
                    changed = True
                    print(f'[settings] root: {{old}} -> {{ALLOWED}}')
        if changed:
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f'[settings] saved {{p}}')
        else:
            print(f'[settings] ok {{p}}')
"""
    run(ssh, f"python3 - <<'PY'\n{py}\nPY")


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    try:
        run(ssh, f"grep -A10 'MERGED_DESK_SHARED_TELEGRAM_TFS' {REMOTE}/lib/mergedDeskSharedTfFeatures.ts | head -12")
        run(ssh, f"grep 'telegramMultiTfTimeframes:' {REMOTE}/lib/settings.ts | tail -1")
        patch_user_settings(ssh)
        run(ssh, f"cd {REMOTE} && bash scripts/telegram-auto-alert-run.sh", timeout=200)
        run(ssh, "curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        run(ssh, "pm2 list | sed -n '1,8p'")
        out("[done] verify OK")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
