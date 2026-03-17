#!/usr/bin/env python3
"""
The Aegis - Pipeline runner (Stage 1 + Stage 2).
Usage:
  pip install -r server/requirements-server.txt
  redis-server   # start Redis locally
  python -m server.run_pipeline

Runs:
  1. Data Ingestion: Binance WebSocket (depth@100ms + aggTrade) -> Redis
  2. Microstructure Replay: every 5s read from Redis, compute wall/delta/density/spread -> replay:BTCUSDT
"""

import asyncio
import sys

# Allow running as python -m server.run_pipeline from repo root
sys.path.insert(0, ".")


async def main() -> None:
    from server.data.dataHub import DataHub

    redis_url = "redis://localhost:6379/0"
    symbol = "BTCUSDT"
    hub = DataHub(redis_url=redis_url, symbol=symbol)

    print("[Aegis] Connecting Redis and starting WebSocket...")
    ok = await hub.start()
    if not ok:
        print("[Aegis] Redis not available. Start Redis: redis-server")
        return

    print("[Aegis] Starting microstructure replay loop (every 5s)...")
    replay_task = hub.run_replay_loop(interval_sec=5.0)

    try:
        await asyncio.Future()
    except asyncio.CancelledError:
        pass
    finally:
        replay_task.cancel()
        try:
            await replay_task
        except asyncio.CancelledError:
            pass
        await hub.stop()
    print("[Aegis] Stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Aegis] Interrupted.")
