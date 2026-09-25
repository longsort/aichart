#!/usr/bin/env python3
import importlib.util, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    cmd = (
        "grep -n '새 봉마다 applyFocusLatestBars 금지\\|가시구간 유지\\|preserveLr' "
        "/root/ailongshort/app/components/ChartView.tsx | head -15; "
        "curl -sS -m 10 -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/; "
        "pm2 list | sed -n '1,8p'"
    )
    _, o, e = ssh.exec_command(cmd, timeout=30)
    sys.stdout.buffer.write(o.read())
    err = e.read()
    if err.strip():
        sys.stdout.buffer.write(err)
    ssh.close()

if __name__ == "__main__":
    main()
