"""Deploy btccion candle draw pack for merged analysis desk to /root/ailongshort."""
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
    "lib/cleanCandleFeatureDraw.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/settings.ts",
    "lib/obPreBeamCandleMarkers.ts",
    "lib/analyze.ts",
    "lib/zoneDirectionalColors.ts",
    "types/index.ts",
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


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


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=20)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(base, rel.replace("/", os.sep))
            if not os.path.exists(local):
                raise FileNotFoundError(local)
            remote = posixpath.join(REMOTE_ROOT, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"[put] {rel}")
            sftp.put(local, remote)

        run(ssh, f"cd {REMOTE_ROOT} && npm run build")
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "sleep 4 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
        print("\n[done] btccion merged-desk draw deployed")
    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    main()
