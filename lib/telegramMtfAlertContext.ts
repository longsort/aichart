/**
 * 텔레그램 알림 차트 — 앱(통합·분석)과 동일 MTF 폭락·기관밴드 맥락.
 * 서버 cron 전용. 조건부 참고 — 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import {
  buildMergedDeskMtfDumpZonePack,
  MTF_DUMP_HTF_ALWAYS,
  mergedDeskTfLabelKo,
  resolveMtfDumpScanTfs,
  type MtfDumpZoneSpec,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  dumpBandBounceContext,
  dumpBandFaceRoleKo,
  dumpLifeVisual,
} from '@/lib/mergedDeskDumpLifeCycle';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  filterTelegramPricesToSymbolScale,
  telegramAssetPricePlausible,
} from '@/lib/telegramSymbolPriceGuard';

export type TelegramMtfZoneBand = {
  top: number;
  bot: number;
  labelKo: string;
  fill: string;
  stroke: string;
  bandRole: 'floor' | 'ceiling';
  sourceTf: string;
  /** 터치 알림 주 구간 — 차트에서 강조 */
  primary?: boolean;
};

export type TelegramAlertChartContext = {
  mtfZones: TelegramMtfZoneBand[];
  mtfSummaryKo: string;
  instBandUpper: number | null;
  instBandLower: number | null;
};

const ctxCache = new Map<string, { ctx: TelegramAlertChartContext; at: number }>();
const CTX_TTL_MS = 22_000;

async function fetchCandles(base: string, symbol: string, tf: string): Promise<Candle[]> {
  const q = `symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`;
  if (isBitgetPerpChartSymbol(symbol)) {
    try {
      const r = await fetch(`${base}/api/market-bitget?${q}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
      if (j.ok !== false && Array.isArray(j.candles) && j.candles.length >= 2) return j.candles;
    } catch {
      /* fall through */
    }
  }
  try {
    const r = await fetch(`${base}/api/market?${q}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
    if (Array.isArray(j.candles) && j.candles.length) return j.candles;
  } catch {
    /* empty */
  }
  return [];
}

/** 통합데스크와 동일 — 차트TF + HTF 캔들 맵 */
export async function fetchTelegramMtfCandlesByTf(params: {
  base: string;
  symbol: string;
  chartTf: string;
  chartCandles: Candle[];
}): Promise<Record<string, Candle[]>> {
  const sym = String(params.symbol || '').trim().toUpperCase();
  const chartTf = normalizeChartTimeframe(params.chartTf);
  const candles = params.chartCandles ?? [];
  const out: Record<string, Candle[]> = {};
  if (!sym || candles.length < 2) {
    if (candles.length >= 2) out[chartTf] = candles;
    return out;
  }
  const scanTfs = resolveMtfDumpScanTfs(chartTf);
  const fetchTfs = [...new Set([...MTF_DUMP_HTF_ALWAYS.map(normalizeChartTimeframe), chartTf, ...scanTfs])];
  const results = await Promise.all(fetchTfs.map((tf) => fetchCandles(params.base, sym, tf)));
  fetchTfs.forEach((tf, i) => {
    const c = results[i] ?? [];
    if (c.length >= 2) out[tf] = c;
  });
  if (!out[chartTf]?.length) out[chartTf] = candles;
  return out;
}

function specToBand(spec: MtfDumpZoneSpec, primary?: boolean): TelegramMtfZoneBand {
  const role = spec.bandRole === 'ceiling' ? 'ceiling' : 'floor';
  const life = spec.lifeState ?? 'WATCH';
  const vis = dumpLifeVisual(life);
  const tfKo = mergedDeskTfLabelKo(spec.sourceTf);
  const bounceCtx = dumpBandBounceContext({
    life: life,
    role,
  });
  const roleKo = dumpBandFaceRoleKo({ role, bounceContext: bounceCtx });
  const labelKo = spec.labelKo || `${tfKo} ${roleKo}`;
  const stroke =
    role === 'ceiling'
      ? life === 'CONFIRM_RESIST' || life === 'RESIST_WATCH'
        ? '#fb923c'
        : '#ca8a04'
      : life === 'CONFIRM_DOWN'
        ? '#f87171'
        : life === 'CONFIRM_UP' || life === 'BOUNCE_WATCH'
          ? '#4ade80'
          : vis.line || '#ca8a04';
  const fill =
    role === 'ceiling'
      ? life === 'CONFIRM_RESIST' || life === 'RESIST_WATCH'
        ? 'rgba(251,146,60,0.16)'
        : 'rgba(234,179,8,0.18)'
      : vis.fill || 'rgba(239,68,68,0.17)';
  return {
    top: spec.top,
    bot: spec.bot,
    labelKo,
    fill,
    stroke,
    bandRole: role,
    sourceTf: normalizeChartTimeframe(spec.sourceTf),
    primary,
  };
}

function zoneNear(a: number, b: number): boolean {
  const m = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / m < 0.004;
}

function isPrimaryZone(
  spec: MtfDumpZoneSpec,
  primary?: { top: number; bot: number }
): boolean {
  if (!primary) return false;
  const mid = (spec.top + spec.bot) / 2;
  const pMid = (primary.top + primary.bot) / 2;
  return zoneNear(mid, pMid) || zoneNear(spec.top, primary.top) || zoneNear(spec.bot, primary.bot);
}

/**
 * 차트 TF + HTF(4h·1d·1w·1M) 캔들 fetch → MTF 폭락 pack → SVG 밴드.
 */
export async function buildTelegramAlertChartContext(params: {
  base: string;
  symbol: string;
  chartTf: string;
  chartCandles: Candle[];
  primaryZone?: { top: number; bot: number };
}): Promise<TelegramAlertChartContext> {
  const sym = String(params.symbol || '').trim().toUpperCase();
  const chartTf = normalizeChartTimeframe(params.chartTf);
  const candles = params.chartCandles ?? [];
  const empty: TelegramAlertChartContext = {
    mtfZones: [],
    mtfSummaryKo: '',
    instBandUpper: null,
    instBandLower: null,
  };
  if (!sym || candles.length < 8) return empty;
  const anchor = Number(candles[candles.length - 1]?.close) || 0;
  if (anchor > 0 && !telegramAssetPricePlausible(sym, anchor)) return empty;

  const cacheKey = `${sym}|${chartTf}|${candles[candles.length - 1]?.time ?? 0}|${Math.round(params.primaryZone?.top ?? 0)}`;
  const hit = ctxCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CTX_TTL_MS) return hit.ctx;

  const scanTfs = resolveMtfDumpScanTfs(chartTf);
  const fetchTfs = [...new Set([...MTF_DUMP_HTF_ALWAYS.map(normalizeChartTimeframe), chartTf, ...scanTfs])];
  const candlesByTf = await fetchTelegramMtfCandlesByTf({
    base: params.base,
    symbol: sym,
    chartTf,
    chartCandles: candles,
  });
  void fetchTfs;

  let pack;
  try {
    pack = buildMergedDeskMtfDumpZonePack({
      chartCandles: candlesByTf[chartTf] ?? candles,
      chartTf,
      candlesByTf,
      displayMode: 'mtf',
    });
  } catch {
    pack = { zones: [], summaryKo: '', reachSummaryKo: '', bounceCapKo: '' };
  }

  const mtfZonesRaw = (pack.zones ?? []).slice(0, 12).map((z) =>
    specToBand(z, isPrimaryZone(z, params.primaryZone))
  );
  const mtfZones = filterTelegramPricesToSymbolScale(
    sym,
    anchor,
    mtfZonesRaw,
    (z) => (z.top + z.bot) / 2
  );

  const summaryParts = [
    pack.summaryKo,
    pack.reachSummaryKo,
    pack.bounceCapKo,
  ].filter(Boolean);
  /** 반등가능 문구 중복 제거 — 텔레 캡션이 같은 문장 반복되던 문제 */
  const rawJoin = summaryParts.join(' · ');
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const part of rawJoin.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean)) {
    const key = part.replace(/\s+/g, '').slice(0, 32);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(part);
    if (uniq.length >= 5) break;
  }
  const mtfSummaryKo = uniq.join(' · ').slice(0, 220);

  const bandE = getLastInstitutionalBandEdges(candles);
  let instBandUpper = bandE?.upper ?? null;
  let instBandLower = bandE?.lower ?? null;
  if (instBandUpper != null && !telegramAssetPricePlausible(sym, instBandUpper)) instBandUpper = null;
  if (instBandLower != null && !telegramAssetPricePlausible(sym, instBandLower)) instBandLower = null;
  const ctx: TelegramAlertChartContext = {
    mtfZones,
    mtfSummaryKo,
    instBandUpper,
    instBandLower,
  };
  ctxCache.set(cacheKey, { ctx, at: Date.now() });
  return ctx;
}

export function instBandExtraLines(ctx: TelegramAlertChartContext): Array<{
  price: number;
  color: string;
  label: string;
}> {
  const out: Array<{ price: number; color: string; label: string }> = [];
  if (ctx.instBandUpper != null && ctx.instBandUpper > 0) {
    out.push({ price: ctx.instBandUpper, color: '#f87171', label: '기관상' });
  }
  if (ctx.instBandLower != null && ctx.instBandLower > 0) {
    out.push({ price: ctx.instBandLower, color: '#4ade80', label: '기관하' });
  }
  return out;
}
