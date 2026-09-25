/**
 * 앱 전역 VWAP 컨텍스트 — AI존 evidence·슈퍼통계·가격선 연동용.
 * 기존 Anchored VWAP 계산을 읽기만 함. 모드 무관.
 */
import type { Candle } from '@/types';
import {
  buildMergedDeskAnchoredVwapDualPack,
  buildUserAnchoredVwapPacks,
  type MergedDeskAvwapUserPin,
  type AnchoredVwapAnchorMode,
} from '@/lib/mergedDeskAnchoredVwap';
import { computeSessionVwapSeries } from './sessionVwap';

export type VwapLevelHint = {
  price: number;
  labelKo: string;
  strength: number;
  kind: 'session' | 'avwap_high' | 'avwap_low' | 'avwap_open' | 'avwap_pin';
};

export type VwapMarketContext = {
  sessionLast: number | null;
  sessionLine: Array<{ time: number; value: number }>;
  anchoredHighLast: number | null;
  anchoredLowLast: number | null;
  anchoredHighOpenLast: number | null;
  anchoredLowOpenLast: number | null;
  pinLasts: Array<{ n: number; role: 'high' | 'low'; extreme: number | null; open: number | null }>;
  levels: VwapLevelHint[];
  noteKo: string;
};

function pushLevel(
  levels: VwapLevelHint[],
  price: number | null | undefined,
  labelKo: string,
  strength: number,
  kind: VwapLevelHint['kind']
) {
  if (price == null || !Number.isFinite(price) || !(price > 0)) return;
  levels.push({ price, labelKo, strength, kind });
}

export function buildVwapMarketContext(params: {
  candles: Candle[];
  chartTf: string;
  mode?: AnchoredVwapAnchorMode;
  htfCandles?: Candle[] | null;
  htfTf?: string | null;
  autoExtreme?: boolean;
  pins?: MergedDeskAvwapUserPin[];
  pinsHidden?: boolean;
  pinAnchorByTf?: Record<string, Candle[] | null | undefined> | null;
  sessionEnabled?: boolean;
}): VwapMarketContext {
  const candles = params.candles ?? [];
  const levels: VwapLevelHint[] = [];
  let sessionLast: number | null = null;
  const sessionLine =
    params.sessionEnabled !== false ? computeSessionVwapSeries(candles) : [];
  if (sessionLine.length) {
    const last = sessionLine[sessionLine.length - 1]!;
    sessionLast = last.value;
    pushLevel(levels, last.value, '세션VWAP', 58, 'session');
  }

  let anchoredHighLast: number | null = null;
  let anchoredLowLast: number | null = null;
  let anchoredHighOpenLast: number | null = null;
  let anchoredLowOpenLast: number | null = null;
  if (params.autoExtreme && candles.length >= 30) {
    const dual = buildMergedDeskAnchoredVwapDualPack(candles, {
      mode: params.mode ?? 'chart_both',
      htfCandles: params.htfCandles ?? null,
      htfTf: params.htfTf ?? null,
    });
    if (dual) {
      const hiExt = dual.high?.extremeLine[dual.high.extremeLine.length - 1];
      const hiOpen = dual.high?.openLine[dual.high.openLine.length - 1];
      const loExt = dual.low?.extremeLine[dual.low.extremeLine.length - 1];
      const loOpen = dual.low?.openLine[dual.low.openLine.length - 1];
      if (hiExt && Number.isFinite(hiExt.value)) {
        anchoredHighLast = hiExt.value;
        pushLevel(levels, hiExt.value, '고가앵커', 72, 'avwap_high');
      }
      if (hiOpen && Number.isFinite(hiOpen.value)) {
        anchoredHighOpenLast = hiOpen.value;
        pushLevel(levels, hiOpen.value, '시가앵커', 68, 'avwap_open');
      }
      if (loExt && Number.isFinite(loExt.value)) {
        anchoredLowLast = loExt.value;
        pushLevel(levels, loExt.value, '저·고가앵커', 70, 'avwap_low');
      }
      if (loOpen && Number.isFinite(loOpen.value)) {
        anchoredLowOpenLast = loOpen.value;
        pushLevel(levels, loOpen.value, '저·시가앵커', 66, 'avwap_open');
      }
    }
  }

  const pinLasts: VwapMarketContext['pinLasts'] = [];
  if (!params.pinsHidden && params.pins?.length) {
    const packs = buildUserAnchoredVwapPacks(
      candles,
      params.pins,
      params.chartTf,
      params.pinAnchorByTf
    );
    for (const { pin, pack } of packs) {
      const ext = pack.extremeLine[pack.extremeLine.length - 1];
      const op = pack.openLine[pack.openLine.length - 1];
      const extreme = ext && Number.isFinite(ext.value) ? ext.value : null;
      const open = op && Number.isFinite(op.value) ? op.value : null;
      pinLasts.push({ n: pin.n, role: pin.role, extreme, open });
      pushLevel(
        levels,
        extreme,
        `찍기#${pin.n}${pin.role === 'high' ? '고' : '저'}`,
        62,
        'avwap_pin'
      );
      pushLevel(
        levels,
        open,
        `찍기#${pin.n}${pin.role === 'high' ? '고시' : '저시'}`,
        58,
        'avwap_pin'
      );
    }
  }

  const noteKo = levels.length
    ? `VWAP 연동 ${levels.length}레벨 · 전모드 공유 · 참고용`
    : 'VWAP 레벨 없음 · 자동극값/세션/찍기 ON';

  return {
    sessionLast,
    sessionLine,
    anchoredHighLast,
    anchoredLowLast,
    anchoredHighOpenLast,
    anchoredLowOpenLast,
    pinLasts,
    levels,
    noteKo,
  };
}
