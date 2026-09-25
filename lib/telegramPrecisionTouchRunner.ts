/**
 * 서버 자동 — 폭락구간 · 정밀E · 빅롱/빅숏 2차 터짐 터치/근접 → 텔레그램(+PNG).
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
 * TF: 15m · 1h · 4h · 1d · 1w · 1M (1m~5m 제외)
 * 폭락: 하방=롱반등 · 상방감시=숏거부 · E/SL/TP 명시
 * 조건부 참고 — 승률·수익 보장 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { MERGED_DESK_AUTO_ALERT_TFS } from '@/lib/telegramServerMergedDeskEval';
import { telegramEventDedupServerTry, telegramPriceBucket } from '@/lib/telegramEventDedupServer';
import {
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
  filterTelegramPricesToSymbolScale,
} from '@/lib/telegramSymbolPriceGuard';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import {
  buildTelegramZoneTouchChartSvg,
  type TelegramAlertChartLevels,
} from '@/lib/telegramAlertChartImage';
import {
  buildTelegramDeskBriefingHtml,
  buildTelegramPhotoCaptionHtml,
  type TelegramDumpGlanceBrief,
} from '@/lib/telegramAlertBriefing';
import {
  buildTelegramAlertChartContext,
  instBandExtraLines,
  type TelegramAlertChartContext,
} from '@/lib/telegramMtfAlertContext';
import { buildTelegramDumpPathSignalAsync } from '@/lib/telegramDumpPathBrief';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import {
  buildVolumeBurstSequenceIntel,
} from '@/lib/volumeBurstSequenceIntel';
import { detectSwingAnchorVolumeEvents } from '@/lib/mergedDeskSwingAnchorVolumeEvents';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { TelegramPlaybookPhase } from '@/lib/telegramSignalPlaybook';

const TOUCH_COOLDOWN_MS = 40 * 60_000;
export const PRECISION_TOUCH_COOLDOWN_MS = TOUCH_COOLDOWN_MS;
const NEAR_ATR = 0.4;

export type PrecisionTouchKind = 'dump' | 'precision-e' | 'vol-burst-1' | 'vol-burst-2';
export type PrecisionTouchMode = 'touch' | 'near' | 'inside';

export type PrecisionTouchHit = {
  kind: PrecisionTouchKind;
  kindKo: string;
  side: 'LONG' | 'SHORT' | 'WAIT';
  titleKo: string;
  top: number;
  bot: number;
  mid: number;
  detailKo: string;
  briefingKo: string;
  volumeBarIdx?: number;
  levels?: TelegramAlertChartLevels;
  invalidKo?: string;
  touchMode?: PrecisionTouchMode;
  phase?: TelegramPlaybookPhase;
  /** floor=하방폭락(롱) · ceiling=상방감시(숏) */
  dumpRole?: 'floor' | 'ceiling';
  cooldownMs?: number;
  /** 폭락 터치 — 거래량·반등/하락한도 한눈 브리핑 */
  dumpGlance?: TelegramDumpGlanceBrief;
  /** 지지 → 반등가능 → 저항 (차트 반등어디까지) */
  pathKo?: string;
  scenarioKo?: string;
  mtfLabelsKo?: string[];
};

export type TelegramPrecisionTouchStats = {
  touchSent: number;
  photoSent: number;
  dedupSkip: number;
  sendErr: number;
  noTouch: number;
  /** 이번 사이클에 폭락경로 히트 있음 → Hot/진입 중복 억제용 */
  dumpPathActive?: boolean;
};

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function atrApprox(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 3) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.01;
  let s = 0;
  let c = 0;
  const start = Math.max(1, n - period);
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.01;
}

function candleInBand(c: Candle, top: number, bot: number): boolean {
  const lo = Math.min(top, bot);
  const hi = Math.max(top, bot);
  return c.high >= lo && c.low <= hi;
}

/** 직전 밖 · 현재 안 = 첫 터치 */
function firstTouchBand(candles: Candle[], top: number, bot: number): boolean {
  if (candles.length < 2) return false;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  return candleInBand(cur, top, bot) && !candleInBand(prev, top, bot);
}

/** 근접: 현재가가 밴드±ATR*pad 안 · 직전은 더 멀리 */
function firstNearBand(
  candles: Candle[],
  top: number,
  bot: number,
  atr: number,
  padMult = NEAR_ATR
): boolean {
  if (candles.length < 2 || !(atr > 0)) return false;
  const pad = atr * padMult;
  const lo = Math.min(top, bot) - pad;
  const hi = Math.max(top, bot) + pad;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const curNear = cur.low <= hi && cur.high >= lo;
  const prevNear = prev.low <= hi && prev.high >= lo;
  if (!curNear || prevNear) return false;
  if (candleInBand(cur, top, bot)) return false;
  return true;
}

function candlesFromAnalysis(analysis: AnalyzeResponse): Candle[] {
  const raw = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles;
  return Array.isArray(raw) && raw.length ? raw : [];
}

function supportResistBrief(side: 'LONG' | 'SHORT' | 'WAIT', price: number, mid: number): string {
  if (side === 'LONG') {
    return price >= mid
      ? '지지 반응 관찰 가능(조건부) · 종가 이탈 시 무효 가능'
      : '지지 근접 · 안착 확인 전 대기';
  }
  if (side === 'SHORT') {
    return price <= mid
      ? '저항 거부 관찰 가능(조건부) · 종가 돌파 시 무효 가능'
      : '저항 근접 · 거부 확인 전 대기';
  }
  return '방향 대기 · 구조·수급 확인 필요';
}

/**
 * 거래량 빅롱/빅숏 — 통합데스크 Hot 정밀E 우선, 없으면 ATR·통계중앙으로 E/SL/TP.
 * 확정 진입 아님 · 조건부 참고.
 */
function buildVolBurstTradeLevels(params: {
  side: 'LONG' | 'SHORT';
  price: number;
  atr: number;
  candles: Candle[];
  timeframe: string;
  forecastMedianPct: number | null;
}): {
  levels: TelegramAlertChartLevels;
  meaningKo: string;
  planKo: string;
  invalidKo: string;
} {
  const { side, price, atr, candles, timeframe, forecastMedianPct } = params;
  let entry = price;
  let sl = side === 'LONG' ? price - atr * 1.15 : price + atr * 1.15;
  let tp1 =
    forecastMedianPct != null && Number.isFinite(forecastMedianPct)
      ? price * (1 + ((side === 'LONG' ? 1 : -1) * Math.abs(forecastMedianPct)) / 100)
      : side === 'LONG'
        ? price + atr * 1.6
        : price - atr * 1.6;
  let tp2 = side === 'LONG' ? price + atr * 2.8 : price - atr * 2.8;
  let inv = sl;
  let sourceKo = 'ATR·거래량통계';

  try {
    const hot = buildMergedDeskHotZoneEntryPack({
      candles,
      timeframe,
      currentPrice: price,
    });
    const prec = hot.precision;
    if (prec && prec.side === side && prec.entry > 0 && prec.stopLoss > 0) {
      entry = prec.entry;
      sl = prec.stopLoss;
      tp1 = prec.tp1 > 0 ? prec.tp1 : tp1;
      inv = prec.invalidationPrice > 0 ? prec.invalidationPrice : sl;
      sourceKo = 'Hot정밀E';
    } else {
      const primary = hot.all?.find((z) => z.side === side && z.primary) ?? hot.all?.find((z) => z.side === side);
      if (primary) {
        entry = primary.mid > 0 ? primary.mid : (primary.top + primary.bot) / 2;
        if (side === 'LONG') {
          sl = Math.min(primary.bot, entry) - atr * 0.35;
          if (!(tp1 < entry)) tp1 = entry + Math.max(atr * 1.5, (entry - sl) * 2);
        } else {
          sl = Math.max(primary.top, entry) + atr * 0.35;
          if (!(tp1 > 0 && tp1 < entry)) tp1 = entry - Math.max(atr * 1.5, (sl - entry) * 2);
        }
        inv = sl;
        sourceKo = 'Hot존';
      }
    }
  } catch {
    /* keep ATR */
  }

  try {
    const band = getLastInstitutionalBandEdges(candles);
    if (band) {
      if (side === 'SHORT' && band.lower > 0 && band.lower < entry) {
        tp2 = band.lower;
      } else if (side === 'LONG' && band.upper > 0 && band.upper > entry) {
        tp2 = band.upper;
      }
    }
  } catch {
    /* ignore */
  }

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(entry - tp1);
  const rr = risk > 0 ? reward / risk : 0;
  const meaningKo =
    side === 'SHORT'
      ? '거래량 빅숏 2차=매도 쪽 거래량 터짐 통계 이벤트(확정 숏 신호 아님). 거부·안착 확인 후 조건부 참고.'
      : '거래량 빅롱 2차=매수 쪽 거래량 터짐 통계 이벤트(확정 롱 신호 아님). 지지·안착 확인 후 조건부 참고.';
  const planKo = [
    `참고플랜(${sourceKo}) E ${fmtPx(entry)} · SL ${fmtPx(sl)} · TP1 ${fmtPx(tp1)}${tp2 ? ` · TP2 ${fmtPx(tp2)}` : ''}`,
    rr > 0 ? `RR≈${rr.toFixed(1)}` : '',
    side === 'SHORT'
      ? '진입: 저항 거부·되돌림 시 · 추격 금지'
      : '진입: 지지 안착·되돌림 시 · 추격 금지',
  ]
    .filter(Boolean)
    .join(' · ');
  const invalidKo =
    side === 'SHORT'
      ? `종가 ${fmtPx(inv)} 상방 돌파·안착 시 숏 시나리오 무효`
      : `종가 ${fmtPx(inv)} 하방 이탈·안착 시 롱 시나리오 무효`;

  return {
    levels: {
      entry,
      sl,
      tp1,
      tp2,
      tp3: null,
      inv,
    },
    meaningKo,
    planKo,
    invalidKo,
  };
}

/**
 * 폭락 · 정밀E · 거래량 2차 — 첫 터치/근접 수집.
 */
export function collectPrecisionTouchHits(params: {
  candles: Candle[];
  timeframe: string;
  price: number;
}): PrecisionTouchHit[] {
  const { candles, timeframe, price } = params;
  const tf = normalizeChartTimeframe(timeframe);
  if (candles.length < 24 || !(price > 0)) return [];
  const atr = atrApprox(candles);
  const hits: PrecisionTouchHit[] = [];

  /** 폭락경로는 async(MTF)로 runTelegramPrecisionTouch에서 주입 */

  /** 2) 정밀 E — Hot 주력 존 mid ± 얇은 밴드 */
  try {
    const hot = buildMergedDeskHotZoneEntryPack({
      candles,
      timeframe: tf,
      currentPrice: price,
    });
    const prec = hot.precision;
    const primary = hot.all?.find((z) => z.primary) ?? hot.all?.[0] ?? null;
    if (prec && primary && prec.entry > 0) {
      const half = Math.max(atr * 0.28, Math.abs(prec.entry) * 0.0004);
      const top = prec.entry + half;
      const bot = prec.entry - half;
      const touch = firstTouchBand(candles, top, bot);
      const near = !touch && firstNearBand(candles, top, bot, atr);
      if (touch || near) {
        const side = prec.side;
        hits.push({
          kind: 'precision-e',
          kindKo: '정밀타점E',
          side,
          titleKo: `정밀${side === 'LONG' ? '롱' : '숏'}E · ${touch ? '터치' : '근접'}`,
          top,
          bot,
          mid: prec.entry,
          detailKo: `E ${fmtPx(prec.entry)} · SL ${fmtPx(prec.stopLoss)} · TP1 ${fmtPx(prec.tp1)} · RR≈${Number(prec.rr).toFixed(1)}`,
          briefingKo: [
            supportResistBrief(side, price, prec.entry),
            prec.invalidationKo || '무효 조건 확인',
            '선물 정밀 타점 · 확정 아님',
          ].join(' · '),
          invalidKo: prec.invalidationKo || (side === 'LONG' ? 'SL 이탈 시 무효' : 'SL 돌파 시 무효'),
          levels: {
            entry: prec.entry,
            sl: prec.stopLoss,
            tp1: prec.tp1,
            tp2: null,
            tp3: null,
            inv: prec.invalidationPrice ?? prec.stopLoss,
          },
        });
      }
    }
  } catch {
    /* ignore precision */
  }

  /** 3) 거래량 1차 · 빅롱/빅숏 2차 터짐 */
  try {
    const swing = detectSwingAnchorVolumeEvents(candles, {
      timeframe: tf,
      maxEvents: 8,
      minBarGap: 5,
    });
    const burst = buildVolumeBurstSequenceIntel({
      candles,
      timeframe: tf,
      swingEvents: swing,
      spotPx: price,
    });
    const live = burst.live;
    const recentBar = (idx: number | undefined) =>
      idx != null && idx >= candles.length - 3;

    if (
      live.first &&
      (live.stageKo === '1차' || live.stageKo === '1차·횡보대기') &&
      (live.side === 'long' || live.side === 'short') &&
      recentBar(live.first.barIdx)
    ) {
      const side: 'LONG' | 'SHORT' = live.side === 'long' ? 'LONG' : 'SHORT';
      const px = Number(candles[live.first.barIdx]?.close) || price;
      const half = Math.max(atr * 0.32, px * 0.0008);
      const plan = buildVolBurstTradeLevels({
        side,
        price: px,
        atr,
        candles,
        timeframe: tf,
        forecastMedianPct: live.forecastMedianPct,
      });
      hits.push({
        kind: 'vol-burst-1',
        kindKo: '거래량1차',
        side,
        titleKo: `${side === 'LONG' ? '빅롱' : '빅숏'}·1차터짐`,
        top: px + half,
        bot: px - half,
        mid: px,
        detailKo: `${plan.meaningKo} · ${live.phaseKo} · RVOL ${live.first.rvol?.toFixed(1) ?? '—'} · ${live.stageKo}`,
        briefingKo: [
          plan.planKo,
          supportResistBrief(side, price, px),
          live.noteKo,
          '1차=초기 터짐 · 2차·구조 확인 전 대기 권장',
        ].join(' · '),
        invalidKo: plan.invalidKo,
        levels: plan.levels,
        volumeBarIdx: live.first.barIdx,
      });
    }

    if (
      live.stageKo === '2차터짐' &&
      live.second &&
      (live.side === 'long' || live.side === 'short') &&
      live.second.barIdx >= candles.length - 3
    ) {
      const side: 'LONG' | 'SHORT' = live.side === 'long' ? 'LONG' : 'SHORT';
      const px = Number(candles[live.second.barIdx]?.close) || price;
      const half = Math.max(atr * 0.35, px * 0.001);
      const fc =
        live.forecastMedianPct != null
          ? `과거중앙 ${live.forecastMedianPct >= 0 ? '+' : ''}${live.forecastMedianPct.toFixed(1)}%`
          : live.forecastKo || '표본 참고';
      const plan = buildVolBurstTradeLevels({
        side,
        price: px,
        atr,
        candles,
        timeframe: tf,
        forecastMedianPct: live.forecastMedianPct,
      });
      hits.push({
        kind: 'vol-burst-2',
        kindKo: side === 'LONG' ? '빅롱2차' : '빅숏2차',
        side,
        titleKo: `${side === 'LONG' ? '빅롱' : '빅숏'}·2차터짐`,
        top: px + half,
        bot: px - half,
        mid: px,
        detailKo: `${plan.meaningKo} · ${live.phaseKo} · 간격${live.gapBars ?? '—'}봉 · ${fc}`,
        briefingKo: [
          plan.planKo,
          supportResistBrief(side, price, px),
          live.noteKo,
          '2차터짐=거래량쌍 통계 이벤트 · 구조 거부/안착 확인 후 조건부',
        ].join(' · '),
        invalidKo: plan.invalidKo,
        levels: plan.levels,
        volumeBarIdx: live.second.barIdx,
      });
    }
  } catch {
    /* ignore burst */
  }

  /** 가격 0.35% 이내 같은 kind 중복 제거 */
  const out: PrecisionTouchHit[] = [];
  for (const h of hits) {
    const dup = out.find(
      (x) => x.kind === h.kind && Math.abs(x.mid - h.mid) / Math.max(h.mid, 1) < 0.0035
    );
    if (!dup) out.push(h);
  }
  return out;
}

function hitEmoji(hit: PrecisionTouchHit): string {
  if (hit.kind === 'dump') return hit.side === 'LONG' ? '🟢📉' : '🔴📉';
  if (hit.kind === 'vol-burst-1' || hit.kind === 'vol-burst-2') return '💥';
  return '🎯';
}

function hitBriefInput(
  symbol: string,
  timeframe: string,
  hit: PrecisionTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null
) {
  return {
    emoji: hitEmoji(hit),
    kindKo: hit.kindKo,
    symbol,
    timeframe,
    titleKo: hit.titleKo,
    side: hit.side === 'WAIT' ? undefined : hit.side,
    top: hit.top,
    bot: hit.bot,
    price,
    detailKo: hit.detailKo,
    briefingKo: hit.briefingKo,
    mtfSummaryKo: ctx?.mtfSummaryKo,
    mtfZoneLines: hit.mtfLabelsKo?.length
      ? hit.mtfLabelsKo
      : ctx?.mtfZones?.map((z) => z.labelKo),
    invalidKo: hit.invalidKo,
    phase: hit.phase ?? (hit.touchMode === 'near' ? 'approach' : 'touch'),
    dumpGlance: hit.dumpGlance,
    pathKo: hit.pathKo,
    scenarioKo: hit.scenarioKo,
    levels: hit.levels
      ? {
          entry: hit.levels.entry,
          sl: hit.levels.sl,
          tp1: hit.levels.tp1,
          tp2: hit.levels.tp2,
          tp3: hit.levels.tp3,
        }
      : undefined,
  };
}

export function precisionTouchHitBriefInput(
  symbol: string,
  timeframe: string,
  hit: PrecisionTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null
) {
  return hitBriefInput(symbol, timeframe, hit, price, ctx);
}

/** 번들용 — 폭락 + 정밀E 등 수집만 (발송 없음) */
export async function collectTelegramPrecisionTouchesForPair(params: {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse;
  candles?: Candle[] | null;
  price?: number | null;
  apiBase?: string;
}): Promise<{
  hits: PrecisionTouchHit[];
  dumpPathActive: boolean;
  candles: Candle[];
  price: number;
}> {
  const empty = { hits: [] as PrecisionTouchHit[], dumpPathActive: false, candles: [] as Candle[], price: 0 };
  const tf = String(params.timeframe || '').toLowerCase();
  if (!MERGED_DESK_AUTO_ALERT_TFS.has(tf)) return empty;

  const candles =
    (params.candles && params.candles.length ? params.candles : null) ||
    candlesFromAnalysis(params.analysis);
  const priceRaw =
    Number(params.price) > 0
      ? Number(params.price)
      : Number(params.analysis.currentPrice) || Number(candles[candles.length - 1]?.close) || 0;
  const candlePx = Number(candles[candles.length - 1]?.close) || 0;
  const price =
    candlePx > 0 &&
    telegramAssetPricePlausible(params.symbol, candlePx) &&
    (!telegramAssetPricePlausible(params.symbol, priceRaw) ||
      !telegramPriceCompatibleWithAnchor(candlePx, priceRaw, 1.5))
      ? candlePx
      : priceRaw;
  if (!telegramAssetPricePlausible(params.symbol, price)) return { ...empty, candles, price };

  const apiBase =
    (params.apiBase || '').trim() ||
    process.env.INTERNAL_API_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || '3000'}`;

  let dumpHit: PrecisionTouchHit | null = null;
  try {
    const dumpSig = await buildTelegramDumpPathSignalAsync({
      candles,
      timeframe: params.timeframe,
      price,
      symbol: params.symbol,
      apiBase: apiBase.replace(/\/$/, ''),
    });
    if (dumpSig) {
      dumpHit = {
        kind: 'dump',
        kindKo: dumpSig.kindKo,
        side: dumpSig.side,
        titleKo: dumpSig.titleKo,
        top: dumpSig.top,
        bot: dumpSig.bot,
        mid: dumpSig.mid,
        detailKo: dumpSig.detailKo,
        briefingKo: dumpSig.briefingKo,
        invalidKo: dumpSig.invalidKo,
        levels: dumpSig.levels,
        touchMode: dumpSig.touchMode,
        phase: dumpSig.phase,
        dumpRole: dumpSig.dumpRole,
        cooldownMs: dumpSig.cooldownMs,
        dumpGlance: dumpSig.dumpGlance,
        pathKo: dumpSig.pathKo,
        scenarioKo: dumpSig.scenarioKo,
        mtfLabelsKo: dumpSig.mtfLabelsKo,
      };
    }
  } catch {
    dumpHit = null;
  }

  const otherHits = collectPrecisionTouchHits({ candles, timeframe: params.timeframe, price });
  /** 번들: 폭락 우선 + 정밀 등 최대 2개 추가 */
  const hits = dumpHit ? [dumpHit, ...otherHits.slice(0, 2)] : otherHits.slice(0, 3);
  return { hits, dumpPathActive: Boolean(dumpHit), candles, price };
}

export async function sendPrecisionTouchHits(params: {
  user: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  hits: PrecisionTouchHit[];
  price: number;
  chartImageOn: boolean;
  chartContext?: TelegramAlertChartContext | null;
  settings: UserSettings;
  apiBase: string;
}): Promise<{ sent: number; photo: number; dedup: number; sendErr: number }> {
  let sent = 0;
  let photo = 0;
  let dedup = 0;
  let sendErr = 0;
  const tf = String(params.timeframe || '').toLowerCase();

  for (const hit of params.hits) {
    if (
      !telegramAssetPricePlausible(params.symbol, params.price) ||
      !telegramAssetPricePlausible(params.symbol, hit.mid) ||
      !telegramPriceCompatibleWithAnchor(params.price, hit.mid)
    ) {
      continue;
    }
    if (hit.levels) {
      const lv = [hit.levels.entry, hit.levels.sl, hit.levels.tp1, hit.levels.tp2, hit.levels.tp3];
      if (lv.some((n) => n != null && n > 0 && !telegramPriceCompatibleWithAnchor(params.price, n))) {
        continue;
      }
    }
    const mid = Math.round(hit.mid);
    const role = hit.dumpRole || 'na';
    /**
     * 폭락경로: mode(터치/근접) 제외 · 가격 버킷으로 같은 자리 묶음.
     * → near→touch→재터치해도 쿨다운 동안 1통만.
     */
    const bucket = telegramPriceBucket(params.price, hit.mid);
    const dedupeKey =
      hit.kind === 'dump'
        ? `dump-path|${params.user}|${params.symbol}|${tf}|${hit.side}|${role}|b${bucket}`
        : `precision-touch|${params.user}|${params.symbol}|${tf}|${hit.kind}|${hit.side}|${role}|b${bucket}`;
    const cooldown =
      hit.kind === 'dump'
        ? hit.cooldownMs && hit.cooldownMs > 0
          ? hit.cooldownMs
          : 10 * 60 * 60_000
        : hit.cooldownMs && hit.cooldownMs > 0
          ? hit.cooldownMs
          : TOUCH_COOLDOWN_MS;
    const ok = await telegramEventDedupServerTry(dedupeKey, cooldown);
    if (!ok) {
      dedup += 1;
      continue;
    }

    const briefIn = hitBriefInput(params.symbol, params.timeframe, hit, params.price, params.chartContext);
    const html = buildTelegramDeskBriefingHtml(briefIn);
    const ctx = params.chartContext;
    const extraLines = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      ctx ? instBandExtraLines(ctx) : [],
      (l) => l.price
    );
    const mtfZones = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      (ctx?.mtfZones ?? []).map((z) => ({
        ...z,
        primary:
          hit.kind === 'dump' &&
          Math.abs((z.top + z.bot) / 2 - hit.mid) / Math.max(hit.mid, 1) < 0.006,
      })),
      (z) => (z.top + z.bot) / 2
    );
    const volumeMarker =
      hit.volumeBarIdx != null && hit.side !== 'WAIT'
        ? { barIdx: hit.volumeBarIdx, side: hit.side }
        : undefined;
    let sentOk = false;
    let photoOk = false;

    if (params.chartImageOn && params.candles.length >= 4) {
      const sendR = await sendTelegramDeskAlertPhoto({
        captionHtml: html,
        photoCaptionHtml: buildTelegramPhotoCaptionHtml(briefIn),
        symbol: params.symbol,
        timeframe: params.timeframe,
        candles: params.candles,
        settings: params.settings,
        apiBase: params.apiBase,
        buildSvg: () =>
          buildTelegramZoneTouchChartSvg({
            symbol: params.symbol,
            timeframe: params.timeframe,
            candles: params.candles,
            titleKo: hit.kindKo,
            zone: {
              top: hit.top,
              bot: hit.bot,
              labelKo: hit.titleKo,
              side: hit.side === 'WAIT' ? undefined : hit.side,
            },
            currentPrice: params.price,
            extraLines,
            mtfZones,
            levels: hit.levels,
            volumeMarker,
            subtitleKo: `${hit.titleKo} · MTF·거래량 · 참고용`,
          }),
      });
      sentOk = sendR.ok;
      photoOk = sendR.photo;
    } else {
      const r = await sendTelegramHtmlCaptionToEnvChat(html);
      sentOk = r.ok;
    }

    if (sentOk) {
      sent += 1;
      if (photoOk) photo += 1;
      console.info('[telegram-precision-touch] sent', {
        user: params.user,
        symbol: params.symbol,
        timeframe: params.timeframe,
        kind: hit.kind,
        photo: photoOk,
      });
    } else {
      sendErr += 1;
    }
  }

  return { sent, photo, dedup, sendErr };
}

export async function runTelegramPrecisionTouchForFetchedPair(params: {
  user: string;
  settings: UserSettings;
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse;
  candles?: Candle[] | null;
  price?: number | null;
  chartContext?: TelegramAlertChartContext | null;
  apiBase?: string;
}): Promise<TelegramPrecisionTouchStats> {
  const empty: TelegramPrecisionTouchStats = {
    touchSent: 0,
    photoSent: 0,
    dedupSkip: 0,
    sendErr: 0,
    noTouch: 0,
  };
  if (params.settings.telegramPrecisionTouchEnabled === false) return empty;

  const tf = String(params.timeframe || '').toLowerCase();
  if (!MERGED_DESK_AUTO_ALERT_TFS.has(tf)) return empty;

  const candles =
    (params.candles && params.candles.length ? params.candles : null) ||
    candlesFromAnalysis(params.analysis);
  const priceRaw =
    Number(params.price) > 0
      ? Number(params.price)
      : Number(params.analysis.currentPrice) || Number(candles[candles.length - 1]?.close) || 0;
  const candlePx = Number(candles[candles.length - 1]?.close) || 0;
  const price =
    candlePx > 0 &&
    telegramAssetPricePlausible(params.symbol, candlePx) &&
    (!telegramAssetPricePlausible(params.symbol, priceRaw) ||
      !telegramPriceCompatibleWithAnchor(candlePx, priceRaw, 1.5))
      ? candlePx
      : priceRaw;
  if (!telegramAssetPricePlausible(params.symbol, price)) return empty;

  const apiBase =
    (params.apiBase || '').trim() ||
    process.env.INTERNAL_API_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || '3000'}`;

  /** 통합모드 MTF 폭락경로 우선 */
  let dumpHit: PrecisionTouchHit | null = null;
  try {
    const dumpSig = await buildTelegramDumpPathSignalAsync({
      candles,
      timeframe: params.timeframe,
      price,
      symbol: params.symbol,
      apiBase: apiBase.replace(/\/$/, ''),
    });
    if (dumpSig) {
      dumpHit = {
        kind: 'dump',
        kindKo: dumpSig.kindKo,
        side: dumpSig.side,
        titleKo: dumpSig.titleKo,
        top: dumpSig.top,
        bot: dumpSig.bot,
        mid: dumpSig.mid,
        detailKo: dumpSig.detailKo,
        briefingKo: dumpSig.briefingKo,
        invalidKo: dumpSig.invalidKo,
        levels: dumpSig.levels,
        touchMode: dumpSig.touchMode,
        phase: dumpSig.phase,
        dumpRole: dumpSig.dumpRole,
        cooldownMs: dumpSig.cooldownMs,
        dumpGlance: dumpSig.dumpGlance,
        pathKo: dumpSig.pathKo,
        scenarioKo: dumpSig.scenarioKo,
        mtfLabelsKo: dumpSig.mtfLabelsKo,
      };
    }
  } catch {
    dumpHit = null;
  }

  const otherHits = collectPrecisionTouchHits({ candles, timeframe: params.timeframe, price });
  const hits = dumpHit ? [dumpHit] : otherHits;
  const dumpPathActive = Boolean(dumpHit);
  if (!hits.length) return { ...empty, noTouch: 1, dumpPathActive: false };

  const chartImageOn = params.settings.telegramConfirmChartImageEnabled !== false;
  let chartContext = params.chartContext ?? null;
  if (chartImageOn && !chartContext) {
    try {
      const primary = hits.find((h) => h.kind === 'dump');
      chartContext = await buildTelegramAlertChartContext({
        base: apiBase.replace(/\/$/, ''),
        symbol: params.symbol,
        chartTf: params.timeframe,
        chartCandles: candles,
        primaryZone: primary ? { top: primary.top, bot: primary.bot } : undefined,
      });
    } catch {
      chartContext = null;
    }
  }

  const r = await sendPrecisionTouchHits({
    user: params.user,
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles,
    hits,
    price,
    chartImageOn,
    chartContext,
    settings: params.settings,
    apiBase: apiBase.replace(/\/$/, ''),
  });
  return {
    touchSent: r.sent,
    photoSent: r.photo,
    dedupSkip: r.dedup,
    sendErr: r.sendErr,
    noTouch: 0,
    dumpPathActive,
  };
}
