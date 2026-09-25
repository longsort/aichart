/**
 * AI 파랑빨강띠 완전체 — 통로 스스로 상승/하락 판정 후
 * 도식·거래량·기관밴드·HotZone을 같은 색 세트로 라벨.
 * 확정 수익·승률 아님.
 */
import type { OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskRbVolumePulse } from '@/lib/mergedDeskRbVolumePulse';
import type { MergedDeskRbFullConfluencePack } from '@/lib/mergedDeskRbFullConfluence';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import { explainMergedDeskRbLabel } from '@/lib/mergedDeskBlueRedLabelGuide';
import {
  evaluateMergedDeskRbPocRelation,
  mergedDeskRbPocTagKo,
  mergedDeskRbStyleWeights,
  type MergedDeskRbTradeStyle,
} from '@/lib/mergedDeskRbAiStyleBrain';
import { gradeMergedDeskRbBounceStrength } from '@/lib/mergedDeskRbBounceStrength';

export type RbKitTagId = 'corridor' | 'schematic' | 'volume' | 'band' | 'hot' | 'poc' | 'style' | 'vdna';

export type RbKitTag = {
  id: RbKitTagId;
  text: string;
  tone: 'up' | 'down' | 'wait';
};

export type MergedDeskRbCompleteKit = {
  bear: boolean;
  dirKo: '상승' | '하락';
  caption: string;
  tags: RbKitTag[];
  tooltip: string;
  extraClass: string;
};

const TONE_CLS: Record<RbKitTag['tone'], string> = {
  up: 'merged-desk-rb-kit-tone--up',
  down: 'merged-desk-rb-kit-tone--down',
  wait: 'merged-desk-rb-kit-tone--wait',
};

export function buildMergedDeskRbCompleteKit(params: {
  geoms?: MergedDeskChannelGeom[] | null;
  paint?: MergedDeskRbCorridorPaint | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  fullConf?: MergedDeskRbFullConfluencePack | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  cycle?: MergedDeskCycleProgressPack | null;
  close?: number | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  tradeStyle?: MergedDeskRbTradeStyle | null;
  volumePulse?: MergedDeskRbVolumePulse | null;
}): MergedDeskRbCompleteKit {
  const styleW = mergedDeskRbStyleWeights(params.tradeStyle ?? params.paint?.tradeStyle);
  const g =
    params.geoms?.find((x) => x.primary) ??
    params.geoms?.find((x) => x.horizon === styleW.preferredHorizon) ??
    params.geoms?.find((x) => x.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const paintBear = params.paint?.bear;
  const bear = paintBear != null ? paintBear : Boolean(g?.descending);
  const dirKo: '상승' | '하락' = bear ? '하락' : '상승';
  const tags: RbKitTag[] = [
    {
      id: 'style',
      text: styleW.styleKo,
      tone: 'wait',
    },
    {
      id: 'corridor',
      text: `${dirKo}통로`,
      tone: bear ? 'down' : 'up',
    },
  ];

  const close = Number(params.close) || 0;
  const pocRel = evaluateMergedDeskRbPocRelation({
    close,
    poc: params.vrvpPoc,
    vaLow: params.vrvpVaLow,
    vaHigh: params.vrvpVaHigh,
    atr: g && g.tipUpper > g.tipLower ? (g.tipUpper - g.tipLower) * 0.35 : null,
  });
  const pocTag = mergedDeskRbPocTagKo(pocRel);
  if (pocTag) {
    tags.push({
      id: 'poc',
      text: pocTag,
      tone: pocRel.side === 'LONG' ? 'up' : pocRel.side === 'SHORT' ? 'down' : 'wait',
    });
  }

  const pin =
    params.cycle?.schematics?.wyckoff ??
    params.cycle?.schematics?.elliott ??
    null;
  const seat = params.cycle?.primary;
  const verdict = [
    pin?.headlineKo,
    pin?.seatKo,
    pin?.seatSide,
    pin?.seatRole,
    seat?.headlineKo,
    seat?.tone,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (/폭락|하락|숏|markdown|마크다운|run-down|rally-short|bear/.test(verdict)) {
    tags.push({ id: 'schematic', text: '도식하락', tone: 'down' });
  } else if (/상승|롱|반등|spring|스프링|run-up|pullback-long|bull/.test(verdict)) {
    tags.push({ id: 'schematic', text: '도식상승', tone: 'up' });
  } else if (verdict || pin) {
    tags.push({ id: 'schematic', text: '도식대기', tone: 'wait' });
  }

  const vs = params.volSync;
  if (vs) {
    if (vs.side === 'down' || vs.sellPct >= 0.56) {
      tags.push({ id: 'volume', text: 'V매도', tone: 'down' });
    } else if (vs.side === 'up' || vs.buyPct >= 0.56) {
      tags.push({ id: 'volume', text: 'V매수', tone: 'up' });
    } else {
      tags.push({ id: 'volume', text: 'V혼조', tone: 'wait' });
    }
  }

  const vp = params.volumePulse;
  if (vp) {
    tags.push({
      id: 'vdna',
      text: vp.tagKo,
      tone: vp.side === 'LONG' ? 'up' : vp.side === 'SHORT' ? 'down' : 'wait',
    });
  }

  const st = params.fullConf?.reasons.find((r) => r.ko.includes('기관밴드'));
  if (st) {
    if (/숏|역행/.test(st.ko) || !st.ok) {
      tags.push({ id: 'band', text: '기관저항', tone: st.ok && /롱/.test(st.ko) ? 'up' : 'down' });
    } else if (/롱|정렬/.test(st.ko)) {
      tags.push({ id: 'band', text: '기관지지', tone: 'up' });
    } else {
      tags.push({ id: 'band', text: '기관대기', tone: 'wait' });
    }
  }

  const hots = params.hotZones ?? [];
  const hotLong = hots.find((z) => z.side === 'LONG' && (z.primary || z.touchedNow));
  const hotShort = hots.find((z) => z.side === 'SHORT' && (z.primary || z.touchedNow));
  if (hotLong && !hotShort) tags.push({ id: 'hot', text: 'Hot지지', tone: 'up' });
  else if (hotShort && !hotLong) tags.push({ id: 'hot', text: 'Hot저항', tone: 'down' });
  else if (hotLong && hotShort) tags.push({ id: 'hot', text: 'Hot양면', tone: 'wait' });

  const caption = `★${styleW.styleKo}·${dirKo}통로 · ${tags
    .filter((t) => t.id !== 'corridor' && t.id !== 'style')
    .map((t) => t.text)
    .join(' · ')}`.replace(/ · $/, '');
  const confHint = params.fullConf
    ? params.fullConf.entryAllowed && (params.fullConf.side === 'LONG' || params.fullConf.side === 'SHORT')
      ? params.fullConf.side === 'LONG'
        ? '롱진입가능'
        : '숏진입가능'
      : '관망'
    : '';
  const liveCaption = confHint ? `${caption} · ${confHint}` : caption;
  const tooltip = [
    `${styleW.styleKo} AI파랑빨강띠 · ${dirKo}통로 · ${confHint || '합류중'} · 확정 아님`,
    params.paint?.summaryKo || '',
    pocRel.ko || '',
    vs?.summaryKo || '',
    params.fullConf?.summaryKo || '',
    params.volumePulse?.storyKo || '',
    ...tags.map((t) => `${t.text}`),
  ]
    .filter(Boolean)
    .join('\n');
  const extraClass = [
    'merged-desk-rb-complete-kit',
    bear ? 'merged-desk-rb-kit--down' : 'merged-desk-rb-kit--up',
    ...tags.map((t) => `merged-desk-rb-kit-tag--${t.id} ${TONE_CLS[t.tone]}`),
  ].join(' ');

  return { bear, dirKo, caption: liveCaption, tags, tooltip, extraClass };
}

export function stampMergedDeskRbCompleteKit(
  overlays: OverlayItem[],
  kit: MergedDeskRbCompleteKit | null
): OverlayItem[] {
  if (!kit || !overlays.length) return overlays;
  return overlays.map((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const isPriBand =
      o.kind === 'channelBand' &&
      (extra.includes('merged-desk-rb-primary') || id.includes('-short-band') || id.includes('-fb-band'));
    if (!isPriBand) return o;
    const c = kitToneColors(kit.bear ? 'down' : 'up');
    return {
      ...o,
      label: kit.caption,
      zoneFaceBase: `${kit.dirKo}통로`,
      zoneFaceSignal: kit.tags
        .filter((t) => t.id !== 'corridor')
        .map((t) => t.text)
        .join(' · '),
      labelTooltip: explainMergedDeskRbLabel(kit.caption, kit.tooltip),
      lineLabelColor: c.line,
      labelBackgroundColor: c.bg,
      labelTextColor: c.text,
      overlayZoneExtraClass: `${extra} ${kit.extraClass}`.trim(),
    };
  });
}

function kitToneColors(tone: RbKitTag['tone']): { line: string; bg: string; text: string } {
  if (tone === 'up') return { line: '#86efac', bg: 'rgba(21,128,61,0.94)', text: '#ecfdf5' };
  if (tone === 'down') return { line: '#fda4af', bg: 'rgba(153,27,27,0.94)', text: '#fef2f2' };
  return { line: '#fde68a', bg: 'rgba(69,26,3,0.94)', text: '#fef3c7' };
}

/** 도식·거래량좌석·기관밴드 라벨을 기능 색 세트로 맞춤 */
export function stampMergedDeskRbFeatureKitLabels(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.map((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const text = `${o.label || ''}${o.zoneFaceBase || ''}${o.zoneFaceSignal || ''}`;

    if (id.startsWith('merged-desk-advvol-seat') || extra.includes('merged-desk-advvol-seat')) {
      const bounce = /2차반등/.test(text);
      const drop = /2차하락/.test(text);
      const tone: RbKitTag['tone'] = bounce ? 'up' : drop ? 'down' : 'wait';
      const c = kitToneColors(tone);
      return {
        ...o,
        lineLabelColor: c.line,
        labelBackgroundColor: c.bg,
        labelTextColor: c.text,
        overlayZoneExtraClass: `${extra} merged-desk-rb-kit-vol merged-desk-rb-kit-tone--${tone}`.trim(),
      };
    }

    if (extra.includes('merged-desk-rb-schematic') || id.includes('schematic')) {
      const dump = extra.includes('dump') || /폭락/.test(text);
      const resist = extra.includes('resist') || /저항/.test(text);
      const bounce = extra.includes('bounce') || extra.includes('support') || /반등|지지/.test(text);
      const tone: RbKitTag['tone'] = dump || resist ? 'down' : bounce ? 'up' : 'wait';
      const c = kitToneColors(tone);
      return {
        ...o,
        lineLabelColor: c.line,
        labelBackgroundColor: c.bg,
        labelTextColor: c.text,
        overlayZoneExtraClass: `${extra} merged-desk-rb-kit-schematic merged-desk-rb-kit-tone--${tone}`.trim(),
      };
    }

    if (id.startsWith('inst-sr-band') || String(o.category || '') === 'institutionalSrBand') {
      const up = id.includes('buy') || /지지|매수/.test(text);
      const tone: RbKitTag['tone'] = up ? 'up' : 'down';
      const c = kitToneColors(tone);
      const face = up ? '기관지지' : '기관저항';
      return {
        ...o,
        label: face,
        zoneFaceBase: face,
        lineLabelColor: c.line,
        labelBackgroundColor: c.bg,
        labelTextColor: c.text,
        overlayZoneExtraClass: `${extra} merged-desk-rb-kit-band merged-desk-rb-kit-tone--${tone}`.trim(),
      };
    }

    if (
      id.includes('rb-rail-bounce') ||
      extra.includes('merged-desk-rb-rail-bounce') ||
      id.includes('rb-pullback') ||
      extra.includes('merged-desk-rb-pullback-entry')
    ) {
      const isLong =
        extra.includes('bounce-long') ||
        extra.includes('pullback-long') ||
        String(o.structureBias || '') === 'bullish' ||
        /반등/.test(text);
      const tone: RbKitTag['tone'] =
        /초강력|ultra/i.test(text) || extra.includes('bounce-grade--ultra')
          ? isLong
            ? 'up'
            : 'down'
          : isLong
            ? 'up'
            : 'down';
      const c = kitToneColors(tone);
      const face =
        String(o.label || o.zoneFaceBase || '').trim() ||
        (isLong ? '★약반등' : '★약하락');
      return {
        ...o,
        label: face,
        zoneFaceBase: face,
        zoneFaceSignal: undefined,
        lineLabelColor: c.line,
        labelBackgroundColor: c.bg,
        labelTextColor: c.text,
        overlayZoneExtraClass: `${extra} merged-desk-rb-kit-bounce merged-desk-rb-kit-tone--${tone} merged-desk-zone-caption-clean merged-desk-zone-label-on merged-desk-zone-label-solo`.trim(),
      };
    }

    return o;
  });
}

export function stampMergedDeskHotZoneKitLabels(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.map((o) => {
    const extra = String(o.overlayZoneExtraClass || '');
    if (!extra.includes('merged-desk-hotzone')) return o;
    const isLong =
      extra.includes('hotzone-signal--long') || String(o.structureBias || '') === 'bullish';
    const status = extra.includes('hotzone-entry--enter')
      ? 'ENTER'
      : extra.includes('hotzone-entry--touch')
        ? 'TOUCH'
        : 'WAIT';
    const strength = gradeMergedDeskRbBounceStrength({
      side: isLong ? 'LONG' : 'SHORT',
      baseScore: Number(o.confidence) || 55,
      status,
    });
    const face =
      /^★(약|중|강|초강)/.test(String(o.zoneFaceBase || o.label || ''))
        ? String(o.zoneFaceBase || o.label || '').trim()
        : strength.labelKo;
    return {
      ...o,
      label: face,
      zoneFaceBase: face,
      zoneFaceSignal: undefined,
      lineLabelColor: isLong ? '#86efac' : '#fda4af',
      labelBackgroundColor: isLong ? 'rgba(20,83,45,0.94)' : 'rgba(127,29,29,0.94)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: `${extra
        .replace(/\bmerged-desk-rb-bounce-grade--\w+\b/g, '')
        .trim()} merged-desk-rb-kit-hot merged-desk-zone-label-on merged-desk-rb-bounce-grade--${strength.grade} ${
        isLong ? 'merged-desk-rb-kit-tone--up' : 'merged-desk-rb-kit-tone--down'
      }`.trim(),
    };
  });
}
