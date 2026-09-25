/**
 * 마감·안착 — 롱·숏 $$$$ 풀을 **하나의 핵심타점**으로 통합 (차트·카드 동일 소스).
 */
import type { MonthDeskMoneyZone } from '@/lib/monthDeskMoneyZone';
import {
  MONTH_DESK_CORE_MONEY_ENTRY_ID,
  monthDeskCoreMoneyEntryLabel,
  monthDeskMoneyDirectionHint,
  monthDeskMoneySideKo,
  pickMonthDeskCoreMoneyPool,
} from '@/lib/monthDeskMoneyZone';

export type MonthDeskUnifiedCoreMoney = {
  primary: MonthDeskMoneyZone;
  alt: MonthDeskMoneyZone | null;
  side: 'LONG' | 'SHORT';
  /** 롱·숏 풀이 좁은 복합 유동성 구간 */
  squeeze: boolean;
  priceTop: number;
  priceBot: number;
  priceMid: number;
  scoreLong: number;
  scoreShort: number;
  labelKo: string;
  tooltipKo: string;
  headlineKo: string;
};

function fmtPx(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtRange(lo: number, hi: number): string {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (relDiff(a, b) < 0.0008) return fmtPx(a);
  return `${fmtPx(a)}~${fmtPx(b)}`;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function sideStrength(pools: MonthDeskMoneyZone[], side: 'LONG' | 'SHORT'): number {
  return pools.filter((p) => p.side === side).reduce((s, p) => s + p.strength, 0);
}

function bestOnSide(pools: MonthDeskMoneyZone[], side: 'LONG' | 'SHORT'): MonthDeskMoneyZone | null {
  const list = pools.filter((p) => p.side === side).sort((a, b) => b.strength - a.strength);
  return list[0] ?? null;
}

/** 차트·카드 — 롱 또는 숏 하나만 (복합 구간도 우세 side만 표기, 보조 풀은 툴팁) */
export function monthDeskUnifiedCoreMoneyLabel(ucm: MonthDeskUnifiedCoreMoney): string {
  return monthDeskCoreMoneyEntryLabel(ucm.side, ucm.priceMid);
}

export function buildMonthDeskUnifiedCoreMoneyTooltip(ucm: MonthDeskUnifiedCoreMoney): string {
  const lines = [
    ucm.labelKo,
    monthDeskMoneyDirectionHint(ucm.side),
    ucm.headlineKo,
    `통합 점수 — 롱 ${ucm.scoreLong.toFixed(1)} vs 숏 ${ucm.scoreShort.toFixed(1)}`,
  ];
  if (ucm.alt) {
    lines.push(
      `보조 ${ucm.alt.side === 'LONG' ? '롱' : '숏'} 풀 ${fmtPx(ucm.alt.priceMid)} — ${ucm.alt.headlineKo}`
    );
  }
  if (ucm.squeeze) {
    lines.push('좁은 구간: 롱·숏 유동성 복합 — 스윕 방향은 우세 점수·연합 분석 참고');
  }
  lines.push('교육·참고 — 확정 매매 아님');
  return lines.filter(Boolean).join('\n');
}

/**
 * 단일 핵심 $$$$ — 연합·verdict·강도·현재가로 롱/숏 풀 중 하나(또는 복합 구간)만 선택.
 */
export function resolveMonthDeskUnifiedCoreMoney(params: {
  pools: MonthDeskMoneyZone[];
  close?: number;
  preferSide?: 'LONG' | 'SHORT' | null;
  fusionDirection?: 'LONG' | 'SHORT' | 'WAIT' | null;
  fusionScoreLong?: number;
  fusionScoreShort?: number;
}): MonthDeskUnifiedCoreMoney | null {
  const { pools, close, preferSide, fusionDirection, fusionScoreLong = 0, fusionScoreShort = 0 } = params;
  if (!pools.length) return null;

  const bestLong = bestOnSide(pools, 'LONG');
  const bestShort = bestOnSide(pools, 'SHORT');

  let scoreLong = fusionScoreLong + sideStrength(pools, 'LONG') * 0.08;
  let scoreShort = fusionScoreShort + sideStrength(pools, 'SHORT') * 0.08;

  if (preferSide === 'LONG') scoreLong += 4;
  if (preferSide === 'SHORT') scoreShort += 4;
  if (fusionDirection === 'LONG') scoreLong += 5;
  if (fusionDirection === 'SHORT') scoreShort += 5;

  const refClose =
    close != null && Number.isFinite(close)
      ? close
      : Number.isFinite(pools[0]?.priceMid)
        ? pools[0]!.priceMid
        : 0;

  const corridorPct =
    bestLong && bestShort && refClose > 0
      ? Math.abs(bestLong.priceMid - bestShort.priceMid) / refClose
      : 1;

  const squeeze =
    Boolean(bestLong && bestShort) &&
    corridorPct < 0.014 &&
    Math.min(scoreLong, scoreShort) > 0;

  const margin = 1.1;
  let side: 'LONG' | 'SHORT' =
    scoreLong > scoreShort + margin ? 'LONG' : scoreShort > scoreLong + margin ? 'SHORT' : 'LONG';

  if (scoreLong <= scoreShort + margin && scoreShort <= scoreLong + margin) {
    if (preferSide === 'LONG' || preferSide === 'SHORT') {
      side = preferSide;
    } else if (fusionDirection === 'LONG' || fusionDirection === 'SHORT') {
      side = fusionDirection;
    } else if (bestLong && bestShort && refClose > 0) {
      side = Math.abs(bestLong.priceMid - refClose) <= Math.abs(bestShort.priceMid - refClose) ? 'LONG' : 'SHORT';
    }
  }

  let primary = side === 'LONG' ? bestLong : bestShort;
  let alt = side === 'LONG' ? bestShort : bestLong;

  if (!primary) {
    primary = pickMonthDeskCoreMoneyPool(pools, preferSide, refClose);
    if (!primary) return null;
    side = primary.side;
    alt = side === 'LONG' ? bestShort : bestLong;
  }

  let priceTop = primary.priceTop;
  let priceBot = primary.priceBot;
  let priceMid = primary.priceMid;

  /** squeeze여도 zone 면은 우세 풀 폭만 — 롱·숏 풀 합치면 $$$$ 박스가 과도하게 넓어짐 */
  if (squeeze && bestLong && bestShort) {
    priceMid = (bestLong.priceMid + bestShort.priceMid) / 2;
  }

  const headlineKo = squeeze
    ? `통합 유동성 복합 — ${monthDeskMoneySideKo(side)} 우세 · ${primary.headlineKo}`
    : primary.headlineKo;

  const draft: MonthDeskUnifiedCoreMoney = {
    primary,
    alt: alt && alt !== primary ? alt : null,
    side,
    squeeze,
    priceTop,
    priceBot,
    priceMid,
    scoreLong,
    scoreShort,
    labelKo: '',
    tooltipKo: '',
    headlineKo,
  };
  draft.labelKo = monthDeskUnifiedCoreMoneyLabel(draft);
  draft.tooltipKo = buildMonthDeskUnifiedCoreMoneyTooltip(draft);
  return draft;
}

/** 차트에 핵심 zone 1개만 남길 때 보조 money pool zone·마크 제거 */
export function filterDuplicateMoneyPoolZones<T extends { id?: string }>(items: T[]): T[] {
  const hasCore = items.some((o) => {
    const id = String(o.id || '');
    return (
      id === MONTH_DESK_CORE_MONEY_ENTRY_ID ||
      id === 'month-desk-core-money-long' ||
      id === 'month-desk-core-money-short'
    );
  });
  if (!hasCore) return items;
  return items.filter((o) => {
    const id = String(o.id || '');
    if (/^month-desk-money-(long|short)-\d+-(zone|mark)$/.test(id)) return false;
    return true;
  });
}
