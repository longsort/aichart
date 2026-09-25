#!/usr/bin/env python3
"""Deploy telegram UI capture + briefing — /root/ailongshort only."""
from __future__ import annotations

import importlib.util
import os
import sys
import tarfile
import tempfile
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"
REMOTE_TGZ = "/tmp/ailongshort-tg-ui-capture.tgz"

# paths relative to repo root
DEPLOY_PATHS = [
    "lib/telegramFormatHtml.ts",
    "lib/telegramAlertBriefing.ts",
    "lib/telegramAlertChartImage.ts",
    "lib/telegramMtfAlertContext.ts",
    "lib/telegramMergedDeskUiCapture.ts",
    "lib/telegramMergedDeskPhotoSend.ts",
    "lib/telegramBotSendHtml.ts",
    "lib/telegramZoneTouchAutoRunner.ts",
    "lib/telegramPrecisionTouchRunner.ts",
    "lib/telegramMoneyEntryTouchRunner.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/telegramSendPolicy.ts",
    "lib/serverRouteGuard.ts",
    "lib/settings.ts",
    "middleware.ts",
    "app/telegram-merged-capture",
    "app/api/telegram/capture-bootstrap",
    "app/HomePageContent.tsx",
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/globals.css",
    "scripts/vps-deploy.sh",
    "scripts/_patch_server_user_settings.py",
    "scripts/telegram-auto-alert-run.sh",
    "scripts/_fix_server_secrets.py",
    "start.js",
]


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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> str:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    chunks = []
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
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return "".join(chunks)


def main() -> int:
    os.chdir(ROOT)
    host, port, user, password = load_creds()

    missing = [p for p in DEPLOY_PATHS if not os.path.exists(os.path.join(ROOT, p.replace("/", os.sep)))]
    if missing:
        out(f"[FAIL] missing local paths: {missing}")
        return 1

    fd, local_tgz = tempfile.mkstemp(suffix=".tgz")
    os.close(fd)
    try:
        with tarfile.open(local_tgz, "w:gz") as tf:
            for rel in DEPLOY_PATHS:
                full = os.path.join(ROOT, rel.replace("/", os.sep))
                if os.path.isdir(full):
                    for dirpath, _, filenames in os.walk(full):
                        for fn in filenames:
                            fp = os.path.join(dirpath, fn)
                            arc = os.path.relpath(fp, ROOT).replace("\\", "/")
                            tf.add(fp, arcname=arc, recursive=False)
                else:
                    tf.add(full, arcname=rel.replace("\\", "/"), recursive=False)
        size_mb = os.path.getsize(local_tgz) / (1024 * 1024)
        out(f"[pack] {size_mb:.2f} MiB ({len(DEPLOY_PATHS)} paths)")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        out(f"[ssh] {host}")
        ssh.connect(host, port=port, username=user, password=password, timeout=30)
        sftp = ssh.open_sftp()
        try:
            run(ssh, f"test -f {REMOTE_DIR}/.env.local && cp -a {REMOTE_DIR}/.env.local /tmp/ailongshort.env.local.bak || true")
            run(ssh, f"rm -f {REMOTE_TGZ}")
            sftp.put(local_tgz, REMOTE_TGZ)
            run(
                ssh,
                f"cd {REMOTE_DIR} && tar -xzf {REMOTE_TGZ} && rm -f {REMOTE_TGZ} && "
                f"if [ -f /tmp/ailongshort.env.local.bak ]; then cp -a /tmp/ailongshort.env.local.bak .env.local; fi",
            )
            run(ssh, f"chmod +x {REMOTE_DIR}/scripts/*.sh 2>/dev/null || true")
            run(ssh, f"cd {REMOTE_DIR} && bash scripts/vps-deploy.sh", timeout=7200)
            patch_py = r"""
import json
from pathlib import Path
p = Path('/root/ailongshort/data/user-settings.json')
keys = {
    'chartMergedDeskMtfDumpZoneEnabled': True,
    'chartMergedDeskMtfDumpDisplayMode': 'mtf',
    'telegramMergedDeskAutoEnabled': True,
    'telegramZoneTouchAlertEnabled': True,
    'telegramPrecisionTouchEnabled': True,
    'telegramMoneyEntryTouchEnabled': True,
    'telegramMergedDeskUiCaptureEnabled': True,
    'telegramConfirmChartImageEnabled': True,
    'telegramMultiTfTimeframes': ['15m', '1h', '4h', '1d', '1w', '1M'],
}
if p.exists():
    data = json.loads(p.read_text(encoding='utf-8'))
    if any(isinstance(v, dict) for v in data.values()):
        for st in data.values():
            if isinstance(st, dict):
                st.update(keys)
    else:
        data.update(keys)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print('[settings] patched')
else:
    print('[settings] no file')
"""
            run(ssh, f"python3 - <<'PY'\n{patch_py}\nPY")
            run(ssh, "pm2 list | sed -n '1,15p'")
            run(ssh, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/ || true")
            run(
                ssh,
                f"test -f {REMOTE_DIR}/lib/telegramMergedDeskUiCapture.ts && "
                f"test -d {REMOTE_DIR}/app/telegram-merged-capture && "
                f"echo '[ok] telegram UI capture files present'",
            )
            out("[done] telegram UI capture deploy OK")
        finally:
            sftp.close()
            ssh.close()
    finally:
        try:
            os.unlink(local_tgz)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
