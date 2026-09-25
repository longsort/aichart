/**
 * AI 파랑빨강띠 — 단타·스윙·중투 스타일 + VRVP POC 연동 표결.
 * 확정 수익·승률 아님. 관점·합류 표시.
 */
import type { MergedDeskChannelHorizon } from '@/lib/mergedDeskBlueRedChannels';

export type MergedDeskRbTradeStyle = 'scalp' | 'swing' | 'mid';

export type MergedDeskRbPocWhere = 'above' | 'below' | 'at' | 'inVa' | 'none';

export type MergedDeskRbPocRelation = {
  side: 'LONG' | 'SHORT' | 'WAIT';
  where: MergedDeskRbPocWhere;
  pts: number;
  ko: string;
  poc: number | null;
};

export type MergedDeskRbStyleWeights = {
  style: MergedDeskRbTradeStyle;
  styleKo: '단타' | '스윙' | '중투';
  preferredHorizon: MergedDeskChannelHorizon;
  horizonKo: string;
  /** 단기 채널 표결 배율 */
  shortMult: number;
  /** 장기 채널 표결 배율 */
  longMult: number;
  /** POC 표결 배율 */
  pocMult: number;
  /** 수급·Hot 반응 배율(단타↑ / 중투↓) */
  reactionMult: number;
  /** 통로 경로 감지 봉 수 */
  pathBars: number;
  /** 경로 전환에 필요한 연속 스텝 */
  pathSteps: number;
};

export function normalizeMergedDeskRbTradeStyle(v: unknown): MergedDeskRbTradeStyle {
  if (v === 'scalp' || v === 'swing' || v === 'mid') return v;
  return 'swing';
}

export function mergedDeskRbStyleWeights(styleIn?: unknown): MergedDeskRbStyleWeights {
  const style = normalizeMergedDeskRbTradeStyle(styleIn);
  if (style === 'scalp') {
    return {
      style,
      styleKo: '단타',
      preferredHorizon: 'short',
      horizonKo: '단기',
      shortMult: 1.45,
      longMult: 0.55,
      pocMult: 1.35,
      reactionMult: 1.4,
      pathBars: 3,
      pathSteps: 2,
    };
  }
  if (style === 'mid') {
    return {
      style,
      styleKo: '중투',
      preferredHorizon: 'long',
      horizonKo: '장기',
      shortMult: 0.55,
      longMult: 1.5,
      pocMult: 1.15,
      reactionMult: 0.75,
      pathBars: 6,
      pathSteps: 3,
    };
  }
  return {
    style,
    styleKo: '스윙',
    preferredHorizon: 'fb',
    horizonKo: '스윙',
    shortMult: 1,
    longMult: 1.05,
    pocMult: 1.25,
    reactionMult: 1,
    pathBars: 4,
    pathSteps: 2,
  };
}

/** 종가 vs POC/VA — 파랑빨강띠 롱숏 표결 */
export function evaluateMergedDeskRbPocRelation(params: {
  close: number;
  poc?: number | null;
  vaLow?: number | null;
  vaHigh?: number | null;
  atr?: number | null;
}): MergedDeskRbPocRelation {
  const close = Number(params.close) || 0;
  const poc = Number(params.poc);
  if (!(close > 0) || !Number.isFinite(poc) || !(poc > 0)) {
    return { side: 'WAIT', where: 'none', pts: 0, ko: '', poc: null };
  }
  const atr = Number(params.atr);
  const band = Math.max(
    Number.isFinite(atr) && atr > 0 ? atr * 0.12 : 0,
    Math.abs(close) * 0.0009,
    1e-6
  );
  const vaLo = Number(params.vaLow);
  const vaHi = Number(params.vaHigh);
  const inVa =
    Number.isFinite(vaLo) &&
    Number.isFinite(vaHi) &&
    vaHi > vaLo &&
    close >= vaLo &&
    close <= vaHi;

  if (Math.abs(close - poc) <= band) {
    return {
      side: 'WAIT',
      where: 'at',
      pts: 4,
      ko: 'POC밀착·방향대기',
      poc,
    };
  }
  if (inVa) {
    const side = close >= poc ? 'LONG' : 'SHORT';
    return {
      side,
      where: 'inVa',
      pts: 8,
      ko: side === 'LONG' ? 'VA안·POC위' : 'VA안·POC아래',
      poc,
    };
  }
  if (close > poc) {
    return { side: 'LONG', where: 'above', pts: 12, ko: '종가>POC·매수우위', poc };
  }
  return { side: 'SHORT', where: 'below', pts: 12, ko: '종가<POC·매도우위', poc };
}

/**
 * 스타일이 선호하는 호라이즌이 있고 마스터 방향과 맞으면 그쪽을 게이트로.
 * 없으면 기존 decision 유지.
 */
export function preferMergedDeskRbHorizonForStyle(params: {
  style: MergedDeskRbTradeStyle;
  decisionHorizon: MergedDeskChannelHorizon;
  available: ReadonlyArray<MergedDeskChannelHorizon>;
  preferredGeomSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
  masterSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
}): MergedDeskChannelHorizon {
  const w = mergedDeskRbStyleWeights(params.style);
  let prefer = w.preferredHorizon;
  /** 스윙(fb) 없으면 단기 */
  if (prefer === 'fb' && !params.available.includes('fb')) {
    prefer = params.available.includes('short') ? 'short' : params.decisionHorizon;
  }
  if (!params.available.includes(prefer)) return params.decisionHorizon;
  const master = params.masterSide;
  const geomSide = params.preferredGeomSide;
  if (master && master !== 'WAIT' && geomSide && geomSide !== 'WAIT' && geomSide !== master) {
    return params.decisionHorizon;
  }
  return prefer;
}

export function mergedDeskRbPocTagKo(rel: MergedDeskRbPocRelation): string | null {
  if (rel.where === 'none') return null;
  if (rel.where === 'at') return 'POC밀착';
  if (rel.where === 'inVa') return rel.side === 'LONG' ? 'VA·POC위' : 'VA·POC아래';
  if (rel.where === 'above') return 'POC위';
  if (rel.where === 'below') return 'POC아래';
  return null;
}
