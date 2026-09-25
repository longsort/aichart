/**
 * LiqZoneEngine — LONG/SHORT LIQ ZONE 가격대.
 * SSL/BSL·EQ 유동성 + ATR 폭. 확정 기관 문구 금지. 확률 아님.
 */
import { atrAt, lastSweepLiquidity, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import type { SqueezeRadarReport } from './squeezeRadarEngine';

export type LiqZoneBand = {
  side: 'LONG' | 'SHORT';
  labelEn: 'LONG LIQ ZONE' | 'SHORT LIQ ZONE';
  labelKo: string;
  upper: number;
  lower: number;
  mid: number;
  active: boolean;
  note: string;
};

export type LiqZoneReport = {
  longLiq: LiqZoneBand | null;
  shortLiq: LiqZoneBand | null;
  primary: LiqZoneBand | null;
  summaryKo: string;
};

function band(
  side: 'LONG' | 'SHORT',
  mid: number,
  half: number,
  active: boolean,
  note: string
): LiqZoneBand {
  const lower = mid - half;
  const upper = mid + half;
  return {
    side,
    labelEn: side === 'LONG' ? 'LONG LIQ ZONE' : 'SHORT LIQ ZONE',
    labelKo: side === 'LONG' ? '롱 청산유동성 구간' : '숏 청산유동성 구간',
    upper,
    lower,
    mid,
    active,
    note,
  };
}

export function runLiqZoneEngine(params: {
  candles: Eagle1Bar[];
  structure: StructureSnapshot;
  endExclusive?: number;
  squeezeRadar?: SqueezeRadarReport | null;
}): LiqZoneReport {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  if (n < 20) {
    return {
      longLiq: null,
      shortLiq: null,
      primary: null,
      summaryKo: '데이터 없음',
    };
  }
  const atr = atrAt(params.candles, n, 14);
  const half = Math.max(atr * 0.35, Math.abs(params.candles[n - 1]?.close ?? 1) * 0.0008);
  const sweep = lastSweepLiquidity(params.structure.events);
  const eql = params.structure.equalLows.slice(-1)[0] ?? null;
  const eqh = params.structure.equalHighs.slice(-1)[0] ?? null;

  const longMid = sweep.ssl ?? eql;
  const shortMid = sweep.bsl ?? eqh;
  const sq = params.squeezeRadar;
  const longActive =
    Boolean(longMid) &&
    (sq?.activeSide === 'LONG' ||
      sq?.long.state === 'SQUEEZE_ACTIVE' ||
      sq?.long.state === 'CASCADE' ||
      sq?.long.state === 'BUILDUP' ||
      sq?.long.state === 'TRIGGER_READY');
  const shortActive =
    Boolean(shortMid) &&
    (sq?.activeSide === 'SHORT' ||
      sq?.short.state === 'SQUEEZE_ACTIVE' ||
      sq?.short.state === 'CASCADE' ||
      sq?.short.state === 'BUILDUP' ||
      sq?.short.state === 'TRIGGER_READY');

  const longLiq =
    longMid != null && Number.isFinite(longMid)
      ? band(
          'LONG',
          longMid,
          half,
          longActive,
          sweep.ssl != null ? 'SSL·하단 유동성 · 확률 아님' : 'Equal Low · 확률 아님'
        )
      : null;
  const shortLiq =
    shortMid != null && Number.isFinite(shortMid)
      ? band(
          'SHORT',
          shortMid,
          half,
          shortActive,
          sweep.bsl != null ? 'BSL·상단 유동성 · 확률 아님' : 'Equal High · 확률 아님'
        )
      : null;

  let primary: LiqZoneBand | null = null;
  if (longLiq?.active && !shortLiq?.active) primary = longLiq;
  else if (shortLiq?.active && !longLiq?.active) primary = shortLiq;
  else if (longLiq?.active && shortLiq?.active) {
    primary = sq?.activeSide === 'SHORT' ? shortLiq : longLiq;
  } else {
    primary = longLiq ?? shortLiq;
  }

  const summaryKo = primary
    ? `${primary.labelEn} · ${primary.labelKo} · ${primary.note}`
    : longLiq || shortLiq
      ? 'LIQ ZONE 후보만 있음 · 스퀴즈 비활성'
      : 'LIQ ZONE 데이터 없음';

  return { longLiq, shortLiq, primary, summaryKo };
}
