/**
 * PDH/PDL · PWH/PWL · PMH/PML — 직전 확정 봉 H/L.
 * 가격 절대 추격 금지용 유동성 앵커.
 */
import { sliceClosedBarsForHtf } from './sessionCloseKst';

export type TapPriorLevelKind = 'PDH' | 'PDL' | 'PWH' | 'PWL' | 'PMH' | 'PML';

export type TapPriorLevel = {
  kind: TapPriorLevelKind;
  price: number;
  tf: string;
  barTime: number;
};

export type TapCandleLite = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function priorHL(
  candles: TapCandleLite[] | null | undefined,
  tf: string,
  hiKind: TapPriorLevelKind,
  loKind: TapPriorLevelKind
): TapPriorLevel[] {
  if (!candles?.length) return [];
  const { bars } = sliceClosedBarsForHtf(candles, tf);
  if (bars.length < 1) return [];
  const last = bars[bars.length - 1]!;
  const hi = Number(last.high);
  const lo = Number(last.low);
  const t = Number(last.time) || 0;
  const out: TapPriorLevel[] = [];
  if (hi > 0) out.push({ kind: hiKind, price: hi, tf, barTime: t });
  if (lo > 0) out.push({ kind: loKind, price: lo, tf, barTime: t });
  return out;
}

export function buildTapPriorLevels(params: {
  daily?: TapCandleLite[] | null;
  weekly?: TapCandleLite[] | null;
  monthly?: TapCandleLite[] | null;
}): TapPriorLevel[] {
  return [
    ...priorHL(params.daily, '1d', 'PDH', 'PDL'),
    ...priorHL(params.weekly, '1w', 'PWH', 'PWL'),
    ...priorHL(params.monthly, '1M', 'PMH', 'PML'),
  ];
}
