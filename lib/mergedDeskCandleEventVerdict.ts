/**
 * 통합·분석 — 캔들 이벤트 판정 (스윕회수 · 돌파안착 · 지지반등 · 돌파거절).
 * 봉 마감 전=진행중 · 마감 후만 안착/실패 참고. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { HqEntryZone } from '@/lib/mergedDeskHqEntryZones';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { detectMonthDeskMoneyZones, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import {
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
} from '@/lib/telegramSymbolPriceGuard';

function workCandles(candles: Candle[]): Candle[] {
  if (candles.length <= 420) return candles;
  return candles.slice(-420);
}

export type CandleEventKind =
  | 'SWEEP_RECLAIM'
  | 'BREAK_SETTLE'
  | 'BREAK_REJECT'
  | 'SUPPORT_BOUNCE';

export type CandleEventPhase = 'WATCH' | 'IN_PROGRESS' | 'OK_REF' | 'FAIL_REF';

export type CandleEventRefLine = {
  id: string;
  price: number;
  role: 'support' | 'resist';
  sourceKo: string;
};

export type CandleEventVerdict = {
  time: number;
  kind: CandleEventKind;
  phase: CandleEventPhase;
  linePrice: number;
  sourceKo: string;
  labelKo: string;
  nextCheckKo: string;
  isLastBar: boolean;
  /** 과거 봉은 true · 마지막 미마감 봉은 false */
  closed: boolean;
};

export type CandleEventVerdictPack = {
  events: CandleEventVerdict[];
  summaryKo: string;
  linesKo: string[];
  /** 텔레 전이 감지용 */
  fingerprint: string;
};

function estimateAtr(candles: Candle[], endIdx: number, period = 14): number {
  const start = Math.max(1, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[endIdx]?.close ?? 1) * 0.01;
}

function fmt(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function priceOk(symbol: string, anchor: number, p: number): boolean {
  if (!(p > 0) || !Number.isFinite(p)) return false;
  if (symbol && !telegramAssetPricePlausible(symbol, p)) return false;
  if (anchor > 0 && !telegramPriceCompatibleWithAnchor(anchor, p, 3)) return false;
  return true;
}

function collectRefLines(params: {
  symbol: string;
  price: number;
  candles: Candle[];
  chartTf: string;
  dumpZones?: MtfDumpZoneSpec[] | null;
  hqZones?: HqEntryZone[] | null;
  keyZones?: MergedKeyZone[] | null;
  criticalZones?: MergedCriticalZone[] | null;
  /** 파랑빨강띠 LOCK 레일 */
  rbRails?: Array<{ tipUpper: number; tipLower: number; descending?: boolean; horizonKo?: string }> | null;
}): CandleEventRefLine[] {
  const { symbol, price, candles, chartTf } = params;
  const out: CandleEventRefLine[] = [];
  const push = (id: string, px: number, role: 'support' | 'resist', sourceKo: string) => {
    if (!priceOk(symbol, price, px)) return;
    if (out.some((r) => r.role === role && Math.abs(r.price - px) / Math.max(px, 1) < 0.0015)) return;
    out.push({ id, price: px, role, sourceKo });
  };

  for (const g of params.rbRails ?? []) {
    const tag = g.horizonKo || '채널';
    push(`rb-u-${g.tipUpper}`, g.tipUpper, 'resist', `${tag}상단레일`);
    push(`rb-l-${g.tipLower}`, g.tipLower, 'support', `${tag}하단레일`);
  }

  for (const z of params.dumpZones ?? []) {
    const lo = Math.min(z.bot, z.top);
    const hi = Math.max(z.bot, z.top);
    if (z.bandRole === 'ceiling') {
      push(`dump-c-${z.sourceTf}-${hi}`, hi, 'resist', `${z.sourceTfKo || z.sourceTf} 저항·폭락감시`);
    } else {
      push(`dump-f-${z.sourceTf}-${lo}`, lo, 'support', `${z.sourceTfKo || z.sourceTf} 지지·폭락`);
    }
  }

  try {
    const money = detectMonthDeskMoneyZones(candles, chartTf);
    for (const p of money.pools.slice(0, 6)) {
      if (p.side === 'LONG') {
        push(`$$$$-l-${p.priceMid}`, p.priceBot, 'support', `${MONTH_DESK_MONEY_LABEL}롱`);
      } else {
        push(`$$$$-s-${p.priceMid}`, p.priceTop, 'resist', `${MONTH_DESK_MONEY_LABEL}숏`);
      }
    }
  } catch {
    /* optional */
  }

  for (const z of params.hqZones ?? []) {
    if (z.side === 'LONG') {
      push(`hq-l-${z.id}`, z.bot, 'support', `HQ ${z.grade}롱`);
    } else {
      push(`hq-s-${z.id}`, z.top, 'resist', `HQ ${z.grade}숏`);
    }
  }

  for (const z of params.criticalZones ?? []) {
    if (z.kind === 'demand') push(`crit-d-${z.bot}`, z.bot, 'support', '핵심수요');
    if (z.kind === 'supply') push(`crit-s-${z.top}`, z.top, 'resist', '핵심공급');
  }

  for (const z of params.keyZones ?? []) {
    if (z.kind === 'demand') push(`key-d-${z.bot}`, z.bot, 'support', '키존지지');
    if (z.kind === 'supply') push(`key-s-${z.top}`, z.top, 'resist', '키존저항');
  }

  /** 가격 근처 우선 · 역할별 최대 4 */
  const near = (r: CandleEventRefLine) => Math.abs(r.price - price) / Math.max(price, 1);
  const supports = out
    .filter((r) => r.role === 'support')
    .sort((a, b) => near(a) - near(b))
    .slice(0, 4);
  const resists = out
    .filter((r) => r.role === 'resist')
    .sort((a, b) => near(a) - near(b))
    .slice(0, 4);
  return [...supports, ...resists];
}

function labelFor(
  kind: CandleEventKind,
  phase: CandleEventPhase,
  isLast: boolean
): { labelKo: string; nextCheckKo: string } {
  const pending = isLast && (phase === 'IN_PROGRESS' || phase === 'WATCH');
  if (kind === 'SWEEP_RECLAIM') {
    if (phase === 'OK_REF') {
      return {
        labelKo: '①스윕회수·안착참고',
        nextCheckKo: '기준선 종가 위 유지 확인',
      };
    }
    if (phase === 'FAIL_REF') {
      return {
        labelKo: '①스윕실패·붕괴쪽',
        nextCheckKo: '기준선 종가 재탈환 전 롱 추격 비권장',
      };
    }
    return {
      labelKo: pending ? '①스윕회수·진행…' : '①스윕회수·진행',
      nextCheckKo: '다음 종가가 기준선 위면 안착참고',
    };
  }
  if (kind === 'BREAK_SETTLE') {
    if (phase === 'OK_REF') {
      return {
        labelKo: '②돌파안착·참고',
        nextCheckKo: '리테스트 종가 방어 유지',
      };
    }
    if (phase === 'FAIL_REF') {
      return {
        labelKo: '②돌파실패·되돌림',
        nextCheckKo: '저항 재돌파·종가 확인 전 추격 비권장',
      };
    }
    return {
      labelKo: pending ? '②돌파시도·미안착…' : '②돌파시도·미안착',
      nextCheckKo: '리테스트 종가 방어 또는 연속 종가 위면 안착참고',
    };
  }
  if (kind === 'BREAK_REJECT') {
    return {
      labelKo: '②돌파거절',
      nextCheckKo: '고가만 돌파·종가 아래 · 돌파 추격 비권장',
    };
  }
  return {
    labelKo: pending ? '②지지반등·참고…' : '②지지반등·참고',
    nextCheckKo: '저항 종가 돌파 전 · 지지반등으로 구분',
  };
}

function markerText(kind: CandleEventKind, phase: CandleEventPhase, isLast: boolean): string {
  const dots = isLast && (phase === 'IN_PROGRESS' || phase === 'WATCH') ? '…' : '';
  if (kind === 'SWEEP_RECLAIM') {
    if (phase === 'OK_REF') return '①스윕OK';
    if (phase === 'FAIL_REF') return '①스윕X';
    return `①스윕${dots}`;
  }
  if (kind === 'BREAK_SETTLE') {
    if (phase === 'OK_REF') return '②안착';
    if (phase === 'FAIL_REF') return '②실패';
    return `②돌파${dots}`;
  }
  if (kind === 'BREAK_REJECT') return '②거절';
  return `②지지반등${dots}`;
}

/**
 * 스윕회수 / 돌파안착 / 지지반등 / 돌파거절 스캔.
 * 과거 봉 phase는 고정(리페인트 최소화) · 마지막 봉만 진행중 갱신.
 */
export function buildMergedDeskCandleEventVerdictPack(params: {
  candles: Candle[];
  timeframe: string;
  symbol?: string;
  dumpZones?: MtfDumpZoneSpec[] | null;
  hqZones?: HqEntryZone[] | null;
  keyZones?: MergedKeyZone[] | null;
  criticalZones?: MergedCriticalZone[] | null;
  lookback?: number;
  rbRails?: Array<{ tipUpper: number; tipLower: number; descending?: boolean; horizonKo?: string }> | null;
}): CandleEventVerdictPack {
  const chartTf = normalizeChartTimeframe(params.timeframe);
  const source = workCandles(params.candles);
  const empty: CandleEventVerdictPack = {
    events: [],
    summaryKo: '캔들이벤트 · 이번 스냅 미검출',
    linesKo: ['캔들이벤트 · 미검출'],
    fingerprint: 'none',
  };
  if (source.length < 24) return empty;

  const last = source[source.length - 1]!;
  const price = last.close;
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const lines = collectRefLines({
    symbol,
    price,
    candles: source,
    chartTf,
    dumpZones: params.dumpZones,
    hqZones: params.hqZones,
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    rbRails: params.rbRails,
  });
  if (!lines.length) return empty;

  const supports = lines.filter((l) => l.role === 'support');
  const resists = lines.filter((l) => l.role === 'resist');
  const lookback = Math.min(source.length - 2, params.lookback ?? 48);
  const start = Math.max(1, source.length - lookback);
  const events: CandleEventVerdict[] = [];

  for (let i = start; i < source.length; i++) {
    const bar = source[i]!;
    const t = Number(bar.time);
    if (!Number.isFinite(t)) continue;
    const isLast = i === source.length - 1;
    const closed = !isLast;
    const atr = estimateAtr(source, i);
    const eps = Math.max(atr * 0.05, price * 0.00015);
    /** 살짝 관통 — ATR 과대면 스윕이 전부 실패하므로 별도 ε */
    const pierceEps = Math.max(atr * 0.012, price * 0.00006);
    const next = i + 1 < source.length ? source[i + 1]! : null;
    const next2 = i + 2 < source.length ? source[i + 2]! : null;

    /** —— ① 스윕회수 (하방 살짝 관통 · 종가 위) —— */
    let bestSweep: CandleEventRefLine | null = null;
    let bestSweepDist = Infinity;
    for (const s of supports) {
      if (bar.low < s.price - pierceEps && bar.close >= s.price) {
        const d = Math.abs(s.price - bar.close);
        if (d < bestSweepDist) {
          bestSweepDist = d;
          bestSweep = s;
        }
      }
    }
    if (bestSweep) {
      let phase: CandleEventPhase = 'IN_PROGRESS';
      if (closed && next) {
        if (next.close >= bestSweep.price) {
          phase = 'OK_REF';
          if (next2 && next2.close < bestSweep.price) phase = 'FAIL_REF';
        } else {
          phase = 'FAIL_REF';
        }
      }
      const { labelKo, nextCheckKo } = labelFor('SWEEP_RECLAIM', phase, isLast);
      events.push({
        time: t,
        kind: 'SWEEP_RECLAIM',
        phase,
        linePrice: bestSweep.price,
        sourceKo: bestSweep.sourceKo,
        labelKo,
        nextCheckKo,
        isLastBar: isLast,
        closed,
      });
    }

    /** —— ② 돌파거절 / 돌파시도 / 지지반등 —— */
    let bestResist: CandleEventRefLine | null = null;
    let bestResistDist = Infinity;
    for (const r of resists) {
      const d = Math.abs(r.price - price);
      if (d < bestResistDist) {
        bestResistDist = d;
        bestResist = r;
      }
    }
    let bestSup: CandleEventRefLine | null = null;
    let bestSupDist = Infinity;
    for (const s of supports) {
      const d = Math.abs(s.price - price);
      if (d < bestSupDist) {
        bestSupDist = d;
        bestSup = s;
      }
    }

    if (bestResist) {
      /** 봉 종가 기준 최근접 저항 */
      let localResist = bestResist;
      let localDist = Math.abs(bestResist.price - bar.close);
      for (const r of resists) {
        const d = Math.abs(r.price - bar.close);
        if (d < localDist) {
          localDist = d;
          localResist = r;
        }
      }
      const wickAboveL = bar.high > localResist.price + eps;
      const closeAboveL = bar.close > localResist.price;
      const closeBelowL = bar.close < localResist.price;

      if (wickAboveL && closeBelowL) {
        const { labelKo, nextCheckKo } = labelFor('BREAK_REJECT', 'OK_REF', isLast);
        events.push({
          time: t,
          kind: 'BREAK_REJECT',
          phase: 'OK_REF',
          linePrice: localResist.price,
          sourceKo: localResist.sourceKo,
          labelKo,
          nextCheckKo,
          isLastBar: isLast,
          closed,
        });
      } else if (closeAboveL) {
        let phase: CandleEventPhase = 'IN_PROGRESS';
        if (closed && next) {
          const hold =
            next.close >= localResist.price ||
            (next.low <= localResist.price + eps && next.close >= localResist.price);
          const twoHold = next2 ? next2.close >= localResist.price : hold;
          phase = hold || twoHold ? 'OK_REF' : 'FAIL_REF';
        }
        const { labelKo, nextCheckKo } = labelFor('BREAK_SETTLE', phase, isLast);
        events.push({
          time: t,
          kind: 'BREAK_SETTLE',
          phase,
          linePrice: localResist.price,
          sourceKo: localResist.sourceKo,
          labelKo,
          nextCheckKo,
          isLastBar: isLast,
          closed,
        });
      }
    }

    /** 지지반등: 저항 종가 미돌파 + 지지 wick/근접 반등 */
    if (bestSup) {
      let localSup = bestSup;
      let localSupDist = Math.abs(bestSup.price - bar.close);
      for (const s of supports) {
        const d = Math.abs(s.price - bar.close);
        if (d < localSupDist) {
          localSupDist = d;
          localSup = s;
        }
      }
      const nearSup =
        bar.low <= localSup.price + eps * 2 && bar.close >= localSup.price;
      const localResistNear = resists
        .slice()
        .sort((a, b) => Math.abs(a.price - bar.close) - Math.abs(b.price - bar.close))[0];
      const notBreakResist =
        !localResistNear || bar.close <= localResistNear.price;
      const bounced = bar.close > bar.open || bar.close > (bar.low + bar.high) / 2;
      if (nearSup && notBreakResist && bounced && !bestSweep) {
        const hasBreakSettle = events.some(
          (e) => e.time === t && e.kind === 'BREAK_SETTLE' && e.phase === 'IN_PROGRESS'
        );
        if (hasBreakSettle) {
          const idx = events.findIndex(
            (e) => e.time === t && e.kind === 'BREAK_SETTLE' && e.phase === 'IN_PROGRESS'
          );
          if (idx >= 0) events.splice(idx, 1);
        }
        const { labelKo, nextCheckKo } = labelFor('SUPPORT_BOUNCE', 'OK_REF', isLast);
        events.push({
          time: t,
          kind: 'SUPPORT_BOUNCE',
          phase: isLast ? 'IN_PROGRESS' : 'OK_REF',
          linePrice: localSup.price,
          sourceKo: localSup.sourceKo,
          labelKo,
          nextCheckKo,
          isLastBar: isLast,
          closed,
        });
      }
    }
  }

  /** 봉당 주이벤트 1~2개 (스윕 + 상방 중 우선순위) */
  const byTime = new Map<number, CandleEventVerdict[]>();
  for (const e of events) {
    const list = byTime.get(e.time) ?? [];
    list.push(e);
    byTime.set(e.time, list);
  }
  const rank = (e: CandleEventVerdict) => {
    if (e.kind === 'SWEEP_RECLAIM') return 4;
    if (e.kind === 'BREAK_SETTLE' && e.phase === 'OK_REF') return 3;
    if (e.kind === 'SUPPORT_BOUNCE') return 3;
    if (e.kind === 'BREAK_REJECT') return 2;
    if (e.kind === 'BREAK_SETTLE') return 2;
    return 1;
  };
  const trimmed: CandleEventVerdict[] = [];
  for (const [, list] of byTime) {
    list.sort((a, b) => rank(b) - rank(a));
    trimmed.push(...list.slice(0, 2));
  }
  trimmed.sort((a, b) => a.time - b.time);

  const recent = trimmed.slice(-12);
  const lastFew = recent.filter((e) => e.isLastBar || e.phase === 'OK_REF' || e.phase === 'FAIL_REF');
  const show = lastFew.length ? lastFew.slice(-4) : recent.slice(-3);

  const linesKo: string[] = ['캔들이벤트 · 참고(확정수익아님)'];
  for (const e of show) {
    linesKo.push(
      `· ${e.labelKo} · ${e.sourceKo} ${fmt(e.linePrice)} · ${e.nextCheckKo}`
    );
  }
  if (show.length === 0) {
    linesKo.push('· 최근 스윕·돌파안착·지지반등 미검출');
  }

  const summaryKo =
    show.length > 0
      ? show
          .map((e) => e.labelKo)
          .slice(0, 2)
          .join(' · ')
      : '캔들이벤트 미검출';

  const fingerprint = show
    .map((e) => `${e.time}:${e.kind}:${e.phase}:${Math.round(e.linePrice)}`)
    .join('|');

  return {
    events: recent,
    summaryKo,
    linesKo: linesKo.slice(0, 6),
    fingerprint: fingerprint || 'none',
  };
}

export function candleEventMarkerText(
  kind: CandleEventKind,
  phase: CandleEventPhase,
  isLastBar: boolean
): string {
  return markerText(kind, phase, isLastBar);
}

export function summarizeCandleEventVerdictKo(pack: CandleEventVerdictPack | null | undefined): string {
  if (!pack?.events?.length) return '';
  return pack.summaryKo;
}

/** 텔레그램 — 의미 있는 전이만 (안착참고·실패) */
export function candleEventEmitWorthy(pack: CandleEventVerdictPack | null | undefined): boolean {
  if (!pack?.events?.length) return false;
  return pack.events.some(
    (e) =>
      (e.phase === 'OK_REF' || e.phase === 'FAIL_REF') &&
      (e.kind === 'SWEEP_RECLAIM' ||
        e.kind === 'BREAK_SETTLE' ||
        e.kind === 'BREAK_REJECT' ||
        e.kind === 'SUPPORT_BOUNCE')
  );
}
