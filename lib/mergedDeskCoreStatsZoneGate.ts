/**
 * 통합모드 — $$$$·초강·반등 zone 폭증 정리.
 * 통계(점수·등급·가격 합류)로 롱·숏 각 핵심 1면만 남김.
 * 확정 수익·승률 보장 아님.
 */
import type { OverlayItem } from '@/types';
import {
  mergedDeskReactionGradeFromScore,
  mergedDeskReactionLabelKo,
  type MergedDeskRbBounceGrade,
} from '@/lib/mergedDeskRbBounceStrength';
import { spotZoneReactionPct } from '@/lib/mergedDeskSpotReactionPct';
import type { Candle } from '@/types';

export const MERGED_DESK_CORE_STATS_ZONE_CLASS = 'merged-desk-core-stats-zone';

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

const CLUTTER_FACE_RE =
  /\$\$\$\$|★|초강|초강력|약반등|중반등|강반등|초강력반등|약하락|중하락|강하락|초강력하락|반등|하락|저항|Hot|최강/;

function midPrice(o: OverlayItem): number {
  const a = Number(o.price1);
  const b = Number(o.price2);
  if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  if (Number.isFinite(a)) return a;
  if (Number.isFinite(b)) return b;
  return NaN;
}

function faceText(o: OverlayItem): string {
  return String(o.zoneFaceBase || o.label || '').trim();
}

function parseGrade(o: OverlayItem): MergedDeskRbBounceGrade {
  const extra = String(o.overlayZoneExtraClass || '');
  const m = extra.match(/merged-desk-rb-bounce-grade--(weak|mid|strong|ultra)/);
  if (m?.[1] === 'ultra' || m?.[1] === 'strong' || m?.[1] === 'mid' || m?.[1] === 'weak') {
    return m[1];
  }
  const t = faceText(o);
  if (/초강|초강력|ultra/i.test(t)) return 'ultra';
  if (/강반등|강하락|강저항|(^|★)강(?!력)/.test(t)) return 'strong';
  if (/중반등|중하락|중저항|(^|★)중/.test(t)) return 'mid';
  return 'weak';
}

function sideOf(o: OverlayItem): 'LONG' | 'SHORT' {
  if (String(o.structureBias || '') === 'bearish') return 'SHORT';
  if (String(o.structureBias || '') === 'bullish') return 'LONG';
  const t = faceText(o);
  const extra = String(o.overlayZoneExtraClass || '');
  const id = String(o.id || '');
  if (
    /하락|저항|숏|short/i.test(t) ||
    extra.includes('rail-bounce-short') ||
    extra.includes('hotzone-signal--short') ||
    id.includes('hotzone-above') ||
    id.includes('hotzone-short') ||
    String(o.kind || '') === 'supplyZone'
  ) {
    return 'SHORT';
  }
  return 'LONG';
}

/** $$$$·초강·반등·Hot·레일·최강 — 차트 라벨 경쟁군 */
export function isMergedDeskClutterMoneyFace(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (id.startsWith('eagle1-ai-zone--') || extra.includes('eagle1-ai-analysis-zone')) return false;
  if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return false;
  if (id.startsWith('ai-market-zone-') || extra.includes('ai-market-zone')) return false;
  if (id.startsWith('avwap-entry-guide-') || extra.includes('avwap-entry-guide')) return false;
  if (id.startsWith('st-band-touch-zone-') || extra.includes('st-band-touch-zone')) return false;
  if (extra.includes('merged-desk-zone-face-hidden') && !CLUTTER_FACE_RE.test(faceText(o))) {
    return false;
  }
  const kindOk =
    ZONE_KINDS.has(String(o.kind || '')) ||
    !!o.channelBand ||
    extra.includes('merged-desk-hotzone') ||
    extra.includes('merged-desk-rb-rail-bounce') ||
    extra.includes('pullback') ||
    extra.includes('money-zone') ||
    extra.includes('merged-desk-strongest');
  if (!kindOk) return false;
  const face = faceText(o);
  if (CLUTTER_FACE_RE.test(face)) return true;
  if (/\$\$\$\$/.test(face)) return true;
  if (extra.includes('merged-desk-money-zone-keep') && /반등|하락|지지|저항|Hot|\$\$\$\$|★/.test(face)) {
    return true;
  }
  if (/merged-desk-rb-bounce-grade--(weak|mid|strong|ultra)/.test(extra)) return true;
  if (extra.includes('merged-desk-hotzone') || id.includes('hotzone')) return true;
  if (extra.includes('merged-desk-rb-rail-bounce') || id.includes('rb-rail-bounce')) return true;
  return false;
}

function scoreCore(o: OverlayItem, opts: {
  close?: number | null;
  activeEntry?: number | null;
  bestSupportPx?: number | null;
  bestResistPx?: number | null;
}): number {
  const conf = Number(o.confidence);
  let score = Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 42;
  const grade = parseGrade(o);
  if (grade === 'ultra') score += 36;
  else if (grade === 'strong') score += 24;
  else if (grade === 'mid') score += 12;

  const extra = String(o.overlayZoneExtraClass || '');
  const id = String(o.id || '');
  if (extra.includes(MERGED_DESK_CORE_STATS_ZONE_CLASS) || extra.includes('merged-desk-strongest-analysis-zone')) {
    score += 10;
  }
  if (extra.includes('merged-desk-hotzone-entry--primary') || extra.includes('merged-desk-zone-pro-hero')) {
    score += 8;
  }
  if (extra.includes('merged-desk-rb-rail-bounce') || id.includes('rb-rail-bounce')) score += 6;
  if (extra.includes('merged-desk-hotzone') || id.includes('hotzone')) score += 10;
  if (/\$\$\$\$/.test(faceText(o))) score += 8;
  if (extra.includes('--enter') || /READY|ENTER/i.test(extra)) score += 10;
  if (extra.includes('merged-desk-zone-face-hidden') || extra.includes('merged-desk-zone-face-minimal')) {
    score -= 28;
  }

  const mid = midPrice(o);
  const close = opts.close && opts.close > 0 ? opts.close : null;
  const side = sideOf(o);
  if (Number.isFinite(mid) && close) {
    const distPct = Math.abs(mid - close) / close;
    /** 너무 멀면 감점 · 적당한 거리 가산 */
    if (distPct < 0.012) score += 14;
    else if (distPct < 0.028) score += 8;
    else if (distPct > 0.06) score -= 16;
  }
  const target =
    side === 'LONG'
      ? opts.bestSupportPx || opts.activeEntry || null
      : opts.bestResistPx || opts.activeEntry || null;
  if (Number.isFinite(mid) && target && target > 0) {
    const d = Math.abs(mid - target) / target;
    if (d < 0.008) score += 18;
    else if (d < 0.02) score += 8;
  }

  return Math.round(score);
}

function hideClutter(o: OverlayItem): OverlayItem {
  const extra = String(o.overlayZoneExtraClass || '')
    .replace(/\bmerged-desk-zone-label-on\b/g, '')
    .replace(/\bmerged-desk-zone-pro-hero\b/g, '')
    .replace(/\bmerged-desk-money-zone-keep\b/g, '')
    .replace(/\bmerged-desk-strongest-analysis-zone\b/g, '')
    .replace(/\bmerged-desk-core-stats-zone\b/g, '')
    .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
    .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
    .trim();
  return {
    ...o,
    zoneFaceBase: undefined,
    zoneFaceSignal: undefined,
    label: '',
    overlayZoneExtraClass: `${extra} merged-desk-zone-face-minimal merged-desk-zone-face-hidden merged-desk-core-stats-folded`.trim(),
    zoneFaceDetailKo:
      String(o.zoneFaceDetailKo || o.labelTooltip || faceText(o) || '').trim() ||
      '통계 합류로 숨김 · 핵심 zone만 표시',
  };
}

function promoteCore(
  o: OverlayItem,
  score: number,
  peers: number,
  opts?: { close?: number | null; candles?: Candle[] }
): OverlayItem {
  const side = sideOf(o);
  const grade = parseGrade(o);
  const reaction = mergedDeskReactionLabelKo(side, grade).replace(/^★/, '');
  const face =
    side === 'LONG'
      ? `핵심·${reaction || '지지'}`.slice(0, 12)
      : `핵심·${reaction || '저항'}`.slice(0, 12);
  const spot = opts?.close && opts.close > 0 ? opts.close : null;
  const top = Number(o.price1);
  const bot = Number(o.price2);
  const spotPct =
    spot != null
      ? spotZoneReactionPct({
          spot,
          zoneTop: top,
          zoneBot: bot,
          side,
          candles: opts?.candles,
        })
      : { moveKo: '', detailKo: '' };
  const detail = [
    face,
    spotPct.moveKo ? `현물 ${spotPct.moveKo}` : '',
    `통계점수 ${score}`,
    peers > 1 ? `경쟁 ${peers}개→1` : '',
    spotPct.detailKo || String(o.zoneFaceDetailKo || o.labelTooltip || '').slice(0, 80),
    '(조건부·확정아님)',
  ]
    .filter(Boolean)
    .join(' · ');
  const extra = String(o.overlayZoneExtraClass || '')
    .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
    .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
    .replace(/\bmerged-desk-core-stats-folded\b/g, '')
    .replace(/\bmerged-desk-grade-stack-folded\b/g, '')
    .replace(/\bmerged-desk-core-stats-zone\b/g, '')
    .trim();
  return {
    ...o,
    label: face,
    zoneFaceBase: face,
    zoneFaceSignal: spotPct.moveKo || undefined,
    zoneFaceDetailKo: detail,
    labelTooltip: detail,
    zoneFillPreserve: true,
    zonePulse: true,
    confidence: Math.max(Number(o.confidence) || 0, Math.min(99, score)),
    overlayZoneExtraClass: [
      extra,
      MERGED_DESK_CORE_STATS_ZONE_CLASS,
      `merged-desk-rb-bounce-grade--${grade}`,
      'merged-desk-zone-label-on',
      'merged-desk-zone-label-solo',
      'merged-desk-zone-pro-hero',
      'merged-desk-zone-caption-clean',
      'merged-desk-money-zone-keep',
      'merged-desk-candle-magnet',
      side === 'LONG' ? 'merged-desk-core-stats-long' : 'merged-desk-core-stats-short',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * 차트: 롱 핵심 1 · 숏 핵심 1만 라벨 표시.
 * 나머지 $$$$/초강/반등 경쟁면은 숨김(객체 유지).
 */
export function applyMergedDeskCoreStatsZoneGate(
  list: OverlayItem[],
  opts?: {
    close?: number | null;
    activeEntry?: number | null;
    bestSupportPx?: number | null;
    bestResistPx?: number | null;
    /** 최소 점수 — 미달이면 해당 측 라벨 숨김 */
    minScore?: number;
    candles?: Candle[];
  }
): OverlayItem[] {
  if (!list.length) return list;
  const minScore = opts?.minScore ?? 58;
  const scored = list
    .map((o, i) => ({ o, i, clutter: isMergedDeskClutterMoneyFace(o), score: 0 }))
    .filter((x) => x.clutter)
    .map((x) => ({ ...x, score: scoreCore(x.o, opts || {}) }));

  if (!scored.length) return list;

  const longs = scored
    .filter((x) => sideOf(x.o) === 'LONG')
    .sort((a, b) => b.score - a.score);
  const shorts = scored
    .filter((x) => sideOf(x.o) === 'SHORT')
    .sort((a, b) => b.score - a.score);

  let winLong = longs[0] && longs[0].score >= minScore ? longs[0] : null;
  let winShort = shorts[0] && shorts[0].score >= minScore ? shorts[0] : null;

  if (winLong && winShort) {
    const ml = midPrice(winLong.o);
    const ms = midPrice(winShort.o);
    if (
      Number.isFinite(ml) &&
      Number.isFinite(ms) &&
      Math.abs(ml - ms) / Math.max(Math.abs(ml), 1) < 0.004
    ) {
      if (winLong.score >= winShort.score) winShort = null;
      else winLong = null;
    }
  }

  const winIdx = new Set<number>();
  if (winLong) winIdx.add(winLong.i);
  if (winShort) winIdx.add(winShort.i);

  return list.map((o, i) => {
    if (!isMergedDeskClutterMoneyFace(o)) return o;
    if (winIdx.has(i)) {
      const side = sideOf(o);
      const peers = side === 'LONG' ? longs.length : shorts.length;
      const sc = scored.find((x) => x.i === i)?.score ?? scoreCore(o, opts || {});
      return promoteCore(o, sc, peers, { close: opts?.close, candles: opts?.candles });
    }
    return hideClutter(o);
  });
}

export function summarizeMergedDeskCoreStatsZoneKo(list: OverlayItem[]): string {
  const wins = list.filter(
    (o) =>
      String(o.overlayZoneExtraClass || '').includes(MERGED_DESK_CORE_STATS_ZONE_CLASS) &&
      !String(o.overlayZoneExtraClass || '').includes('merged-desk-zone-face-hidden')
  );
  if (!wins.length) return '핵심 zone 대기 — 통계 합류 후보 부족';
  return wins
    .map((o) => {
      const mid = midPrice(o);
      return `${faceText(o)} ${Number.isFinite(mid) ? mid.toFixed(0) : '—'}`;
    })
    .join(' · ');
}

export function coreGradeFromScore(score: number): MergedDeskRbBounceGrade {
  return mergedDeskReactionGradeFromScore(score);
}
