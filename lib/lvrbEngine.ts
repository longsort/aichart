/**
 * Lakshmi — Low Volatility Range Breakout (LVRB), Pine v6 로직 TS 포팅.
 * 원본: 사용자 제공 indicator("Lakshmi - Low Volatility Range Breakout" ...)
 */

import type { Candle, OverlayItem } from '@/types';
import { hexToRgba } from '@/lib/chartHexColor';

export type LvrbParams = {
  lenVol: number;
  trMult: number;
  bodyMult: number;
  useBody: boolean;
  minBars: number;
  minGoodFrac: number;
  gapMax: number;
  heightMult: number;
  breakMode: 'Wick' | 'Close';
  breakoutBodyMult: number;
  requireCandleColor: boolean;
  keepInvalidated: boolean;
  showBoxes: boolean;
  showSignals: boolean;
  boxTransparency: number;
  colorBullHex: string;
  colorBearHex: string;
  colorNeutralHex: string;
  /** 최종 박스·라벨 개수 상한 (차트 과부하 방지) */
  maxBoxes: number;
  maxSignals: number;
};

export const defaultLvrbParams: LvrbParams = {
  lenVol: 20,
  trMult: 1.0,
  bodyMult: 1.1,
  useBody: true,
  minBars: 6,
  minGoodFrac: 0.65,
  gapMax: 5,
  heightMult: 1.5,
  breakMode: 'Wick',
  breakoutBodyMult: 1.0,
  requireCandleColor: false,
  keepInvalidated: true,
  showBoxes: true,
  showSignals: true,
  boxTransparency: 85,
  colorBullHex: '#84CC16',
  colorBearHex: '#EF4444',
  colorNeutralHex: '#94A3B8',
  maxBoxes: 48,
  maxSignals: 32,
};

function trSeries(candles: Candle[]): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) tr.push(c.high - c.low);
    else {
      const pc = candles[i - 1].close;
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
    }
  }
  return tr;
}

function smaAt(series: number[], i: number, len: number): number | null {
  if (i < len - 1 || i >= series.length) return null;
  let s = 0;
  for (let j = 0; j < len; j++) s += series[i - j];
  return s / len;
}

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

type FinalBox = {
  startIdx: number;
  endIdx: number;
  hi: number;
  lo: number;
  tone: 'bull' | 'bear' | 'neutral';
};

type Signal = { idx: number; dir: 'LONG' | 'SHORT' };

function runLvrbState(candles: Candle[], p: LvrbParams): { boxes: FinalBox[]; signals: Signal[]; active: FinalBox | null } {
  const n = candles.length;
  if (n < p.lenVol + 2) return { boxes: [], signals: [], active: null };

  const tr = trSeries(candles);
  const body = candles.map((c) => Math.abs(c.close - c.open));

  let inSeq = false;
  let qualified = false;
  let startIdx = -1;
  let totalBars = 0;
  let goodBars = 0;
  let failStreak = 0;
  let rngHi = NaN;
  let rngLo = NaN;
  let baseATR = NaN;
  let baseBody0: number | null = null;

  const finalized: FinalBox[] = [];
  const signals: Signal[] = [];

  const minGoodBars = Math.ceil(p.minBars * p.minGoodFrac);

  const pushBox = (b: FinalBox) => {
    if (finalized.length >= p.maxBoxes) finalized.shift();
    finalized.push(b);
  };
  const pushSig = (s: Signal) => {
    if (signals.length >= p.maxSignals) signals.shift();
    signals.push(s);
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const avgTR = smaAt(tr, i, p.lenVol);
    const avgBody = smaAt(body, i, p.lenVol);
    const trNow = tr[i];
    const bodyNow = body[i];

    const lvTR = avgTR != null && trNow <= avgTR * p.trMult;
    const lvBody = !p.useBody || (avgBody != null && bodyNow <= avgBody * p.bodyMult);
    const isLowVol = lvTR && lvBody;

    if (!inSeq) {
      if (isLowVol && avgTR != null) {
        inSeq = true;
        qualified = false;
        startIdx = i;
        totalBars = 1;
        goodBars = 1;
        failStreak = 0;
        rngHi = c.high;
        rngLo = c.low;
        baseATR = avgTR;
        baseBody0 = avgBody;
      }
      continue;
    }

    // inSeq === true
    let bullBreakCommit = false;
    let bearBreakCommit = false;

    if (qualified && !Number.isNaN(rngHi) && !Number.isNaN(rngLo)) {
      const upWickPierce = c.high > rngHi;
      const dnWickPierce = c.low < rngLo;
      const upCloseOut = c.close > rngHi;
      const dnCloseOut = c.close < rngLo;

      const upCond = p.breakMode === 'Wick' ? upWickPierce && upCloseOut : upCloseOut;
      const dnCond = p.breakMode === 'Wick' ? dnWickPierce && dnCloseOut : dnCloseOut;

      const bigOk =
        p.breakoutBodyMult <= 1.0 ? true : baseBody0 != null && !Number.isNaN(baseBody0) && bodyNow >= baseBody0 * p.breakoutBodyMult;
      const dirOkUp = p.requireCandleColor ? c.close > c.open : true;
      const dirOkDn = p.requireCandleColor ? c.close < c.open : true;

      const bullBreakLive = upCond && bigOk && dirOkUp;
      const bearBreakLive = dnCond && bigOk && dirOkDn;
      bullBreakCommit = bullBreakLive;
      bearBreakCommit = bearBreakLive;

      if (bullBreakCommit || bearBreakCommit) {
        if (p.showBoxes) {
          pushBox({
            startIdx,
            endIdx: i,
            hi: rngHi,
            lo: rngLo,
            tone: bullBreakCommit ? 'bull' : 'bear',
          });
        }
        if (p.showSignals) {
          pushSig({ idx: i, dir: bullBreakCommit ? 'LONG' : 'SHORT' });
        }
        inSeq = false;
        qualified = false;
        startIdx = -1;
        totalBars = 0;
        goodBars = 0;
        failStreak = 0;
        rngHi = NaN;
        rngLo = NaN;
        baseATR = NaN;
        baseBody0 = null;
        continue;
      }
    }

    if (inSeq) {
      if (Number.isNaN(baseATR) || avgTR == null) {
        if (p.showBoxes && p.keepInvalidated && qualified && startIdx >= 0 && !Number.isNaN(rngHi) && !Number.isNaN(rngLo)) {
          pushBox({ startIdx, endIdx: i, hi: rngHi, lo: rngLo, tone: 'neutral' });
        }
        inSeq = false;
        qualified = false;
        startIdx = -1;
        totalBars = 0;
        goodBars = 0;
        failStreak = 0;
        rngHi = NaN;
        rngLo = NaN;
        baseATR = NaN;
        baseBody0 = null;
        continue;
      }

      const outNow = false;

      if (!outNow) {
        const wickOutButReentered =
          qualified && (c.high > rngHi || c.low < rngLo) && c.close <= rngHi && c.close >= rngLo;

        const nextHi = wickOutButReentered ? rngHi : Math.max(rngHi, c.high);
        const nextLo = wickOutButReentered ? rngLo : Math.min(rngLo, c.low);
        const nextTotal = totalBars + 1;
        const nextGood = goodBars + (isLowVol ? 1 : 0);
        const nextFail = isLowVol ? 0 : failStreak + 1;
        const nextFrac = nextGood / nextTotal;
        const nextQual = nextTotal >= p.minBars && nextGood >= minGoodBars && nextFrac >= p.minGoodFrac;

        const violates = nextHi - nextLo > baseATR * p.heightMult || nextFail > p.gapMax;

        if (violates) {
          if (p.showBoxes) {
            const rightEdge = i - 1;
            if (startIdx >= 0 && rightEdge >= startIdx && !Number.isNaN(rngHi) && !Number.isNaN(rngLo)) {
              if (qualified) {
                if (p.keepInvalidated) {
                  pushBox({ startIdx, endIdx: rightEdge, hi: rngHi, lo: rngLo, tone: 'neutral' });
                }
              } else if (p.keepInvalidated) {
                pushBox({ startIdx, endIdx: rightEdge, hi: rngHi, lo: rngLo, tone: 'neutral' });
              }
            }
          }

          inSeq = false;
          qualified = false;
          startIdx = -1;
          totalBars = 0;
          goodBars = 0;
          failStreak = 0;
          rngHi = NaN;
          rngLo = NaN;
          baseATR = NaN;
          baseBody0 = null;

          if (isLowVol && avgTR != null) {
            inSeq = true;
            qualified = false;
            startIdx = i;
            totalBars = 1;
            goodBars = 1;
            failStreak = 0;
            rngHi = c.high;
            rngLo = c.low;
            baseATR = avgTR;
            baseBody0 = avgBody;
          }
        } else {
          rngHi = nextHi;
          rngLo = nextLo;
          totalBars = nextTotal;
          goodBars = nextGood;
          failStreak = nextFail;

          if (nextQual && !qualified) {
            qualified = true;
          }
        }
      }
    }
  }

  let active: FinalBox | null = null;
  if (inSeq && qualified && p.showBoxes && startIdx >= 0 && !Number.isNaN(rngHi) && !Number.isNaN(rngLo)) {
    active = { startIdx, endIdx: n - 1, hi: rngHi, lo: rngLo, tone: 'neutral' };
  }

  return { boxes: finalized, signals, active };
}

function zoneColor(hex: string, transparencyPct: number): string {
  const a = Math.max(0.04, Math.min(0.92, 1 - transparencyPct / 100));
  return hexToRgba(hex, a);
}

function labelSolid(hex: string): string {
  return hexToRgba(hex, 1);
}

/** visible 슬라이스·min/max·nVis는 analyze와 동일 */
export function computeLvrbOverlays(
  visible: Candle[],
  min: number,
  max: number,
  partial?: Partial<LvrbParams>
): OverlayItem[] {
  const p: LvrbParams = { ...defaultLvrbParams, ...partial };
  if (!p.showBoxes && !p.showSignals) return [];

  const { boxes, signals, active } = runLvrbState(visible, p);
  const nVis = Math.max(1, visible.length - 1);
  const out: OverlayItem[] = [];

  const pushZone = (b: FinalBox, suffix: string) => {
    const t1 = visible[b.startIdx]?.time as number;
    const t2 = visible[b.endIdx]?.time as number;
    if (t1 == null || t2 == null) return;
    const hi = b.hi;
    const lo = b.lo;
    let hex: string;
    if (b.tone === 'bull') hex = p.colorBullHex;
    else if (b.tone === 'bear') hex = p.colorBearHex;
    else hex = p.colorNeutralHex;

    out.push({
      id: `lvrb-zone-${b.startIdx}-${b.endIdx}-${b.tone}-${suffix}`,
      kind: 'zone',
      label: b.tone === 'bull' ? 'LVRB ↑' : b.tone === 'bear' ? 'LVRB ↓' : 'LVRB',
      x1: b.startIdx / nVis,
      y1: toRatio(hi, min, max),
      x2: Math.min(0.995, b.endIdx / nVis),
      y2: toRatio(lo, min, max),
      time1: t1,
      time2: t2,
      price1: hi,
      price2: lo,
      confidence: 70,
      color: zoneColor(hex, p.boxTransparency),
      lineLabelColor: labelSolid(hex),
      category: 'lvrb',
    });
  };

  for (const b of boxes) {
    pushZone(b, 'f');
  }
  if (active) pushZone(active, 'a');

  for (const s of signals) {
    const c = visible[s.idx];
    if (!c) continue;
    const isLong = s.dir === 'LONG';
    const hex = isLong ? p.colorBullHex : p.colorBearHex;
    out.push({
      id: `lvrb-sig-${s.idx}-${s.dir}`,
      kind: 'label',
      label: isLong ? '▲ LONG' : '▼ SHORT',
      x1: Math.min(0.97, s.idx / nVis),
      y1: isLong ? toRatio(c.low, min, max) + 0.02 : toRatio(c.high, min, max) - 0.02,
      confidence: 78,
      color: labelSolid(hex),
      lineLabelColor: labelSolid(hex),
      labelBackgroundColor: 'rgba(8,15,25,0.75)',
      labelTextColor: labelSolid(hex),
      category: 'lvrb',
    });
  }

  return out;
}
