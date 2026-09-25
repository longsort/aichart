"""Verify server + rebuild/restart even if sources already match."""
import paramiko

HOST = "167.179.119.140"
USER = "root"
PASSWORD = "-9iR,D65[{})$%f)"
REMOTE = "/root/ailongshort"


def run(ssh, cmd: str):
    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(safe(out.strip()[-2000:]))
    if err.strip():
        print(safe(err.strip()[-600:]))
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    try:
        run(ssh, f"test -f {REMOTE}/lib/mergedDeskBtccionCandleDraw.ts && echo btccion_ok")
        run(ssh, f"cd {REMOTE} && npm run build")
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "sleep 4 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
        print("\n[done] rebuild+restart complete")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
