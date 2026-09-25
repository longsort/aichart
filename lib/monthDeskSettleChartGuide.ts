/**
 * 마감·안착 — 차트용 한눈에 가이드 (3단계 + 체크리스트 + 마커).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  buildSettleLevelProbes,
  evaluateSettleBreak,
  findLastBreakIndex,
  isFakeBreakoutCandle,
  settleHoldBarsForTf,
  type SettleBreakSnapshot,
  type SettleLevelProbe,
} from '@/lib/monthDeskSettleProbe';
export type MonthDeskSettleChartMarker = {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
  detailKo?: string;
  size?: number;
  priority: number;
};

export type SettleGuideStep = 'wait' | 'break' | 'settle' | 'confirm' | 'failed' | 'fake';

export type MonthDeskSettleChartGuide = {
  step: SettleGuideStep;
  stepIndex: 0 | 1 | 2 | 3;
  stepKo: string;
  headlineKo: string;
  sublineKo: string;
  levelKo: string;
  levelPrice: number | null;
  bias: 'LONG' | 'SHORT' | 'NONE';
  holdNeed: number;
  checklist: Array<{ label: string; done: boolean }>;
  legend: Array<{ swatch: string; label: string }>;
};

const TAIL_BARS = 160;
const MIN_MARKER_GAP_BARS = 5;

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return '–';
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(4);
  if (a >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function engineProbe(sz: NonNullable<AnalyzeResponse['settlementZone']>): SettleLevelProbe | null {
  if (sz.level == null || !Number.isFinite(sz.level)) return null;
  return {
    key: 'engine',
    levelKo: '안착존',
    level: sz.level,
    dir: sz.direction === 'SHORT' ? 'below' : 'above',
    weight: 100,
  };
}

/** 플랜·엔진 중 가장 유효한 돌파 스냅샷 1개 */
export function pickBestSettleSnapshot(
  candles: Candle[],
  pack: OverlayItem[],
  opts?: { timeframe?: string; analysis?: AnalyzeResponse | null }
): SettleBreakSnapshot | null {
  const evalOpts = {
    useLastBreak: true,
    holdBars: settleHoldBarsForTf(opts?.timeframe),
    timeframe: opts?.timeframe,
  };
  let best: SettleBreakSnapshot | null = null;
  let bestW = 0;

  const sz = opts?.analysis?.settlementZone;
  if (sz && sz.state !== 'none') {
    const ep = engineProbe(sz);
    if (ep) {
      const snap = evaluateSettleBreak(candles, ep, evalOpts);
      if (snap && ep.weight > bestW) {
        bestW = ep.weight;
        best = snap;
      }
    }
  }

  for (const probe of buildSettleLevelProbes(pack)) {
    const snap = evaluateSettleBreak(candles, probe, evalOpts);
    if (!snap) continue;
    if (probe.weight > bestW) {
      bestW = probe.weight;
      best = snap;
    }
  }
  return best;
}

function resolveGuideStep(snap: SettleBreakSnapshot | null): {
  step: SettleGuideStep;
  stepIndex: 0 | 1 | 2 | 3;
  stepKo: string;
} {
  if (!snap) {
    return { step: 'wait', stepIndex: 0, stepKo: '대기' };
  }
  if (snap.fakeBreak) {
    return { step: 'fake', stepIndex: 0, stepKo: '가짜 돌파' };
  }
  if (!snap.stillAbove || snap.retest.violated) {
    return { step: 'failed', stepIndex: 0, stepKo: '안착 실패' };
  }
  const holdOk = snap.holdN ?? snap.hold2;
  const retestOk = !snap.retest.touched || !snap.retest.violated;
  const confirmed =
    (snap.confirmIdx >= 0 && snap.confirmIdx > snap.breakIdx) ||
    (holdOk && snap.breakVolOk && retestOk);
  if (confirmed) {
    return { step: 'confirm', stepIndex: 3, stepKo: '3단계 · 확인' };
  }
  if (holdOk) {
    return { step: 'settle', stepIndex: 2, stepKo: '2단계 · 안착' };
  }
  return { step: 'break', stepIndex: 1, stepKo: '1단계 · 돌파' };
}

function buildChecklist(snap: SettleBreakSnapshot | null, holdNeed: number): MonthDeskSettleChartGuide['checklist'] {
  if (!snap) {
    return [
      { label: '레벨 돌파(종가)', done: false },
      { label: `${holdNeed}봉 종가 유지`, done: false },
      { label: '돌파봉 거래량 1.5×', done: false },
      { label: '리테스트 유지', done: false },
    ];
  }
  const holdOk = snap.holdN ?? snap.hold2;
  const retestOk = !snap.retest.touched || !snap.retest.violated;
  const confirmed =
    snap.confirmIdx >= snap.breakIdx + 1 || (holdOk && snap.breakVolOk && retestOk && snap.stillAbove);
  return [
    { label: '레벨 돌파(종가)', done: snap.breakIdx >= 0 && !snap.fakeBreak },
    { label: `${holdNeed}봉 종가 유지`, done: holdOk },
    { label: '돌파봉 거래량 1.5×', done: snap.breakVolOk },
    { label: '리테스트·BOS 확인', done: retestOk && (confirmed || snap.confirmIdx >= 0) },
  ];
}

function markerPos(dir: 'above' | 'below', step: 'break' | 'hold' | 'confirm' | 'fail'): 'aboveBar' | 'belowBar' {
  if (step === 'fail') return dir === 'above' ? 'aboveBar' : 'belowBar';
  return dir === 'above' ? 'belowBar' : 'aboveBar';
}

function markersFromSnap(candles: Candle[], snap: SettleBreakSnapshot): MonthDeskSettleChartMarker[] {
  const out: MonthDeskSettleChartMarker[] = [];
  const dir = snap.probe.dir;
  const bull = dir === 'above';
  const bi = snap.breakIdx;
  const levelKo = snap.probe.levelKo;
  const price = fmtPrice(snap.probe.level);

  if (snap.fakeBreak || (isFakeBreakoutCandle(candles[bi]!, snap.probe.level, dir) && !snap.stillAbove)) {
    out.push({
      time: Number(candles[bi]?.time),
      position: markerPos(dir, 'fail'),
      shape: 'square',
      color: '#F87171',
      text: '가짜돌파',
      detailKo: `${levelKo} ${price} — 꼬리만 돌파, 종가는 레벨 안쪽 · 참고`,
      size: 1,
      priority: 88,
    });
    return out;
  }

  out.push({
    time: Number(candles[bi]?.time),
    position: markerPos(dir, 'break'),
    shape: 'circle',
    color: bull ? '#FACC15' : '#FB923C',
    text: snap.breakVolOk ? '1·돌파' : '1·돌파↓량',
    detailKo: `${levelKo} ${price} — 종가 ${bull ? '상향' : '하향'} 돌파${snap.breakVolOk ? ' · 거래량 OK' : ' · 거래량 약함'}`,
    size: 1,
    priority: 70,
  });

  const holdIdx = bi + 1;
  if (holdIdx < candles.length && snap.stillAbove) {
    const eps = Math.max(Math.abs(snap.probe.level) * 0.00035, 1e-8);
    const cl = Number(candles[holdIdx]?.close);
    const holdOk = bull ? cl >= snap.probe.level - eps : cl <= snap.probe.level + eps;
    if (holdOk) {
      out.push({
        time: Number(candles[holdIdx]?.time),
        position: markerPos(dir, 'hold'),
        shape: 'circle',
        color: bull ? '#22C55E' : '#EF4444',
        text: '2·안착',
        detailKo: `다음 봉 종가도 ${price} ${bull ? '위' : '아래'} 유지 — 안착 확인`,
        size: 1,
        priority: 82,
      });
    }
  }

  if (snap.confirmIdx >= 0 && snap.confirmIdx > bi) {
    out.push({
      time: Number(candles[snap.confirmIdx]?.time),
      position: markerPos(dir, 'confirm'),
      shape: 'square',
      color: bull ? '#4ADE80' : '#FCA5A5',
      text: '3·확인',
      detailKo: `돌파봉 고저 재돌파(BOS) — ${bull ? '상승' : '하락'} 추세 전환 참고`,
      size: 1,
      priority: 95,
    });
  } else if (snap.holdN && snap.breakVolOk && snap.stillAbove) {
    const ci = bi + (snap.holdNeed ?? 2);
    if (ci < candles.length) {
      out.push({
        time: Number(candles[ci]?.time),
        position: markerPos(dir, 'confirm'),
        shape: 'square',
        color: bull ? '#4ADE80' : '#FCA5A5',
        text: '3·확인',
        detailKo: `${snap.holdNeed ?? 2}봉 종가 유지 + 거래량 — 안착 확정 참고`,
        size: 1,
        priority: 90,
      });
    }
  }

  if (snap.retest.retestIdx >= 0) {
    const ri = snap.retest.retestIdx;
    const ok = !snap.retest.violated && snap.stillAbove;
    out.push({
      time: Number(candles[ri]?.time),
      position: markerPos(dir, ok ? 'hold' : 'fail'),
      shape: 'circle',
      color: ok ? '#2DD4BF' : '#94A3B8',
      text: ok ? '재시험✓' : '재시험✗',
      detailKo: ok
        ? `레벨 ${price} 재터치 후 종가 유지 — 지지·저항 전환 참고`
        : `레벨 ${price} 재터치 후 종가 이탈 — 돌파 실패 참고`,
      size: 1,
      priority: ok ? 76 : 85,
    });
  }

  return out.filter((m) => Number.isFinite(m.time));
}

function dedupeMarkers(rows: MonthDeskSettleChartMarker[], candles: Candle[]): MonthDeskSettleChartMarker[] {
  const idxByTime = new Map<number, number>();
  candles.forEach((c, i) => idxByTime.set(Number(c.time), i));
  const byTime = new Map<number, MonthDeskSettleChartMarker>();
  for (const m of rows) {
    const prev = byTime.get(m.time);
    if (!prev || m.priority > prev.priority) byTime.set(m.time, m);
  }
  const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);
  const out: MonthDeskSettleChartMarker[] = [];
  let lastIdx = -999;
  for (const m of sorted) {
    const ci = idxByTime.get(m.time) ?? -1;
    if (ci >= 0 && ci - lastIdx < MIN_MARKER_GAP_BARS) continue;
    out.push(m);
    if (ci >= 0) lastIdx = ci;
  }
  return out;
}

export function buildMonthDeskSettleChartGuide(
  candles: Candle[],
  pack: OverlayItem[],
  opts?: {
    timeframe?: string;
    analysis?: AnalyzeResponse | null;
    tailBars?: number;
  }
): { guide: MonthDeskSettleChartGuide; markers: MonthDeskSettleChartMarker[] } | null {
  if (candles.length < 6) return null;
  const tailN = Math.max(40, opts?.tailBars ?? TAIL_BARS);
  const tail = candles.slice(Math.max(0, candles.length - tailN));
  const holdNeed = settleHoldBarsForTf(opts?.timeframe);
  const snap = pickBestSettleSnapshot(tail, pack, opts);

  const { step, stepIndex, stepKo } = resolveGuideStep(snap);
  const bias: 'LONG' | 'SHORT' | 'NONE' =
    snap?.probe.dir === 'above' ? 'LONG' : snap?.probe.dir === 'below' ? 'SHORT' : 'NONE';
  const levelKo = snap?.probe.levelKo ?? '진입·저항';
  const levelPrice = snap?.probe.level ?? null;

  let headlineKo = '아직 돌파 없음 — 플랜 라인·존을 기다리는 중';
  let sublineKo = `종가 기준 · ${holdNeed}봉 유지 · 거래량 1.5× 참고`;
  if (snap) {
    const p = fmtPrice(levelPrice);
  const dirKo = bias === 'LONG' ? '상향' : bias === 'SHORT' ? '하향' : '';
    switch (step) {
      case 'fake':
        headlineKo = `${levelKo} ${p} — 가짜 돌파 (꼬리만)`;
        sublineKo = '몸통 종가가 레벨 안쪽이면 신뢰 낮음';
        break;
      case 'failed':
        headlineKo = `${levelKo} ${p} — 안착 실패`;
        sublineKo = '종가가 다시 레벨 반대편으로 마감';
        break;
      case 'break':
        headlineKo = `${levelKo} ${p} — 1단계 돌파`;
        sublineKo = snap.breakVolOk
          ? '다음 봉도 종가 유지되는지 확인'
          : '돌파는 됐으나 거래량 약함 — 추가 확인 필요';
        break;
      case 'settle':
        headlineKo = `${levelKo} ${p} — 2단계 안착 중`;
        sublineKo = `${holdNeed}봉 연속 종가 ${dirKo} 유지 검증`;
        break;
      case 'confirm':
        headlineKo = `${levelKo} ${p} — 3단계 확인`;
        sublineKo = bias === 'LONG' ? '저항→지지 전환 참고' : '지지→저항 전환 참고';
        break;
      default:
        break;
    }
  }

  const guide: MonthDeskSettleChartGuide = {
    step,
    stepIndex,
    stepKo,
    headlineKo,
    sublineKo,
    levelKo,
    levelPrice,
    bias,
    holdNeed,
    checklist: buildChecklist(snap, holdNeed),
    legend: [
      { swatch: '#FACC15', label: '1·돌파 봉' },
      { swatch: '#22C55E', label: '2·안착 봉' },
      { swatch: '#4ADE80', label: '3·확인 봉' },
      { swatch: '#F87171', label: '가짜·실패' },
    ],
  };

  const markers: MonthDeskSettleChartMarker[] = [];
  if (snap) markers.push(...markersFromSnap(tail, snap));

  for (const probe of buildSettleLevelProbes(pack)) {
    const bi = findLastBreakIndex(tail, probe.level, probe.dir);
    if (bi < 0) continue;
    const c = tail[bi]!;
    if (!isFakeBreakoutCandle(c, probe.level, probe.dir)) continue;
    if (snap && snap.breakIdx === bi && snap.probe.level === probe.level) continue;
    markers.push({
      time: Number(c.time),
      position: markerPos(probe.dir, 'fail'),
      shape: 'square',
      color: '#F87171',
      text: '가짜돌파',
      detailKo: `${probe.levelKo} ${fmtPrice(probe.level)} — 꼬리 돌파·종가 실패`,
      size: 1,
      priority: 86,
    });
  }

  return { guide, markers: dedupeMarkers(markers, tail) };
}

export function settleMarkerDetailLine(marker: MonthDeskSettleChartMarker): string {
  return marker.detailKo || `마감·안착 ${marker.text}`;
}
