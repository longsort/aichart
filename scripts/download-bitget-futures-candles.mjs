#!/usr/bin/env node
/**
 * Bitget USDT-M 선물 공개 캔들(OHLC + 거래량) 다운로드 → CSV
 * API: GET https://api.bitget.com/api/v2/mix/market/candles
 *
 * 과거 전체를 받으려면 **현재 시각(now)부터 90일 단위로 과거로 이동**하며,
 * 각 90일 구간 안에서는 **endTime 쪽(최신)부터** limit개씩 받고, 다음 페이지는
 * **가장 오래된 봉 시각 − 1ms**를 새 endTime으로 두어 더 과거로 이동합니다.
 * (startTime만 앞으로 올리면 API가 끝 구간만 반환해 일부 과거 구간이 비는 문제가 있었음.)
 *
 * 인증 불필요. 문서상 limit 최대 1000이나, **과거 구간에서는 limit>360이면 빈 data**가 나오는
 * 경우가 있어 **항상 limit≤360**으로 요청합니다. 구간 길이 문서상 약 90일.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const BASE = process.env.BITGET_API_BASE || 'https://api.bitget.com';
const DAY_MS = 86_400_000;
/** Bitget: start~end 조회 범위 상한(문서 약 90일) — 한 요청 구간은 이 안에 있어야 함 */
const WINDOW_MS = 90 * DAY_MS;
const REQ_GAP_MS = 120;
/** Bitget mix candles: 과거 구간에서 limit>360이면 빈 배열이 나오는 경우가 있음 → 안전 상한 */
const MAX_LIMIT = 360;

function parseArgs(argv) {
  const o = {
    symbol: 'BTCUSDT',
    granularity: '1H',
    productType: 'usdt-futures',
    start: null,
    out: null,
    maxRows: Infinity,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) o.symbol = String(argv[++i]).toUpperCase();
    else if (a === '--granularity' && argv[i + 1]) o.granularity = String(argv[++i]);
    else if (a === '--productType' && argv[i + 1]) o.productType = String(argv[++i]);
    else if (a === '--start' && argv[i + 1]) o.start = String(argv[++i]);
    else if (a === '--out' && argv[i + 1]) o.out = String(argv[++i]);
    else if (a === '--max-rows' && argv[i + 1]) o.maxRows = parseInt(argv[++i], 10) || 0;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function normalizeGranularity(g) {
  const g0 = String(g).trim();
  const map = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '1H': '1H',
    '2h': '2H',
    '2H': '2H',
    '4h': '4H',
    '4H': '4H',
    '6h': '6H',
    '6H': '6H',
    '12h': '12H',
    '12H': '12H',
    '1d': '1D',
    '1D': '1D',
    '1w': '1W',
    '1W': '1W',
    '1M': '1M',
    '1mo': '1M',
  };
  return map[g0] || g0;
}

function parseStartMs(startStr) {
  if (!startStr) return Date.UTC(2020, 0, 1);
  const t = Date.parse(startStr);
  if (!Number.isFinite(t)) throw new Error(`invalid --start: ${startStr}`);
  return t;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchChunk({ symbol, productType, granularity, startTime, endTime, limit }) {
  const u = new URL(`${BASE}/api/v2/mix/market/candles`);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('productType', productType);
  u.searchParams.set('granularity', granularity);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('startTime', String(startTime));
  u.searchParams.set('endTime', String(endTime));
  const res = await fetch(u, { cache: 'no-store' });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}, non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${j?.msg || text.slice(0, 200)}`);
  if (j.code !== '00000' && j.code !== '0') {
    throw new Error(`Bitget ${j.code}: ${j.msg || 'error'}`);
  }
  const data = j.data;
  if (!Array.isArray(data)) return [];
  return data;
}

function csvEscape(s) {
  if (s == null) return '';
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Bitget USDT-M futures candles → CSV (OHLC + base volume + quote volume)

  --symbol BTCUSDT
  --granularity 15m | 1H | 4H | 1D | 1W | 1M  (default 1H)
  --productType usdt-futures
  --start 2020-01-01   ISO date (default 2020-01-01 UTC)
  --out path.csv       (default data/bitget-futures/{symbol}_{granularity}.csv)
  --max-rows N         stop after N rows (test)
`);
    process.exit(0);
  }

  const symbol = args.symbol;
  const granularity = normalizeGranularity(args.granularity);
  const productType = args.productType;
  const startMs = parseStartMs(args.start);
  const endMs = Date.now();
  const maxRows = Number.isFinite(args.maxRows) && args.maxRows > 0 ? args.maxRows : Infinity;

  const outRel =
    args.out ||
    path.join('data', 'bitget-futures', `${symbol}_${granularity.replace(/[^a-zA-Z0-9]/g, '')}.csv`);
  const outAbs = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  console.error(`Bitget futures candles: ${symbol} ${granularity} ${productType}`);
  console.error(`Range: ${new Date(startMs).toISOString()} .. ${new Date(endMs).toISOString()}`);
  console.error(`→ ${outAbs}`);
  console.error(`(now부터 90일 단위로 과거로 이동, 각 90일 안에서는 endTime 쪽부터 최대 ${MAX_LIMIT}개씩 페이지)`);

  const seen = new Set();
  const accumulated = [];
  let total = 0;

  /** 끝을 now부터 한 칸씩 과거로 — 2020부터 앞으로만 가면 빈 구간만 지나 최근 일부만 쌓이던 문제 방지 */
  let endBoundary = endMs;
  let winIdx = 0;
  /** 연속으로 “이번 90일 창에 신규 봉 0개”이면 API에 더 과거 데이터가 없는 것으로 보고 조기 종료 */
  let emptyWinStreak = 0;
  const EMPTY_WIN_STOP = 8;

  while (endBoundary > startMs && total < maxRows) {
    const totalAtWindowStart = total;
    const beginBoundary = Math.max(startMs, endBoundary - WINDOW_MS);
    winIdx++;
    /** 한 90일 창 안: 최신(endBoundary) 쪽부터 페이지 → 더 과거는 pageEnd = oldestTs - 1 */
    let pageEnd = endBoundary;

    while (pageEnd > beginBoundary && total < maxRows) {
      await sleep(REQ_GAP_MS);
      const lim = Math.min(MAX_LIMIT, maxRows - total);
      if (lim <= 0) break;

      let rows;
      try {
        rows = await fetchChunk({
          symbol,
          productType,
          granularity,
          startTime: beginBoundary,
          endTime: pageEnd,
          limit: lim,
        });
      } catch (e) {
        console.error(`Fetch error win#${winIdx} pageEnd=${pageEnd}:`, e.message);
        throw e;
      }

      if (!rows.length) break;

      let oldestInPage = Infinity;
      let addedThisPage = 0;
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 7) continue;
        const ts = Number(row[0]);
        if (!Number.isFinite(ts)) continue;
        if (ts < beginBoundary || ts > endBoundary) continue;
        if (ts < oldestInPage) oldestInPage = ts;
        if (seen.has(ts)) continue;
        seen.add(ts);
        accumulated.push(row);
        total++;
        addedThisPage++;
        if (total >= maxRows) break;
      }

      if (!Number.isFinite(oldestInPage)) break;
      /** 동일 페이지만 반복되면 중복·경계 문제로 진행 중단 */
      if (addedThisPage === 0) break;

      /** 이 창의 시작 시각까지 도달했으면 다음 90일 창으로 */
      if (oldestInPage <= beginBoundary) break;

      const nextPageEnd = oldestInPage - 1;
      if (nextPageEnd < beginBoundary) break;
      if (nextPageEnd >= pageEnd) break;
      pageEnd = nextPageEnd;
    }

    if (winIdx % 10 === 0) {
      console.error(`… 90d-windows: ${winIdx}, rows: ${total}, next end ≤ ${new Date(beginBoundary).toISOString()}`);
    }

    if (total === totalAtWindowStart) {
      emptyWinStreak++;
      if (emptyWinStreak >= EMPTY_WIN_STOP) {
        console.error(
          `Stopped: ${EMPTY_WIN_STOP} consecutive 90d windows with no new candles (no older data for this symbol/granularity, or gap).`,
        );
        break;
      }
    } else {
      emptyWinStreak = 0;
    }

    endBoundary = beginBoundary - 1;
  }

  accumulated.sort((a, b) => Number(a[0]) - Number(b[0]));

  const header = 'time_ms,time_iso,open,high,low,close,volume_base,volume_quote\n';
  const lines = [header];
  for (const row of accumulated) {
    const ts = Number(row[0]);
    const iso = new Date(ts).toISOString();
    lines.push([ts, iso, row[1], row[2], row[3], row[4], row[5], row[6]].map(csvEscape).join(',') + '\n');
  }
  fs.writeFileSync(outAbs, lines.join(''), 'utf8');

  console.error(`Done. rows=${accumulated.length} (sorted ascending by time)`);
  if (accumulated.length) {
    const t0 = Number(accumulated[0][0]);
    const t1 = Number(accumulated[accumulated.length - 1][0]);
    console.error(
      `Actual span: ${new Date(t0).toISOString()} .. ${new Date(t1).toISOString()} (Range 위 줄은 요청 한도일 뿐)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
