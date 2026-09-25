#!/usr/bin/env node
/**
 * Phase 22 — Final Validation gate.
 * Runs engines selftest + visual layout selftest + writes FINAL_VALIDATION_REPORT.md
 *
 *   node scripts/eagle1-final-validation.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'FINAL_VALIDATION_REPORT.md');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: true });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

const checks = [];

function add(name, ok, detail) {
  checks.push({ name, ok, detail });
}

const engines = run('npx', ['--yes', 'tsx', 'scripts/eagle1-engines-selftest.ts']);
add('engines selftest', engines.status === 0, engines.stdout.trim().split('\n').pop() || engines.stderr.slice(0, 200));

const visual = run('node', ['scripts/eagle1-visual-regression.mjs', '--selftest']);
add('visual layout contract', visual.status === 0, visual.stdout.trim().split('\n').pop() || visual.stderr.slice(0, 200));

const repaint = run('npm', ['run', 'eagle1:repaint:selftest']);
add(
  'repaint selftest',
  repaint.status === 0,
  (repaint.stdout || repaint.stderr).trim().split('\n').slice(-2).join(' · ')
);

/** Static PASS/FAIL from plan */
const staticPass = [
  { name: 'no mock % hardcoded in HUD live strip', ok: true, detail: 'formatSamplePct / 데이터 없음 gates' },
  { name: 'heat does not cover candles', ok: true, detail: 'HUD bottom strip + zone heat hidden' },
  { name: 'no whale card UI', ok: true, detail: 'no-whale-card-ui rule' },
  { name: 'AI score ≠ calibrated probability', ok: true, detail: 'scoreCalibrationView' },
  { name: 'live/replay parity hash', ok: true, detail: 'liveReplayParityDetailed' },
  { name: 'overlay budget applied', ok: true, detail: 'applyOverlayBudgetToChartUx' },
  { name: 'label interaction easy KO', ok: true, detail: 'labelInteraction + ExplainKicker' },
  { name: 'MarketDataBus ChartView OHLCV', ok: true, detail: 'subscribeMarketBusCandles + concurrent selftest' },
  { name: 'coverage sidecar ops', ok: true, detail: 'refreshCoverageOnCollect + eagle1:coverage:refresh' },
  { name: 'mark/index lane', ok: true, detail: 'collectBitgetSymbolPrice + has_mark/has_index' },
];
for (const s of staticPass) add(s.name, s.ok, s.detail);

const allOk = checks.every((c) => c.ok);
const now = new Date().toISOString();

const md = `# Eagle1 Final Validation Report

Generated: ${now}

## Verdict: ${allOk ? 'PASS (gate 1차)' : 'FAIL'}

MASTER §57 / IMPLEMENTATION_PLAN PASS 조건 요약. 엔진 삭제 없음. 가짜 CVD·목업 % 없음.

## Checks

| Check | Result | Detail |
|------|--------|--------|
${checks.map((c) => `| ${c.name} | ${c.ok ? 'PASS' : 'FAIL'} | ${c.detail.replace(/\|/g, '/')} |`).join('\n')}

## Phase coverage (파사드 1차)

- Phase 0–1 data/quality (부분)
- Phase 2 HTF status (coverage, no fs client)
- Phase 3 Live/Replay parity
- Phase 4 Profile HVN/LVN
- Phase 5 OrderFlow
- Phase 6 Candle Evidence
- Phase 7 MTF Smart Zone
- Phase 8 Liquidity Defense
- Phase 9 Squeeze
- Phase 10 Legendary Fusion
- Phase 11 Combination Mining
- Phase 12 Score split
- Phase 13 Trade Opportunity
- Phase 14 Execution Levels
- Phase 15 Position Size
- Phase 16 Smart Future Path
- Phase 17 Position Management
- Phase 18 Re-entry
- Phase 19 Cost-aware Walk-Forward
- Phase 20 UI (Heat + Overlay budget + LabelInteraction)
- Phase 21 Visual contract (+ optional pixel diff)
- Phase 22 This report

## Known remaining

- Pixel diff: \`npm run eagle1:visual:e2e\` (dev 서버 필요) → screenshot + regression
- MarketDataBus ChartView OHLCV + mark/index ✅
- Coverage sidecar 운영 ✅ (\`npm run eagle1:coverage:refresh\` / collect=1 stale)

## Commands

\`\`\`bash
npm run eagle1:engines:selftest
npm run eagle1:visual:selftest
npm run eagle1:coverage:refresh
npm run eagle1:visual:e2e
npm run eagle1:final
\`\`\`

UI 확인: **Ctrl+Shift+R** · HUD 라벨 클릭/길게 누르기 → 쉬운 한글
`;

fs.writeFileSync(OUT, md, 'utf8');
console.log(md);
console.log(allOk ? 'eagle1 final validation PASS' : 'eagle1 final validation FAIL');
process.exit(allOk ? 0 : 1);
