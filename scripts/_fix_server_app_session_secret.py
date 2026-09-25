# -*- coding: utf-8 -*-
"""Ensure APP_SESSION_SECRET on server .env.local, then pm2 restart --update-env."""
from __future__ import annotations

import importlib.util
import secrets
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = "/root/ailongshort/.env.local"
FALLBACK = "ailongshort-dev-session-secret"


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str]:
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = (out + ("\n" + err if err.strip() else "")).encode("ascii", "replace").decode("ascii")
    return code, text


def main() -> int:
    host, port, user, password = load_creds()
    new_secret = secrets.token_urlsafe(48)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)

    # Upload a tiny remote helper to avoid shell-quoting hell, run it, delete it.
    helper = f"""# -*- coding: utf-8 -*-
from pathlib import Path
import shutil
p = Path({ENV_PATH!r})
fallback = {FALLBACK!r}
new = {new_secret!r}
if p.exists():
    shutil.copy2(p, str(p) + ".bak-session")
    raw = p.read_text(encoding="utf-8", errors="replace")
else:
    raw = ""
lines = raw.splitlines()
out = []
found = False
keep_existing = False
for line in lines:
    if line.strip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    k, _, v = line.partition("=")
    key = k.strip()
    val = v.strip().strip('"').strip("'")
    if key == "APP_SESSION_SECRET":
        found = True
        if val and val != fallback:
            keep_existing = True
            out.append(line)
        else:
            out.append("APP_SESSION_SECRET=" + new)
        continue
    out.append(line)
if not found:
    if out and out[-1].strip() != "":
        out.append("")
    out.append("APP_SESSION_SECRET=" + new)
    action = "added"
elif keep_existing:
    action = "kept_existing"
else:
    action = "replaced_fallback"
p.parent.mkdir(parents=True, exist_ok=True)
text = "\\n".join(out).rstrip() + "\\n"
p.write_text(text, encoding="utf-8")
keys = []
for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
    if line.strip().startswith("#") or "=" not in line:
        continue
    k = line.split("=", 1)[0].strip()
    if k in ("APP_SESSION_SECRET", "INTERNAL_ANALYZE_SECRET", "TELEGRAM_MULTITF_CRON_SECRET"):
        keys.append(k)
secret_line = [l for l in p.read_text(encoding="utf-8", errors="replace").splitlines() if l.startswith("APP_SESSION_SECRET=")][0]
print("action=" + action)
print("keys=" + ",".join(keys))
print("len_secret=" + str(len(secret_line.split("=", 1)[1].strip())))
"""
    remote_helper = "/tmp/_fix_app_session_secret.py"
    sftp = ssh.open_sftp()
    with sftp.file(remote_helper, "w") as f:
        f.write(helper)
    sftp.close()

    code, text = run(ssh, f"python3 {remote_helper}", 60)
    print(text, flush=True)
    run(ssh, f"rm -f {remote_helper}", 30)
    if code != 0:
        print("[FAIL] env update", flush=True)
        ssh.close()
        return 1

    code, text = run(ssh, "pm2 restart ailongshort --update-env", 120)
    print(text[-1500:], flush=True)
    if code != 0:
        print("[FAIL] pm2", flush=True)
        ssh.close()
        return 1

    import time

    time.sleep(4)
    code, text = run(
        ssh,
        "curl -s -w '\\nHTTP:%{http_code}' -X POST http://127.0.0.1:3000/api/merged-desk/exchange-keys "
        "-H 'Content-Type: application/json' -d '{}'",
        30,
    )
    print(text[-800:], flush=True)
    if "SITE_AUTH_MISCONFIGURED" in text:
        print("[FAIL] still misconfigured — check ecosystem env_file", flush=True)
        # also check how pm2 loads env
        _, eco = run(ssh, "grep -n env /root/ailongshort/ecosystem.config.cjs /root/ailongshort/ecosystem.config.js 2>/dev/null | head -40", 30)
        print(eco[-2000:], flush=True)
        ssh.close()
        return 1
    if "HTTP:401" in text or "SITE_AUTH_REQUIRED" in text:
        print("[ok] secret loaded · login required (expected)", flush=True)
    else:
        print("[warn] unexpected response", flush=True)

    print("[done] re-login on site, then 저장·인증", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
