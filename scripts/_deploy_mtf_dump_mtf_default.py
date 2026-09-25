#!/usr/bin/env python3
"""MTF 폭락 default mtf + AI200 band touch — /root/ailongshort deploy, build, pm2."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

FILES = [
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "lib/mergedDeskScalp200BandTouchBridge.ts",
    "lib/mergedDeskHotZoneEntry.ts",
    "lib/mergedDeskScalp200Plan.ts",
    "lib/mergedDeskScalp200ZoneLife.ts",
    "lib/mergedDeskTradeEventJournal.ts",
    "lib/mergedDeskAi200ZoneBridge.ts",
    "lib/mergedDeskSharedTfFeatures.ts",
    "lib/telegramServerMergedDeskEval.ts",
    "lib/telegramPrecisionTouchRunner.ts",
    "lib/telegramZoneTouchAutoRunner.ts",
    "lib/telegramMultiTfPairList.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/settings.ts",
    "lib/mergedDeskMtfDumpZoneRegistry.ts",
    "app/globals.css",
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]

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


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(f"fail: {cmd}")


def patch_user_settings(ssh) -> None:
    py = r"""
import json
from pathlib import Path
p = Path('/root/ailongshort/data/user-settings.json')
if not p.exists():
    print('[settings] no file')
else:
    data = json.loads(p.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        print('[settings] bad format')
    elif any(isinstance(v, dict) for v in data.values()):
        for user, st in data.items():
            if not isinstance(st, dict):
                continue
            st['chartMergedDeskMtfDumpZoneEnabled'] = True
            st['chartMergedDeskMtfDumpDisplayMode'] = 'mtf'
            st['telegramMultiTfTimeframes'] = ['15m', '1h', '4h', '1d', '1w', '1M']
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('[settings] patched per-user mtf+telegram')
    else:
        data['chartMergedDeskMtfDumpZoneEnabled'] = True
        data['chartMergedDeskMtfDumpDisplayMode'] = 'mtf'
        data['telegramMultiTfTimeframes'] = ['15m', '1h', '4h', '1d', '1w', '1M']
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('[settings] patched root (legacy)')
"""
    run(ssh, f"python3 - <<'PY'\n{py}\nPY")


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                out(f"[skip missing] {rel}")
                continue
            remote = f"{REMOTE}/{rel}"
            remote_dir = os.path.dirname(remote).replace("\\", "/")
            run(ssh, f"mkdir -p '{remote_dir}'")
            out(f"[put] {rel}")
            sftp.put(local, remote)
        patch_user_settings(ssh)
        run(ssh, f"cd {REMOTE} && rm -rf .next")
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(ssh, f"cd {REMOTE} && pm2 restart ailongshort && pm2 save")
        run(ssh, "sleep 2; curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        run(ssh, "grep -n \"MTF_DUMP_SCAN_TFS\\|chartMergedDeskMtfDumpDisplayMode\" "
            f"{REMOTE}/lib/mergedDeskMtfDumpZoneBridge.ts {REMOTE}/lib/settings.ts | head -6")
        out("[done]")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
