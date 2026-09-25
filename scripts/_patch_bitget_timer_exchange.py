from pathlib import Path
import re

p = Path(r"d:/apps/ailongshort/app/components/ChartView.tsx")
t = p.read_text(encoding="utf-8")

old = """        <ChartCandleCloseTimer
          timeframe={timeframe}
          nowMs={tfCloseNowMs}
          lastPrice={
            candles.length > 0 && Number.isFinite(candles[candles.length - 1]!.close)
              ? candles[candles.length - 1]!.close
              : null
          }
          hostRef={hostRef}
          chartRef={chartRef}
          seriesRef={seriesRef}
        />"""
new = """        <ChartCandleCloseTimer
          timeframe={timeframe}
          nowMs={tfCloseNowMs}
          lastPrice={
            candles.length > 0 && Number.isFinite(candles[candles.length - 1]!.close)
              ? candles[candles.length - 1]!.close
              : null
          }
          hostRef={hostRef}
          chartRef={chartRef}
          seriesRef={seriesRef}
          exchange={bitgetVolumePackOn ? 'bitget' : 'binance'}
        />"""
if old not in t:
    raise SystemExit("timer block missing")
t = t.replace(old, new, 1)

ex = "bitgetVolumePackOn ? 'bitget' : 'binance'"
t = t.replace(
    "tfCandleCloseTitleSuffix(timeframe, tfCloseNowMs)",
    f"tfCandleCloseTitleSuffix(timeframe, tfCloseNowMs, {ex})",
)
t = t.replace(
    "tfCandleCloseTitleSuffix(tf, tfCloseNowMs)",
    f"tfCandleCloseTitleSuffix(tf, tfCloseNowMs, {ex})",
)


def add_exchange(m: re.Match[str]) -> str:
    s = m.group(0)
    if "exchange=" in s:
        return s
    if s.endswith("/>"):
        return s[:-2] + f" exchange={{{ex}}} />"
    return s


t, n = re.subn(r"<TfCandleCloseRemain\b[^>]*?/>", add_exchange, t, flags=re.S)
print("TfCandleCloseRemain patched", n)
print("exchange count", t.count("exchange={bitgetVolumePackOn ? 'bitget' : 'binance'}"))
p.write_text(t, encoding="utf-8")
print("ok")
