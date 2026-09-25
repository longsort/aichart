# -*- coding: utf-8 -*-
import importlib.util
from pathlib import Path
import paramiko, os, posixpath

ROOT = Path(r"d:\apps\ailongshort")
p = ROOT / "deploy_today.py"
s = importlib.util.spec_from_file_location("d", p)
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)

FILES = [
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=30)
sftp = c.open_sftp()

def mkdirs(remote_dir):
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for part in parts:
        cur = f"{cur}/{part}" if cur else f"/{part}"
        try:
            sftp.stat(cur)
        except OSError:
            try:
                sftp.mkdir(cur)
            except OSError:
                pass

for rel in FILES:
    local = ROOT / rel.replace("/", os.sep)
    remote = posixpath.join(m.REMOTE_ROOT, rel)
    mkdirs(posixpath.dirname(remote))
    sftp.put(str(local), remote)
    print("uploaded", rel, flush=True)
sftp.close()

# env check without PowerShell mangling
_, o, _ = c.exec_command(
    "python3 - <<'PY'\n"
    "from pathlib import Path\n"
    "p=Path('/root/ailongshort/.env.local')\n"
    "print('env_exists', p.exists())\n"
    "if p.exists():\n"
    "  for line in p.read_text(errors='replace').splitlines():\n"
    "    if any(k in line for k in ('APP_SESSION','EXCHANGE','ENCRYPT','KEYS_SECRET','SITE')) and not line.strip().startswith('#'):\n"
    "      k=line.split('=',1)[0].strip()\n"
    "      print(k+'=***')\n"
    "PY",
    timeout=30,
)
print(o.read().decode("utf-8", "replace"), flush=True)

print("Building...", flush=True)
_, stdout, stderr = c.exec_command(f"cd {m.REMOTE_ROOT} && npm run build", get_pty=True, timeout=7200)
out = stdout.read().decode("utf-8", "replace")
print(out[-8000:] if len(out) > 8000 else out, flush=True)
code = stdout.channel.recv_exit_status()
print("build_exit", code, flush=True)
if code == 0:
    for cmd in [
        "pm2 restart ailongshort --update-env",
        'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/',
    ]:
        _, so, _ = c.exec_command(cmd, get_pty=True, timeout=120)
        print(so.read().decode("utf-8", "replace")[-2000:], flush=True)
c.close()
print("[done]" if code == 0 else "[FAIL]", flush=True)
