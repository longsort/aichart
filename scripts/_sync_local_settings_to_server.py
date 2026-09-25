#!/usr/bin/env python3
"""
localhost aichart1 통합모드 설정을 서버 data/user-settings.json 에 그대로 반영.
코드 전체 배포(_full_deploy_now) 직후 실행.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_SETTINGS = os.path.join(ROOT, "data", "user-settings.json")
REMOTE_SETTINGS = "/root/ailongshort/data/user-settings.json"


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


def main() -> int:
    if not os.path.isfile(LOCAL_SETTINGS):
        out(f"[FAIL] missing {LOCAL_SETTINGS}")
        return 1

    local = json.loads(open(LOCAL_SETTINGS, encoding="utf-8").read())
    if not isinstance(local.get("aichart1"), dict):
        out("[FAIL] local data/user-settings.json has no aichart1")
        return 1

    # localhost 통합모드 그대로 — aichart1 전체 동기화
    payload = {"aichart1": local["aichart1"]}

    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        # pull remote, merge other users keep, replace aichart1
        remote_raw = None
        try:
            with sftp.open(REMOTE_SETTINGS, "r") as f:
                remote_raw = f.read().decode("utf-8")
        except OSError:
            remote_raw = None

        if remote_raw:
            remote = json.loads(remote_raw)
            if isinstance(remote, dict) and any(isinstance(v, dict) for v in remote.values()):
                remote["aichart1"] = payload["aichart1"]
                out_data = remote
            else:
                out_data = payload
        else:
            out_data = payload

        fd, tmp = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, indent=2)
        sftp.put(tmp, REMOTE_SETTINGS)
        os.unlink(tmp)

        st = out_data["aichart1"]
        out("[settings] synced aichart1 from localhost")
        out(
            "  mtfDump=%s mode=%s uiCapture=%s mergedTele=%s precision=%s money=%s zone=%s"
            % (
                st.get("chartMergedDeskMtfDumpZoneEnabled"),
                st.get("chartMergedDeskMtfDumpDisplayMode"),
                st.get("telegramMergedDeskUiCaptureEnabled"),
                st.get("telegramMergedDeskAutoEnabled"),
                st.get("telegramPrecisionTouchEnabled"),
                st.get("telegramMoneyEntryTouchEnabled"),
                st.get("telegramZoneTouchAlertEnabled"),
            )
        )
        _, stdout, _ = ssh.exec_command("chmod 644 /root/ailongshort/data/user-settings.json; pm2 restart ailongshort")
        out(stdout.read().decode("utf-8", errors="replace").strip())
    finally:
        sftp.close()
        ssh.close()
    out("[done] localhost merged-desk settings on server")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
