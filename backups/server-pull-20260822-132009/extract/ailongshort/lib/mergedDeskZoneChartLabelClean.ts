/**
 * 통합·분석 zone 차트 캡션 정리 — 면·기능은 유지, 라벨만 짧게·우선순위 적용.
 * 삭제 금지: overlays 제거하지 않음. face-minimal = 캡션·zoneFaceBase 숨김.
 * 중복 라벨(같은 문구·가까운 가격) 전부 숨김.
 */
import type { OverlayItem } from '@/types';
import {
  isMergedDeskAnalyzedCandleSpanOverlay,
  isMergedAnalysisDeskOverlayId,
} from '@/lib/mergedAnalysisOverlayIds';

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

function isZoneFace(o: OverlayItem): boolean {
  return ZONE_KINDS.has(String(o.kind || '')) || !!o.channelBand;
}

/** 차트에 찍을 짧은 캡션 (툴팁은 원문 유지) */
export function compactMergedDeskZoneChartLabel(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';

  /** $$$$ 돈구간 — 약/중/강/초 유지 `$$$$롱·강` */
  if (/\$\$\$\$/.test(s)) {
    const graded = s.match(/\$\$\$\$(롱|숏)\s*[·･]?\s*(약|중|강|초강)/);
    if (graded) return `$$$$${graded[1]}·${graded[2]}`;
    const scored = s.match(/\$\$\$\$(롱|숏)\s*[·･]?\s*(\d{1,2})(?:\s*[·･]\s*(지지\+|저항\+|돌파\+|이탈\+|혼조|약|중|강|초강))?/);
    if (scored) {
      const tag = scored[3] ? ` · ${scored[3]}` : '';
      return `$$$$${scored[1]}·${scored[2]}${tag}`;
    }
    if (/롱/.test(s)) return '$$$$롱';
    if (/숏/.test(s)) return '$$$$숏';
    return '$$$$';
  }

  if (/^[①②③④⑤]/.test(s) || /반등 여력|되돌림 깊|진도|전량 매도|반등국면|시나리오/.test(s)) {
    const head = s.split(/[→·|]/)[0]?.trim() || s;
    const short = head.replace(/\s+/g, ' ').slice(0, 12);
    return short || '시나리오';
  }

  s = s.replace(/^핵심\s+/, '');
  s = s.replace(/★ENTRY\b/gi, '★진입');
  s = s.replace(/\bENTRY\b/gi, '진입');
  s = s.replace(/\bWAIT\b/gi, '대기');
  s = s.replace(/진입점/g, '진입');
  s = s.replace(/롱진입/g, '롱');
  s = s.replace(/숏진입/g, '숏');
  s = s.replace(/저항대/g, '저항');
  s = s.replace(/지지대/g, '지지');
  s = s.replace(/\s*·\s*(대기|대|터치|진입가능|진입)$/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  s = s.replace(/(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/g, (_, n: string) => n.replace(/,/g, ''));
  s = s.replace(/(\d+\.\d{2,})/g, (m) => {
    const n = Number(m);
    return Number.isFinite(n) ? String(Math.round(n)) : m;
  });

  if (s.length > 12) s = `${s.slice(0, 11)}…`;
  return s;
}

/** 중복 판별용 정규화 키 — OB L / OBL / ▲ L 등 동일 취급 */
export function normalizeMergedDeskZoneCaptionKey(raw: string): string {
  let s = compactMergedDeskZoneChartLabel(raw).toLowerCase();
  s = s
    .replace(/[★☆▲▼◆⚔·･]/g, '')
    .replace(/\s+/g, '')
    .replace(/\$/g, '')
    .replace(/ok\b/g, '')
    .replace(/확/g, '')
    .replace(/존/g, 'zn')
    .replace(/^obl$/, 'obl')
    .replace(/^obs$/, 'obs')
    .replace(/^ob(l|s)$/, 'ob$1');
  /** L58 / L$58 / ▲L58 → l58 */
  s = s.replace(/^l(\d+)/, 'l$1').replace(/^s(\d+)/, 's$1');
  return s || '_';
}

function zoneMid(o: OverlayItem): number {
  const p1 = Number(o.price1);
  const p2 = Number(o.price2);
  if (Number.isFinite(p1) && Number.isFinite(p2)) return (p1 + p2) / 2;
  if (Number.isFinite(p1)) return p1;
  if (Number.isFinite(p2)) return p2;
  return NaN;
}

function captionText(o: OverlayItem): string {
  return (
    String(o.zoneFaceBase || '').trim() ||
    String(o.label || '').trim().split('·')[0]?.trim() ||
    ''
  );
}

function captionPriority(o: OverlayItem): number {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const text = `${o.label || ''}${o.zoneFaceBase || ''}`;
  if (extra.includes('merged-desk-zone-face-hidden') || extra.includes('merged-desk-rb-core-face-off')) return 0;
  /** 채널 띠는 zone 타점 캡션 경쟁에서 제외(별도 1개) */
  if (String(o.kind || '') === 'channelBand' || !!o.channelBand) return 0;
  if (id.includes('rb-rail-bounce') || extra.includes('merged-desk-rb-rail-bounce')) return 120;
  if (id.includes('rb-pullback') || extra.includes('merged-desk-rb-pullback')) return 115;
  if (extra.includes('merged-desk-money-zone-keep') || /\$\$\$\$/.test(text)) return 110;
  if (id.startsWith('merged-desk-hq-') || extra.includes('merged-hq-entry-zone')) return 108;
  if (
    (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone')) &&
    (extra.includes('merged-desk-hotzone-entry--primary') ||
      extra.includes('hotzone-entry--enter') ||
      extra.includes('hotzone-entry--touch') ||
      /★|반등|저항/.test(text))
  ) {
    return 105;
  }
  if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone')) return 92;
  if (
    id.startsWith('merged-desk-asset-') ||
    id.startsWith('merged-desk-ai-buy-') ||
    id.startsWith('merged-desk-ai-sell-') ||
    id.startsWith('merged-desk-ai-defense-') ||
    extra.includes('merged-desk-asset-auto-zone') ||
    extra.includes('merged-desk-ai-force-zone')
  ) {
    return 70;
  }
  if (id.startsWith('merged-desk-core-sr') && (extra.includes('--support') || extra.includes('--primary')))
    return 55;
  if (id.startsWith('merged-desk-core-sr') || extra.includes('merged-desk-core-sr')) return 35;
  if (/Hist|핵심구간|핵심지점|매수라인|매도라인/i.test(text)) return 30;
  return 12;
}

function isDemandSide(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const label = `${o.label || ''}${o.zoneFaceBase || ''}`;
  if (o.kind === 'demandZone') return true;
  if (o.kind === 'supplyZone') return false;
  if (/support|지지|demand|롱|long|below|반등|ob\s*l|obl/i.test(`${id} ${extra} ${label}`)) return true;
  if (/resist|저항|supply|숏|short|above|ob\s*s|obs/i.test(`${id} ${extra} ${label}`)) return false;
  const p1 = Number(o.price1);
  const p2 = Number(o.price2);
  if (Number.isFinite(p1) && Number.isFinite(p2)) return Math.min(p1, p2) < Math.max(p1, p2);
  return true;
}

function hideCaptionFields(raw: OverlayItem, tip?: string): OverlayItem {
  const extra = String(raw.overlayZoneExtraClass || '');
  if (extra.includes('merged-desk-zone-face-hidden')) {
    return {
      ...raw,
      label: '',
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
    };
  }
  return {
    ...raw,
    label: '',
    zoneFaceBase: undefined,
    zoneFaceSignal: undefined,
    labelTooltip: tip ?? String(raw.labelTooltip || raw.label || raw.zoneFaceBase || ''),
    overlayZoneExtraClass: `${extra
      .replace(/\bmerged-desk-zone-caption-clean\b/g, '')
      .replace(/\bmerged-desk-zone-pro-hero\b/g, '')
      .replace(/\bmerged-desk-money-zone-keep\b/g, '')
      .trim()} merged-desk-zone-face-minimal merged-desk-zone-pro-soft`.trim(),
  };
}

/** zone 타점 캡션 — zone마다 전부 표시. 완전 동일 문구·가격만 중복 제거 */
const DUP_PRICE_FRAC = 0.0035;

function isChannelBandOverlay(o: OverlayItem): boolean {
  return String(o.kind || '') === 'channelBand' || !!o.channelBand;
}

/**
 * zone 면·캡션 유지. 라벨은 zone마다 표시(완전 동일 중복만 숨김).
 */
export function applyMergedDeskZoneChartLabelClean(overlays: OverlayItem[]): OverlayItem[] {
  if (!overlays.length) return overlays;

  const zoneIdx: number[] = [];
  const channelIdx: number[] = [];
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i]!;
    if (!isZoneFace(o)) continue;
    if (!isMergedAnalysisDeskOverlayId(o.id) && !isMergedDeskAnalyzedCandleSpanOverlay(o)) continue;
    if (isChannelBandOverlay(o)) {
      channelIdx.push(i);
      continue;
    }
    zoneIdx.push(i);
  }

  const keepCaption = new Set<number>();
  for (const i of zoneIdx) {
    const extra = String(overlays[i]!.overlayZoneExtraClass || '');
    if (extra.includes('merged-desk-rb-core-face-off') || extra.includes('merged-desk-zone-face-hidden')) {
      continue;
    }
    keepCaption.add(i);
  }
  for (const i of channelIdx) {
    const extra = String(overlays[i]!.overlayZoneExtraClass || '');
    const id = String(overlays[i]!.id || '');
    if (extra.includes('merged-desk-rb-secondary') || id.includes('confluence')) continue;
    if (extra.includes('merged-desk-zone-face-hidden')) continue;
    keepCaption.add(i);
  }

  /** 1차: 우선순위 캡 적용 */
  let next = overlays.map((raw, i) => {
    const extra0 = String(raw.overlayZoneExtraClass || '');
    if (extra0.includes('merged-desk-zone-face-hidden') || extra0.includes('merged-desk-rb-core-face-off')) {
      return hideCaptionFields(raw, String(raw.labelTooltip || raw.label || raw.zoneFaceBase || ''));
    }

    const id = String(raw.id || '');
    const kind = String(raw.kind || '');
    const tip = String(raw.labelTooltip || raw.label || raw.zoneFaceBase || '');

    if (!zoneIdx.includes(i) && !channelIdx.includes(i)) {
      if (
        kind === 'bos' ||
        kind === 'choch' ||
        kind === 'label' ||
        id.includes('-struct-') ||
        id.endsWith('-pin') ||
        id.includes('ChoCH') ||
        id.includes('choch') ||
        id.includes('-bos-')
      ) {
        return hideCaptionFields(raw, tip);
      }
      return raw;
    }

    if (!keepCaption.has(i)) {
      return hideCaptionFields(raw, tip);
    }

    const full = captionText(raw);
    const extra = String(raw.overlayZoneExtraClass || '');
    /** 레일 반등·눌림 타점 — 강도 라벨 유지 */
    if (
      id.includes('rb-rail-bounce') ||
      id.includes('rb-pullback') ||
      extra.includes('merged-desk-rb-rail-bounce') ||
      extra.includes('merged-desk-rb-pullback')
    ) {
      const face =
        String(raw.zoneFaceBase || '').trim() ||
        String(raw.label || '').trim() ||
        full ||
        (extra.includes('short') || /저항|하락/.test(full) ? '★약하락' : '★약반등');
      const signal = String(raw.zoneFaceSignal || '').trim();
      return {
        ...raw,
        label: face,
        zoneFaceBase: face,
        zoneFaceSignal: undefined,
        labelTooltip: tip || face || signal,
        overlayZoneExtraClass: `${extra
          .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
          .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
          .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
          .trim()} merged-desk-zone-caption-clean merged-desk-zone-pro-hero merged-desk-zone-label-on merged-desk-money-zone-keep`.trim(),
      };
    }
    /** Hot·반응 zone — 약/중/강/초강 반등·하락 1라벨 */
    if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone')) {
      const isLong =
        extra.includes('hotzone-signal--long') || String(raw.structureBias || '') === 'bullish';
      const existing = String(raw.zoneFaceBase || '').trim() || String(raw.label || '').split('·')[0]?.trim();
      const face = /^★(약|중|강|초강)/.test(existing)
        ? existing
        : isLong
          ? '★중반등'
          : '★중하락';
      return {
        ...raw,
        label: face,
        zoneFaceBase: face,
        zoneFaceSignal: undefined,
        labelTooltip: tip || face,
        overlayZoneExtraClass: `${extra
          .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
          .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
          .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
          .trim()} merged-desk-zone-caption-clean merged-desk-zone-pro-hero merged-desk-zone-label-on`.trim(),
      };
    }
    /** 파란·빨간 평행채널 */
    if (isChannelBandOverlay(raw) || id.startsWith('merged-desk-rb-') || extra.includes('merged-desk-rb-channel')) {
      const cap = full || String(raw.label || '').trim() || '채널';
      return {
        ...raw,
        label: cap,
        zoneFaceBase: cap,
        zoneFaceSignal: undefined,
        labelTooltip: tip || cap,
        overlayZoneExtraClass: `${extra
          .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
          .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
          .trim()} merged-desk-zone-caption-clean merged-desk-rb-channel-keep merged-desk-zone-label-on`.trim(),
      };
    }

    const compact = compactMergedDeskZoneChartLabel(full);
    const face = compact || full || String(raw.label || '').trim() || 'zone';
    return {
      ...raw,
      label: face,
      zoneFaceBase: face,
      zoneFaceSignal: String(raw.zoneFaceSignal || '').trim() || undefined,
      labelTooltip: tip || face,
      overlayZoneExtraClass: `${extra
        .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
        .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
        .trim()} merged-desk-zone-caption-clean merged-desk-zone-pro-hero merged-desk-zone-label-on`.trim(),
    };
  });

  /** 2차: 완전 동일 문구 + 거의 같은 가격만 중복 숨김 (zone마다 라벨은 유지) */
  const visible: Array<{ i: number; key: string; mid: number; pri: number }> = [];
  for (let i = 0; i < next.length; i++) {
    const o = next[i]!;
    const extra = String(o.overlayZoneExtraClass || '');
    if (extra.includes('merged-desk-zone-face-minimal')) continue;
    if (isChannelBandOverlay(o)) continue;
    if (!isZoneFace(o)) continue;
    const text = captionText(o);
    if (!text) continue;
    const mid = zoneMid(o);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    visible.push({
      i,
      key: normalizeMergedDeskZoneCaptionKey(text),
      mid,
      pri: captionPriority(o),
    });
  }

  visible.sort((a, b) => b.pri - a.pri || a.mid - b.mid);
  const hideDup = new Set<number>();
  const kept: Array<{ key: string; mid: number }> = [];
  for (const row of visible) {
    const hit = kept.find(
      (k) => k.key === row.key && Math.abs(k.mid - row.mid) / row.mid <= DUP_PRICE_FRAC
    );
    if (hit) {
      hideDup.add(row.i);
      continue;
    }
    kept.push({ key: row.key, mid: row.mid });
  }

  if (hideDup.size) {
    next = next.map((raw, i) => {
      if (!hideDup.has(i)) return raw;
      const id = String(raw.id || '');
      const extra = String(raw.overlayZoneExtraClass || '');
      if (
        id.includes('rb-rail-bounce') ||
        extra.includes('merged-desk-rb-rail-bounce') ||
        id.startsWith('merged-desk-rb-') ||
        extra.includes('merged-desk-rb-channel')
      ) {
        return raw;
      }
      return hideCaptionFields(raw);
    });
  }

  return next;
}
