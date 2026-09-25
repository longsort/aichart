#!/usr/bin/env python3
"""Local evidence runner for pattern-memory. Does not print secrets."""
import json
import os
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = {}
p = root / ".env.local"
if p.exists():
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

secret = env.get("INTERNAL_ANALYZE_SECRET") or env.get("TELEGRAM_MULTITF_CRON_SECRET") or ""
base = "http://127.0.0.1:3000"


def get(path: str, timeout=180):
    req = urllib.request.Request(
        base + path,
        headers={"x-internal-analyze-secret": secret, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def post(path: str, body: dict, timeout=180):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        method="POST",
        headers={
            "x-internal-analyze-secret": secret,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


out = {"lookahead": None, "sync": [], "inventory": None, "analyze15m": None, "paper": None, "errors": []}
try:
    out["lookahead"] = get("/api/pattern-memory?action=lookahead", 60)
except Exception as e:
    out["errors"].append(f"lookahead: {e}")
for tf in ("4h", "1d", "15m", "1M"):
    try:
        row = post("/api/pattern-memory", {"action": "sync", "symbol": "BTCUSDT", "timeframe": tf}, 180)
        out["sync"].append(row)
        print("SYNC", tf, "count", row.get("count"), "inc", row.get("incremental"))
    except Exception as e:
        out["errors"].append(f"sync {tf}: {e}")
try:
    out["inventory"] = get("/api/pattern-memory?action=inventory&symbol=BTCUSDT", 120)
except Exception as e:
    out["errors"].append(f"inventory: {e}")
try:
    out["analyze15m"] = get("/api/pattern-memory?action=analyze&symbol=BTCUSDT&tf=15m", 180)
except Exception as e:
    out["errors"].append(f"analyze: {e}")
try:
    out["paper"] = get("/api/pattern-memory?action=paper&symbol=BTCUSDT", 30)
except Exception as e:
    out["errors"].append(f"paper: {e}")

dest = root / "data" / "pattern-memory" / "evidence-last.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", dest)
print("errors", out["errors"])
la = out.get("lookahead") or {}
print("lookahead_ok", (la.get("lookahead") or {}).get("pass") if isinstance(la, dict) else None)
inv = ((out.get("inventory") or {}).get("inventory") if isinstance(out.get("inventory"), dict) else None) or []
if isinstance(inv, list):
    for row in inv:
        print(
            "INV",
            row.get("timeframe"),
            "n=",
            row.get("count"),
            "miss=",
            row.get("missingCount"),
            "dup=",
            row.get("duplicateCount"),
        )
an = out.get("analyze15m") or {}
res = an.get("result") if isinstance(an, dict) else None
if res:
    print("verdict", res.get("verdict"), "incremental", res.get("incremental"), "ms", res.get("searchMs"))
    print("logs", (res.get("logs") or [])[-4:])
    print("hits", len(res.get("candleHits") or []))
    print("wait", res.get("waitReasons"))
