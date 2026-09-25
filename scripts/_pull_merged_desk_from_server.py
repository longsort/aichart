#!/usr/bin/env python3
"""서버 /root/ailongshort 통합·분석 모드 관련 소스를 로컬에 덮어쓰기."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import stat
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

# 통합·분석 데스크 + 차트/홈/설정/관련 lib
PULL_PATHS = [
    "app/components/mergedAnalysis",
    "app/components/ChartView.tsx",
    "app/components/ChartViewMergedServer.tsx",
    "app/components/CandleAnalysisHeader.tsx",
    "app/HomePageContent.tsx",
    "app/globals.css",
    "lib/settings.ts",
    "lib/mergedDesk4hReference.ts",
    "lib/mergedDesk4hReferenceAnalysis.ts",
    "lib/mergedAnalysisOverlayIds.ts",
    "lib/mergedAnalysisDeskVisualCleanup.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/mergedDeskDumpLifeCycle.ts",
    "lib/mergedDeskDumpReboundConfluencePack.ts",
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "lib/mergedDeskUnifiedTradeRails.ts",
    "lib/mergedDeskHotZoneEntry.ts",
    "lib/mergedDeskAdvVolumeRead.ts",
    "lib/mergedDeskAi200ZoneRegistry.ts",
    "lib/mergedAnalysisTradeLearningClient.ts",
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


def ensure_local_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def sftp_is_dir(sftp: paramiko.SFTPClient, remote: str) -> bool:
    try:
        return stat.S_ISDIR(sftp.stat(remote).st_mode)
    except FileNotFoundError:
        return False


def pull_file(sftp: paramiko.SFTPClient, remote: str, local: str) -> None:
    ensure_local_dir(os.path.dirname(local))
    sftp.get(remote, local)
    out(f"  OK  {remote.replace(REMOTE + '/', '')}")


def pull_tree(sftp: paramiko.SFTPClient, remote: str, local: str) -> int:
    n = 0
    try:
        entries = sftp.listdir_attr(remote)
    except FileNotFoundError:
        out(f"  SKIP missing {remote}")
        return 0
    ensure_local_dir(local)
    for attr in entries:
        name = attr.filename
        if name in (".", ".."):
            continue
        r = posixpath.join(remote, name)
        l = os.path.join(local, name)
        if stat.S_ISDIR(attr.st_mode):
            n += pull_tree(sftp, r, l)
        else:
            pull_file(sftp, r, l)
            n += 1
    return n


def expand_merged_globs(sftp: paramiko.SFTPClient) -> list[str]:
    """서버 lib/ 에서 merged* 파일 추가 수집."""
    extra: list[str] = []
    try:
        for name in sftp.listdir(posixpath.join(REMOTE, "lib")):
            if name.startswith("merged") and name.endswith((".ts", ".tsx", ".js")):
                rel = f"lib/{name}"
                if rel not in PULL_PATHS:
                    extra.append(rel)
    except FileNotFoundError:
        pass
    return extra


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] connect {host} …")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    total = 0
    try:
        paths = list(PULL_PATHS) + expand_merged_globs(sftp)
        # dedupe preserve order
        seen = set()
        ordered = []
        for p in paths:
            if p not in seen:
                seen.add(p)
                ordered.append(p)

        out(f"[pull] {len(ordered)} paths → {ROOT}")
        for rel in ordered:
            remote = posixpath.join(REMOTE, rel)
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if sftp_is_dir(sftp, remote):
                out(f"[dir] {rel}")
                total += pull_tree(sftp, remote, local)
            else:
                try:
                    sftp.stat(remote)
                except FileNotFoundError:
                    out(f"  SKIP missing {rel}")
                    continue
                pull_file(sftp, remote, local)
                total += 1
        out(f"[done] files={total}")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
