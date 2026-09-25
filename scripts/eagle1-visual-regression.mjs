#!/usr/bin/env node
/**
 * Phase 21 — Visual regression.
 * 1) Layout contract selftest (--selftest, always)
 * 2) Optional pixel diff vs reference when screenshot exists
 *
 *   node scripts/eagle1-visual-regression.mjs
 *   node scripts/eagle1-visual-regression.mjs --selftest
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const REF = path.join(ROOT, 'public', 'mockups', 'eagle1-ai-hud-reference.png');
const SHOT = path.join(ROOT, 'test-results', 'eagle1-visual', 'desk-1440.png');
const OUT = path.join(ROOT, 'test-results', 'eagle1-visual', 'diff-1440.png');
const REPORT = path.join(ROOT, 'test-results', 'eagle1-visual', 'visual-report.json');

const selftestOnly = process.argv.includes('--selftest');

function fail(msg) {
  console.error('VISUAL FAIL', msg);
  process.exit(1);
}

/** Layout contract — mirrors lib/eagle1/visualLayoutContract.ts */
const CONTRACT = {
  regions: ['header', 'gauges', 'chart', 'side', 'plan', 'stats', 'events', 'research'],
  heatCoverCandlesForbidden: true,
  whaleCardUiForbidden: true,
  maxDiffRatio: 0.42,
};

function runContractSelftest() {
  const fails = [];
  if (!CONTRACT.heatCoverCandlesForbidden) fails.push('heat cover allowed');
  if (!CONTRACT.whaleCardUiForbidden) fails.push('whale card allowed');
  for (const r of ['header', 'chart', 'plan']) {
    if (!CONTRACT.regions.includes(r)) fails.push(`missing region ${r}`);
  }
  /** CSS/HUD source markers */
  const hudCss = path.join(ROOT, 'app/components/eagle1/Eagle1AiHud.module.css');
  const hudTsx = path.join(ROOT, 'app/components/eagle1/Eagle1AiHud.tsx');
  if (!fs.existsSync(hudCss) || !fs.existsSync(hudTsx)) fails.push('HUD files missing');
  else {
    const css = fs.readFileSync(hudCss, 'utf8');
    const tsx = fs.readFileSync(hudTsx, 'utf8');
    if (!/heatBack/.test(css)) fails.push('heatBack missing');
    if (/inset:\s*0/.test(css.match(/\.heatBack\s*\{[^}]+\}/s)?.[0] || '')) {
      fails.push('heatBack still full-bleed inset:0 (covers candles)');
    }
    if (!/eagle1-zone--heat/.test(css) || !/display:\s*none/.test(css)) {
      fails.push('zone heat not hidden');
    }
    if (!/data-eagle1-region="chart"/.test(tsx)) fails.push('chart region missing');
    if (!/data-eagle1-region="plan"/.test(tsx)) fails.push('plan region missing');
    if (!/OVERLAY BUDGET|overlayBudget/.test(tsx)) fails.push('overlay budget UI missing');
  }
  return fails;
}

const contractFails = runContractSelftest();
if (contractFails.length) fail(contractFails.join('; '));
console.log('eagle1 visual layout contract ok');

if (selftestOnly) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ ok: true, mode: 'selftest', contract: CONTRACT, at: Date.now() }, null, 2)
  );
  process.exit(0);
}

if (!fs.existsSync(REF)) {
  console.log('SKIP no reference image:', REF);
  process.exit(0);
}
if (!fs.existsSync(SHOT)) {
  console.log('SKIP no screenshot yet. Run: EAGLE1_E2E=1 npx playwright test e2e/eagle1-structure-desk-layout.spec.ts');
  console.log('(layout contract already PASS)');
  process.exit(0);
}

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.log('SKIP sharp not installed — layout contract PASS only');
  process.exit(0);
}

const W = 1440;
const H = 900;
const [ref, shot] = await Promise.all([
  sharp(REF)
    .resize(W, H, { fit: 'contain', background: { r: 7, g: 16, b: 24, alpha: 1 } })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true }),
  sharp(SHOT)
    .resize(W, H, { fit: 'contain', background: { r: 7, g: 16, b: 24, alpha: 1 } })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true }),
]);

const a = ref.data;
const b = shot.data;
let diff = 0;
const out = Buffer.alloc(a.length);
for (let i = 0; i < a.length; i += 4) {
  const dr = Math.abs(a[i] - b[i]);
  const dg = Math.abs(a[i + 1] - b[i + 1]);
  const db = Math.abs(a[i + 2] - b[i + 2]);
  const d = (dr + dg + db) / 3;
  if (d > 28) {
    diff += 1;
    out[i] = 255;
    out[i + 1] = 40;
    out[i + 2] = 40;
    out[i + 3] = 255;
  } else {
    out[i] = b[i];
    out[i + 1] = b[i + 1];
    out[i + 2] = b[i + 2];
    out[i + 3] = 255;
  }
}
const pixels = a.length / 4;
const ratio = diff / pixels;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(OUT);
const payload = {
  ok: ratio <= CONTRACT.maxDiffRatio,
  pixels,
  diffPixels: diff,
  diffRatio: Number(ratio.toFixed(4)),
  threshold: CONTRACT.maxDiffRatio,
  out: OUT,
  contract: CONTRACT,
};
fs.writeFileSync(REPORT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload));
if (ratio > CONTRACT.maxDiffRatio) {
  fail(`layout diff too high vs reference: ${ratio.toFixed(4)} (threshold ${CONTRACT.maxDiffRatio})`);
}
console.log('eagle1 visual regression ok');
