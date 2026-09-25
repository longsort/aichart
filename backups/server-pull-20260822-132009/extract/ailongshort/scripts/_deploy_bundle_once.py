#!/usr/bin/env python3
"""One-shot: pack repo (exclude node_modules/.git/.next etc.) → scp → remote tar xf → rm bundle."""
from __future__ import annotations

import os
import subprocess
import sys
import tarfile
import tempfile

HOST = "root@167.179.119.140"
REMOTE_DIR = "/root/ailongshort"
REMOTE_TGZ = "/tmp/ailongshort-deploy-oneshot.tgz"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

EXCLUDE_TOP = {
    "node_modules",
    ".git",
    ".next",
    ".cursor",
    ".agents",
    "playwright-report",
    "test-results",
    ".env.local",
    "deploy-sync.tgz",
    # 로컬 전용·깨진 심볼릭 링크 — 서버 런타임 불필요
    "assets/btccion",
    # 별도 WMS 앱(의존성 미포함) — ailongshort 서버 빌드 깨짐
    "components/wms",
    "lib/wms",
    "app/(wms)",
}


def tar_filter(ti: tarfile.TarInfo) -> tarfile.TarInfo | None:
    name = ti.name.replace("\\", "/").lstrip("./")
    if not name or name == ".":
        return ti
    for ex in EXCLUDE_TOP:
        if name == ex or name.startswith(ex + "/"):
            return None
    if name.startswith(".git/"):
        return None
    # Windows 깨진 junction/symlink
    try:
        full = os.path.join(ROOT, name.replace("/", os.sep))
        if ti.issym() or ti.islnk():
            return None
        if os.path.islink(full) and not os.path.exists(full):
            return None
    except OSError:
        return None
    return ti


def main() -> None:
    fd, path = tempfile.mkstemp(suffix=".tgz")
    os.close(fd)
    try:
        with tarfile.open(path, "w:gz", format=tarfile.PAX_FORMAT) as tf:
            for dirpath, dirnames, filenames in os.walk(ROOT, followlinks=False):
                rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
                if rel_dir == ".":
                    rel_dir = ""
                # prune excluded dirs in-place
                keep = []
                for d in dirnames:
                    rel = f"{rel_dir}/{d}" if rel_dir else d
                    skip = False
                    for ex in EXCLUDE_TOP:
                        if rel == ex or rel.startswith(ex + "/"):
                            skip = True
                            break
                    if not skip:
                        keep.append(d)
                dirnames[:] = keep
                for d in list(dirnames):
                    full = os.path.join(dirpath, d)
                    if os.path.islink(full):
                        dirnames.remove(d)
                for fn in filenames:
                    rel = f"{rel_dir}/{fn}" if rel_dir else fn
                    skip = False
                    for ex in EXCLUDE_TOP:
                        if rel == ex or rel.startswith(ex + "/"):
                            skip = True
                            break
                    if skip:
                        continue
                    full = os.path.join(dirpath, fn)
                    if os.path.islink(full):
                        continue
                    try:
                        tf.add(full, arcname=rel, recursive=False, filter=tar_filter)
                    except (FileNotFoundError, OSError) as e:
                        print(f"[skip] {rel}: {e}")
        print(f"[pack] {path} ({os.path.getsize(path) // 1024} KiB)")
        subprocess.run(["scp", "-q", path, f"{HOST}:{REMOTE_TGZ}"], check=True)
        print("[scp] ok")
        cmd = f"cd {REMOTE_DIR} && tar -xzf {REMOTE_TGZ} && rm -f {REMOTE_TGZ}"
        subprocess.run(["ssh", HOST, cmd], check=True)
        print("[extract] ok")
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
