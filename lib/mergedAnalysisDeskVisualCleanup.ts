/**
 * 통합·분석 차트 — zone 면·라벨 정리 (15m 공유 분석, 전 TF 동일).
 * 핵심 $$$$ 롱·숏 타점 각 1개만 보이게 — 나머지는 면·라벨 숨김(삭제 아님).
 * $$$$ = 돈구간(HQ/HotZone 합류 타점) — 면 + 중간가 전폭선으로 식별.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import { mergedDeskLastCandleZoneBars, mergedDeskAnalyzedZoneSpanTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { tightenMoneyZoneVerticalSpan, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { computeMoneyZoneBreakHold } from '@/lib/mergedDeskMoneyZoneBreakHold';
import { applyMergedDeskZoneBreakLifecycle } from '@/lib/mergedDeskZoneBreakLifecycle';
import { loadSettings } from '@/lib/settings';

const SWING_FUSION_ZONE_IDS = new Set([
  'merged-swing-fusion-risk',
  'merged-swing-fusion-reward-tp1',
  'merged-swing-fusion-reward-ext',
  'merged-swing-fusion-entry-pocket',
]);

const ZONE_KINDS = new Set([
  'zone',
  'box',
  'supplyZone',
  'demandZone',
  'fvg',
  'ob',
  'reactionZone',
  'bprZone',
]);

const MONEY_LABEL = MONTH_DESK_MONEY_LABEL; // $$$$

function isZoneFace(o: OverlayItem): boolean {
  return ZONE_KINDS.has(String(o.kind || '')) || !!o.channelBand;
}

function isCloudOrTradeRailFace(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  return (
    id.startsWith('merged-cp-cloud') ||
    id.startsWith('merged-unified-cloud') ||
    id.startsWith('merged-ares-st-cloud') ||
    extra.includes('merged-cp-cloud') ||
    extra.includes('merged-unified-cloud') ||
    extra.includes('merged-ares-st-cloud') ||
    extra.includes('merged-desk-hotzone-rail') ||
    extra.includes('merged-swing-mid-rail') ||
    /^merged-desk-trade-rail-/.test(id) ||
    /^merged-ares-line-/.test(id)
  );
}

function atr14(candles: Candle[]): number {
  const end = candles.length - 1;
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - 13);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]!.close) * 0.01;
}

/** HQ / HotZone 후보만 — 핵심 타점 풀 */
export function isMergedDeskMoneyZoneCandidate(
  o: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'label'>
): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (extra.includes('merged-desk-hotzone-rail') || extra.includes('merged-swing-mid-rail')) {
    return false;
  }
  if (id.startsWith('merged-desk-hq-') || extra.includes('merged-hq-entry-zone')) return true;
  if (
    id === 'merged-desk-entry-zone' ||
    id === 'merged-desk-sl-zone' ||
    id === 'merged-desk-tp-zone' ||
    id === 'merged-desk-candle-card-entry-ev' ||
    id === 'merged-desk-hot-glow-band' ||
    extra.includes('merged-desk-trade-target-band') ||
    extra.includes('merged-desk-candle-card-evidence')
  ) {
    return true;
  }
  if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone-entry')) {
    return true;
  }
  /** AI 세력ZONE은 $$$ 타점 1장 경쟁에 넣지 않음 — polish에서 별도 항상 유지 */
  return false;
}

/** @deprecated — 후보 판별용. keep 여부는 polish가 결정 */
export function isMergedDeskMoneyZoneKeepFace(
  o: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'label'>
): boolean {
  const extra = String(o.overlayZoneExtraClass || '');
  if (extra.includes('merged-desk-money-zone-keep')) return true;
  return isMergedDeskMoneyZoneCandidate(o);
}

function moneySide(o: OverlayItem): 'LONG' | 'SHORT' | null {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const label = String(o.label || o.zoneFaceBase || '');
  /** 돌파·무효 zone은 활성 돈구간($$$$) 후보에서 제외 */
  if (
    extra.includes('merged-desk-zone-broken') ||
    /숏돌파|롱이탈|상단돌파|돌파무효/.test(label)
  ) {
    return null;
  }
  if (
    id.includes('hq-short') ||
    id.includes('hotzone-above') ||
    extra.includes('merged-hq-short') ||
    extra.includes('hotzone-signal--short') ||
    o.kind === 'supplyZone' ||
    /숏|short|저항/i.test(label)
  ) {
    return 'SHORT';
  }
  if (
    id.includes('hq-long') ||
    id.includes('hotzone-below') ||
    extra.includes('merged-hq-long') ||
    extra.includes('hotzone-signal--long') ||
    o.kind === 'demandZone' ||
    /롱|long|지지/i.test(label)
  ) {
    return 'LONG';
  }
  return null;
}

function moneyRank(o: OverlayItem): number {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const conf = Number(o.confidence);
  let score = Number.isFinite(conf) ? conf : 50;
  if (id.startsWith('merged-desk-hq-') || extra.includes('merged-hq-entry-zone')) score += 40;
  if (extra.includes('merged-hq-grade-A') || /\bA\b/.test(String(o.label || ''))) score += 20;
  if (extra.includes('merged-hq-grade-B')) score += 8;
  if (extra.includes('merged-desk-hotzone-entry--primary')) score += 18;
  if (extra.includes('merged-desk-hotzone-entry--enter')) score += 12;
  if (extra.includes('merged-desk-hotzone-entry--touch')) score += 6;
  if (String(o.label || '').includes('★')) score += 5;
  return score;
}

function hideZoneFaceCompletely(raw: OverlayItem): OverlayItem {
  /** 면·라벨 유지 — 숨기면 통합차트에 작도가 안 보임 */
  const extra = String(raw.overlayZoneExtraClass || '')
    .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
    .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    ...raw,
    zoneFillPreserve: true,
    overlayZoneExtraClass: extra,
  };
}

/** 와이코프·엘리엇·학파 도식/블링크 — 머니존 정리에서 숨기지 않음 */
function isMergedDeskSchoolSchematicOverlay(o: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'>): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (id.includes('-blink-') && id.startsWith('merged-desk-')) return true;
  if (
    id.startsWith('merged-desk-wyckoff-') ||
    id.startsWith('merged-desk-reacc-') ||
    id.startsWith('merged-desk-elliott-') ||
    id.startsWith('merged-desk-dow-') ||
    id.startsWith('merged-desk-smc-') ||
    id.startsWith('merged-desk-ict-') ||
    id.startsWith('merged-desk-harmonic-') ||
    id.startsWith('merged-desk-turtle-') ||
    id.startsWith('merged-desk-albrooks-') ||
    id.startsWith('merged-desk-vsa-') ||
    id.startsWith('merged-desk-school-')
  ) {
    return true;
  }
  return (
    extra.includes('merged-desk-wyckoff') ||
    extra.includes('merged-desk-reacc') ||
    extra.includes('merged-desk-elliott') ||
    extra.includes('merged-desk-school-schematic') ||
    extra.includes('schematic-') ||
    extra.includes('-blink-')
  );
}

function keepSchoolSchematicOverlay(raw: OverlayItem): OverlayItem {
  const extra = String(raw.overlayZoneExtraClass || '');
  return {
    ...raw,
    zoneFillPreserve: true,
    overlayZoneExtraClass: `${extra
      .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
      .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
      .trim()} merged-desk-school-schematic-keep`.trim(),
  };
}

/** 파랑빨강띠 레일 반등·눌림 타점 zone (라벨 유지 대상) */
function isMergedDeskRbReactionEntryZone(id: string, extra: string): boolean {
  return (
    id.includes('rb-rail-bounce') ||
    id.includes('rb-pullback') ||
    extra.includes('merged-desk-rb-rail-bounce') ||
    extra.includes('merged-desk-rb-pullback-entry') ||
    extra.includes('merged-desk-rb-pullback-long') ||
    extra.includes('merged-desk-rb-pullback-short')
  );
}

/**
 * AI ZONE ON + 클래식 ZONE OFF — Mirage/SMC 범람 제거, AI·Hot·채널·로켓만.
 */
export function filterMergedDeskEngineZoneClutter(
  overlays: OverlayItem[],
  opts: { aiZoneMode: boolean; classicZoneOn: boolean }
): OverlayItem[] {
  if (!opts.aiZoneMode || opts.classicZoneOn) return overlays;
  return overlays.filter((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const kind = String(o.kind || '');
    const face = String(o.zoneFaceBase || o.label || '');
    if (id.startsWith('eagle1-ai-zone--') || extra.includes('eagle1-ai-analysis-zone')) return true;
    if (kind === 'channelBand' || kind === 'trendLine') return true;
    if (isMergedDeskRequestedVisibleZone(o)) return true;
    if (id.startsWith('merged-desk-rb-') && kind !== 'zone') return true;
    if (
      id.startsWith('merged-desk-rb-fog-') ||
      extra.includes('merged-desk-rb-fog-pocket') ||
      extra.includes('merged-desk-rb-gravity-well')
    ) {
      return true;
    }
    if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-hq-entry-zone')) return true;
    if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return true;
    if (kind === 'zone' || kind === 'reactionZone' || kind === 'keyLevel') {
      if (id.startsWith('merged-ares-mlsp-tv-') || id.startsWith('merged-ares-zone-')) return false;
      if (id.startsWith('merged-ares-') || extra.includes('merged-ares-zone')) return false;
      if (/강력|공급|수요|저항|지지|Supply|Demand|OB|FVG/i.test(face)) return false;
      return false;
    }
    return true;
  });
}

/** 사용자가 지정한 차트 면만: 파랑빨강띠 · $$$$ · 핵심 하얀 · 폭락 · 레일반등/눌림 · AI ZONE · AI존엔진 */
export function isMergedDeskRequestedVisibleZone(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const kind = String(o.kind || '');
  const text = `${o.label || ''}${o.zoneFaceBase || ''}${o.zoneFaceSignal || ''}`;
  /** AI Market Zone 엔진 칩 — zone 네모 면 */
  if (
    id.startsWith('ai-market-zone-') ||
    extra.includes('ai-market-zone') ||
    o.category === 'aiMarketZone'
  ) {
    return true;
  }
  /** AVWAP 분홍/초록 줄 → zone 면 (숫자 알약·화살 금지) */
  if (
    id.startsWith('avwap-entry-guide-') ||
    extra.includes('avwap-entry-guide') ||
    o.category === 'avwapEntryGuide'
  ) {
    return true;
  }
  /** 기관ST 터치 — ↓화살 대신 zone */
  if (
    id.startsWith('st-band-touch-zone-') ||
    extra.includes('st-band-touch-zone')
  ) {
    return true;
  }
  /** 파랑빨강 × MSB·OB·BB·MB — zone 면 */
  if (
    id.startsWith('merged-desk-rb-smc-') ||
    extra.includes('merged-desk-rb-smc')
  ) {
    return true;
  }
  /** AI ZONE v2 — 차트 면(클릭 시 근거 카드). 카드만이 아님 */
  if (
    id.startsWith('eagle1-ai-zone--') ||
    id.startsWith('eagle1-entry-zone') ||
    extra.includes('eagle1-ai-analysis-zone')
  ) {
    return true;
  }
  if (
    id.startsWith('merged-ares-st-cloud') ||
    extra.includes('merged-ares-st-cloud') ||
    extra.includes('merged-desk-st-cloud-keep') ||
    o.category === 'monthDeskEnvelope'
  ) {
    return true;
  }
  if (kind === 'channelBand') {
    return (
      id.startsWith('merged-desk-rb-') ||
      extra.includes('merged-desk-rb-channel') ||
      extra.includes('merged-desk-blue-red-channel')
    );
  }
  if (/\$\$\$\$/.test(text) || extra.includes('merged-desk-money-zone-keep')) return true;
  if (extra.includes('merged-desk-strongest-analysis-zone') || /★\s*최강/.test(text)) return true;
  if (isMergedDeskRbReactionEntryZone(id, extra)) return true;
  if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone-entry')) {
    return true;
  }
  if (id.startsWith('merged-desk-advvol-seat') || extra.includes('merged-desk-advvol-seat')) {
    return true;
  }
  if (
    id.includes('rb-core-settle') ||
    id.includes('rb-core-fail') ||
    extra.includes('merged-desk-rb-core-settle') ||
    extra.includes('merged-desk-rb-core-fail')
  ) {
    return true;
  }
  /** 레일LED·안개포켓·팁존·구조문(중력우물) */
  if (
    id.startsWith('merged-desk-rb-fog-') ||
    id.startsWith('merged-desk-rb-tip-') ||
    id === 'merged-desk-rb-horizon-door' ||
    extra.includes('merged-desk-rb-fog-pocket') ||
    extra.includes('merged-desk-rb-rail-led') ||
    extra.includes('merged-desk-rb-gravity-well') ||
    extra.includes('merged-desk-rb-tip-zone')
  ) {
    return true;
  }
  /** 파동 이동경로 (실선·점선·핀) */
  if (
    id.startsWith('merged-desk-wave-path') ||
    extra.includes('merged-desk-wave-path')
  ) {
    return true;
  }
  if (
    /폭락/.test(text) ||
    id.includes('dump-zone') ||
    extra.includes('schematic-dump') ||
    extra.includes('merged-desk-crash')
  ) {
    return true;
  }
  if (isMergedDeskSchoolSchematicOverlay(o)) return true;
  if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return true;
  return false;
}

/** 우측 pill — $$$$ 돈구간 식별 (등급은 툴팁) */
function coreEntryCaption(side: 'LONG' | 'SHORT', grade?: string): string {
  const g =
    grade === 'A' || grade === 'ultra' || grade === 'strong'
      ? grade === 'A' || grade === 'ultra'
        ? '초강'
        : '강'
      : grade === 'B' || grade === 'mid'
        ? '중'
        : '약';
  return side === 'LONG' ? `${MONEY_LABEL}롱·${g}` : `${MONEY_LABEL}숏·${g}`;
}

/** 타점 면 세로폭 — ATR 대비 얇게 (넓은 박스가 타점을 가리지 않게) */
function tightEntryBand(
  top: number,
  bot: number,
  mid: number,
  atr: number,
  close: number
): { top: number; bot: number } {
  const ref = Math.max(Math.abs(mid), Math.abs(close), 1e-9);
  const maxSpan = Math.min(
    Math.max(atr * 0.22, ref * 0.0018),
    Math.max(atr * 0.55, ref * 0.0045),
    Math.max(top - bot, atr * 0.12)
  );
  const half = maxSpan / 2;
  return { top: mid + half, bot: mid - half };
}

function extractGrade(o: OverlayItem): string | undefined {
  const blob = `${o.overlayZoneExtraClass || ''} ${o.label || ''}`;
  return /grade-([AB])|\b([AB])\b/i.exec(blob)?.[1] || /[AB]/.exec(String(o.label || ''))?.[0];
}

/**
 * SMC 작도·Mirage 합류 후에도 호출 — $$$$ 롱·숏 타점 각 1개만 남김.
 */
export function polishMergedDeskChartOverlays(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string,
  trade?: MergedTradeSignal | null
): OverlayItem[] {
  if (!overlays.length) return overlays;

  const close = Number(candles[candles.length - 1]?.close);
  const atrVal = candles.length >= 2 ? atr14(candles) : Math.abs(close || 1) * 0.01;
  const tf = normalizeChartTimeframe(timeframe);

  const width = mergedDeskLastCandleZoneBars(timeframe);
  const tail = candles.length ? candles.slice(-Math.min(width + 12, candles.length)) : [];
  let tLo = Infinity;
  let tHi = -Infinity;
  for (const c of tail) {
    tLo = Math.min(tLo, c.low);
    tHi = Math.max(tHi, c.high);
  }
  if (Number.isFinite(close) && close > 0) {
    const corridor = trade
      ? [trade.entry, trade.stopLoss, trade.tp1, trade.tp2, trade.tp3, close].filter(
          (p) => Number.isFinite(p) && p > 0
        )
      : [close];
    if (corridor.length) {
      tLo = Math.min(tLo, ...corridor);
      tHi = Math.max(tHi, ...corridor);
    }
  }
  const pad = Math.max((tHi - tLo) * 0.06, Math.abs(close || 1) * 0.004, 8);
  const bandTop = Number.isFinite(tHi) ? tHi + pad : close || 0;
  const bandBot = Number.isFinite(tLo) ? tLo - pad : close || 0;

  const base = overlays.filter((o) => !SWING_FUSION_ZONE_IDS.has(String(o.id || '')));

  /** 방향별 최고점 후보 1개 (filter 이후 인덱스) */
  let bestLong: { i: number; rank: number } | null = null;
  let bestShort: { i: number; rank: number } | null = null;
  for (let i = 0; i < base.length; i++) {
    const o = base[i]!;
    if (!isZoneFace(o) || !isMergedDeskMoneyZoneCandidate(o)) continue;
    const side = moneySide(o);
    if (!side) continue;
    const rank = moneyRank(o);
    if (side === 'LONG') {
      if (!bestLong || rank > bestLong.rank) bestLong = { i, rank };
    } else if (!bestShort || rank > bestShort.rank) {
      bestShort = { i, rank };
    }
  }

  /** HQ/HotZone 한쪽이 비면 demand/supply로만 보강 (기존 후보 덮어쓰기 금지) */
  const needLong = !bestLong;
  const needShort = !bestShort;
  if (needLong || needShort) {
    for (let i = 0; i < base.length; i++) {
      const o = base[i]!;
      if (!isZoneFace(o)) continue;
      if (String(o.overlayZoneExtraClass || '').includes('merged-desk-hotzone-rail')) continue;
      const id = String(o.id || '');
      if (id.startsWith('merged-swing-') || id.includes('channel') || id.includes('regime')) continue;
      const side = moneySide(o);
      if (!side) continue;
      if (side === 'LONG' && !needLong) continue;
      if (side === 'SHORT' && !needShort) continue;
      const p1 = Number(o.price1);
      const p2 = Number(o.price2);
      if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
      const mid = (p1 + p2) / 2;
      const dist = Number.isFinite(close) ? Math.abs(mid - close) : 0;
      const rank = moneyRank(o) - (dist / Math.max(atrVal, 1)) * 0.01;
      if (side === 'LONG') {
        if (!bestLong || rank > bestLong.rank) bestLong = { i, rank };
      } else if (!bestShort || rank > bestShort.rank) {
        bestShort = { i, rank };
      }
    }
  }

  const keepIdx = new Set<number>();
  if (bestLong) keepIdx.add(bestLong.i);
  if (bestShort) keepIdx.add(bestShort.i);

  const polished = base.map((raw, i) => {
      const id = String(raw.id || '');
      const extra = String(raw.overlayZoneExtraClass || '');
      const kind = String(raw.kind || '');

      if (isMergedDeskSchoolSchematicOverlay(raw)) {
        return keepSchoolSchematicOverlay(raw);
      }

      if (id.startsWith('merged-desk-live-practice') || extra.includes('merged-desk-live-practice')) {
        return isZoneFace(raw) ? hideZoneFaceCompletely(raw) : raw;
      }

      if (id.startsWith('merged-desk-advvol-seat') || extra.includes('merged-desk-advvol-seat')) {
        return {
          ...raw,
          zoneFillPreserve: true,
          overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep`.trim(),
        };
      }

      if (id.startsWith('merged-swing-regime-')) {
        return {
          ...raw,
          label: '',
          price1: bandTop,
          price2: bandBot,
          color: 'rgba(0,0,0,0)',
          overlayZoneExtraClass: `${extra} merged-desk-regime-compact merged-desk-zone-face-hidden`.trim(),
        };
      }

      if (
        id.startsWith('merged-swing-channel') ||
        id.startsWith('merged-desk-rb-') ||
        extra.includes('merged-swing-channel') ||
        extra.includes('merged-desk-rb-channel') ||
        extra.includes('merged-desk-blue-red-channel')
      ) {
        /** 파란·빨간 띠만 유지 — 스윙채널 면은 숨김 */
        if (kind === 'channelBand') {
          const isRbBand =
            id.startsWith('merged-desk-rb-') ||
            extra.includes('merged-desk-rb-channel') ||
            extra.includes('merged-desk-blue-red-channel');
          if (!isRbBand) return hideZoneFaceCompletely(raw);
          const isConf =
            id.includes('confluence') || extra.includes('merged-desk-rb-confluence');
          if (isConf || extra.includes('merged-desk-rb-secondary')) {
            return hideZoneFaceCompletely(raw);
          }
          return {
            ...raw,
            zoneFillPreserve: true,
            label: String(raw.label || raw.zoneFaceBase || '채널'),
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep`.trim(),
          };
        }
        /** 폭락구간·핵심 하얀 안착/실패만 유지 (도식반등/저항·게이트면은 숨김) */
        if (
          id.includes('dump-zone') ||
          extra.includes('schematic-dump') ||
          /폭락/.test(String(raw.label || raw.zoneFaceBase || ''))
        ) {
          return {
            ...raw,
            zoneFillPreserve: true,
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep`.trim(),
          };
        }
        if (
          id.includes('rb-core-settle') ||
          id.includes('rb-core-fail') ||
          extra.includes('merged-desk-rb-core-settle') ||
          extra.includes('merged-desk-rb-core-fail')
        ) {
          return {
            ...raw,
            zoneFillPreserve: true,
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep`.trim(),
          };
        }
        /** 레일LED 안개포켓 · 고저 팁존 — 숨기지 않음 */
        if (
          id.startsWith('merged-desk-rb-fog-') ||
          id.startsWith('merged-desk-rb-tip-') ||
          extra.includes('merged-desk-rb-fog-pocket') ||
          extra.includes('merged-desk-rb-tip-zone')
        ) {
          return {
            ...raw,
            zoneFillPreserve: true,
            label: String(raw.label || raw.zoneFaceBase || '').trim() || raw.label,
            zoneFaceBase: String(raw.zoneFaceBase || raw.label || '').trim() || undefined,
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep merged-desk-zone-label-on merged-desk-zone-caption-clean`
              .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
              .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
              .replace(/\s+/g, ' ')
              .trim(),
          };
        }
        /** 구조문(중력우물) — 선·라벨 유지 */
        if (
          id === 'merged-desk-rb-horizon-door' ||
          extra.includes('merged-desk-rb-gravity-well') ||
          extra.includes('merged-desk-rb-horizon-door')
        ) {
          return {
            ...raw,
            label: String(raw.label || '구조문'),
            zoneFaceBase: String(raw.zoneFaceBase || '구조문'),
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep merged-desk-rb-gravity-well merged-desk-zone-label-on`
              .replace(/\s+/g, ' ')
              .trim(),
          };
        }
        /** 레일 반등·눌림 타점 — zone+라벨 유지 (숨기지 않음) */
        if (isMergedDeskRbReactionEntryZone(id, extra)) {
          const face =
            String(raw.label || raw.zoneFaceBase || '').trim() ||
            (extra.includes('rail-bounce-short') || extra.includes('pullback-short')
              ? '★약하락'
              : '★약반등');
          return {
            ...raw,
            label: face,
            zoneFaceBase: String(raw.zoneFaceBase || face),
            zoneFaceSignal: String(raw.zoneFaceSignal || '').trim() || undefined,
            zoneFillPreserve: true,
            overlayZoneExtraClass: `${extra} merged-desk-rb-channel-keep merged-desk-money-zone-keep merged-desk-zone-label-on merged-desk-zone-label-solo merged-desk-zone-pro-hero`.trim(),
          };
        }
        if (extra.includes('merged-desk-money-zone-keep') || /\$\$\$\$/.test(String(raw.label || ''))) {
          return raw;
        }
        if (isZoneFace(raw)) return hideZoneFaceCompletely(raw);
        /** 파동 이동경로 — 라벨·점선 유지 */
        if (
          id.startsWith('merged-desk-wave-path') ||
          extra.includes('merged-desk-wave-path')
        ) {
          return {
            ...raw,
            overlayZoneExtraClass: `${extra} merged-desk-wave-path-keep`.trim(),
          };
        }
        /** 장기 점선·스윙채널 레일 — 주 3통로와 겹침 */
        if (
          kind === 'trendLine' &&
          (/merged-desk-rb-(short|long|fb)-(upper|lower|mid)$/.test(id) ||
            extra.includes('merged-desk-rb-edge-sec') ||
            extra.includes('merged-desk-rb-edge-pri') ||
            extra.includes('merged-desk-rb-mid') ||
            extra.includes('merged-desk-candle-trend') ||
            extra.includes('merged-desk-channel-no-end-label') ||
            (id.startsWith('merged-swing-channel-') && /-(upper|mid|lower)$/.test(id)))
        ) {
          return {
            ...raw,
            color: 'rgba(0,0,0,0)',
            lineStrokeWidth: 0,
            label: '',
            zoneFaceBase: undefined,
            overlayZoneExtraClass: `${extra} merged-desk-trendline-hidden merged-desk-channel-no-end-label`.trim(),
          };
        }
        /** 채널·추세 계열 — 마지막봉 끝 라벨 금지 (선만) */
        return {
          ...raw,
          label: '',
          zoneFaceBase: kind === 'channelBand' ? String(raw.zoneFaceBase || '') : undefined,
          labelTooltip: String(raw.labelTooltip || raw.label || ''),
          overlayZoneExtraClass: `${extra} merged-desk-channel-no-end-label`.trim(),
        };
      }

      if (id.startsWith('merged-ares-st-cloud') || extra.includes('merged-ares-st-cloud')) {
        const instBandOn = loadSettings().chartMergedInstitutionalBandEnabled !== false;
        if (!instBandOn) {
          return isZoneFace(raw) || kind === 'channelBand' ? hideZoneFaceCompletely(raw) : raw;
        }
        const longCloud = raw.structureBias !== 'bearish';
        const face = String(raw.label || raw.zoneFaceBase || '').trim() || (longCloud ? '롱기관밴드' : '숏기관밴드');
        return {
          ...raw,
          zoneFillPreserve: true,
          label: face,
          zoneFaceBase: face,
          overlayZoneExtraClass: `${extra} merged-desk-st-cloud-keep merged-desk-zone-label-on`
            .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
            .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        };
      }

      if (kind === 'bos' || kind === 'choch' || kind === 'label' || id.endsWith('-pin')) {
        /** 학파 블링크·도식 핀 라벨은 유지 */
        if (isMergedDeskSchoolSchematicOverlay(raw) || id.includes('-blink-')) {
          return keepSchoolSchematicOverlay(raw);
        }
        return {
          ...raw,
          label: '',
          zoneFaceBase: undefined,
          overlayZoneExtraClass: `${extra} merged-desk-zone-face-minimal`.trim(),
        };
      }

      if (!isZoneFace(raw)) {
        if (id.startsWith('merged-ares-line-') || id.startsWith('merged-desk-trade-rail-')) {
          return {
            ...raw,
            lineStrokeWidth: Math.max(2, Number(raw.lineStrokeWidth) || 2),
            overlayZoneExtraClass: `${extra} merged-desk-trade-rail-prominent`.trim(),
          };
        }
        return raw;
      }

      /** 구름·채널 면은 숨김(타점만). E/SL HTML 레일은 유지 — 단 파란/빨간채널·ST구름 제외 */
      if (isCloudOrTradeRailFace(raw)) {
        if (id.startsWith('merged-ares-line-') || id.startsWith('merged-desk-trade-rail-')) {
          return raw;
        }
        if (
          id.startsWith('merged-desk-rb-') ||
          extra.includes('merged-desk-rb-channel') ||
          extra.includes('merged-desk-blue-red-channel')
        ) {
          return raw;
        }
        if (
          id.startsWith('merged-ares-st-cloud') ||
          extra.includes('merged-ares-st-cloud') ||
          extra.includes('merged-desk-st-cloud-keep')
        ) {
          return raw;
        }
        return hideZoneFaceCompletely(raw);
      }

      if (isMergedDeskRequestedVisibleZone(raw)) {
        if (
          id.startsWith('ai-market-zone-') ||
          extra.includes('ai-market-zone') ||
          raw.category === 'aiMarketZone'
        ) {
          /** 축 라벨 주입 방식 — 면 캡션/콜아웃 재스탬프 금지 */
          return {
            ...raw,
            zoneFaceBase: '',
            zoneFaceSignal: '',
            zoneFillPreserve: true,
            color:
              raw.color && String(raw.color) !== 'rgba(0,0,0,0)'
                ? raw.color
                : String(raw.structureBias || '') === 'bearish'
                  ? 'rgba(239,68,68,0.34)'
                  : 'rgba(34,197,94,0.34)',
            overlayZoneExtraClass: `${extra
              .replace(/\bmerged-desk-zone-label-on\b/g, '')
              .replace(/\bmerged-desk-money-zone-keep\b/g, '')
              .replace(/\bai-market-zone-callout\b/g, '')
              .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
              .trim()} ai-market-zone merged-desk-zone-face-minimal`.trim(),
          };
        }
        if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone-entry')) {
          /** 얇은 띠로 줄이면 가로점선처럼 보임 — 원래 top/bot 네모 + 라벨 유지 */
          const face =
            String(raw.zoneFaceBase || raw.label || '').trim() ||
            (String(raw.structureBias || '') === 'bearish' ? '★Hot저항' : '★Hot지지');
          return {
            ...raw,
            label: face,
            zoneFaceBase: face,
            zoneFillPreserve: true,
            color:
              raw.color && String(raw.color) !== 'rgba(0,0,0,0)'
                ? raw.color
                : String(raw.structureBias || '') === 'bearish'
                  ? 'rgba(248,113,113,0.36)'
                  : 'rgba(74,222,128,0.36)',
            overlayZoneExtraClass: `${extra
              .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
              .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
              .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
              .trim()} merged-desk-hotzone-entry merged-desk-hotzone-hunt merged-desk-zone-label-on merged-desk-zone-label-solo merged-desk-money-zone-keep merged-desk-zone-pro-hero`.trim(),
          };
        }
        return raw;
      }

      /** 핵심 롱·숏 타점만 */
      if (!keepIdx.has(i)) {
        return hideZoneFaceCompletely(raw);
      }

      const side = moneySide(raw) ?? 'LONG';
      const grade = extractGrade(raw);
      const cap = coreEntryCaption(side, grade);
      const tip = [
        side === 'LONG' ? `${MONEY_LABEL} 롱 돈구간·타점` : `${MONEY_LABEL} 숏 돈구간·타점`,
        grade ? `합류등급 ${grade}` : '',
        String(raw.labelTooltip || raw.label || ''),
        'HQ·HotZone 합류 · 교육·참고(확정 매매 아님)',
      ]
        .filter(Boolean)
        .join(' · ');
      const p1 = Number(raw.price1);
      const p2 = Number(raw.price2);
      const mid =
        Number.isFinite(p1) && Number.isFinite(p2)
          ? (p1 + p2) / 2
          : Number.isFinite(p1)
            ? p1
            : close || 0;
      const monthTight =
        Number.isFinite(p1) && Number.isFinite(p2) && mid > 0
          ? tightenMoneyZoneVerticalSpan(Math.max(p1, p2), Math.min(p1, p2), mid, atrVal, tf)
          : null;
      const tight =
        monthTight && mid > 0
          ? tightEntryBand(monthTight.top, monthTight.bot, mid, atrVal, close || mid)
          : Number.isFinite(p1) && Number.isFinite(p2) && mid > 0
            ? tightEntryBand(Math.max(p1, p2), Math.min(p1, p2), mid, atrVal, close || mid)
            : null;

      const isLong = side === 'LONG';
      const spanTimes =
        candles.length >= 2
          ? mergedDeskAnalyzedZoneSpanTimes(candles, {
              id: String(raw.id || ''),
              time1: raw.time1,
              price1: tight ? tight.top : raw.price1,
              price2: tight ? tight.bot : raw.price2,
            })
          : null;
      return {
        ...raw,
        label: cap,
        zoneFaceBase: cap,
        zoneFaceSignal: undefined,
        price1: tight ? tight.top : raw.price1,
        price2: tight ? tight.bot : raw.price2,
        ...(spanTimes
          ? {
              time1: spanTimes.t1,
              time2: spanTimes.t2,
            }
          : {}),
        color: isLong ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.26)',
        zoneFillPreserve: true,
        labelTooltip: tip,
        lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
        labelBackgroundColor: isLong ? 'rgba(6,78,59,0.96)' : 'rgba(127,29,29,0.96)',
        labelTextColor: '#f8fafc',
        overlayZoneExtraClass: `${extra
          .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
          .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
          .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
          .trim()} merged-desk-pill-zone merged-desk-zone-caption-clean merged-desk-zone-pro-hero merged-desk-zone-label-on merged-desk-money-zone-keep merged-desk-candle-magnet ${
          isLong
            ? 'overlay-zone--hotzone-signal--long merged-hq-long'
            : 'overlay-zone--hotzone-signal--short merged-hq-short'
        }`.trim(),
      };
    });

  /** 추세선 여러 개 → 1개만 (채널 상·중·하 / Mirage / 스윙 중복 정리) */
  const consolidated = consolidateMergedDeskTrendLines(polished, close);
  /** 숏존 상향 종가 돌파 → 활성 숏 라벨 금지 (BROKEN) */
  return applyMergedDeskZoneBreakLifecycle(consolidated, candles);
}

function hideTrendLine(raw: OverlayItem): OverlayItem {
  /** 지시 없이 추세선 숨김 금지 */
  return raw;
}

function trendLineRank(o: OverlayItem, close: number): number {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const conf = Number(o.confidence);
  let score = Number.isFinite(conf) ? (conf > 1 ? conf : conf * 100) : 40;
  /** 스윙 진입 연결선 — 타점과 직결 */
  if (id === 'merged-swing-mid-trend-to-entry' || extra.includes('merged-swing-mid-trend')) score += 55;
  /** 캔들 피벗 채널 — 하단/상단 중 현재가 쪽 */
  if (extra.includes('merged-desk-candle-trend') || id.startsWith('merged-swing-channel-')) {
    score += 35;
    if (id.includes('-lower') || id.includes('하단')) score += close > 0 && Number(o.price2) <= close * 1.01 ? 12 : 0;
    if (id.includes('-upper') || id.includes('상단')) score += close > 0 && Number(o.price2) >= close * 0.99 ? 12 : 0;
    if (id.includes('-mid') || id.includes('중심')) score += 4;
  }
  if (extra.includes('merged-ares-mlsp-tv-trend') || id.includes('mlsp-tv-tri') || id.includes('mlsp-tv-trend'))
    score += 28;
  if (id.includes('choch') || id.includes('retrace')) score += 10;
  if (id.includes('btccion') || id.includes('downside')) score += 8;
  /** 더 긴 구간 가점 */
  const t1 = Number(o.time1);
  const t2 = Number(o.time2);
  if (Number.isFinite(t1) && Number.isFinite(t2)) score += Math.min(15, Math.abs(t2 - t1) / 3_600_000);
  return score;
}

/**
 * 대각 추세선 — 차트에 1개만 남김 (삭제 아님, hidden 클래스).
 * 남긴 선에 「추세선」 라벨.
 */
export function consolidateMergedDeskTrendLines(
  overlays: OverlayItem[],
  close?: number
): OverlayItem[] {
  if (!overlays.length) return overlays;
  const px = Number(close) > 0 ? Number(close) : 0;
  const idxs: number[] = [];
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i]!;
    if (String(o.kind || '') !== 'trendLine') continue;
    const id = String(o.id || '');
    /** 매매 레일·키레벨성 짧은 선은 추세선 경쟁에서 제외 */
    if (id.startsWith('merged-desk-trade-rail-') || id.startsWith('merged-ares-line-')) continue;
    if (String(o.overlayZoneExtraClass || '').includes('merged-desk-hotzone-rail')) continue;
    idxs.push(i);
  }
  if (idxs.length <= 1) {
    if (idxs.length === 1) {
      const i = idxs[0]!;
      const o = overlays[i]!;
      return overlays.map((raw, j) =>
        j === i
          ? {
              ...raw,
              label: '',
              lineStrokeWidth: Math.max(2, Number(raw.lineStrokeWidth) || 2),
              color: raw.color && String(raw.color) !== 'rgba(0,0,0,0)' ? raw.color : 'rgba(56,189,248,0.9)',
              lineLabelColor: '#e0f2fe',
              labelTooltip: String(raw.labelTooltip || '핵심 추세선 · 조건부 참고'),
              overlayZoneExtraClass: `${String(raw.overlayZoneExtraClass || '')
                .replace(/\bmerged-desk-trendline-hidden\b/g, '')
                .trim()} merged-desk-trendline-keep merged-desk-channel-no-end-label`.trim(),
            }
          : raw
      );
    }
    return overlays;
  }

  let bestI = idxs[0]!;
  let bestScore = -Infinity;
  for (const i of idxs) {
    const s = trendLineRank(overlays[i]!, px);
    if (s > bestScore) {
      bestScore = s;
      bestI = i;
    }
  }

  return overlays.map((raw, i) => {
    if (String(raw.kind || '') !== 'trendLine') return raw;
    const id = String(raw.id || '');
    if (id.startsWith('merged-desk-trade-rail-') || id.startsWith('merged-ares-line-')) return raw;
    if (!idxs.includes(i)) return raw;
    if (i === bestI) {
      const rising = Number(raw.price2) >= Number(raw.price1);
      return {
        ...raw,
        label: '',
        lineStrokeWidth: 2.4,
        lineDash: String(raw.lineDash || '6 4'),
        color: rising ? 'rgba(56,189,248,0.95)' : 'rgba(251,146,60,0.95)',
        lineLabelColor: '#f8fafc',
        labelTooltip: String(raw.labelTooltip || '핵심 추세선 1본 · 교육·참고'),
        overlayZoneExtraClass: `${String(raw.overlayZoneExtraClass || '')
          .replace(/\bmerged-desk-trendline-hidden\b/g, '')
          .trim()} merged-desk-trendline-keep merged-desk-channel-no-end-label`.trim(),
      };
    }
    return hideTrendLine(raw);
  });
}

export type MergedDeskMoneyZoneConfluenceCtx = {
  close?: number | null;
  candles?: Candle[] | null;
  /** HQ 존 목록 */
  hqZones?: Array<{ side: 'LONG' | 'SHORT'; score: number; grade: string; mid: number; sources?: string[] }>;
  /** HotZone 목록 */
  hotZones?: Array<{ side: 'LONG' | 'SHORT'; score: number; mid: number; primary?: boolean; sources?: string[] }>;
  mtfAligned?: boolean | null;
  mtfLabelKo?: string | null;
  vrvpPoc?: number | null;
};

/**
 * $$$$ keep 면에 합류 점수·근거 스탬프 (라벨 `$$$$롱·72`, 툴팁에 소스).
 */
export function stampMergedDeskMoneyZoneConfluence(
  overlays: OverlayItem[],
  ctx: MergedDeskMoneyZoneConfluenceCtx
): OverlayItem[] {
  if (!overlays.length) return overlays;
  const close = Number(ctx.close) > 0 ? Number(ctx.close) : 0;

  return overlays.map((raw) => {
    const extra = String(raw.overlayZoneExtraClass || '');
    if (!extra.includes('merged-desk-money-zone-keep')) return raw;

    const side = moneySide(raw);
    if (!side) return raw;

    const p1 = Number(raw.price1);
    const p2 = Number(raw.price2);
    const mid =
      Number.isFinite(p1) && Number.isFinite(p2) ? (p1 + p2) / 2 : Number(raw.price1) || 0;

    const sources: string[] = [];
    let score = Number(raw.confidence);
    if (!Number.isFinite(score) || score <= 0) score = 50;

    const hqHit = (ctx.hqZones ?? []).find(
      (z) =>
        z.side === side &&
        mid > 0 &&
        Math.abs(z.mid - mid) / Math.max(mid, 1) < 0.012
    );
    if (hqHit) {
      score = Math.max(score, hqHit.score);
      sources.push(`HQ${hqHit.grade}`);
      for (const s of hqHit.sources ?? []) sources.push(s);
    }

    const hotHit =
      (ctx.hotZones ?? []).find(
        (z) =>
          z.side === side &&
          z.primary &&
          mid > 0 &&
          Math.abs(z.mid - mid) / Math.max(mid, 1) < 0.015
      ) ??
      (ctx.hotZones ?? []).find(
        (z) => z.side === side && mid > 0 && Math.abs(z.mid - mid) / Math.max(mid, 1) < 0.015
      );
    if (hotHit) {
      score = Math.max(score, hotHit.score);
      sources.push(hotHit.primary ? 'Hot★' : 'Hot');
      for (const s of hotHit.sources ?? []) sources.push(s);
    }

    if (ctx.vrvpPoc != null && Number.isFinite(ctx.vrvpPoc) && mid > 0) {
      const d = Math.abs(ctx.vrvpPoc - mid) / mid;
      if (d < 0.008) {
        score = Math.min(99, score + 6);
        sources.push('VRVP');
      }
    }

    if (ctx.mtfAligned === true) {
      score = Math.min(99, score + 5);
      sources.push('MTF✓');
    } else if (ctx.mtfAligned === false) {
      score = Math.max(0, score - 8);
      sources.push('MTF×');
    }

    if (close > 0 && mid > 0) {
      const near = Math.abs(close - mid) / close < 0.01;
      if (near) {
        score = Math.min(99, score + 3);
        sources.push('근접');
      }
    }

    score = Math.round(Math.max(0, Math.min(99, score)));
    const uniq = [...new Set(sources)].slice(0, 6);
    const grade =
      score >= 86 ? '초강' : score >= 70 ? '강' : score >= 55 ? '중' : '약';
    const gradeCls =
      score >= 86 ? 'ultra' : score >= 70 ? 'strong' : score >= 55 ? 'mid' : 'weak';
    const baseCap = side === 'LONG' ? `${MONEY_LABEL}롱` : `${MONEY_LABEL}숏`;
    const face = `${baseCap}·${grade}`;

    const top = Math.max(p1, p2);
    const bot = Math.min(p1, p2);
    const bh =
      Array.isArray(ctx.candles) && ctx.candles.length >= 16 && Number.isFinite(top) && Number.isFinite(bot)
        ? computeMoneyZoneBreakHold(ctx.candles, side, top, bot)
        : null;
    const tip = [
      `${face} · 합류 ${score}`,
      bh ? bh.detailKo : '',
      bh ? `${bh.holdKo} / ${bh.breakKo}` : '',
      uniq.length ? `근거: ${uniq.join('+')}` : '',
      ctx.mtfLabelKo ? `MTF: ${ctx.mtfLabelKo}` : '',
      String(raw.labelTooltip || ''),
      '$$$$·약중강초 = 합류강도 참고(승률·수익 아님)',
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      ...raw,
      label: face,
      zoneFaceBase: face,
      zoneFaceSignal: undefined,
      confidence: score,
      labelTooltip: tip,
      overlayZoneExtraClass: `${extra
        .replace(/\bmerged-desk-rb-bounce-grade--\w+\b/g, '')
        .trim()} merged-desk-money-zone-scored merged-desk-zone-label-on merged-desk-rb-bounce-grade--${gradeCls}`.trim(),
    };
  });
}

/**
 * $$$$ 돈구간 — 면 중간 전폭선(축 알약 없음). 시그널 핀·라벨은 제외.
 */
export function buildMergedDeskMoneyZoneAxisLines(overlays: OverlayItem[]): AtlasPulsePriceLine[] {
  const out: AtlasPulsePriceLine[] = [];
  for (const o of overlays) {
    const kind = String(o.kind || '');
    if (kind === 'label' || kind === 'keyLevel' || kind === 'channelBand' || kind === 'trendLine') continue;
    const extra = String(o.overlayZoneExtraClass || '');
    const id = String(o.id || '');
    const face = `${o.label || ''}${o.zoneFaceBase || ''}`;
    const isMoneyFace =
      face.includes(MONEY_LABEL) ||
      id.includes('money-zone') ||
      extra.includes('merged-desk-money-zone') && extra.includes('$$$$');
    if (!isMoneyFace) continue;
    if (!ZONE_KINDS.has(kind) && !extra.includes('merged-desk-money-zone')) continue;
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const top = Math.max(p1, p2);
    const bot = Math.min(p1, p2);
    if (!(top > bot)) continue;
    const mid = (top + bot) / 2;
    const side = moneySide(o) ?? 'LONG';
    const isLong = side === 'LONG';
    const score = Number(o.confidence);
    const tag =
      Number.isFinite(score) && score > 0
        ? `${isLong ? `${MONEY_LABEL}롱` : `${MONEY_LABEL}숏`}·${Math.round(score)}`
        : isLong
          ? `${MONEY_LABEL}롱`
          : `${MONEY_LABEL}숏`;
    const midColor = isLong ? '#4ADE80' : '#F87171';
    out.push({
      price: mid,
      color: midColor,
      title: tag,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: false,
    });
  }
  return out;
}

/** 진입E/손절SL/익절TP·무효·Hot 밴드 축 라벨 우선 — 다른 선과 가격이 겹쳐도 타점이 사라지지 않게 */
function axisPriceLinePriority(title: string): number {
  const t = String(title || '');
  if (/[🚀📉](E|T1|T2|Tmax|무효)|진입E|손절SL|익절TP[123]|무효|롱진입여기|숏진입여기|돌파확인|채널게이트|게이트손절|게이트TP|게이트무효/.test(t))
    return 10_000 + t.length;
  if (/핵심지지|핵심저항/.test(t)) return 11_000 + t.length;
  if (/\$\$\$\$롱·Hot|\$\$\$\$숏·Hot|Hot·/.test(t)) return 2_000 + t.length;
  if (/채널(상|하)·(돌파|지지|저항)/.test(t)) return 900 + t.length;
  if (/채널상|채널중|채널하/.test(t)) return 800 + t.length;
  if (/하방지지|상방저항|\$\$\$\$|돈구간/.test(t)) return 500 + t.length;
  return t.length;
}

function isPrimaryTradeAxisTitle(title: string): boolean {
  const t = String(title || '');
  if (/TP2|TP3|정렬강|관망|매수매도불명|상승가능|하락가능|횡보/.test(t)) return false;
  if (/◆(매수|매도)관점·(실패금지|안착참고|안착대기|돌파전대기)/.test(t)) return true;
  if (/[🚀📉](E|T1|T2|Tmax|무효)/.test(t)) return true;
  if (/진입E|손절SL|익절TP1|·E·|게이트손절|게이트무효/.test(t)) return true;
  if (/^[▲▼]무효|무효·이탈/.test(t)) return true;
  if (/◆[^·\s]*손절|◆[^·\s]*TP1(?!\d)/.test(t)) return true;
  if (/핵심지지|핵심저항/.test(t)) return true;
  return false;
}

/** 가까운 가격 중복 선 제거. 축 알약은 E/SL/TP1만 — 나머지는 zone·선·핀 */
export function dedupeMergedDeskAxisPriceLines(lines: AtlasPulsePriceLine[]): AtlasPulsePriceLine[] {
  const sorted = [...lines].sort(
    (a, b) => axisPriceLinePriority(String(b.title || '')) - axisPriceLinePriority(String(a.title || ''))
  );
  const kept: AtlasPulsePriceLine[] = [];
  for (const pl of sorted) {
    if (!Number.isFinite(pl.price) || pl.price <= 0) continue;
    const hit = kept.find((k) => Math.abs(k.price - pl.price) / Math.max(k.price, 1) < 0.00035);
    if (hit) continue;
    kept.push({
      ...pl,
      axisLabel: isPrimaryTradeAxisTitle(String(pl.title || '')),
    });
  }
  return kept.sort((a, b) => b.price - a.price);
}

const MERGED_DESK_AXIS_COLOR_SOFT: Record<string, string> = {
  '#FACC15': 'rgba(196,162,56,0.88)',
  '#EAB308': 'rgba(176,148,52,0.88)',
  '#FDE047': 'rgba(196,162,56,0.88)',
  '#FBBF24': 'rgba(186,154,62,0.86)',
  '#F59E0B': 'rgba(180,148,58,0.86)',
  '#F87171': 'rgba(208,138,138,0.88)',
  '#FB7185': 'rgba(208,140,148,0.88)',
  '#EF4444': 'rgba(196,124,124,0.86)',
  '#86EFAC': 'rgba(122,168,140,0.88)',
  '#4ADE80': 'rgba(110,160,128,0.86)',
  '#22C55E': 'rgba(96,148,116,0.86)',
  '#7DD3FC': 'rgba(122,154,178,0.88)',
  '#38BDF8': 'rgba(110,158,186,0.86)',
  '#A78BFA': 'rgba(148,138,180,0.86)',
  '#C084FC': 'rgba(156,140,186,0.86)',
  '#60A5FA': 'rgba(112,150,196,0.86)',
};

/** 통합·분석 축선·라벨 — 네온을 낮춰 캔들이 읽히게 (삭제 아님) */
export function softenMergedDeskChartColor(color: string): string {
  const c = String(color || '').trim();
  if (!c) return c;
  const mapped = MERGED_DESK_AXIS_COLOR_SOFT[c.toUpperCase()];
  if (mapped) return mapped;
  const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!m) return c;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] != null ? Number(m[4]) : 1;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return `rgba(${Math.round(r * 0.62 + l * 0.38)},${Math.round(g * 0.62 + l * 0.38)},${Math.round(b * 0.62 + l * 0.38)},${Math.min(a, 0.82)})`;
}
