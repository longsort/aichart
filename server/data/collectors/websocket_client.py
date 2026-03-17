"""
Binance WebSocket client: single connection manager with auto-reconnect.
Streams are multiplexed per symbol/stream; collectors subscribe to payloads.
"""

import asyncio
import json
import time
from typing import Callable, Awaitable, Optional

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
    WS_AVAILABLE = True
except ImportError:
    WS_AVAILABLE = False
    websockets = None
    ConnectionClosed = Exception


PayloadHandler = Callable[[dict], Awaitable[None]]


class WebsocketClient:
    """
    Manages Binance spot WebSocket connection with reconnect and heartbeat.
    """

    BASE = "wss://stream.binance.com:9443/ws"

    def __init__(
        self,
        streams: list[str],
        on_payload: PayloadHandler,
        reconnect_delay: float = 2.0,
        max_reconnect_delay: float = 60.0,
    ):
        """
        Args:
            streams: e.g. ["btcusdt@depth@100ms", "btcusdt@aggTrade"]
            on_payload: async handler(event_type, payload) for each message
            reconnect_delay: initial delay before reconnect
            max_reconnect_delay: cap for exponential backoff
        """
        self._streams = streams
        self._on_payload = on_payload
        self._reconnect_delay = reconnect_delay
        self._max_reconnect_delay = max_reconnect_delay
        self._ws = None
        self._task: Optional[asyncio.Task] = None
        self._closed = False
        self._reconnect_count = 0
        self._last_message_ts: Optional[float] = None

    def _url(self) -> str:
        stream_str = "/".join(self._streams)
        return f"{self.BASE}/{stream_str}"

    async def run(self) -> None:
        """Run loop: connect, read, reconnect on failure."""
        if not WS_AVAILABLE:
            return
        delay = self._reconnect_delay
        while not self._closed:
            try:
                async with websockets.connect(
                    self._url(),
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    self._reconnect_count += 1
                    delay = self._reconnect_delay
                    await self._receive_loop(ws)
            except ConnectionClosed as e:
                if not self._closed:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, self._max_reconnect_delay)
            except asyncio.CancelledError:
                break
            except Exception:
                if not self._closed:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, self._max_reconnect_delay)
            self._ws = None

    async def _receive_loop(self, ws) -> None:
        async for raw in ws:
            if self._closed:
                break
            try:
                self._last_message_ts = time.time()
                data = json.loads(raw)
                await self._on_payload(data)
            except json.JSONDecodeError:
                continue
            except Exception:
                continue

    def start(self) -> asyncio.Task:
        """Start background run loop."""
        if self._task is not None and not self._task.done():
            return self._task
        self._closed = False
        self._task = asyncio.create_task(self.run())
        return self._task

    async def stop(self) -> None:
        """Stop and wait for task."""
        self._closed = True
        if self._ws:
            await self._ws.close()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    @property
    def last_message_ts(self) -> Optional[float]:
        return self._last_message_ts

    @property
    def reconnect_count(self) -> int:
        return self._reconnect_count
