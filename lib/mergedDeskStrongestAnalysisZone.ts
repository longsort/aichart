/**
 * 통합·분석 — ★약/중/강/초강력 반등·하락 면을 「최강분석zone」으로 표시 통합.
 * 엔진(Hot/레일/눌림/머니)은 유지 · 차트에는 롱·숏 각 최대 1면만.
 * 확정 수익·승률 아님.
 */
import type { OverlayItem } from '@/types';
import {
  mergedDeskReactionGradeFromScore,
  mergedDeskReactionLabelKo,
  type MergedDeskRbBounceGrade,
} from '@/lib/mergedDeskRbBounceStrength';

export const MERGED_DESK_STRONGEST_ZONE_CLASS = 'merged-desk-strongest-analysis-zone';

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

const GRADE_FACE_RE =
  /★\s*(약|중|강|초강|초강력)?\s*(반등|하락|저항)|약반등|중반등|강반등|초강력반등|약하락|중하락|강하락|초강력하락|약저항|중저항|강저항|초강력저항/;

const SOURCE_EXTRA_RE =
  /merged-desk-hotzone|merged-desk-rb-rail-bounce|merged-desk-rb-pullback|merged-desk-channel-pullback|merged-desk-rb-bounce-grade--|merged-desk-money-zone-graded|merged-desk-rb-live-hub|merged-desk-rb-kit-hot/;

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
  if (/강반등|강하락|강저항|(^|★)강(?!력)/.test(t) || /\bstrong\b/i.test(t)) return 'strong';
  if (/중반등|중하락|중저항|중급|(^|★)중/.test(t)) return 'mid';
  return 'weak';
}

function sideOf(o: OverlayItem): 'LONG' | 'SHORT' {
  if (String(o.structureBias || '') === 'bearish') return 'SHORT';
  if (String(o.structureBias || '') === 'bullish') return 'LONG';
  const t = faceText(o);
  const extra = String(o.overlayZoneExtraClass || '');
  if (
    /하락|저항|숏|short/i.test(t) ||
    extra.includes('rail-bounce-short') ||
    extra.includes('hotzone-signal--short') ||
    String(o.kind || '') === 'supplyZone'
  ) {
    return 'SHORT';
  }
  return 'LONG';
}

function sourceTag(o: OverlayItem): string {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (extra.includes('merged-desk-rb-rail-bounce') || id.includes('rb-rail-bounce')) return '레일';
  if (
    extra.includes('pullback') ||
    id.includes('pullback') ||
    extra.includes('merged-desk-channel-pullback')
  ) {
    return '눌림';
  }
  if (extra.includes('merged-desk-hotzone') || id.includes('hotzone')) return 'Hot';
  if (extra.includes('money-zone') || /\$\$\$\$/.test(faceText(o))) return '$$$$';
  if (extra.includes('merged-desk-rb-live-hub')) return 'Live';
  return '합류';
}

function sourceRank(tag: string): number {
  if (tag === '레일') return 18;
  if (tag === 'Hot') return 14;
  if (tag === '눌림') return 12;
  if (tag === '$$$$') return 10;
  if (tag === 'Live') return 8;
  return 4;
}

function gradeBoost(g: MergedDeskRbBounceGrade): number {
  if (g === 'ultra') return 40;
  if (g === 'strong') return 28;
  if (g === 'mid') return 14;
  return 0;
}

/** 약·중·강·초강 스택 후보 (엔진 면 — AI ZONE·Hot·AMZ 네모면은 제외하고 항상 표시) */
export function isMergedDeskGradeStackZoneCandidate(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (id.startsWith('eagle1-ai-zone--') || extra.includes('eagle1-ai-analysis-zone')) return false;
  if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return false;
  if (id.startsWith('ai-market-zone-') || extra.includes('ai-market-zone')) return false;
  if (id.startsWith('avwap-entry-guide-') || extra.includes('avwap-entry-guide')) return false;
  if (id.startsWith('st-band-touch-zone-') || extra.includes('st-band-touch-zone')) return false;
  /** Hot도 등급 스택에 합류 — $$$$초강 중복 라벨 폭증 방지 */
  /** $$$$ 머니 면은 등급·반등 문구 있으면 스택 합류 */
  /** $$$$ 머니도 등급/반등 라벨이면 스택 합류(중복 초강 라벨 방지) */
  if (/\$\$\$\$/.test(faceText(o)) && !GRADE_FACE_RE.test(faceText(o)) && !/반등|하락|지지|저항/.test(faceText(o))) {
    return false;
  }
  if (extra.includes(MERGED_DESK_STRONGEST_ZONE_CLASS) && !GRADE_FACE_RE.test(faceText(o))) {
    /* already consolidated — still candidate for re-run */
  }
  const kindOk =
    ZONE_KINDS.has(String(o.kind || '')) ||
    !!o.channelBand ||
    extra.includes('merged-desk-hotzone') ||
    extra.includes('merged-desk-rb-rail-bounce') ||
    extra.includes('pullback');
  if (!kindOk) return false;
  const face = faceText(o);
  if (GRADE_FACE_RE.test(face)) return true;
  if (SOURCE_EXTRA_RE.test(extra) && /★|반등|하락|저항/.test(face)) return true;
  if (/merged-desk-rb-bounce-grade--(weak|mid|strong|ultra)/.test(extra)) return true;
  return false;
}

function scoreCandidate(o: OverlayItem): number {
  const conf = Number(o.confidence);
  let score = Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 40;
  const grade = parseGrade(o);
  score += gradeBoost(grade);
  score += sourceRank(sourceTag(o));
  const extra = String(o.overlayZoneExtraClass || '');
  if (extra.includes('--enter') || extra.includes('-ready') || /READY|ENTER/i.test(extra)) score += 12;
  if (extra.includes('--touch') || extra.includes('-near') || extra.includes('-hold')) score += 6;
  if (extra.includes('merged-desk-hotzone-entry--primary') || extra.includes('merged-desk-zone-pro-hero')) {
    score += 8;
  }
  if (extra.includes('merged-desk-zone-face-hidden') || extra.includes('merged-desk-zone-face-minimal')) {
    score -= 20;
  }
  return Math.round(score);
}

function strongestFaceKo(side: 'LONG' | 'SHORT', grade: MergedDeskRbBounceGrade): string {
  const reaction = mergedDeskReactionLabelKo(side, grade).replace(/^★/, '');
  return `★최강·${reaction}`;
}

function hideGradeFace(o: OverlayItem): OverlayItem {
  const extra = String(o.overlayZoneExtraClass || '')
    .replace(/\bmerged-desk-zone-label-on\b/g, '')
    .replace(/\bmerged-desk-zone-pro-hero\b/g, '')
    .replace(/\bmerged-desk-strongest-analysis-zone\b/g, '')
    .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
    .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
    .trim();
  const detail =
    String(o.zoneFaceDetailKo || o.labelTooltip || faceText(o) || '').trim() ||
    '내부 등급면 · 차트 숨김(최강분석 통합)';
  return {
    ...o,
    zoneFaceBase: undefined,
    zoneFaceSignal: undefined,
    label: String(o.label || '').replace(GRADE_FACE_RE, '').trim() || o.label,
    overlayZoneExtraClass: `${extra} merged-desk-zone-face-minimal merged-desk-zone-face-hidden merged-desk-grade-stack-folded`.trim(),
    zoneFaceDetailKo: detail,
  };
}

function promoteWinner(o: OverlayItem, peers: OverlayItem[]): OverlayItem {
  const side = sideOf(o);
  const grade = parseGrade(o);
  const face = strongestFaceKo(side, grade);
  const sources = [...new Set([o, ...peers].map(sourceTag))].join('+');
  const peerBits = peers
    .filter((p) => p !== o)
    .map((p) => `${sourceTag(p)} ${faceText(p) || parseGrade(p)}`)
    .slice(0, 4);
  const detail = [
    face,
    mergedDeskReactionLabelKo(side, grade),
    `점수 ${scoreCandidate(o)}`,
    sources ? `근거 ${sources}` : '',
    peerBits.length ? `합류 ${peerBits.join(' · ')}` : '',
    String(o.zoneFaceDetailKo || o.labelTooltip || '').slice(0, 120),
    '(참고·터치≠확정)',
  ]
    .filter(Boolean)
    .join(' · ');
  const extra = String(o.overlayZoneExtraClass || '')
    .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
    .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
    .replace(/\bmerged-desk-grade-stack-folded\b/g, '')
    .replace(/\bmerged-desk-rb-bounce-grade--\w+\b/g, '')
    .replace(/\bmerged-desk-strongest-analysis-zone\b/g, '')
    .trim();
  return {
    ...o,
    label: face,
    zoneFaceBase: face,
    zoneFaceSignal: undefined,
    zoneFaceDetailKo: detail,
    labelTooltip: detail,
    zoneFillPreserve: true,
    zonePulse: true,
    confidence: Math.max(Number(o.confidence) || 0, scoreCandidate(o)),
    overlayZoneExtraClass: [
      extra,
      MERGED_DESK_STRONGEST_ZONE_CLASS,
      `merged-desk-rb-bounce-grade--${grade}`,
      'merged-desk-zone-label-on',
      'merged-desk-zone-label-solo',
      'merged-desk-zone-pro-hero',
      'merged-desk-zone-caption-clean',
      'merged-desk-money-zone-keep',
      'merged-desk-candle-magnet',
      side === 'LONG' ? 'merged-desk-strongest-long' : 'merged-desk-strongest-short',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * 차트 표시용: 롱·숏 각 최고점 1면만 ★최강·{등급반등|하락}.
 * 나머지 등급 스택은 숨김(엔진 데이터·오버레이 객체는 유지).
 */
export function applyMergedDeskStrongestAnalysisZone(list: OverlayItem[]): OverlayItem[] {
  if (!list.length) return list;
  const candidates = list.filter(isMergedDeskGradeStackZoneCandidate);
  if (candidates.length <= 1) {
    if (candidates.length === 1) {
      const only = candidates[0]!;
      const onlyId = String(only.id || '');
      return list.map((o) =>
        (onlyId && String(o.id || '') === onlyId) || o === only ? promoteWinner(only, candidates) : o
      );
    }
    return list;
  }

  const longs = candidates
    .filter((c) => sideOf(c) === 'LONG')
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const shorts = candidates
    .filter((c) => sideOf(c) === 'SHORT')
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const winLong = longs[0] ?? null;
  const winShort = shorts[0] ?? null;
  const winIds = new Set<string>();
  if (winLong?.id) winIds.add(String(winLong.id));
  if (winShort?.id) winIds.add(String(winShort.id));

  /** 같은 가격대(~0.4%)에 롱·숏이 겹치면 점수 높은 쪽만 */
  if (winLong && winShort) {
    const ml = midPrice(winLong);
    const ms = midPrice(winShort);
    if (Number.isFinite(ml) && Number.isFinite(ms) && Math.abs(ml - ms) / Math.max(Math.abs(ml), 1) < 0.004) {
      if (scoreCandidate(winLong) >= scoreCandidate(winShort)) winIds.delete(String(winShort.id));
      else winIds.delete(String(winLong.id));
    }
  }

  return list.map((o) => {
    if (!isMergedDeskGradeStackZoneCandidate(o)) return o;
    const id = String(o.id || '');
    if (id && winIds.has(id)) {
      const peers = sideOf(o) === 'LONG' ? longs : shorts;
      return promoteWinner(o, peers);
    }
    return hideGradeFace(o);
  });
}

/** HUD/요약용 */
export function summarizeMergedDeskStrongestAnalysisKo(list: OverlayItem[]): string {
  const wins = list.filter(
    (o) =>
      String(o.overlayZoneExtraClass || '').includes(MERGED_DESK_STRONGEST_ZONE_CLASS) &&
      !String(o.overlayZoneExtraClass || '').includes('merged-desk-zone-face-hidden')
  );
  if (!wins.length) return '최강분석zone 대기 — 등급면 후보 부족';
  return wins
    .map((o) => {
      const g = parseGrade(o);
      const side = sideOf(o);
      const mid = midPrice(o);
      const px = Number.isFinite(mid) ? mid.toFixed(0) : '—';
      return `${faceText(o) || strongestFaceKo(side, g)} ${px}`;
    })
    .join(' · ');
}

export function strongestGradeFromScore(score: number): MergedDeskRbBounceGrade {
  return mergedDeskReactionGradeFromScore(score);
}
