/**
 * Doksuri-1 — Path engine (조건 경로; 확률은 표본 있을 때만).
 */
import type { Doksuri1PathLeg, Doksuri1TradePlan } from '@/lib/doksuri1/types';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import { sanitizeTelegramPrice } from '@/lib/telegramSymbolPriceGuard';

export function buildDoksuri1Paths(params: {
  symbol: string;
  price: number;
  long: Doksuri1TradePlan;
  short: Doksuri1TradePlan;
  srPath?: DumpSupportResistPath | null;
  histBullPct?: number | null;
  histBearPct?: number | null;
  histN?: number | null;
}): { paths: Doksuri1PathLeg[]; bull: number[]; bear: number[] } {
  const { symbol, price, long, short, srPath } = params;
  const pick = (n: number | null | undefined) => sanitizeTelegramPrice(symbol, price, n);

  const bull: number[] = [price];
  const t1 = pick(long.tp1 ?? srPath?.bounceLimitPrice);
  const t2 = pick(long.tp2 ?? srPath?.resistPrice);
  const t3 = pick(long.tp3);
  if (t1) bull.push(t1);
  if (t2) bull.push(t2);
  if (t3) bull.push(t3);

  const bear: number[] = [price];
  const b1 = pick(short.tp1 ?? srPath?.supportPrice);
  const b2 = pick(short.tp2 ?? srPath?.invalidationPrice);
  const b3 = pick(short.tp3);
  if (b1) bear.push(b1);
  if (b2) bear.push(b2);
  if (b3) bear.push(b3);

  const n = params.histN ?? 0;
  const useProb = n >= 12;
  const bullP = useProb && params.histBullPct != null ? Math.round(params.histBullPct) : null;
  const bearP = useProb && params.histBearPct != null ? Math.round(params.histBearPct) : null;
  let baseP: number | null = null;
  if (bullP != null && bearP != null) {
    baseP = Math.max(0, 100 - bullP - bearP);
  }

  const paths: Doksuri1PathLeg[] = [
    {
      id: 'BULL',
      points: bull,
      probabilityPct: bullP,
      conditionKo: '지지 방어·반등 확인 시',
    },
    {
      id: 'BASE',
      points: [price],
      probabilityPct: baseP,
      conditionKo: '승부처 미결 · 횡보',
    },
    {
      id: 'BEAR',
      points: bear,
      probabilityPct: bearP,
      conditionKo: '지지 붕괴·하락 재개 시',
    },
  ];

  return { paths, bull, bear };
}
