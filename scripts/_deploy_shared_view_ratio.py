"""Deploy shared chart view ratio (복원뷰) across merged-desk TFs."""
import os
import posixpath
import paramiko

HOST = "167.179.119.140"
USER = "root"
PASSWORD = "-9iR,D65[{})$%f)"
REMOTE = "/root/ailongshort"

FILES = [
    "lib/mergedDeskSharedChartView.ts",
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
        print(safe(out.strip()[-2200:]))
    if err.strip():
        print(safe(err.strip()[-600:]))
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(base, rel.replace("/", os.sep))
            remote = posixpath.join(REMOTE, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"[put] {rel}")
            sftp.put(local, remote)
        run(ssh, f"cd {REMOTE} && npm run build")
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "sleep 4 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
        print("\n[done] shared view ratio deployed")
    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    main()
