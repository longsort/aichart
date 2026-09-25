/**
 * AI 파랑빨강띠 완전체 — 통로 스스로 상승/하락 판정 후
 * 도식·거래량·기관밴드·HotZone을 같은 색 세트로 라벨.
 * 확정 수익·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
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
import type { RbWavePhase } from '@/lib/mergedDeskRbWaveLock';
import type { MergedDeskRbEdgeConfluenceGatePack } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { computeMergedDeskRbPatternLean } from '@/lib/mergedDeskRbPatternLean';

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
  wavePhase?: RbWavePhase | null;
  edgeGate?: MergedDeskRbEdgeConfluenceGatePack | null;
  /** 추세선 자동 라벨 캡션 (지지/저항/돌파…) */
  waveBandCaptionKo?: string | null;
  /** 데스크 캔들 — 패턴기억 경량 투표 */
  candles?: Candle[] | null;
  /** 라이브 허브 액션 (롱진입가능 등) */
  liveActionKo?: string | null;
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

  const pat =
    params.candles && params.candles.length >= 40
      ? computeMergedDeskRbPatternLean(params.candles)
      : null;
  if (pat && pat.sample >= 6) {
    tags.push({
      id: 'style',
      text: pat.tagKo,
      tone: pat.lean === 'LONG' ? 'up' : pat.lean === 'SHORT' ? 'down' : 'wait',
    });
  }

  const confHint = params.fullConf
    ? params.fullConf.entryAllowed && (params.fullConf.side === 'LONG' || params.fullConf.side === 'SHORT')
      ? params.fullConf.side === 'LONG'
        ? '롱진입가능'
        : '숏진입가능'
      : '관망'
    : '';
  const liveHint = String(params.liveActionKo || '').trim();
  const actionHint = liveHint || confHint || (pat?.lean === 'LONG' ? '패턴롱기울기' : pat?.lean === 'SHORT' ? '패턴숏기울기' : '관망');
  const waveHint =
    params.wavePhase === 'LOCK'
      ? '🔒고정'
      : params.wavePhase === 'FREEZE'
        ? '🔒과거'
        : params.wavePhase === 'REBUILD'
          ? '♻재구축'
          : '';
  const liveCaption = [
    '파랑빨강띠',
    actionHint,
    pat?.sample && pat.sample >= 6 ? pat.tagKo : '',
    params.edgeGate?.placeRefOk
      ? `자리${params.edgeGate.coreHitCount}/6`
      : params.edgeGate
        ? `합류${params.edgeGate.coreHitCount}/6`
        : '',
    `${dirKo}통로`,
  ]
    .filter(Boolean)
    .join(' · ');
  const tooltip = [
    '파랑빨강띠 · 구조파동 고정 · 매봉 재적합 안 함 · 참고(확정수익 아님)',
    '합류: 채널·기관·POC·Hot·$$$$·거래량DNA·패턴기억',
    `${styleW.styleKo} · ${dirKo}통로 · ${waveHint || '실시간'} · ${actionHint}`,
    pat?.detailKo || '',
    '라벨 자동: 지지/저항/돌파/안파/안착 — 추세선·종가에 맞춰 갱신',
    params.paint?.summaryKo || '',
    params.edgeGate?.summaryKo || '',
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
    actionHint.includes('롱') ? 'merged-desk-rb-kit-tone--up' : actionHint.includes('숏') ? 'merged-desk-rb-kit-tone--down' : 'merged-desk-rb-kit-tone--wait',
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
      const up =
        id.includes('buy') ||
        id.includes('-l-') ||
        String(o.structureBias || '') === 'bullish' ||
        /지지|매수|롱/.test(text);
      const tone: RbKitTag['tone'] = up ? 'up' : 'down';
      const c = kitToneColors(tone);
      const baseFace = up ? '기관지지' : '기관저항';
      const srBits: string[] = [];
      const sp = Number(o.supportProb);
      const rp = Number(o.resistanceProb);
      if (up && Number.isFinite(sp) && sp > 0) srBits.push(`지지${Math.round(sp)}%`);
      if (!up && Number.isFinite(rp) && rp > 0) srBits.push(`저항${Math.round(rp)}%`);
      const existingSig = String(o.zoneFaceSignal || '').trim();
      if (!srBits.length && /지지\d+%|저항\d+%/.test(existingSig)) {
        srBits.push(existingSig.replace(/.*?((?:지지|저항)\d+%).*/, '$1'));
      }
      const face = srBits.length ? `${baseFace} · ${srBits.join(' · ')}` : baseFace;
      const signal = srBits.join(' · ') || existingSig || undefined;
      return {
        ...o,
        label: face,
        zoneFaceBase: face,
        zoneFaceSignal: signal,
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
    const srBits: string[] = [];
    const sp = Number(o.supportProb);
    const rp = Number(o.resistanceProb);
    if (isLong && Number.isFinite(sp) && sp > 0) srBits.push(`지지${Math.round(sp)}%`);
    if (!isLong && Number.isFinite(rp) && rp > 0) srBits.push(`저항${Math.round(rp)}%`);
    const prevSig = String(o.zoneFaceSignal || '').trim();
    if (!srBits.length && /지지\d+%|저항\d+%/.test(prevSig)) srBits.push(prevSig);
    const signal = srBits.join(' · ') || undefined;
    const faceWithSr =
      signal && !/지지\d+%|저항\d+%/.test(face) ? `${face} · ${signal}` : face;
    return {
      ...o,
      label: faceWithSr,
      zoneFaceBase: faceWithSr,
      zoneFaceSignal: signal,
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
