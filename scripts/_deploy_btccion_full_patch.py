"""Deploy all btccion / merged-desk draw patches still needed on /root/ailongshort."""
import hashlib
import os
import posixpath
import paramiko

HOST = "167.179.119.140"
PORT = 22
USER = "root"
PASSWORD = "-9iR,D65[{})$%f)"
REMOTE_ROOT = "/root/ailongshort"

FILES = [
    "lib/mergedDeskBtccionCandleDraw.ts",
    "lib/mergedDeskMirageStyleDraw.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/cleanCandleFeatureDraw.ts",
    "lib/settings.ts",
    "lib/obPreBeamCandleMarkers.ts",
    "lib/zoneDirectionalColors.ts",
    "types/index.ts",
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/globals.css",
]


def md5_file(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(ssh, cmd: str):
    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(safe(out.strip()[-2500:]))
    if err.strip():
        print(safe(err.strip()[-800:]))
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return out


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=20)
    sftp = ssh.open_sftp()
    uploaded = []
    skipped = []
    try:
        for rel in FILES:
            local = os.path.join(base, rel.replace("/", os.sep))
            if not os.path.exists(local):
                print(f"[skip-missing] {rel}")
                continue
            remote = posixpath.join(REMOTE_ROOT, rel)
            local_md5 = md5_file(local)
            remote_md5 = ""
            try:
                out = run(ssh, f"md5sum {remote} 2>/dev/null | awk '{{print $1}}'")
                remote_md5 = (out or "").strip().splitlines()[-1].strip() if out else ""
            except Exception:
                remote_md5 = ""
            if remote_md5 and remote_md5 == local_md5:
                print(f"[same] {rel}")
                skipped.append(rel)
                continue
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"[put] {rel} ({'missing' if not remote_md5 else 'changed'})")
            sftp.put(local, remote)
            uploaded.append(rel)

        if not uploaded:
            print("\n[info] all files already match server — still rebuild+restart to be safe")
        else:
            print(f"\n[info] uploaded {len(uploaded)} file(s)")

        run(ssh, f"cd {REMOTE_ROOT} && npm run build")
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "sleep 4 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
        print("\n[done] full btccion patch deploy")
        print("uploaded:", ", ".join(uploaded) if uploaded else "(none)")
        print("already-same:", ", ".join(skipped) if skipped else "(none)")
    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    main()
