from __future__ import annotations
import importlib.util, sys, time
import paramiko

spec = importlib.util.spec_from_file_location("d", r"d:\apps\ailongshort\deploy_today.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)

def run(cmd: str, timeout: int = 120) -> int:
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
    return stdout.channel.recv_exit_status()

run("sleep 5; pm2 list | sed -n '1,12p'")
run("curl -sS -o /tmp/fx_search.json -w 'search_http=%{http_code}\n' 'http://127.0.0.1:3000/api/symbols/search?q=usdkrw&limit=5'; head -c 500 /tmp/fx_search.json; echo")
run("curl -sS -o /tmp/fx_market.json -w 'market_http=%{http_code}\n' 'http://127.0.0.1:3000/api/market?symbol=USDKRW&timeframe=4h'; python3 -c \"import json; j=json.load(open('/tmp/fx_market.json')); print('ok', j.get('ok'), 'n', len(j.get('candles') or []), 'err', j.get('error'))\"")
run("curl -sS -o /tmp/fx_cny.json -w 'cny_http=%{http_code}\n' 'http://127.0.0.1:3000/api/market?symbol=CNYKRW&timeframe=1d'; python3 -c \"import json; j=json.load(open('/tmp/fx_cny.json')); print('ok', j.get('ok'), 'n', len(j.get('candles') or []), 'err', j.get('error'))\"")
run("test -f /root/ailongshort/lib/forexMarket.ts && echo forex_ok; test -f /root/ailongshort/.env.local && echo env_ok; df -h / | sed -n '1,2p'; du -sh /root/ailongshort /root/ailongshort/.next /root/ailongshort/node_modules")
run("pm2 logs ailongshort --lines 30 --nostream")
ssh.close()
