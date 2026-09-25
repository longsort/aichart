from __future__ import annotations
import importlib.util, sys, time
import paramiko

spec = importlib.util.spec_from_file_location("d", r"d:\apps\ailongshort\deploy_today.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)

def run(cmd: str, timeout: int = 7200) -> None:
    sys.stdout.buffer.write(("\n$ " + cmd + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stdout.buffer.write((err + "\n").encode("utf-8", "replace"))
        sys.stdout.buffer.flush()
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise SystemExit(f"fail {code}: {cmd}")

run("cd /root/ailongshort && npm install sharp --save --no-audit --no-fund", timeout=600)
run("cd /root/ailongshort && npm run build", timeout=7200)
run("cd /root/ailongshort && pm2 delete ailongshort 2>/dev/null || true; pm2 start ecosystem.config.cjs; pm2 save")
run("sleep 3; curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/; echo")
run("curl -sf 'http://127.0.0.1:3000/api/symbols/search?q=usdkrw&limit=5'; echo")
run("curl -sf 'http://127.0.0.1:3000/api/market?symbol=USDKRW&timeframe=4h' | python3 -c \"import sys,json; j=json.load(sys.stdin); print('market', j.get('ok'), len(j.get('candles') or []))\"")
run("pm2 list | sed -n '1,12p'; df -h / | sed -n '1,2p'; du -sh /root/ailongshort /root/ailongshort/.next /root/ailongshort/node_modules")
ssh.close()
print("DONE")
