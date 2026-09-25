# -*- coding: utf-8 -*-
"""Deploy multi-asset analyze patch + full merged desk → /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import posixpath
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]

# Reuse merged desk collector
spec_m = importlib.util.spec_from_file_location(
    "deploy_merged", ROOT / "scripts" / "_deploy_merged_desk_to_server.py"
)
assert spec_m and spec_m.loader
mod_m = importlib.util.module_from_spec(spec_m)
spec_m.loader.exec_module(mod_m)

EXTRA = [
    "lib/analyzeSymbolSupport.ts",
    "lib/analyzeCandleSource.ts",
    "lib/clientMarketCandleCache.ts",
    "lib/telegramMultiTfPairList.ts",
    "lib/telegramSfpAlertRunner.ts",
    "lib/telegramBackgroundHtfEval.ts",
    "lib/telegramSymbolPriceGuard.ts",
    "lib/bitgetFuturesMarket.ts",
    "lib/bitgetVolumePack.ts",
    "lib/closeSettlement.ts",
    "lib/settings.ts",
    "lib/forexMarket.ts",
    "lib/constants.ts",
    "lib/market.ts",
    "app/api/market-bitget/route.ts",
    "app/api/market/route.ts",
    "app/api/analyze/route.ts",
    "app/api/symbols/search/route.ts",
    "app/HomePageContent.tsx",
]


def load_creds():
    return mod_m.load_creds()


def run(ssh, cmd, timeout=7200):
    return mod_m.run(ssh, cmd, timeout)


def sftp_mkdirs(sftp, remote_dir):
    return mod_m.sftp_mkdirs(sftp, remote_dir)


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    files = list(dict.fromkeys([*mod_m.collect_local_files(), *EXTRA]))
    files = [f for f in files if (ROOT / f.replace("/", os.sep)).is_file()]
    print(f"Deploy files: {len(files)}", flush=True)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        ok = 0
        for rel in files:
            local = ROOT / rel.replace("/", os.sep)
            remote = posixpath.join(remote_root, rel)
            sftp_mkdirs(sftp, posixpath.dirname(remote))
            if ok % 25 == 0:
                print(f"Uploading {rel}", flush=True)
            sftp.put(str(local), remote)
            ok += 1
            if ok % 25 == 0:
                print(f"  ... {ok}/{len(files)}", flush=True)
        print(f"\nUploaded {ok}. Building...", flush=True)
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "pm2 list | sed -n '1,12p'")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
        # quick multi-symbol analyze smoke
        for sym in ("ETHUSDT", "SOLUSDT", "USDKRW", "CNYKRW"):
            run(
                ssh,
                f'curl -s -o /tmp/an_{sym}.json -w "{sym}:%{{http_code}}" '
                f'"http://127.0.0.1:3000/api/analyze?symbol={sym}&timeframe=15m" ; echo',
                timeout=180,
            )
        print(f"\n[done] multi-asset + merged desk deploy ok={ok}", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"[FAIL] {e}", flush=True)
        raise SystemExit(1)
