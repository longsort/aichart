#!/usr/bin/env node
/**
 * Eagle1 PHASE 1 — CSV quality report + synthetic selftest.
 * 인위 캔들을 저장하지 않는다. 기존 Bitget CSV만 검사한다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TF_MS = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '12H': 43_200_000,
  '1D': 86_400_000,
  '1W': 7 * 86_400_000,
};

function validateRows(rows, timeframe) {
  const step = TF_MS[timeframe] || null;
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  let duplicate_count = 0;
  let gap_count = 0;
  let invalid_ohlc_count = 0;
  let negative_volume_count = 0;
  let zero_volume_count = 0;
  const seen = new Set();
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (seen.has(c.t)) {
      duplicate_count++;
      continue;
    }
    seen.add(c.t);
    const ok =
      [c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x) && x > 0) &&
      c.h >= c.l &&
      c.h >= c.o &&
      c.h >= c.c &&
      c.l <= c.o &&
      c.l <= c.c;
    if (!ok) invalid_ohlc_count++;
    if (!Number.isFinite(c.v) || c.v < 0) negative_volume_count++;
    else if (c.v === 0) zero_volume_count++;
    if (step && i > 0) {
      const delta = c.t - sorted[i - 1].t;
      if (delta > step * 1.5) gap_count++;
    }
  }
  const confirmed_signal_blocked =
    invalid_ohlc_count > 0 || negative_volume_count > 0 || duplicate_count > 0 || sorted.length === 0;
  return {
    sample_count: sorted.length,
    duplicate_count,
    gap_count,
    invalid_ohlc_count,
    negative_volume_count,
    zero_volume_count,
    confirmed_signal_blocked,
    first: sorted[0]?.t || null,
    last: sorted[sorted.length - 1]?.t || null,
  };
}

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    rows.push({
      t: Number(cols[0]),
      o: Number(cols[2]),
      h: Number(cols[3]),
      l: Number(cols[4]),
      c: Number(cols[5]),
      v: Number(cols[6]),
    });
  }
  return rows;
}

function selftest() {
  const fail = [];
  const empty = validateRows([], '1H');
  if (!empty.confirmed_signal_blocked) fail.push('empty must block confirmed');
  const bad = validateRows([{ t: 1, o: 10, h: 9, l: 11, c: 10, v: 1 }], '1H');
  if (bad.invalid_ohlc_count !== 1) fail.push('invalid ohlc not detected');
  const dup = validateRows(
    [
      { t: 1000, o: 1, h: 2, l: 1, c: 1.5, v: 1 },
      { t: 1000, o: 1, h: 2, l: 1, c: 1.5, v: 1 },
    ],
    '1H',
  );
  if (dup.duplicate_count !== 1) fail.push('duplicate not detected');
  const gap = validateRows(
    [
      { t: 0, o: 1, h: 2, l: 1, c: 1.5, v: 1 },
      { t: 3_600_000 * 5, o: 1, h: 2, l: 1, c: 1.5, v: 1 },
    ],
    '1H',
  );
  if (gap.gap_count !== 1) fail.push('gap not detected');
  const ok = validateRows(
    [
      { t: 0, o: 1, h: 2, l: 1, c: 1.5, v: 1 },
      { t: 3_600_000, o: 1.5, h: 2, l: 1, c: 1.6, v: 2 },
    ],
    '1H',
  );
  if (ok.confirmed_signal_blocked) fail.push('valid series blocked');
  if (fail.length) {
    console.error('SELFTEST FAIL:', fail.join('; '));
    process.exit(1);
  }
  console.error('SELFTEST OK');
}

function dirSizeBytes(abs, depth = 0) {
  if (depth > 12 || !fs.existsSync(abs)) return 0;
  let n = 0;
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(abs, e.name);
    try {
      if (e.isDirectory()) n += dirSizeBytes(p, depth + 1);
      else n += fs.statSync(p).size;
    } catch {
      /* skip */
    }
  }
  return n;
}

function csvNameForTf(tf) {
  if (tf === '1m') return 'BTCUSDT_1min.csv';
  return `BTCUSDT_${tf}.csv`;
}

function main() {
  selftest();
  const dir = path.join(ROOT, 'data', 'bitget-futures');
  const tfs = ['1M', '1W', '1D', '12H', '4H', '1H', '15m', '5m', '1m'];
  const files = fs.existsSync(dir)
    ? new Set(fs.readdirSync(dir).filter((n) => n.endsWith('.csv')))
    : new Set();
  const reports = [];
  for (const tf of tfs) {
    const name = csvNameForTf(tf);
    if (!files.has(name)) {
      reports.push({ timeframe: tf, status: '데이터 없음', sample_count: 0 });
      continue;
    }
    const file = path.join(dir, name);
    const rows = readCsv(file);
    const q = validateRows(rows, tf);
    reports.push({
      timeframe: tf,
      status: q.confirmed_signal_blocked ? 'DATA_QUALITY_WARNING' : q.gap_count ? '신뢰도 낮음' : 'ok',
      ...q,
      first_iso: q.first ? new Date(q.first).toISOString() : null,
      last_iso: q.last ? new Date(q.last).toISOString() : null,
    });
  }
  const storage = {
    used_bytes:
      dirSizeBytes(path.join(ROOT, 'data')) +
      dirSizeBytes(path.join(ROOT, '.next')) +
      dirSizeBytes(path.join(ROOT, 'playwright-report')),
    limit_bytes: 50 * 1024 * 1024 * 1024,
    preserve: ['data/bitget-futures', 'data/eagle1'],
    availability: {
      has_oi: false,
      has_cvd: false,
      has_funding: false,
      has_orderbook: false,
      has_liquidation: false,
      has_trades: false,
    },
  };
  storage.used_ratio = storage.used_bytes / storage.limit_bytes;
  storage.tier = storage.used_ratio >= 0.9 ? 'emergency' : storage.used_ratio >= 0.8 ? 'cleanup' : 'ok';

  const outDir = path.join(ROOT, 'data', 'eagle1');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'phase1-quality-report.json');
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        calculated_at: new Date().toISOString(),
        engine_version: 'eagle1-core-0.6.0',
        availability: storage.availability,
        storage: {
          used_bytes: storage.used_bytes,
          limit_bytes: storage.limit_bytes,
          used_ratio: storage.used_ratio,
          tier: storage.tier,
          preserve: storage.preserve,
        },
        reports,
      },
      null,
      2,
    ),
    'utf8',
  );
  const manifests = reports.map((r) => ({
    exchange: 'bitget',
    symbol: 'BTCUSDT',
    market_type: 'usdt-futures',
    timeframe: r.timeframe,
    first_open_time: r.first ?? null,
    last_open_time: r.last ?? null,
    first_iso: r.first_iso ?? null,
    last_iso: r.last_iso ?? null,
    row_count: r.sample_count || 0,
    gap_count: r.gap_count || 0,
    source_endpoint: 'https://api.bitget.com/api/v2/mix/market/history-candles',
    status: r.status,
    engine_version: 'eagle1-core-0.6.0',
  }));
  const manOut = path.join(outDir, 'coverage-manifest.json');
  fs.writeFileSync(
    manOut,
    JSON.stringify({ calculated_at: new Date().toISOString(), datasets: manifests }, null, 2),
    'utf8',
  );
  console.error(JSON.stringify({ storage: storage, reports }, null, 2));
  console.error(`wrote ${out}`);
  console.error(`wrote ${manOut}`);
}

main();
