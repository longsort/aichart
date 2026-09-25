#!/usr/bin/env python3
"""Hotfix: candle empty/jump (tip setData + TF 40/180/700) → /root/ailongshort."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REL = "app/components/ChartView.tsx"
REMOTE = "/root/ailongshort"


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        print(safe(out[-12000:] if len(out) > 12000 else out), flush=True)
    if err.strip():
        print(safe(err[-3000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> None:
    host, port, user, password = load_creds()
    print(f"Connecting {host}...", flush=True)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=60)
    sftp = ssh.open_sftp()
    local = ROOT / REL
    remote = f"{REMOTE}/{REL}"
    sftp.put(str(local), remote)
    print(f"uploaded {remote} ({local.stat().st_size} bytes)", flush=True)
    # marker so we can verify remote has the tip-only skip
    with sftp.file(remote, "r") as f:
        blob = f.read().decode("utf-8", errors="replace")
    needle = "OHLC·길이 동일 — settle/스파클 펄스만 바뀌면 setData 금지"
    if needle not in blob:
        raise RuntimeError("upload verify failed — patch marker missing")
    print("verify marker ok", flush=True)
    sftp.close()
    run(ssh, f"cd {REMOTE} && npm run build")
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
    ssh.close()
    print("[done] candle jump/empty fix deployed to /root/ailongshort", flush=True)


if __name__ == "__main__":
    main()
