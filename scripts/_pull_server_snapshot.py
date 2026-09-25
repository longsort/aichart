"""Pull /root/ailongshort from VPS into backups/server-pull-* (no node_modules/.next)."""
from __future__ import annotations

import time
from pathlib import Path

import paramiko

HOST = "167.179.119.140"
USER = "root"
PASSWORD = "-9iR,D65[{})$%f)"
ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = ROOT / "backups" / f"server-pull-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    local_tar = out_dir / "ailongshort-server.tgz"
    remote_tar = f"/tmp/ailongshort-pull-{stamp}.tgz"

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("[ssh] connect", HOST)
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    cmd = (
        f"cd /root && tar -czf {remote_tar} "
        "--exclude=ailongshort/node_modules "
        "--exclude=ailongshort/.next "
        "--exclude=ailongshort/.git "
        "--exclude=ailongshort/assets/btccion "
        "--exclude=ailongshort/*.tgz "
        "--exclude=ailongshort/deploy-sync.tgz "
        f"ailongshort && ls -lh {remote_tar}"
    )
    print("[remote] tar …")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=900)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip()[-1500:])
    if err.strip():
        print("[stderr]", err.strip()[-800:])
    if code != 0:
        raise SystemExit(code)

    sftp = ssh.open_sftp()
    print("[sftp] download →", local_tar)
    sftp.get(remote_tar, str(local_tar))
    sftp.close()
    ssh.exec_command(f"rm -f {remote_tar}")
    ssh.close()

    mb = local_tar.stat().st_size / (1024 * 1024)
    print(f"[ok] {mb:.1f} MB → {out_dir}")


if __name__ == "__main__":
    main()
