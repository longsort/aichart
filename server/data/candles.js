/**
 * Railway 전용: Bitget V2 Mix API만 사용.
 * GET https://api.bitget.com/api/v2/mix/market/candles
 * 실패 시 throw 없이 빈 배열 반환, 서버 유지.
 */
const { getHttpClient } = require("../lib/httpClient");

const BITGET_BASE = "https://api.bitget.com";

// tf → Bitget V2 mix granularity (문자열만, 숫자 금지)
const TF_TO_GRANULARITY = {
  "1m": "1m",
  "3m": "1m",   // 1m 수집 후 3개 묶음
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1D",  // 1D로 수집 후 7개 묶음 또는 동일 1D 반환
  "1M": "1D",
};

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

function aggregate3m(candles) {
  const out = [];
  for (let i = 0; i + 2 < candles.length; i += 3) {
    const a = candles[i], b = candles[i + 1], c = candles[i + 2];
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

exports.load = async function load(symbol = "BTCUSDT", tf = "1h") {
  const normTf = (tf || "1h").toLowerCase();
  const granularity = TF_TO_GRANULARITY[normTf] || "15m";
  const productType = "usdt-futures";
  const limit = 200;

  const client = getHttpClient();
  const url = `${BITGET_BASE}/api/v2/mix/market/candles?symbol=${encodeURIComponent(symbol)}&productType=${productType}&granularity=${granularity}&limit=${limit}`;

  let res;
  try {
    res = await client.get(url, { timeout: 15000 });
  } catch (e) {
    const status = e.response?.status;
    const body = typeof e.response?.data === "string"
      ? e.response.data
      : JSON.stringify(e.response?.data || e.message || "");
    console.log("bitget request url:", url);
    console.log("bitget status:", status != null ? status : "no response");
    console.log("bitget raw body:", body.slice(0, 500));
    return [];
  }

  const status = res.status;
  const data = res.data?.data;
  if (status !== 200 || !Array.isArray(data) || data.length === 0) {
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data || "");
    console.log("bitget request url:", url);
    console.log("bitget status:", status);
    console.log("bitget raw body:", body.slice(0, 500));
    return [];
  }

  // Bitget V2 mix 응답: [{ ts, open, high, low, close, vol }] (ts ms)
  const candles = data.map((c) =>
    toCandle(c.ts, c.open, c.high, c.low, c.close, c.vol ?? c.volume)
  ).sort((a, b) => a.time - b.time);

  if (normTf === "3m") return aggregate3m(candles);
  return candles;
};
