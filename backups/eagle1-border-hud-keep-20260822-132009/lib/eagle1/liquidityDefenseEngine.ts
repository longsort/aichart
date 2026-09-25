/**
 * Phase 8 — Advanced Liquidity / Defense.
 * REAL BID/ASK DEFENSE · Hidden Liquidity 후보 · Pressure Migration · Vacuum Corridor.
 * 확정 기관 문구 금지. 없으면 데이터 없음.
 */
import { atrAt, lastSweepLiquidity, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import type { Eagle1MoneyPressureLive } from './moneyPressureBand';
import type { LiqZoneReport } from './liqZoneEngine';

export type DefenseSide = {
  side: 'BID' | 'ASK';
  price: number | null;
  strength: number | null;
  real: boolean;
  labelKo: string;
  note: string;
};

export type HiddenLiqCandidate = {
  price: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  labelKo: string;
  note: string;
};

export type LiquidityDefenseReport = {
  bidDefense: DefenseSide;
  askDefense: DefenseSide;
  hidden: HiddenLiqCandidate[];
  pressureMigration: 'UP' | 'DOWN' | 'NONE' | '데이터 없음';
  vacuumCorridor: { lower: number; upper: number; note: string } | null;
  institutionClaimForbidden: true;
  summaryKo: string;
};

function emptyDefense(side: 'BID' | 'ASK'): DefenseSide {
  return {
    side,
    price: null,
    strength: null,
    real: false,
    labelKo: side === 'BID' ? '매수 방어' : '매도 방어',
    note: '데이터 없음',
  };
}

export function runLiquidityDefenseEngine(params: {
  candles: Eagle1Bar[];
  structure: StructureSnapshot;
  endExclusive?: number;
  live?: Eagle1MoneyPressureLive | null;
  liqZones?: LiqZoneReport | null;
}): LiquidityDefenseReport {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const live = params.live;
  const hasBook = Boolean(live?.has_orderbook);
  const bidQty = typeof live?.bidQty === 'number' && Number.isFinite(live.bidQty) ? live.bidQty : null;
  const askQty = typeof live?.askQty === 'number' && Number.isFinite(live.askQty) ? live.askQty : null;
  const imb =
    typeof live?.orderbookImbalance === 'number' && Number.isFinite(live.orderbookImbalance)
      ? live.orderbookImbalance
      : null;
  const last = n > 0 ? params.candles[n - 1] : null;
  const atr = n >= 20 ? atrAt(params.candles, n, 14) : null;

  let bidDefense = emptyDefense('BID');
  let askDefense = emptyDefense('ASK');

  if (hasBook && last && imb != null) {
    const mid = last.close;
    const half = atr != null ? atr * 0.15 : mid * 0.0006;
    const bidStrong = imb > 0.08 || (bidQty != null && askQty != null && bidQty > askQty * 1.15);
    const askStrong = imb < -0.08 || (bidQty != null && askQty != null && askQty > bidQty * 1.15);
    bidDefense = {
      side: 'BID',
      price: mid - half,
      strength: bidStrong ? Math.min(1, Math.abs(imb)) : Math.max(0, imb),
      real: true,
      labelKo: '실시간 매수 방어',
      note: bidStrong ? '호가 매수벽 후보 · 기관 확정 아님' : '호가 관찰 · 기관 확정 아님',
    };
    askDefense = {
      side: 'ASK',
      price: mid + half,
      strength: askStrong ? Math.min(1, Math.abs(imb)) : Math.max(0, -imb),
      real: true,
      labelKo: '실시간 매도 방어',
      note: askStrong ? '호가 매도벽 후보 · 기관 확정 아님' : '호가 관찰 · 기관 확정 아님',
    };
  }

  const hidden: HiddenLiqCandidate[] = [];
  const sweep = lastSweepLiquidity(params.structure.events);
  const eql = params.structure.equalLows.slice(-1)[0];
  const eqh = params.structure.equalHighs.slice(-1)[0];
  if (sweep.ssl != null) {
    hidden.push({
      price: sweep.ssl,
      bias: 'bullish',
      labelKo: '숨은 유동성 후보(하단)',
      note: 'SSL 스윕 잔여 · 확정 기관 아님',
    });
  } else if (eql != null) {
    hidden.push({
      price: eql,
      bias: 'bullish',
      labelKo: '숨은 유동성 후보(하단)',
      note: 'Equal Low · 확정 기관 아님',
    });
  }
  if (sweep.bsl != null) {
    hidden.push({
      price: sweep.bsl,
      bias: 'bearish',
      labelKo: '숨은 유동성 후보(상단)',
      note: 'BSL 스윕 잔여 · 확정 기관 아님',
    });
  } else if (eqh != null) {
    hidden.push({
      price: eqh,
      bias: 'bearish',
      labelKo: '숨은 유동성 후보(상단)',
      note: 'Equal High · 확정 기관 아님',
    });
  }

  let pressureMigration: LiquidityDefenseReport['pressureMigration'] = '데이터 없음';
  if (hasBook && imb != null) {
    pressureMigration = imb > 0.12 ? 'UP' : imb < -0.12 ? 'DOWN' : 'NONE';
  } else if (live?.has_cvd && typeof live.volumeDelta === 'number') {
    pressureMigration = live.volumeDelta > 0 ? 'UP' : live.volumeDelta < 0 ? 'DOWN' : 'NONE';
  }

  let vacuumCorridor: LiquidityDefenseReport['vacuumCorridor'] = null;
  const longL = params.liqZones?.longLiq;
  const shortL = params.liqZones?.shortLiq;
  if (longL && shortL && longL.upper < shortL.lower) {
    vacuumCorridor = {
      lower: longL.upper,
      upper: shortL.lower,
      note: '청산대 사이 희박 구간 후보 · 확률 아님',
    };
  } else if (n >= 30 && atr != null && last) {
    /** LVN-ish: 최근 고저 대비 중간대가 거래 얇으면 후보 — 날조 CVD 없음 */
    const win = params.candles.slice(Math.max(0, n - 24), n);
    const midP = (Math.min(...win.map((b) => b.low)) + Math.max(...win.map((b) => b.high))) / 2;
    const thin = win.filter((b) => b.low <= midP && b.high >= midP);
    const volMid = thin.reduce((s, b) => s + (Number(b.volume) || 0), 0) / Math.max(1, thin.length);
    const volAll = win.reduce((s, b) => s + (Number(b.volume) || 0), 0) / win.length;
    if (volAll > 0 && volMid < volAll * 0.55) {
      vacuumCorridor = {
        lower: midP - atr * 0.25,
        upper: midP + atr * 0.25,
        note: '상대 저거래 복도 후보 · 확률 아님',
      };
    }
  }

  const hasAny =
    bidDefense.real || askDefense.real || hidden.length > 0 || vacuumCorridor != null || pressureMigration !== '데이터 없음';

  return {
    bidDefense,
    askDefense,
    hidden: hidden.slice(0, 4),
    pressureMigration,
    vacuumCorridor,
    institutionClaimForbidden: true,
    summaryKo: hasAny
      ? `유동성방어 · 압력 ${pressureMigration}${vacuumCorridor ? ' · Vacuum' : ''}`
      : '데이터 없음',
  };
}
