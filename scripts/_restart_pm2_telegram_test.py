#!/usr/bin/env python3
import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def main() -> int:
    spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)

    def run(cmd: str, timeout: int = 200) -> str:
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
            out(f"[exit {code}]")
        return "".join(chunks)

    try:
        run("cd /root/ailongshort && pm2 restart ailongshort && pm2 save")
        time.sleep(5)
        run("curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        run("grep -E '^TELEGRAM_MULTITF_CRON_SECRET=' /root/ailongshort/.env.local | sed 's/=.*/=***set***/'")
        run("cd /root/ailongshort && bash scripts/telegram-auto-alert-run.sh", timeout=200)
        run("tail -8 /var/log/ailongshort-tg.log 2>/dev/null || true")
        out("[done]")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
