/**
 * Doksuri-1 — Zone absorption (estimateAbsorptionAtZone + 캔들 폴백).
 * 체결 없으면 캔들 겹침·거래량으로만 참고 (창작 금지 · 표본 부족 null).
 */
import type { Candle } from '@/types';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { estimateAbsorptionAtZone } from '@/lib/aiMarketZone/orderflowEngine';
import { dumpZoneStableId } from '@/lib/mergedDeskLearningSnapshot';
import type { AmzZoneRole } from '@/lib/aiMarketZone/types';

function atr14(candles: Candle[]): number {
  if (candles.length < 3) {
    const c = candles[candles.length - 1];
    return c ? Math.max(1, c.close * 0.01) : 1;
  }
  const end = candles.length - 1;
  const start = Math.max(1, end - 13);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.max(1, candles[end]!.close * 0.01);
}

function roleOf(z: MtfDumpZoneSpec): AmzZoneRole {
  return z.bandRole === 'ceiling' ? 'DEFENSE_RESISTANCE' : 'DEFENSE_SUPPORT';
}

/** 캔들 기반 흡수 참고 — 존 가격대 겹침 봉의 거래량↑·레인지↓ */
function absorbFromCandles(
  candles: Candle[],
  lo: number,
  hi: number,
  atr: number
): { score: number | null; note: string } {
  const mid = (lo + hi) / 2;
  if (!(mid > 0) || !(atr > 0)) return { score: null, note: '가격대 불가' };
  const hit = candles.filter((c) => c.low <= hi && c.high >= lo).slice(-24);
  if (hit.length < 4) return { score: null, note: `존겹침봉 ${hit.length} · 흡수 추정 불가` };
  const vols = hit.map((c) => Number(c.volume) || 0);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastVol = vols[vols.length - 1] || 0;
  const ranges = hit.map((c) => Math.max(c.high - c.low, 1e-9));
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const moveNorm = avgRange / atr;
  let score = Math.max(
    0,
    Math.min(100, (1 - Math.min(1.2, moveNorm)) * 65 + Math.min(25, (lastVol / Math.max(avgVol, 1e-9)) * 12))
  );
  score = Math.round(score);
  return {
    score,
    note: `캔들기반 흡수참고 · 겹침${hit.length} · 이동/ATR ${moveNorm.toFixed(2)}`,
  };
}

export function buildDoksuri1Absorption(params: {
  symbol: string;
  candles: Candle[];
  zones: MtfDumpZoneSpec[] | null | undefined;
  trades?: AggTrade[] | null;
  enabled: boolean;
}): {
  absorptionScore: number | null;
  absorptionNoteKo: string | null;
  byZoneId: Record<string, number | null>;
} {
  if (!params.enabled) {
    return { absorptionScore: null, absorptionNoteKo: null, byZoneId: {} };
  }
  const zones = params.zones ?? [];
  if (!zones.length || params.candles.length < 8) {
    return {
      absorptionScore: null,
      absorptionNoteKo: null,
      byZoneId: {},
    };
  }

  const atr = atr14(params.candles);
  const trades = params.trades?.length ? params.trades : null;
  const byZoneId: Record<string, number | null> = {};
  const notes: string[] = [];
  const scores: number[] = [];

  for (const z of zones.slice(0, 6)) {
    const lo = Math.min(z.top, z.bot);
    const hi = Math.max(z.top, z.bot);
    const id = dumpZoneStableId({
      symbol: params.symbol,
      sourceTf: z.sourceTf,
      bandRole: z.bandRole,
      top: z.top,
      bot: z.bot,
    });
    let score: number | null = null;
    let note = '';
    if (trades) {
      const r = estimateAbsorptionAtZone({
        trades,
        zoneLo: lo,
        zoneHi: hi,
        role: roleOf(z),
        atr,
      });
      score = r.score;
      note = r.note;
    } else {
      const r = absorbFromCandles(params.candles, lo, hi, atr);
      score = r.score;
      note = r.note;
    }
    byZoneId[id] = score;
    if (score != null) {
      scores.push(score);
      notes.push(`${z.sourceTfKo || z.sourceTf} ${score} · ${note}`);
    }
  }

  if (!scores.length) {
    return {
      absorptionScore: null,
      absorptionNoteKo: trades ? '존 흡수 표본 부족' : '체결 없음 · 캔들 흡수 표본 부족',
      byZoneId,
    };
  }

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    absorptionScore: avg,
    absorptionNoteKo: `흡수 ${avg} · ${notes[0]}${notes.length > 1 ? ` 외${notes.length - 1}` : ''}`,
    byZoneId,
  };
}
