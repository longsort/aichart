#!/usr/bin/env python3
"""Full sync to /root/ailongshort — exclude heavy junk, keep remote .env.local, build+pm2."""
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
REMOTE_TGZ = "/tmp/ailongshort-full-deploy.tgz"

EXCLUDE_TOP = {
    "node_modules",
    ".git",
    ".next",
    ".cursor",
    ".agents",
    ".claude",
    "playwright-report",
    "test-results",
    "e2e",
    ".dart_tool",
    "android",
    "ios",
    "macos",
    "windows",
    "linux",
    "build",
    "coverage",
    "mockups",
    "docs",
    # 로컬 깨진 junction — 서버 런타임 불필요
    "assets/btccion",
    "components/wms",
    "lib/wms",
    "app/(wms)",
}

EXCLUDE_FILES = {
    ".env.local",
    ".env",
    "deploy-sync.tgz",
    "deploy_today.py",
}

EXCLUDE_PREFIXES = (
    "assets/mp4",
    "data/virtual-store/",
    "data/confirmed-signals/",
)


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


def should_skip(name: str) -> bool:
    n = name.replace("\\", "/").lstrip("./")
    if not n or n == ".":
        return False
    for ex in EXCLUDE_TOP:
        if n == ex or n.startswith(ex + "/"):
            return True
    top = n.split("/", 1)[0]
    if top in EXCLUDE_TOP:
        return True
    base = os.path.basename(n)
    if base in EXCLUDE_FILES or n in EXCLUDE_FILES:
        return True
    if base.endswith(".tgz") or base.endswith(".pack.gz"):
        return True
    for p in EXCLUDE_PREFIXES:
        if n == p.rstrip("/") or n.startswith(p):
            return True
    if n.startswith("assets/") and n.count("/") >= 1:
        second = n.split("/", 2)[1]
        if second and not second.isascii():
            if n.count("/") == 1 and "." in second:
                return False
            return True
    return False


def tar_filter(ti: tarfile.TarInfo):
    name = ti.name.replace("\\", "/").lstrip("./")
    if should_skip(name):
        return None
    try:
        if ti.issym() or ti.islnk():
            return None
    except Exception:
        return None
    return ti


def add_tree(tf: tarfile.TarFile, root: str) -> None:
    """Walk and add files; skip missing/broken Windows junctions."""
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dirpath, root).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""
        keep = []
        for d in dirnames:
            rel = f"{rel_dir}/{d}" if rel_dir else d
            if should_skip(rel):
                continue
            full = os.path.join(dirpath, d)
            if os.path.islink(full):
                continue
            keep.append(d)
        dirnames[:] = keep
        for fn in filenames:
            rel = f"{rel_dir}/{fn}" if rel_dir else fn
            if should_skip(rel):
                continue
            full = os.path.join(dirpath, fn)
            if os.path.islink(full):
                continue
            try:
                tf.add(full, arcname=rel, recursive=False, filter=tar_filter)
            except (FileNotFoundError, OSError) as e:
                out(f"[skip] {rel}: {e}")


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
    out(f"[pack] root={ROOT}")

    fd, local_tgz = tempfile.mkstemp(suffix=".tgz")
    os.close(fd)
    try:
        with tarfile.open(local_tgz, "w:gz", format=tarfile.PAX_FORMAT) as tf:
            add_tree(tf, ROOT)
        size_mb = os.path.getsize(local_tgz) / (1024 * 1024)
        out(f"[pack] {local_tgz} ({size_mb:.1f} MiB)")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        out(f"[ssh] connect {host}")
        ssh.connect(host, port=port, username=user, password=password, timeout=30)
        sftp = ssh.open_sftp()
        try:
            run(ssh, "df -h / /tmp | sed -n '1,5p'")
            run(
                ssh,
                "du -sh /root/ailongshort /root/ailongshort/node_modules /root/ailongshort/.next 2>/dev/null || true",
            )
            run(ssh, f"mkdir -p {REMOTE_DIR} && rm -rf {REMOTE_DIR}/.next")
            run(ssh, f"rm -f {REMOTE_TGZ}")

            out(f"[scp] upload -> {REMOTE_TGZ}")
            sftp.put(local_tgz, REMOTE_TGZ)

            run(
                ssh,
                f"cd {REMOTE_DIR} && tar -xzf {REMOTE_TGZ} && rm -f {REMOTE_TGZ} && "
                f"test -f .env.local && echo '[env] .env.local present' || echo '[env] WARN missing .env.local'",
            )
            run(ssh, f"chmod +x {REMOTE_DIR}/scripts/*.sh 2>/dev/null || true")
            run(ssh, f"cd {REMOTE_DIR} && bash scripts/vps-deploy.sh", timeout=7200)
            run(ssh, "df -h / | sed -n '1,3p'")
            run(ssh, "pm2 list | sed -n '1,20p'")
            out("[done] full deploy OK")
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
