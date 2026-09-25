from __future__ import annotations
import importlib.util, os, sys, time
import paramiko

ROOT = r"d:\apps\ailongshort"
FILES = [
    "app/globals.css",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
]
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

def out(s):
    sys.stdout.buffer.write((s+"\n").encode("utf-8","replace")); sys.stdout.buffer.flush()

def run(ssh, cmd, timeout=7200):
    out("$ "+cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536)); sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest: sys.stdout.buffer.write(rest); sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8","replace")
    if err.strip(): out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0: raise RuntimeError("fail %s"%code)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
sftp = ssh.open_sftp()
try:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = "/root/ailongshort/"+rel
        out("[put] "+rel)
        sftp.put(local, remote)
    run(ssh, "cd /root/ailongshort && rm -rf .next && npm run build", timeout=7200)
    run(ssh, "cd /root/ailongshort && pm2 restart ailongshort && sleep 2 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
    # verify bad rule gone
    run(ssh, "grep -n 'max-height:11%\\|max-height:9%\\|max-height:12%' /root/ailongshort/app/globals.css /root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDesk.module.css || echo 'bad max-height rules cleared'")
    out("[done]")
finally:
    sftp.close(); ssh.close()
