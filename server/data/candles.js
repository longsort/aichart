/**
 * Railway 배포 시 거래소 차단(403/451) 회피:
 * - getHttpClient() 사용 → PROXY_URL 설정 시 프록시 경유.
 * - Bitget 우선 사용(지역 제한 적음), 실패 시 Binance fallback.
 */
const { getHttpClient } = require("../lib/httpClient");

const BITGET_BASE = "https://api.bitget.com";

// 우리 tf → Bitget period (spot v1)
const tfToBitgetPeriod = {
  "1m": "1min",
  "3m": "1min",   // 1min 수집 후 3개 묶음
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
  "1w": "1week",
  "1M": "1M",
};

// 우리 tf → Binance interval
const tfToBinanceInterval = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
  "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w", "1M": "1M",
};

const BINANCE_START = 1502942400000;

function toCandle(ts, open, high, low, close, vol) {
  return {
    time: Math.floor(Number(ts) / 1000),
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume: vol != null ? parseFloat(vol) : 0,
  };
}

/** 1min 캔들 배열을 3개씩 묶어 3m 캔들로 변환 */
function aggregate3m(candles) {
  const out = [];
  for (let i = 0; i + 2 < candles.length; i += 3) {
    const a = candles[i];
    const b = candles[i + 1];
    const c = candles[i + 2];
    out.push({
      time: a.time,
      open: a.open,
      high: Math.max(a.high, b.high, c.high),
      low: Math.min(a.low, b.low, c.low),
      close: c.close,
      volume: (a.volume || 0) + (b.volume || 0) + (c.volume || 0),
    });
  }
  return out;
}

async function fetchBitgetCandles(client, sym, period, after, before) {
  const url = `${BITGET_BASE}/api/spot/v1/market/candles?symbol=${encodeURIComponent(sym)}&period=${period}&after=${after}&before=${before}&limit=1000`;
  const res = await client.get(url, { timeout: 15000 });
  const data = res.data?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.map((c) =>
    toCandle(c.ts, c.open, c.high, c.low, c.close, c.baseVol)
  ).sort((a, b) => a.time - b.time);
}

async function loadBitget(symbol, tf) {
  const client = getHttpClient();
  const period = tfToBitgetPeriod[tf] || "1h";
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const before = now;
  const after = now - (tf === "1d" || tf === "1w" || tf === "1M" ? 365 * oneDay : 30 * oneDay);

  // 시도 1: 소문자 Symbol Id (btcusdt_spbl)
  const symWithSuffix = (symbol.includes("_") ? symbol : `${symbol}_SPBL`).toLowerCase();
  let candles = await fetchBitgetCandles(client, symWithSuffix, period, after, before).catch(() => null);
  // 시도 2: 400이면 접미사 없이 (btcusdt)
  if (!candles?.length && !symbol.includes("_")) {
    const symPlain = symbol.toLowerCase();
    candles = await fetchBitgetCandles(client, symPlain, period, after, before).catch(() => null);
  }
  if (!candles?.length) return null;
  if (tf === "3m") return aggregate3m(candles);
  return candles;
}

async function loadBinance(symbol, tf) {
  const client = getHttpClient();
  const interval = tfToBinanceInterval[tf] || "1h";
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${BINANCE_START}&limit=1000`;
  const res = await client.get(url, { timeout: 15000 });
  const data = res.data;
  if (!Array.isArray(data)) return null;
  return data.map((c) =>
    toCandle(c[0], c[1], c[2], c[3], c[4], c[5])
  );
}

exports.load = async function load(symbol = "BTCUSDT", tf = "1h") {
  const normTf = (tf || "1h").toLowerCase();
  try {
    const fromBitget = await loadBitget(symbol, normTf);
    if (fromBitget && fromBitget.length > 0) {
      return fromBitget;
    }
  } catch (e) {
    console.warn("[candles] Bitget failed, trying Binance:", e?.message || e);
  }
  try {
    const fromBinance = await loadBinance(symbol, normTf);
    if (fromBinance && fromBinance.length > 0) {
      return fromBinance;
    }
  } catch (e) {
    console.warn("[candles] Binance failed:", e?.message || e);
  }
  // 둘 다 실패해도 서버는 유지: 빈 배열 반환 (Next가 fallback 시도 가능)
  console.warn("[candles] Bitget and Binance both failed, returning empty candles");
  return [];
};
