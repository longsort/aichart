#!/usr/bin/env python3
"""Deploy telegram money/entry touch + related hub files to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = r"d:\apps\ailongshort"
REMOTE = "/root/ailongshort"

FILES = [
    "lib/telegramMoneyEntryTouchRunner.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/telegramServerConfirmRunner.ts",
    "app/api/cron/telegram-auto-alert/route.ts",
    "scripts/telegram-auto-alert-run.sh",
    "scripts/install-server-cron.sh",
    "lib/settings.ts",
    "lib/mergedDeskHLineClean.ts",
    "lib/mergedDeskRbAiStyleBrain.ts",
    "lib/mergedDeskRbLiveEntryHub.ts",
    "lib/mergedDeskRbVolumePulse.ts",
    "lib/mergedDeskRbCompleteKit.ts",
    "lib/mergedDeskRbBounceStrength.ts",
    "lib/mergedDeskRbCorridorPaint.ts",
    "lib/mergedDeskRbCorridorPhase.ts",
    "lib/mergedDeskRbSignalDraw.ts",
    "lib/mergedDeskRbSchematicChartDraw.ts",
    "lib/mergedDeskRbFullConfluence.ts",
    "lib/mergedDeskRbMasterStance.ts",
    "lib/mergedDeskRbCoreBreakSet.ts",
    "lib/mergedDeskRbChipConfluence.ts",
    "lib/mergedDeskRbGateTargets.ts",
    "lib/mergedDeskRbVolumeSync.ts",
    "lib/mergedDeskRbAiZoneFace.ts",
    "lib/mergedDeskHotZoneEntry.ts",
    "lib/mergedDeskZoneChartLabelClean.ts",
    "lib/mergedAnalysisDeskVisualCleanup.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/mergedDeskMirageChartLabels.ts",
    "lib/mergedDeskRbRailBounceEntry.ts",
    "lib/mergedDeskChannelPullbackEntry.ts",
    "lib/mergedDeskChannelMoneyEdge.ts",
    "lib/mergedDeskBlueRedChannels.ts",
    "lib/monthDeskMoneyZone.ts",
    "lib/institutionalSuperBand.ts",
    "lib/volumeDirectionStats.ts",
    "lib/volumeHistogramIntelligence.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/ChartView.tsx",
    "app/globals.css",
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


def fix_crlf_local(rel: str) -> None:
    if not rel.endswith(".sh"):
        return
    path = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.isfile(path):
        return
    raw = open(path, "rb").read()
    fixed = raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if fixed != raw:
        open(path, "wb").write(fixed)


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out("$ " + cmd)
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
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    for rel in FILES:
        fix_crlf_local(rel)

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

        run(ssh, f"sed -i 's/\\r$//' {REMOTE}/scripts/*.sh")
        run(ssh, f"chmod +x {REMOTE}/scripts/*.sh")
        run(ssh, f"bash {REMOTE}/scripts/install-server-cron.sh")
        run(ssh, f"cd {REMOTE} && rm -rf .next && npm run build", timeout=7200)
        run(
            ssh,
            "pm2 restart ailongshort --update-env; sleep 4; "
            "curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/ || true",
        )
        out("[ok] deploy + cron done")
        return 0
    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
