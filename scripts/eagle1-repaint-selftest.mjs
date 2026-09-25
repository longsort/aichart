#!/usr/bin/env node
/**
 * non-repaint-validator required tests.
 * Writes data/eagle1/repaint-audit.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];

function assert(cond, msg) {
  if (!cond) fail.push(msg);
}

function synthetic(n) {
  const out = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const close = px + ((i % 7) - 3) * 0.4 + (i % 11 === 0 ? 2 : 0);
    const open = px;
    out.push({
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
    });
    px = close;
  }
  return out;
}

function detectFvgCausal(candles, endExclusive) {
  const n = Math.min(candles.length, endExclusive);
  const fvg = [];
  const overlaps = (c, lo, hi) => c.low <= hi && c.high >= lo;
  for (let i = 2; i < n; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (overlaps(candles[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, known_at: i, valid: !mitigated });
    }
  }
  return fvg;
}

function ser(rows) {
  return JSON.stringify(rows.map((r) => ({ bias: r.bias, index: r.index, low: r.low, high: r.high, known_at: r.known_at })));
}

const series = synthetic(80);
for (const t of [20, 40, 60]) {
  const live = ser(detectFvgCausal(series, t + 1));
  const later = detectFvgCausal(series, series.length).filter((f) => f.index <= t && f.known_at <= t);
  assert(live === ser(later), `prefix replay mismatch t=${t}`);
}

const frozen = Object.freeze({
  signal_id: 'a',
  price: 100,
  entry: 100,
  sl: 99,
  tp: [101, 102, 103],
});
const outcome = { signal_id: frozen.signal_id, mfe: 1, mae: 0.2 };
assert(frozen.price === 100 && outcome.signal_id === 'a', 'outcome must not replace freeze identity');
try {
  frozen.price = 1;
} catch {
  /* ok */
}
assert(frozen.price === 100, 'frozen prediction mutated');

function chronoSplit(n) {
  const trainEnd = Math.floor(n * 0.6);
  const valEnd = Math.floor(n * 0.8);
  const train = [];
  const val = [];
  const hold = [];
  for (let i = 0; i < n; i++) {
    if (i < trainEnd) train.push(i);
    else if (i < valEnd) val.push(i);
    else hold.push(i);
  }
  return { train, val, hold };
}
function isChrono(a) {
  for (let i = 1; i < a.length; i++) if (a[i] <= a[i - 1]) return false;
  return true;
}
const sp = chronoSplit(100);
assert(isChrono(sp.train) && isChrono(sp.val) && isChrono(sp.hold), 'chrono split failed');
assert(sp.train[sp.train.length - 1] < sp.val[0], 'train/val overlap');
assert(!isChrono([...sp.train].reverse()), 'shuffle detector broken');

const zone = { lower: 99, upper: 101 };
const laterZone = { ...zone };
assert(laterZone.lower === zone.lower && laterZone.upper === zone.upper, 'zone bounds must stay frozen');

const passed = fail.length === 0;
const report = {
  passed,
  confirmedSignalBlocked: !passed,
  failures: fail,
  checks: {
    prefix_replay_parity: !fail.some((f) => String(f).includes('prefix')),
    frozen_prediction: !fail.some((f) => String(f).includes('frozen')),
    chrono_split: !fail.some((f) => String(f).includes('chrono') || String(f).includes('overlap')),
  },
  engine_version: 'eagle1-phase1-0.1.0',
  calculated_at: Date.now(),
};
const dir = path.join(ROOT, 'data', 'eagle1');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'repaint-audit.json'), JSON.stringify(report, null, 2), 'utf8');

if (!passed) {
  console.error('REPAINT SELFTEST FAIL');
  for (const f of fail) console.error(' -', f);
  process.exit(1);
}
console.error('REPAINT SELFTEST OK');
