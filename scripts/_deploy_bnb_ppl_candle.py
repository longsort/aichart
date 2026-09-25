#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os, posixpath, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/mergedDeskBnbPplCandleTrade.ts",
    "lib/mergedDeskParallelPivotLines.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskAutoTradeConfig.ts",
    "lib/serverMergedDeskAutoTradeStore.ts",
    "lib/mergedAnalysisOverlayIds.ts",
    "app/api/merged-desk/bnb-ppl-scan/route.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
]

def ensure_bnb_in_arm_files(ssh, remote: str) -> None:
    """서버 ARM JSON에 BNBUSDT 없으면 추가 (기존 설정 유지)."""
    arm_dir = f"{remote}/data/auto-trade-arm"
    cmd = (
        f"python3 - <<'PY'\n"
        f"import json, glob, os\n"
        f"d={arm_dir!r}\n"
        f"if not os.path.isdir(d):\n"
        f"  print('no arm dir'); raise SystemExit(0)\n"
        f"for p in glob.glob(d+'/*.json'):\n"
        f"  if p.endswith('.fired.json'): continue\n"
        f"  try:\n"
        f"    j=json.load(open(p))\n"
        f"  except Exception as e:\n"
        f"    print('skip',p,e); continue\n"
        f"  syms=j.get('enabledSymbols') or []\n"
        f"  if not isinstance(syms,list): syms=[]\n"
        f"  u=[str(x).upper() for x in syms]\n"
        f"  if 'BNBUSDT' in u:\n"
        f"    print('ok',os.path.basename(p),'has BNB');\n"
        f"    continue\n"
        f"  u.append('BNBUSDT')\n"
        f"  j['enabledSymbols']=u\n"
        f"  json.dump(j, open(p,'w'), ensure_ascii=False, indent=2)\n"
        f"  print('patched',os.path.basename(p),u)\n"
        f"PY"
    )
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print(out or err or "arm patch done", flush=True)

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    remote = getattr(mod, "REMOTE_ROOT", "/root/ailongshort")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {mod.HOST} ...", flush=True)
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            rem = posixpath.join(remote, rel)
            _, so, _ = ssh.exec_command(f"mkdir -p {posixpath.dirname(rem)}")
            so.channel.recv_exit_status()
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, rem)
    finally:
        sftp.close()

    def run(cmd, timeout=7200):
        print(f"\n$ {cmd}", flush=True)
        _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        safe = lambda s: s.encode("cp949", errors="replace").decode("cp949", errors="replace")
        if out.strip():
            print(safe(out[-9000:] if len(out) > 9000 else out), flush=True)
        if err.strip():
            print(safe(err[-1500:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")
        return out

    print("\n# ensure BNB in ARM", flush=True)
    ensure_bnb_in_arm_files(ssh, remote)

    run(f"cd {remote} && npm run build")
    run("pm2 restart ailongshort --update-env")
    run("sleep 3")
    http = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/').strip()
    if "200" not in http:
        raise RuntimeError(http)
    run(
        f"grep -n 'bnb-ppl\\|longPct\\|BNBUSDT\\|migrateEnableBnbPpl\\|AIZONE' "
        f"{remote}/lib/mergedDeskBnbPplCandleTrade.ts "
        f"{remote}/lib/mergedDeskServerAutoTradeRunner.ts "
        f"{remote}/lib/serverMergedDeskAutoTradeStore.ts "
        f"{remote}/app/api/merged-desk/bnb-ppl-scan/route.ts | head -35"
    )
    print("\nOK bnb-ppl-candle deploy · BNB enabled + AI70", flush=True)
    ssh.close()
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
