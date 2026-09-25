/**
 * AI超级变身统计 — TF별 스윙 타점(E/SL/TP1·2·3 가격) · 현물 기준 %.
 *
 * 전부 Hub 연동 타점:
 * - 앵커 진입 = SuperStats Hub E (동일)
 * - 현재 TF = Hub 실타점 가격 그대로
 * - 다른 TF = 같은 Hub E + ATR 스케일 손절/목표 → 가격 산출 (참고 연동)
 * - %는 현물(진입) 대비 파생. 확정 수익·승률 문구 금지.
 *
 * turbopack-hmr-bust: 2026-08-31 empty-module fix
 */
import { normalizeChartTimeframe } from '@/lib/constants';

export type SuperStatsSwingTfRow = {
  tf: string;
  horizonKo: string;
  active: boolean;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopPct: number | null;
  risePctTp1: number | null;
  risePctTp2: number | null;
  risePctTp3: number | null;
  source: 'hub' | 'hub_tf_scale';
  noteKo: string;
};

export type SuperStatsSwingSpotPack = {
  timeframe: string;
  horizonKo: string;
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopPct: number | null;
  risePctTp1: number | null;
  risePctTp2: number | null;
  risePctTp3: number | null;
  rrTp1: number | null;
  atrPct: number | null;
  spotLineKo: string;
  qualityKo: string;
  tfBoard: SuperStatsSwingTfRow[];
};

/** 보드 대표 TF — TIMEFRAMES 토큰 */
const SWING_TF_BOARD = ['15m', '1h', '4h', '1d', '1w'] as const;

type Horizon = {
  horizonKo: string;
  stopAtr: number;
  tp1Atr: number;
  tp2Atr: number;
  tp3Atr: number;
};

function tfMinutes(tf: string): number {
  const t = normalizeChartTimeframe(tf) || String(tf || '');
  if (/^\d+m$/.test(t)) return Number(t.replace('m', '')) || 15;
  if (/^\d+h$/i.test(t)) return (Number(t.replace(/h/i, '')) || 1) * 60;
  if (/^\d+d$/i.test(t)) return (Number(t.replace(/d/i, '')) || 1) * 1440;
  if (/^1w$/i.test(t)) return 10080;
  if (/^1M$/.test(t)) return 43200;
  return 60;
}

function horizonForTf(tf: string): Horizon {
  const min = tfMinutes(tf);
  if (min <= 15) {
    return { horizonKo: '스캘프·초단', stopAtr: 0.9, tp1Atr: 1.6, tp2Atr: 2.8, tp3Atr: 4.2 };
  }
  if (min <= 60) {
    return { horizonKo: '인트라데이 스윙', stopAtr: 1.15, tp1Atr: 2.2, tp2Atr: 3.6, tp3Atr: 5.5 };
  }
  if (min <= 240) {
    return { horizonKo: '스윙', stopAtr: 1.4, tp1Atr: 2.8, tp2Atr: 4.8, tp3Atr: 7.2 };
  }
  if (min <= 1440) {
    return { horizonKo: '포지션 스윙', stopAtr: 1.7, tp1Atr: 3.4, tp2Atr: 6.0, tp3Atr: 9.5 };
  }
  return { horizonKo: '장기 포지션', stopAtr: 2.0, tp1Atr: 4.0, tp2Atr: 7.5, tp3Atr: 12 };
}

function roundPct(n: number | null, digits = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function roundPx(n: number | null): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) return Math.round(n);
  if (n >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 1e6) / 1e6;
}

/** 유리 방향 이동 % → 가격 (롱 +, 숏 −) */
function priceFromFavorPct(
  direction: 'LONG' | 'SHORT',
  entry: number,
  favorPct: number
): number | null {
  if (!(entry > 0) || !Number.isFinite(favorPct)) return null;
  const signed = direction === 'LONG' ? favorPct : -favorPct;
  return roundPx(entry * (1 + signed / 100));
}

/** 손절 % (절대) → 가격 */
function stopFromPct(
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopPctAbs: number
): number | null {
  if (!(entry > 0) || !(stopPctAbs > 0)) return null;
  const signed = direction === 'LONG' ? -stopPctAbs : stopPctAbs;
  return roundPx(entry * (1 + signed / 100));
}

export function spotMovePct(
  direction: 'LONG' | 'SHORT',
  entry: number,
  target: number
): number | null {
  if (!(entry > 0) || !(target > 0)) return null;
  const raw = ((target - entry) / entry) * 100;
  if (direction === 'LONG') return raw;
  return -raw;
}

export function spotStopPct(
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopLoss: number
): number | null {
  const m = spotMovePct(direction, entry, stopLoss);
  if (m == null) return null;
  return Math.abs(m);
}

function fmtSignedPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtStopPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `−${Math.abs(n).toFixed(2)}%`;
}

function scaleAtrPct(atrPctChart: number, chartTf: string, targetTf: string): number {
  const a = Math.max(tfMinutes(chartTf), 1);
  const b = Math.max(tfMinutes(targetTf), 1);
  return atrPctChart * Math.sqrt(b / a);
}

function levelsFromPct(
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopPct: number,
  tp1Pct: number,
  tp2Pct: number,
  tp3Pct: number
): { stopLoss: number | null; tp1: number | null; tp2: number | null; tp3: number | null } {
  return {
    stopLoss: stopFromPct(direction, entry, stopPct),
    tp1: priceFromFavorPct(direction, entry, tp1Pct),
    tp2: priceFromFavorPct(direction, entry, tp2Pct),
    tp3: priceFromFavorPct(direction, entry, tp3Pct),
  };
}

export function buildSuperStatsSwingSpotPack(params: {
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  timeframe: string;
  atrPct?: number | null;
}): SuperStatsSwingSpotPack {
  const tf = normalizeChartTimeframe(params.timeframe) || String(params.timeframe || '1h');
  const horizon = horizonForTf(tf);
  const dir = params.direction;
  const entry = params.entry != null && params.entry > 0 ? params.entry : null;
  const atrPct =
    params.atrPct != null && Number.isFinite(params.atrPct) && params.atrPct > 0
      ? params.atrPct
      : null;

  let stopLoss = params.stopLoss != null && params.stopLoss > 0 ? roundPx(params.stopLoss) : null;
  let tp1 = params.tp1 != null && params.tp1 > 0 ? roundPx(params.tp1) : null;
  let tp2 = params.tp2 != null && params.tp2 > 0 ? roundPx(params.tp2) : null;
  let tp3 = params.tp3 != null && params.tp3 > 0 ? roundPx(params.tp3) : null;

  let stopPct: number | null = null;
  let risePctTp1: number | null = null;
  let risePctTp2: number | null = null;
  let risePctTp3: number | null = null;
  let rrTp1: number | null = null;

  if (dir && entry != null) {
    if (stopLoss != null) stopPct = roundPct(spotStopPct(dir, entry, stopLoss));
    if (tp1 != null) risePctTp1 = roundPct(spotMovePct(dir, entry, tp1));
    if (tp2 != null) risePctTp2 = roundPct(spotMovePct(dir, entry, tp2));
    if (tp3 != null) risePctTp3 = roundPct(spotMovePct(dir, entry, tp3));
  }

  /** Hub 레벨 비면 현재 TF ATR×배수로 가격·% 채움 (Hub 연동 참고) */
  if (dir && atrPct != null && entry != null) {
    if (stopPct == null) stopPct = roundPct(horizon.stopAtr * atrPct);
    if (risePctTp1 == null) risePctTp1 = roundPct(horizon.tp1Atr * atrPct);
    if (risePctTp2 == null) risePctTp2 = roundPct(horizon.tp2Atr * atrPct);
    if (risePctTp3 == null) risePctTp3 = roundPct(horizon.tp3Atr * atrPct);
    if (stopLoss == null && stopPct != null) stopLoss = stopFromPct(dir, entry, stopPct);
    if (tp1 == null && risePctTp1 != null) tp1 = priceFromFavorPct(dir, entry, risePctTp1);
    if (tp2 == null && risePctTp2 != null) tp2 = priceFromFavorPct(dir, entry, risePctTp2);
    if (tp3 == null && risePctTp3 != null) tp3 = priceFromFavorPct(dir, entry, risePctTp3);
  }

  if (stopPct != null && stopPct > 0 && risePctTp1 != null) {
    rrTp1 = roundPct(Math.abs(risePctTp1) / stopPct, 2);
  }

  const spotLineKo =
    dir && entry != null
      ? `현물기준 · 손절 ${fmtStopPct(stopPct)} · TP1 ${fmtSignedPct(risePctTp1)} · TP2 ${fmtSignedPct(
          risePctTp2
        )} · TP3 ${fmtSignedPct(risePctTp3)}${rrTp1 != null ? ` · RR≈${rrTp1}` : ''}`
      : '현물기준 % · 대기(타점 없음)';

  let qualityKo = '대기';
  if (dir && stopPct != null && risePctTp1 != null) {
    if (rrTp1 != null && rrTp1 < 1.8) qualityKo = 'RR낮음 · 감시만';
    else if (rrTp1 != null && rrTp1 < 2.5) qualityKo = 'RR보통 · 감시~확정후보';
    else if (rrTp1 != null) qualityKo = 'RR양호 · 확정후보(참고)';
    else qualityKo = '타점 % 산출';
    if (atrPct != null && stopPct < atrPct * 0.35) {
      qualityKo += ' · 손절이 ATR대비 타이트(노이즈 주의)';
    }
  }

  const chartAtr = atrPct ?? 0.85;
  const tfBoard: SuperStatsSwingTfRow[] = SWING_TF_BOARD.map((boardTf) => {
    const h = horizonForTf(boardTf);
    const active = normalizeChartTimeframe(boardTf) === normalizeChartTimeframe(tf);

    if (active && dir && entry != null) {
      return {
        tf: boardTf,
        horizonKo: h.horizonKo,
        active: true,
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        stopPct,
        risePctTp1,
        risePctTp2,
        risePctTp3,
        source: 'hub' as const,
        noteKo: 'AI超级变身统计 Hub 실타점',
      };
    }

    if (!dir || entry == null) {
      return {
        tf: boardTf,
        horizonKo: h.horizonKo,
        active: false,
        entry: null,
        stopLoss: null,
        tp1: null,
        tp2: null,
        tp3: null,
        stopPct: null,
        risePctTp1: null,
        risePctTp2: null,
        risePctTp3: null,
        source: 'hub_tf_scale' as const,
        noteKo: 'Hub 대기 · TF 타점 없음',
      };
    }

    const scaled = scaleAtrPct(chartAtr, tf, boardTf);
    const sPct = roundPct(h.stopAtr * scaled)!;
    const t1Pct = roundPct(h.tp1Atr * scaled)!;
    const t2Pct = roundPct(h.tp2Atr * scaled)!;
    const t3Pct = roundPct(h.tp3Atr * scaled)!;
    const lv = levelsFromPct(dir, entry, sPct, t1Pct, t2Pct, t3Pct);
    return {
      tf: boardTf,
      horizonKo: h.horizonKo,
      active: false,
      entry,
      stopLoss: lv.stopLoss,
      tp1: lv.tp1,
      tp2: lv.tp2,
      tp3: lv.tp3,
      stopPct: sPct,
      risePctTp1: t1Pct,
      risePctTp2: t2Pct,
      risePctTp3: t3Pct,
      source: 'hub_tf_scale' as const,
      noteKo: 'Hub E 연동 · TF ATR 스케일 타점(참고)',
    };
  });

  if (!tfBoard.some((r) => r.active)) {
    tfBoard.unshift({
      tf,
      horizonKo: horizon.horizonKo,
      active: true,
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      stopPct,
      risePctTp1,
      risePctTp2,
      risePctTp3,
      source: entry && (stopLoss || tp1) ? 'hub' : 'hub_tf_scale',
      noteKo: entry ? '현재 TF · Hub 연동' : '현재 TF · 대기',
    });
  }

  return {
    timeframe: tf,
    horizonKo: horizon.horizonKo,
    direction: dir,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    stopPct,
    risePctTp1,
    risePctTp2,
    risePctTp3,
    rrTp1,
    atrPct: atrPct != null ? roundPct(atrPct) : null,
    spotLineKo,
    qualityKo,
    tfBoard,
  };
}

export function summarizeSwingSpotKo(pack: SuperStatsSwingSpotPack | null | undefined): string {
  if (!pack) return '';
  return `${pack.horizonKo} · ${pack.spotLineKo} · ${pack.qualityKo}`;
}
