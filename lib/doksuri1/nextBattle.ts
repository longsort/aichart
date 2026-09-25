/**
 * Doksuri-1 — Next Battle / 가격 지도.
 */
import type { Doksuri1MapLevel, Doksuri1TradePlan, Doksuri1ZoneScore } from '@/lib/doksuri1/types';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import { sanitizeTelegramPrice } from '@/lib/telegramSymbolPriceGuard';

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export function buildDoksuri1MapLevels(params: {
  symbol: string;
  price: number;
  srPath?: DumpSupportResistPath | null;
  zones?: Doksuri1ZoneScore[];
  long?: Doksuri1TradePlan | null;
  short?: Doksuri1TradePlan | null;
  whaleEntry?: number | null;
  whaleTarget?: number | null;
  /** 청산·EQ 유동성 실측 */
  liqLongCluster?: number | null;
  liqShortCluster?: number | null;
  eqh?: number | null;
  eql?: number | null;
}): Doksuri1MapLevel[] {
  const { symbol, price } = params;
  const rows: Doksuri1MapLevel[] = [];
  const push = (
    p: number | null | undefined,
    labelKo: string,
    kind: Doksuri1MapLevel['kind'],
    priceHi?: number | null
  ) => {
    const ok = sanitizeTelegramPrice(symbol, price, p);
    if (ok == null) return;
    const hi = priceHi != null ? sanitizeTelegramPrice(symbol, price, priceHi) : null;
    rows.push({ price: ok, priceHi: hi ?? undefined, labelKo, kind });
  };

  push(price, 'NOW', 'now');
  /** 폭락존 주경로 — 텔레 지도 라벨 (실측만) */
  if (params.srPath?.resistPrice) {
    push(
      params.srPath.resistPrice,
      params.srPath.resistFirm ? '강한 저항' : '저항 후보',
      'resist'
    );
  }
  if (params.srPath?.bounceLimitPrice) {
    push(params.srPath.bounceLimitPrice, '1차 저항·반등한도', 'resist');
  }
  if (params.srPath?.supportPrice) {
    push(
      params.srPath.supportPrice,
      params.srPath.supportFirm ? '확실지지·롱후보' : '반등/롱 후보',
      'support'
    );
  }
  if (params.srPath?.invalidationPrice) {
    const broke =
      price < params.srPath.invalidationPrice * 0.9995
        ? '방어선 붕괴'
        : '방어·무효선';
    push(params.srPath.invalidationPrice, broke, 'pivot');
  }

  for (const z of params.zones ?? []) {
    const resistish = /매도|저항|ceiling/i.test(z.labelKo) || z.attackScore > z.defenseScore + 8;
    push(
      z.bot,
      z.labelKo || (resistish ? '폭락·저항' : '폭락·지지'),
      resistish ? 'resist' : 'support',
      z.top
    );
  }

  if (params.long?.entry) push(params.long.entry, '롱 E', 'support');
  if (params.long?.stopLoss) push(params.long.stopLoss, '롱 SL', 'pivot');
  if (params.short?.entry) push(params.short.entry, '숏 E', 'resist');
  if (params.whaleEntry) push(params.whaleEntry, '고래 진입참고', 'whale');
  if (params.whaleTarget) push(params.whaleTarget, '고래 목표참고', 'whale');
  if (params.liqLongCluster) push(params.liqLongCluster, '롱청산밀집', 'liq');
  if (params.liqShortCluster) push(params.liqShortCluster, '숏청산밀집', 'liq');
  if (params.eqh) push(params.eqh, 'EQH 유동성', 'liq');
  if (params.eql) push(params.eql, 'EQL 유동성', 'liq');

  rows.sort((a, b) => b.price - a.price);
  const out: Doksuri1MapLevel[] = [];
  for (const r of rows) {
    if (out.some((x) => Math.abs(x.price - r.price) / Math.max(r.price, 1) < 0.0008)) continue;
    out.push(r);
    if (out.length >= 12) break;
  }
  return out;
}

export function resolveNextBattle(params: {
  price: number;
  srPath?: DumpSupportResistPath | null;
  map: Doksuri1MapLevel[];
}): { price: number | null; ko: string | null } {
  const p = params.price;
  const above = params.map.filter((m) => m.price > p * 1.0005 && m.kind !== 'now');
  const below = params.map.filter((m) => m.price < p * 0.9995 && m.kind !== 'now');
  above.sort((a, b) => a.price - b.price);
  below.sort((a, b) => b.price - a.price);
  const up = above[0];
  const dn = below[0];
  if (!up && !dn) {
    if (params.srPath?.supportPrice) {
      return {
        price: params.srPath.supportPrice,
        ko: `지지 ${fmt(params.srPath.supportPrice)} 테스트`,
      };
    }
    return { price: null, ko: null };
  }
  const battle = up && dn ? (Math.abs(up.price - p) <= Math.abs(dn.price - p) ? up : dn) : up || dn;
  if (!battle) return { price: null, ko: null };
  return {
    price: battle.price,
    ko: `${battle.labelKo} ${fmt(battle.price)}${battle.priceHi ? `~${fmt(battle.priceHi)}` : ''}`,
  };
}
