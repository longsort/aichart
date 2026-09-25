/**
 * 텔레그램 폭락경로 — 통합·분석 차트와 동일 엔진.
 * MTF 폭락/폭등감시 · 반등어디까지(지지→반등가능→저항) · Hot합류 · E/SL/TP1/TP2/TP3
 * 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import {
  buildMergedDeskMtfDumpZonePack,
  mergedDeskTfLabelKo,
  type MtfDumpZoneSpec,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  dumpBandBounceContext,
  dumpBandFaceRoleKo,
} from '@/lib/mergedDeskDumpLifeCycle';
import {
  buildDumpSupportResistPath,
  type DumpSupportResistPath,
} from '@/lib/mergedDeskDumpSupportResistPath';
import type { DumpBounceCap } from '@/lib/mergedDeskDumpCeilingReachStats';
import { buildDumpReboundConfluencePack } from '@/lib/mergedDeskDumpReboundConfluencePack';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import { fetchTelegramMtfCandlesByTf } from '@/lib/telegramMtfAlertContext';
import type { TelegramAlertChartLevels } from '@/lib/telegramAlertChartImage';
import type { TelegramDumpGlanceBrief } from '@/lib/telegramAlertBriefing';
import type { TelegramPlaybookPhase } from '@/lib/telegramSignalPlaybook';
import {
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
} from '@/lib/telegramSymbolPriceGuard';
import { formatReachConditionalKo } from '@/lib/mergedDeskSupportResistScore';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';

export type DumpPathTouchMode = 'touch' | 'near' | 'inside';

export type TelegramDumpPathSignal = {
  side: 'LONG' | 'SHORT' | 'WAIT';
  kindKo: string;
  titleKo: string;
  top: number;
  bot: number;
  mid: number;
  detailKo: string;
  briefingKo: string;
  invalidKo: string;
  levels: TelegramAlertChartLevels;
  touchMode: DumpPathTouchMode;
  phase: TelegramPlaybookPhase;
  dumpRole: 'floor' | 'ceiling';
  cooldownMs: number;
  dumpGlance: TelegramDumpGlanceBrief;
  pathKo: string;
  scenarioKo: string;
  /** 차트 우측과 같은 MTF 폭락 라벨 */
  mtfLabelsKo: string[];
};

const TOUCH_COOLDOWN_MS = 40 * 60_000;

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function pctFrom(from: number, to: number): string {
  if (!(from > 0) || !(to > 0)) return '';
  const p = ((to - from) / from) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function pxPct(from: number, to: number): string {
  const pct = pctFrom(from, to);
  return pct ? `${fmtPx(to)}(${pct})` : fmtPx(to);
}

function atrApprox(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 3) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.01;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - period); i < n; i++) {
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

function firstTouchBand(candles: Candle[], top: number, bot: number): boolean {
  if (candles.length < 2) return false;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  return candleInBand(cur, top, bot) && !candleInBand(prev, top, bot);
}

function firstNearBand(candles: Candle[], top: number, bot: number, atr: number, padMult: number): boolean {
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

function nearPad(tf: string): number {
  if (tf === '1w' || tf === '1M') return 1.25;
  if (tf === '1d') return 0.95;
  if (tf === '4h' || tf === '1h') return 0.7;
  return 0.4;
}

function resolveMode(
  candles: Candle[],
  top: number,
  bot: number,
  atr: number,
  tf: string
): DumpPathTouchMode | null {
  /** 스팸 방지: 구간 안 상주(inside)는 알림 안 함 — 첫 진입(터치/근접)만 */
  if (firstTouchBand(candles, top, bot)) return 'touch';
  if (firstNearBand(candles, top, bot, atr, nearPad(tf))) return 'near';
  return null;
}

function modeKo(m: DumpPathTouchMode): string {
  if (m === 'near') return '근접';
  if (m === 'inside') return '구간안';
  return '터치';
}

/**
 * 같은 폭락자리 = 긴 쿨다운.
 * 이탈 후 재진입만 다시 알림 (디듀프 키에 mode 미포함).
 */
function cooldownMs(tf: string, mode: DumpPathTouchMode): number {
  const base =
    tf === '1w' || tf === '1M'
      ? 48 * 60 * 60_000
      : tf === '1d'
        ? 24 * 60 * 60_000
        : tf === '4h'
          ? 16 * 60 * 60_000
          : tf === '1h'
            ? 10 * 60 * 60_000
            : 6 * 60 * 60_000;
  /** 근접은 터치보다 약간 짧게 — 그래도 최소 4h */
  if (mode === 'near') return Math.max(4 * 60 * 60_000, Math.floor(base * 0.75));
  return base;
}

function readVolume(candles: Candle[]): {
  gradeKo: '많음' | '보통' | '적음';
  lineKo: string;
  meaningKo: (side: 'LONG' | 'SHORT') => string;
} {
  const n = candles.length;
  if (n < 8) {
    return {
      gradeKo: '보통',
      lineKo: '거래량 표본 부족',
      meaningKo: () => '확인 전 대기',
    };
  }
  const hist = candles
    .slice(Math.max(0, n - 21), n - 1)
    .map((c) => Number(c.volume) || 0)
    .filter((v) => v > 0);
  const last = Number(candles[n - 1]!.volume) || 0;
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : Math.max(last, 1);
  const rvol = avg > 0 ? last / avg : 1;
  const gradeKo: '많음' | '보통' | '적음' = rvol >= 1.75 ? '많음' : rvol < 0.75 ? '적음' : '보통';
  return {
    gradeKo,
    lineKo: `거래량 ${gradeKo} (최근대비 ${rvol.toFixed(1)}배)`,
    meaningKo: (side) => {
      if (side === 'LONG') {
        if (gradeKo === '많음') return '반등 반응 가능 · 이탈도 빠를 수 있음';
        if (gradeKo === '적음') return '반응 약함 · 안착 확인 전 대기';
        return '보통 · 종가·다음봉 확인';
      }
      if (gradeKo === '많음') return '거부·하락 압력 가능';
      if (gradeKo === '적음') return '거부 약함 · 확인 대기';
      return '보통 · 윗꼬리·종가 확인';
    },
  };
}

function bounceCapFromPack(
  pack: { bounceCapPrice?: number; bounceCapKo?: string },
  price: number,
  tf: string
): DumpBounceCap | null {
  const px = Number(pack.bounceCapPrice);
  if (!(px > 0) || !(price > 0)) return null;
  const gapPct = ((px - price) / price) * 100;
  return {
    sourceTf: normalizeChartTimeframe(tf),
    sourceTfKo: mergedDeskTfLabelKo(tf),
    price: px,
    mid: px,
    gapPct,
    labelKo: pack.bounceCapKo || `반등가능 ${Math.round(px)}`,
    tipKo: `반등 1차 한도 ≈ ${Math.round(px)} (+${gapPct.toFixed(1)}%) · 한도·목표가 보장 아님`,
    reachPct: null,
    reachSample: null,
  };
}

function pickTouchZone(
  zones: MtfDumpZoneSpec[],
  candles: Candle[],
  atr: number,
  tf: string,
  srPath: DumpSupportResistPath
): { zone: MtfDumpZoneSpec; mode: DumpPathTouchMode; role: 'floor' | 'ceiling' } | null {
  const chartTf = normalizeChartTimeframe(tf);
  const ranked = [...zones].sort((a, b) => {
    const aChart = normalizeChartTimeframe(a.sourceTf) === chartTf ? 1 : 0;
    const bChart = normalizeChartTimeframe(b.sourceTf) === chartTf ? 1 : 0;
    if (aChart !== bChart) return bChart - aChart;
    const aSup =
      srPath.support && Math.abs(a.mid - (srPath.supportPrice || 0)) / Math.max(a.mid, 1) < 0.01 ? 1 : 0;
    const bSup =
      srPath.support && Math.abs(b.mid - (srPath.supportPrice || 0)) / Math.max(b.mid, 1) < 0.01 ? 1 : 0;
    return bSup - aSup;
  });

  for (const z of ranked) {
    if (!(z.top > 0) || !(z.bot > 0)) continue;
    const mode = resolveMode(candles, z.top, z.bot, atr, chartTf);
    if (!mode) continue;
    return { zone: z, mode, role: z.bandRole === 'ceiling' ? 'ceiling' : 'floor' };
  }

  if (srPath.support && srPath.supportPrice) {
    const mid = srPath.supportPrice;
    const half = Math.max(atr * 0.35, mid * 0.0015);
    const mode = resolveMode(candles, mid + half, mid - half, atr, chartTf);
    if (mode) {
      return {
        zone: {
          sourceTf: srPath.support.sourceTf,
          sourceTfKo: srPath.support.sourceTfKo,
          top: mid + half,
          bot: mid - half,
          mid,
          formedTime: 0,
          labelKo: `${srPath.support.sourceTfKo} 폭락`,
          detailKo: srPath.pathKo,
          analysisSource: 'wyckoff',
          bandRole: 'floor',
        },
        mode,
        role: 'floor',
      };
    }
  }
  return null;
}

/** 상위 TF ceiling들을 TP2/TP3 후보로 */
function ceilingTargetsAbove(zones: MtfDumpZoneSpec[], above: number): number[] {
  const xs: { px: number; rank: number }[] = [];
  for (const z of zones) {
    if (z.bandRole !== 'ceiling') continue;
    const bot = Math.min(Number(z.bot), Number(z.top));
    const mid = Number(z.mid) > 0 ? Number(z.mid) : bot;
    const px = bot > 0 ? bot : mid;
    if (!(px > above * 1.001)) continue;
    xs.push({ px, rank: timeframeRank(normalizeChartTimeframe(z.sourceTf)) });
  }
  xs.sort((a, b) => a.px - b.px || b.rank - a.rank);
  const out: number[] = [];
  for (const x of xs) {
    if (out.some((p) => Math.abs(p - x.px) / Math.max(p, 1) < 0.002)) continue;
    out.push(x.px);
    if (out.length >= 4) break;
  }
  return out;
}

function floorTargetsBelow(zones: MtfDumpZoneSpec[], below: number): number[] {
  const xs: { px: number; rank: number }[] = [];
  for (const z of zones) {
    if ((z.bandRole ?? 'floor') === 'ceiling') continue;
    const mid = Number(z.mid) > 0 ? Number(z.mid) : (Number(z.top) + Number(z.bot)) / 2;
    if (!(mid < below * 0.999)) continue;
    xs.push({ px: mid, rank: timeframeRank(normalizeChartTimeframe(z.sourceTf)) });
  }
  xs.sort((a, b) => b.px - a.px || b.rank - a.rank);
  const out: number[] = [];
  for (const x of xs) {
    if (out.some((p) => Math.abs(p - x.px) / Math.max(p, 1) < 0.002)) continue;
    out.push(x.px);
    if (out.length >= 4) break;
  }
  return out;
}

function mtfZoneLabels(zones: MtfDumpZoneSpec[], max = 6): string[] {
  const rows = [...zones]
    .sort(
      (a, b) =>
        timeframeRank(normalizeChartTimeframe(b.sourceTf)) -
        timeframeRank(normalizeChartTimeframe(a.sourceTf))
    )
    .map((z) => {
      const life = z.lifeState
        ? ` ${z.lifeState === 'BOUNCE_WATCH' ? '반등감시' : z.lifeState === 'WATCH' ? '감시' : ''}`.trim()
        : '';
      const role = z.bandRole === 'ceiling' ? 'ceiling' : 'floor';
      const bounceCtx = dumpBandBounceContext({
        life: z.lifeState,
        role,
      });
      const base =
        z.labelKo ||
        `${z.sourceTfKo} ${dumpBandFaceRoleKo({ role, bounceContext: bounceCtx })}`;
      const touch = z.touchLabelKo || (z.touchCount != null ? `터치${z.touchCount}` : '');
      const prob =
        z.srLabelKo ||
        (z.reachPct != null
          ? formatReachConditionalKo(z.reachPct, z.reachSample)
          : z.touchReactionPct != null
            ? `${z.bandRole === 'ceiling' ? '저항조건부' : '지지조건부'}${Math.round(z.touchReactionPct)}%`
            : '');
      return `${base}${life ? ` · ${life}` : ''}${touch ? ` · ${touch}` : ''}${prob ? ` · ${prob}` : ''}`
        .replace(/\s+/g, ' ')
        .trim();
    });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const k = r.slice(0, 36);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 통합모드와 동일 입력으로 폭락경로 신호 생성.
 */
export function buildTelegramDumpPathSignal(params: {
  candles: Candle[];
  timeframe: string;
  price: number;
  candlesByTf?: Record<string, Candle[] | null | undefined>;
  symbol?: string;
  whaleBeamIntel?: WhaleBeamIntelPack | null;
}): TelegramDumpPathSignal | null {
  const candles = params.candles;
  const candlePx = Number(candles[candles.length - 1]?.close) || 0;
  let price = Number(params.price);
  const tf = normalizeChartTimeframe(params.timeframe);
  if (candles.length < 24 || !(price > 0)) return null;
  const sym = params.symbol || '';
  if (sym) {
    if (!telegramAssetPricePlausible(sym, price)) return null;
    if (candlePx > 0 && !telegramAssetPricePlausible(sym, candlePx)) return null;
    if (candlePx > 0 && !telegramPriceCompatibleWithAnchor(candlePx, price, 1.5)) {
      price = candlePx;
    }
  }

  const atr = atrApprox(candles);
  const candlesByTfRaw = {
    ...(params.candlesByTf || {}),
    [tf]: params.candlesByTf?.[tf]?.length ? params.candlesByTf[tf] : candles,
  };
  /** HTF 캔들이 다른 심볼 가격대면 제외 (BTC↔ETH 혼입 방지) */
  const candlesByTf: Record<string, Candle[] | null | undefined> = {};
  for (const [k, v] of Object.entries(candlesByTfRaw)) {
    if (!v?.length) continue;
    const last = Number(v[v.length - 1]?.close) || 0;
    if (sym && last > 0 && !telegramPriceCompatibleWithAnchor(price, last, 4)) continue;
    if (sym && last > 0 && !telegramAssetPricePlausible(sym, last)) continue;
    candlesByTf[k] = v;
  }
  if (!candlesByTf[tf]?.length) candlesByTf[tf] = candles;

  let hotAll: ReturnType<typeof buildMergedDeskHotZoneEntryPack>['all'] | null = null;
  let hotPrec: ReturnType<typeof buildMergedDeskHotZoneEntryPack>['precision'] | null = null;
  try {
    const hot = buildMergedDeskHotZoneEntryPack({
      candles,
      timeframe: tf,
      currentPrice: price,
    });
    hotAll = hot.all ?? null;
    hotPrec = hot.precision ?? null;
  } catch {
    hotAll = null;
    hotPrec = null;
  }

  let pack;
  try {
    pack = buildMergedDeskMtfDumpZonePack({
      chartCandles: candles,
      chartTf: tf,
      candlesByTf,
      hotZones: hotAll,
      whaleBeamIntel: params.whaleBeamIntel ?? null,
      displayMode: 'mtf',
    });
  } catch {
    return null;
  }
  if (!pack.zones.length && !pack.bounceCapPrice) return null;

  const bounceCap = bounceCapFromPack(pack, price, tf);
  const srPath = buildDumpSupportResistPath({
    zones: pack.zones,
    bounceCap,
    priceNow: price,
    chartCandles: candles,
  });

  const touched = pickTouchZone(pack.zones, candles, atr, tf, srPath);
  if (!touched) return null;

  const rebound = buildDumpReboundConfluencePack({
    chartCandles: candles,
    chartTf: tf,
    zones: pack.zones,
    srPath,
    bounceCap,
    hotZones: hotAll,
  });

  const vol = readVolume(candles);
  const tfKo = mergedDeskTfLabelKo(tf);
  const { zone, mode, role } = touched;
  const labels = mtfZoneLabels(pack.zones);

  let side: 'LONG' | 'SHORT' | 'WAIT' =
    rebound?.direction === 'LONG' || rebound?.direction === 'SHORT'
      ? rebound.direction
      : role === 'ceiling'
        ? 'SHORT'
        : 'LONG';
  if (rebound?.verdict === 'INVALID' || srPath.scenario === 'FAIL') {
    side = 'SHORT';
  }

  const bouncePx =
    srPath.bounceLimitPrice ??
    bounceCap?.price ??
    pack.bounceCapPrice ??
    (rebound?.tp1 && rebound.tp1 > 0 ? rebound.tp1 : null);
  const supportPx = srPath.supportPrice ?? zone.mid;
  const resistPx = srPath.resistPrice ?? bouncePx;
  const dumpPx =
    side === 'SHORT'
      ? srPath.supportPrice ?? Math.min(zone.bot, zone.top)
      : srPath.invalidationPrice ?? Math.min(zone.bot, zone.top);

  /** 진입: Hot정밀E가 같은 방향이면 우선(차트 Hot존 정렬) */
  let entry =
    rebound?.entry && rebound.entry > 0
      ? rebound.entry
      : side === 'LONG'
        ? supportPx
        : zone.mid;
  if (hotPrec && hotPrec.side === side && hotPrec.entry > 0) {
    const nearHot = Math.abs(hotPrec.entry - price) / price < 0.012;
    if (nearHot || mode === 'touch' || mode === 'inside') {
      entry = hotPrec.entry;
    }
  }

  let sl =
    rebound?.stopLoss && rebound.stopLoss > 0
      ? rebound.stopLoss
      : side === 'LONG'
        ? (srPath.invalidationPrice ?? Math.min(zone.bot, zone.top) - atr * 0.35)
        : Math.max(zone.top, zone.bot) + atr * 0.35;
  if (hotPrec && hotPrec.side === side && hotPrec.stopLoss > 0) {
    sl = hotPrec.stopLoss;
  }

  const ups = ceilingTargetsAbove(pack.zones, entry);
  const dns = floorTargetsBelow(pack.zones, entry);

  let tp1: number;
  let tp2: number;
  let tp3: number;
  if (side === 'LONG') {
    tp1 =
      rebound?.tp1 && rebound.tp1 > entry
        ? rebound.tp1
        : bouncePx && bouncePx > entry
          ? bouncePx
          : ups[0] ?? entry + atr * 1.8;
    tp2 =
      rebound?.tp2 && rebound.tp2 > tp1
        ? rebound.tp2
        : resistPx && resistPx > tp1
          ? resistPx
          : ups.find((x) => x > tp1 * 1.001) ?? tp1 + atr * 1.5;
    tp3 =
      rebound?.tp3 && rebound.tp3 > tp2
        ? rebound.tp3
        : ups.find((x) => x > tp2 * 1.001) ?? tp2 + atr * 1.6;
  } else {
    tp1 =
      rebound?.tp1 && rebound.tp1 < entry
        ? rebound.tp1
        : dumpPx && dumpPx < entry
          ? dumpPx
          : dns[0] ?? entry - atr * 1.8;
    tp2 =
      rebound?.tp2 && rebound.tp2 < tp1
        ? rebound.tp2
        : dns.find((x) => x < tp1 * 0.999) ?? tp1 - atr * 1.5;
    tp3 =
      rebound?.tp3 && rebound.tp3 < tp2
        ? rebound.tp3
        : dns.find((x) => x < tp2 * 0.999) ?? tp2 - atr * 1.6;
  }

  if (hotPrec && hotPrec.side === side && hotPrec.tp1 > 0) {
    if (side === 'LONG' && hotPrec.tp1 > entry) tp1 = hotPrec.tp1;
    if (side === 'SHORT' && hotPrec.tp1 < entry) tp1 = hotPrec.tp1;
  }

  const levels: TelegramAlertChartLevels = {
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    inv: rebound?.invalidationPrice ?? sl,
  };

  const pathKo =
    srPath.pathKo ||
    pack.supportResistPathKo ||
    [
      supportPx ? `지지 ${Math.round(supportPx)}` : null,
      bouncePx ? `반등가능 ${Math.round(bouncePx)}` : null,
      resistPx && resistPx !== bouncePx ? `저항 ${Math.round(resistPx)}` : null,
    ]
      .filter(Boolean)
      .join(' → ');

  const scenarioKo = srPath.scenarioKo || pack.pathScenarioKo || '감시';
  const resultKo =
    side === 'LONG'
      ? rebound?.verdict === 'CONFIRM'
        ? '롱 반등'
        : '롱 반등 관찰'
      : rebound?.verdict === 'CONFIRM'
        ? '숏 나락/거부'
        : '숏 관찰';

  const bounceLine =
    bouncePx && bouncePx > 0
      ? `반등 어디까지: ${pxPct(price, bouncePx)} · ${bounceCap?.labelKo || '반등가능 1차한도'}`
      : `반등 어디까지: TP1 ${pxPct(entry, tp1)}`;
  const dumpLine =
    side === 'LONG'
      ? `하락 어디까지: 무효/손절 ${pxPct(price, dumpPx || sl)}`
      : `하락 어디까지: TP1 ${pxPct(entry, tp1)} · TP2 ${pxPct(entry, tp2)} · TP3 ${pxPct(entry, tp3)}`;

  const activeBounce = pack.bounceTargetByTf?.activeRow;
  const tfBounceBit =
    activeBounce?.bounce1Px != null
      ? `${activeBounce.sourceTfKo} ${Math.round(activeBounce.supportPx || 0)}→${Math.round(activeBounce.bounce1Px)}${
          activeBounce.gapPct != null ? `(+${activeBounce.gapPct}%)` : ''
        }`
      : '';

  const touchLabel =
    zone.touchLabelKo ||
    (zone.touchCount != null && zone.touchCount > 0 ? `터치${zone.touchCount}` : '');
  const srBit = zone.srLabelKo || '';
  const reachPct =
    zone.reachPct != null
      ? zone.reachPct
      : activeBounce?.reachPct != null
        ? activeBounce.reachPct
        : zone.touchReactionPct;
  const reachSample = zone.reachSample ?? activeBounce?.reachSample ?? null;
  const probBit =
    srBit ||
    (reachPct != null
      ? formatReachConditionalKo(reachPct, reachSample)
      : '');
  const chipBit = (zone.evidenceChips || []).slice(0, 2).join('+');
  const touchProbLineKo = [touchLabel, probBit, chipBit || null]
    .filter(Boolean)
    .join(' · ');

  const dumpGlance: TelegramDumpGlanceBrief = {
    oneLookKo: `${side === 'LONG' ? '🟢' : '🔴'} ${resultKo} · 거래량 ${vol.gradeKo} · ${scenarioKo}${
      touchLabel ? ` · ${touchLabel}` : ''
    }${probBit ? ` · ${probBit}` : ''}${chipBit ? ` · ${chipBit}` : ''}`,
    volumeLineKo: `${vol.lineKo} → ${vol.meaningKo(side === 'SHORT' ? 'SHORT' : 'LONG')}`,
    bounceLineKo: bounceLine + (tfBounceBit ? ` · ${tfBounceBit}` : '') + (probBit ? ` · ${probBit}` : ''),
    dumpLineKo: dumpLine,
    structureLineKo: `경로: ${pathKo || scenarioKo}`,
    touchProbLineKo:
      touchProbLineKo ||
      (touchLabel || probBit ? [touchLabel, probBit].filter(Boolean).join(' · ') : undefined),
  };

  if (sym) {
    if (!telegramAssetPricePlausible(sym, zone.mid)) return null;
    if (!telegramPriceCompatibleWithAnchor(price, zone.mid)) return null;
    for (const n of [entry, sl, tp1, tp2, tp3]) {
      if (n > 0 && !telegramPriceCompatibleWithAnchor(price, n)) return null;
    }
  }

  return {
    side,
    kindKo: '통합폭락경로',
    titleKo: `${tfKo} 통합분석 · ${modeKo(mode)} · ${resultKo}`,
    top: zone.top,
    bot: zone.bot,
    mid: zone.mid,
    detailKo: [
      dumpGlance.oneLookKo,
      `경로 ${pathKo}`,
      bounceLine,
      dumpGlance.touchProbLineKo || '',
      `E ${fmtPx(entry)} · SL ${fmtPx(sl)} · TP1 ${fmtPx(tp1)} · TP2 ${fmtPx(tp2)} · TP3 ${fmtPx(tp3)}`,
      labels.slice(0, 3).join(' · '),
    ]
      .filter(Boolean)
      .join(' · '),
    briefingKo: [
      vol.lineKo,
      dumpGlance.touchProbLineKo || '',
      zone.srTipKo || '',
      rebound?.summaryKo || scenarioKo,
      hotPrec ? `Hot정밀E합류` : '',
      '통합·분석 차트와 동일 계열 · 조건부 참고',
    ]
      .filter(Boolean)
      .join(' · '),
    invalidKo:
      side === 'LONG'
        ? `종가 ${fmtPx(sl)} 이탈 시 롱 경로 약화·무효 가능`
        : `종가 ${fmtPx(sl)} 돌파 시 숏 경로 약화·무효 가능`,
    levels,
    touchMode: mode,
    phase: mode === 'near' ? 'approach' : 'touch',
    dumpRole: role,
    cooldownMs: cooldownMs(tf, mode),
    dumpGlance,
    pathKo,
    scenarioKo,
    mtfLabelsKo: labels,
  };
}

/** 서버 cron — MTF 캔들 fetch 후 통합모드와 동일 팩 */
export async function buildTelegramDumpPathSignalAsync(params: {
  candles: Candle[];
  timeframe: string;
  price: number;
  symbol: string;
  apiBase: string;
}): Promise<TelegramDumpPathSignal | null> {
  const base = (params.apiBase || '').replace(/\/$/, '');
  let candlesByTf: Record<string, Candle[]> = {
    [normalizeChartTimeframe(params.timeframe)]: params.candles,
  };
  let whaleBeamIntel: WhaleBeamIntelPack | null = null;
  try {
    if (base && params.symbol) {
      candlesByTf = await fetchTelegramMtfCandlesByTf({
        base,
        symbol: params.symbol,
        chartTf: params.timeframe,
        chartCandles: params.candles,
      });
      try {
        const bq = new URLSearchParams({
          symbol: String(params.symbol).toUpperCase(),
          timeframe: normalizeChartTimeframe(params.timeframe),
        });
        const beamRes = await fetch(`${base}/api/bitget-whale-volume-beam-intel?${bq}`, {
          cache: 'no-store',
        });
        const beamData = (await beamRes.json()) as {
          ok?: boolean;
          intel?: WhaleBeamIntelPack | null;
        };
        if (beamData?.ok && beamData.intel) whaleBeamIntel = beamData.intel;
      } catch {
        /* whale optional — SR/합류는 거래량만으로도 동작 */
      }
    }
  } catch {
    /* keep chart tf only */
  }
  return buildTelegramDumpPathSignal({
    candles: params.candles,
    timeframe: params.timeframe,
    price: params.price,
    candlesByTf,
    symbol: params.symbol,
    whaleBeamIntel,
  });
}
