/**
 * 캔들 이벤트 판정 — ①스윕회수 / ②돌파거절 샘플 검증.
 * 실행: npx --yes tsx scripts/_verify_candle_event_verdict.ts
 */
import { buildMergedDeskCandleEventVerdictPack } from '../lib/mergedDeskCandleEventVerdict';
import type { Candle } from '../types';
import type { MergedKeyZone } from '../lib/mergedAnalysisKeyZones';
import type { MtfDumpZoneSpec } from '../lib/mergedDeskMtfDumpZoneBridge';

function bar(t: number, o: number, h: number, l: number, c: number, v = 100): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: v };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function main(): void {
  const base = 77000;
  const candles: Candle[] = [];
  const t0 = 1_700_000_000;
  for (let i = 0; i < 40; i++) {
    const mid = base + Math.sin(i / 5) * 80;
    candles.push(bar(t0 + i * 3600, mid - 20, mid + 40, mid - 40, mid));
  }

  const support = 76800;
  const resist = 77200;
  const i1 = candles.length - 4;
  candles[i1] = bar(
    candles[i1]!.time,
    support + 30,
    support + 60,
    support - 50,
    support + 40
  );
  candles[i1 + 1] = bar(
    candles[i1 + 1]!.time,
    support + 40,
    support + 90,
    support + 10,
    support + 70
  );

  const i2 = candles.length - 2;
  candles[i2] = bar(
    candles[i2]!.time,
    resist - 40,
    resist + 80,
    resist - 60,
    resist - 30
  );

  const keyZones = [
    {
      id: 'd1',
      kind: 'demand',
      pattern: 'support_bounce',
      top: support + 40,
      bot: support - 40,
      price: support,
      labelKo: '지지',
      score: 80,
      bouncePct: 0.5,
      time1: candles[0]!.time,
      time2: candles[candles.length - 1]!.time,
    },
    {
      id: 's1',
      kind: 'supply',
      pattern: 'resist_reject',
      top: resist + 40,
      bot: resist - 40,
      price: resist,
      labelKo: '저항',
      score: 80,
      bouncePct: 0.5,
      time1: candles[0]!.time,
      time2: candles[candles.length - 1]!.time,
    },
  ] as MergedKeyZone[];

  const dumpZones = [
    {
      sourceTf: '1h',
      sourceTfKo: '1시간',
      mid: support,
      top: support + 40,
      bot: support - 40,
      bandRole: 'floor',
      lifeState: 'active',
      evidenceScore: 70,
    },
    {
      sourceTf: '1h',
      sourceTfKo: '1시간',
      mid: resist,
      top: resist + 40,
      bot: resist - 40,
      bandRole: 'ceiling',
      lifeState: 'active',
      evidenceScore: 70,
    },
  ] as MtfDumpZoneSpec[];

  const pack = buildMergedDeskCandleEventVerdictPack({
    candles,
    timeframe: '1h',
    symbol: 'BTCUSDT',
    dumpZones,
    hqZones: [],
    keyZones,
    criticalZones: [],
  });

  console.log('[summary]', pack.summaryKo);
  console.log('[lines]', pack.linesKo.join('\n'));
  console.log(
    '[events]',
    pack.events.map((e) => `${e.kind}/${e.phase}/${e.labelKo}`).join(' | ')
  );

  const sweeps = pack.events.filter((e) => e.kind === 'SWEEP_RECLAIM');
  assert(sweeps.length >= 1, 'expected SWEEP_RECLAIM');
  assert(
    sweeps.some((e) => e.phase === 'OK_REF' || e.phase === 'IN_PROGRESS'),
    'expected sweep OK or IN_PROGRESS'
  );

  const rejects = pack.events.filter((e) => e.kind === 'BREAK_REJECT');
  assert(rejects.length >= 1, 'expected BREAK_REJECT for wick-only break');

  const pack2 = buildMergedDeskCandleEventVerdictPack({
    candles,
    timeframe: '1h',
    symbol: 'BTCUSDT',
    dumpZones,
    keyZones,
  });
  const closedSweeps = pack2.events.filter(
    (e) => e.kind === 'SWEEP_RECLAIM' && e.closed && e.phase === 'OK_REF'
  );
  assert(closedSweeps.length >= 1, 'closed sweep should stay OK_REF (non-repaint)');

  /** ETH급 이상가격 라인은 무시 */
  const bad = buildMergedDeskCandleEventVerdictPack({
    candles,
    timeframe: '1h',
    symbol: 'BTCUSDT',
    keyZones: [
      {
        id: 'bad',
        kind: 'demand',
        pattern: 'support_bounce',
        top: 2500,
        bot: 2400,
        price: 2450,
        labelKo: '이상',
        score: 1,
        bouncePct: 0,
        time1: candles[0]!.time,
        time2: candles[candles.length - 1]!.time,
      } as MergedKeyZone,
    ],
  });
  assert(
    !bad.events.some((e) => e.linePrice < 10000),
    'BTC should ignore ETH-scale ref lines'
  );

  console.log('[ok] candle event verdict cases passed');
}

main();
