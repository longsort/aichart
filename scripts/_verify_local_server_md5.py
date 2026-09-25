#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "app/globals.css",
    "app/components/ChartView.tsx",
    "app/components/ChartViewMergedServer.tsx",
    "app/components/UIModeSwitcher.tsx",
    "app/HomePageContent.tsx",
    "lib/settings.ts",
    "lib/mergedAnalysisDeskVisualCleanup.ts",
    "lib/mergedDeskMirageStyleDraw.ts",
]


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def md5_file(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    ok = True
    print("=== md5 local vs /root/ailongshort ===")
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        lm = md5_file(local)
        remote = posixpath.join("/root/ailongshort", rel)
        with sftp.file(remote, "rb") as f:
            rm = md5_bytes(f.read())
        same = lm == rm
        if not same:
            ok = False
        print(("OK" if same else "DIFF"), rel)
    _, o, _ = ssh.exec_command(
        "stat -c '%y %n' "
        "/root/ailongshort/app/components/ChartView.tsx "
        "/root/ailongshort/app/globals.css "
        "/root/ailongshort/lib/mergedDeskMirageStyleDraw.ts"
    )
    print("=== remote mtime ===")
    print(o.read().decode("utf-8", errors="replace"))
    _, o, _ = ssh.exec_command(
        "python3 - <<'PY'\n"
        "p='/root/ailongshort/app/components/ChartView.tsx'\n"
        "lines=open(p,encoding='utf-8',errors='replace').read().splitlines()\n"
        "for i,l in enumerate(lines,1):\n"
        "    if 'const candleAnalysisLikeUi' in l or l.strip().startswith('uiMode ===') and i>3710 and i<3725:\n"
        "        print(f'{i}:{l}')\n"
        "PY"
    )
    print("=== candleAnalysisLikeUi ===")
    print(o.read().decode("utf-8", errors="replace"))
    _, o, _ = ssh.exec_command(
        "sleep 2; curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/; "
        "pm2 list | sed -n '1,12p'"
    )
    print("=== health ===")
    print(o.read().decode("utf-8", errors="replace"))
    sftp.close()
    ssh.close()
    print("ALL_MATCH" if ok else "HAS_DIFF")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
