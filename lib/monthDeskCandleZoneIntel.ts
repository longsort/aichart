/**
 * 마감·안착 — 캔들×zone×line 통합 인텔 (종가·꼬리·거래량·레벨 돌파).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  buildSettleLevelProbes,
  evaluateSettleBreak,
  isFakeBreakoutCandle,
  settleHoldBarsForTf,
  volSma,
  SETTLE_BREAKOUT_VOL_RATIO,
  type SettleProbeDir,
} from '@/lib/monthDeskSettleProbe';
import type { MonthDeskSettleCandleCell, MonthDeskSettleCandlePhase } from '@/lib/monthDeskSettleCandlePaint';
import { MONTH_DESK_STRIKE_IDS } from '@/lib/monthDeskStrikeDesk';

export type CandleZoneScene =
  | 'neutral'
  | 'long_break'
  | 'long_settle'
  | 'long_confirm'
  | 'short_break'
  | 'short_settle'
  | 'short_confirm'
  | 'fake_up'
  | 'fake_dn'
  | 'retest_ok'
  | 'retest_fail';

export type CandleZoneIntelCell = {
  time: number;
  scene: CandleZoneScene;
  ko: string;
  paint?: MonthDeskSettleCandleCell;
};

export type MonthDeskCandleZoneIntel = {
  byTime: Map<number, CandleZoneIntelCell>;
  headlineKo: string;
  sublineKo: string;
  activeLevelKo: string;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
};

function priceOf(pack: OverlayItem[], id: string): number | null {
  const o = pack.find((x) => x.id === id);
  const p = o?.price1 ?? o?.price2;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function collectKeyLevels(pack: OverlayItem[]): Array<{ id: string; ko: string; price: number; dir: SettleProbeDir; weight: number }> {
  const rows: Array<{ id: string; ko: string; price: number; dir: SettleProbeDir; weight: number }> = [];
  const push = (id: string, ko: string, price: number | null, dir: SettleProbeDir, w: number) => {
    if (price == null) return;
    rows.push({ id, ko, price, dir, weight: w });
  };
  push(MONTH_DESK_STRIKE_IDS.longEntry, 'Strike 롱 E', priceOf(pack, MONTH_DESK_STRIKE_IDS.longEntry), 'above', 100);
  push(MONTH_DESK_STRIKE_IDS.longSl, 'Strike 롱 SL', priceOf(pack, MONTH_DESK_STRIKE_IDS.longSl), 'below', 96);
  push(MONTH_DESK_STRIKE_IDS.shortEntry, 'Strike 숏 E', priceOf(pack, MONTH_DESK_STRIKE_IDS.shortEntry), 'below', 100);
  push(MONTH_DESK_STRIKE_IDS.shortSl, 'Strike 숏 SL', priceOf(pack, MONTH_DESK_STRIKE_IDS.shortSl), 'above', 96);
  push('month-desk-plan-entry', '진입', priceOf(pack, 'month-desk-plan-entry'), 'above', 88);
  push('month-desk-plan-sl', '손절', priceOf(pack, 'month-desk-plan-sl'), 'below', 90);
  for (const probe of buildSettleLevelProbes(pack)) {
    if (!rows.some((r) => Math.abs(r.price - probe.level) < probe.level * 0.0005)) {
      rows.push({
        id: probe.key,
        ko: probe.levelKo,
        price: probe.level,
        dir: probe.dir,
        weight: probe.weight,
      });
    }
  }
  return rows.sort((a, b) => b.weight - a.weight);
}

function sceneToPaint(scene: CandleZoneScene): MonthDeskSettleCandleCell | undefined {
  const bull = scene.startsWith('long');
  const bear = scene.startsWith('short');
  const bias: 'bullish' | 'bearish' = bull ? 'bullish' : bear ? 'bearish' : 'bullish';
  let phase: MonthDeskSettleCandlePhase = 'breakout';
  if (scene.includes('settle')) phase = 'settling';
  if (scene.includes('confirm')) phase = 'confirmed';
  if (scene.startsWith('fake') || scene === 'retest_fail') phase = 'failed';
  if (scene === 'retest_ok') phase = 'retest';
  if (scene === 'neutral') return undefined;
  return { phase, bias: scene.startsWith('fake') ? (scene === 'fake_up' ? 'bullish' : 'bearish') : bias };
}

function sceneKo(scene: CandleZoneScene, levelKo: string): string {
  switch (scene) {
    case 'long_break':
      return `${levelKo} 상향 돌파`;
    case 'long_settle':
      return `${levelKo} 안착 유지`;
    case 'long_confirm':
      return `${levelKo} 상승 확인`;
    case 'short_break':
      return `${levelKo} 하향 이탈`;
    case 'short_settle':
      return `${levelKo} 하락 안착`;
    case 'short_confirm':
      return `${levelKo} 하락 확인`;
    case 'fake_up':
      return `${levelKo} 가짜 상향(꼬리)`;
    case 'fake_dn':
      return `${levelKo} 가짜 하향(꼬리)`;
    case 'retest_ok':
      return `${levelKo} 재시험 유지`;
    case 'retest_fail':
      return `${levelKo} 재시험 실패`;
    default:
      return '관망';
  }
}

/** 캔들별 zone·line 반응 + 마감안착 페인트 통합 */
export function analyzeMonthDeskCandleZoneIntel(
  candles: Candle[],
  pack: OverlayItem[],
  opts?: { timeframe?: string; analysis?: AnalyzeResponse | null }
): MonthDeskCandleZoneIntel {
  const byTime = new Map<number, CandleZoneIntelCell>();
  if (candles.length < 6) {
    return {
      byTime,
      headlineKo: '캔들 부족 — 분석 대기',
      sublineKo: '',
      activeLevelKo: '–',
      bias: 'NEUTRAL',
    };
  }

  const levels = collectKeyLevels(pack);
  const tf = opts?.timeframe;
  const evalOpts = { useLastBreak: true, holdBars: settleHoldBarsForTf(tf), timeframe: tf };
  const tailFrom = Math.max(0, candles.length - 120);
  const tail = candles.slice(tailFrom);

  let bestSnap: ReturnType<typeof evaluateSettleBreak> = null;
  let bestW = 0;
  let bestKo = '';
  for (const lv of levels.slice(0, 6)) {
    const probe = {
      key: lv.id,
      levelKo: lv.ko,
      level: lv.price,
      dir: lv.dir,
      weight: lv.weight,
    };
    const snap = evaluateSettleBreak(tail, probe, evalOpts);
    if (snap && lv.weight > bestW) {
      bestW = lv.weight;
      bestSnap = snap;
      bestKo = lv.ko;
    }
  }

  for (let i = Math.max(1, tailFrom); i < candles.length; i++) {
    const c = candles[i]!;
    const t = Number(c.time);
    const prev = candles[i - 1]!;
    let bestScene: CandleZoneScene = 'neutral';
    let bestLevelKo = '';

    for (const lv of levels) {
      const eps = Math.max(lv.price * 0.00035, 1e-8);
      const cl = Number(c.close);
      const wasBelow = Number(prev.close) < lv.price - eps;
      const wasAbove = Number(prev.close) > lv.price + eps;

      if (lv.dir === 'above') {
        if (isFakeBreakoutCandle(c, lv.price, 'above')) {
          bestScene = 'fake_up';
          bestLevelKo = lv.ko;
          break;
        }
        if (wasBelow && cl >= lv.price - eps) {
          bestScene = 'long_break';
          bestLevelKo = lv.ko;
        } else if (cl >= lv.price - eps && i > 0) {
          const v = Number(c.volume) || 0;
          const ma = volSma(candles, i, 20);
          if (bestScene === 'long_break' || (wasBelow && cl >= lv.price - eps)) {
            bestScene = ma > 0 && v >= ma * SETTLE_BREAKOUT_VOL_RATIO ? 'long_break' : 'long_settle';
          } else bestScene = 'long_settle';
          bestLevelKo = lv.ko;
        }
      } else {
        if (isFakeBreakoutCandle(c, lv.price, 'below')) {
          bestScene = 'fake_dn';
          bestLevelKo = lv.ko;
          break;
        }
        if (wasAbove && cl <= lv.price + eps) {
          bestScene = 'short_break';
          bestLevelKo = lv.ko;
        } else if (cl <= lv.price + eps) {
          bestScene = 'short_settle';
          bestLevelKo = lv.ko;
        }
      }
    }

    if (bestSnap && bestSnap.confirmIdx >= 0 && i === bestSnap.confirmIdx + tailFrom) {
      bestScene = bestSnap.probe.dir === 'above' ? 'long_confirm' : 'short_confirm';
      bestLevelKo = bestSnap.probe.levelKo;
    }
    if (bestSnap?.retest.retestIdx >= 0 && i === bestSnap.retest.retestIdx + tailFrom) {
      bestScene = bestSnap.retest.violated ? 'retest_fail' : 'retest_ok';
      bestLevelKo = bestSnap.probe.levelKo;
    }

    if (bestScene !== 'neutral') {
      const paint = sceneToPaint(bestScene);
      byTime.set(t, {
        time: t,
        scene: bestScene,
        ko: sceneKo(bestScene, bestLevelKo),
        paint,
      });
    }
  }

  let headlineKo = '레벨 대기 — zone·line 형성 중';
  let sublineKo = '종가 마감·꼬리·거래량을 레벨과 함께 해석';
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

  if (bestSnap) {
    bias = bestSnap.probe.dir === 'above' ? 'LONG' : 'SHORT';
    if (bestSnap.fakeBreak || bestSnap.retest.violated || !bestSnap.stillAbove) {
      headlineKo = `${bestKo} — 안착 실패·가짜 돌파 참고`;
      sublineKo = '몸통 종가가 레벨을 유지하지 못함';
      bias = 'NEUTRAL';
    } else if (bestSnap.confirmIdx >= 0 || (bestSnap.holdN && bestSnap.breakVolOk)) {
      headlineKo = `${bestKo} — 3단계 확인(마감·안착)`;
      sublineKo = bestSnap.breakVolOk ? '돌파 거래량 OK' : '돌파 거래량 약함 — 추가 확인';
    } else if (bestSnap.hold2) {
      headlineKo = `${bestKo} — 2단계 안착 중`;
      sublineKo = `${bestSnap.holdNeed}봉 종가 유지 검증`;
    } else {
      headlineKo = `${bestKo} — 1단계 돌파`;
      sublineKo = '다음 봉 종가 유지 여부 확인';
    }
  }

  const sz = opts?.analysis?.settlementZone;
  if (sz && sz.state === 'confirmed' && sz.direction === 'LONG') bias = 'LONG';
  if (sz && sz.state === 'confirmed' && sz.direction === 'SHORT') bias = 'SHORT';

  return { byTime, headlineKo, sublineKo, activeLevelKo: bestKo || '–', bias };
}

/** 인텔 페인트 → settle 캔들 맵 병합 */
export function mergeIntelIntoSettleCandlePaint(
  base: Map<number, MonthDeskSettleCandleCell>,
  intel: MonthDeskCandleZoneIntel
): Map<number, MonthDeskSettleCandleCell> {
  const out = new Map(base);
  for (const cell of intel.byTime.values()) {
    if (!cell.paint) continue;
    const t = cell.time;
    const prev = out.get(t);
    const rank = (p: MonthDeskSettleCandlePhase) =>
      ({ failed: 0, breakoutWeak: 1, breakout: 2, retest: 3, settling: 4, confirmed: 5 })[p] ?? 0;
    if (!prev || rank(cell.paint.phase) >= rank(prev.phase)) {
      out.set(t, cell.paint);
    }
  }
  return out;
}
