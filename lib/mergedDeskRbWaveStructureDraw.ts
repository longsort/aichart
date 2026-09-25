/**
 * 파랑·빨강띠 — 추세선(LOCK 레일)에 맞춘 자동 라벨.
 * 이미지 스펙: 지지 / 저항 / 돌파 / 안파 / 안착
 * 테두리는 고정 · 라벨·역할만 종가 기준으로 그때그때 갱신.
 * 확정 수익·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskRbWaveLockPack, RbWavePhase } from '@/lib/mergedDeskRbWaveLock';
import { explainMergedDeskRbLabel } from '@/lib/mergedDeskBlueRedLabelGuide';

export type RbAutoRailRole = '지지' | '저항' | '돌파' | '안파' | '안착' | '관찰';

export type RbAutoRailLabel = {
  role: RbAutoRailRole;
  price: number;
  title: string;
  color: string;
  dashed?: boolean;
  active: boolean;
};

export type MergedDeskRbWaveStructureDrawPack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
  phase: RbWavePhase;
  judgeKo: string;
  /** 채널 밴드·엣지에 찍을 자동 캡션 */
  bandCaptionKo: string;
  rails: {
    upper: RbAutoRailLabel;
    lower: RbAutoRailLabel;
    mid: RbAutoRailLabel;
    extra: RbAutoRailLabel[];
  };
};

type EdgeReadLite = {
  upper?: string;
  lower?: string;
} | null;

type GhostMem = {
  geom: MergedDeskChannelGeom;
  untilBar: number;
};

const GHOST = new Map<string, GhostMem>();

const ROLE_COLOR: Record<RbAutoRailRole, string> = {
  지지: 'rgba(74,222,128,0.95)',
  저항: 'rgba(248,113,113,0.95)',
  돌파: 'rgba(251,146,60,0.95)',
  안파: 'rgba(250,204,21,0.85)',
  안착: 'rgba(251,146,60,0.9)',
  관찰: 'rgba(148,163,184,0.85)',
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function phaseTag(phase: RbWavePhase): string {
  if (phase === 'LOCK') return '고정유지';
  if (phase === 'FREEZE') return '과거고정';
  if (phase === 'REBUILD') return '재구축';
  return '실시간';
}

/**
 * 종가만으로 상·하·중 레일 역할을 자동 부여.
 * 심지 관통은 역할 변경에 쓰지 않음(이미지 LOCK).
 */
export function resolveRbAutoRailLabels(params: {
  close: number;
  tipUpper: number;
  tipLower: number;
  atr: number;
  descending: boolean;
  phase: RbWavePhase;
  edgeRead?: EdgeReadLite;
}): {
  judgeKo: string;
  bandCaptionKo: string;
  upper: RbAutoRailLabel;
  lower: RbAutoRailLabel;
  mid: RbAutoRailLabel;
  extra: RbAutoRailLabel[];
  priceLines: AtlasPulsePriceLine[];
} {
  const { close, tipUpper, tipLower, atr, descending, phase, edgeRead } = params;
  const eps = atr * 0.12;
  const midPx = (tipUpper + tipLower) / 2;
  const hi = Math.max(tipUpper, tipLower);
  const lo = Math.min(tipUpper, tipLower);
  const tag = phaseTag(phase);
  const upState = String(edgeRead?.upper || '');
  const loState = String(edgeRead?.lower || '');

  let upperRole: RbAutoRailRole = descending ? '저항' : '지지';
  let lowerRole: RbAutoRailRole = descending ? '지지' : '저항';
  let midRole: RbAutoRailRole = '안파';
  let judgeKo = '채널내·관찰';
  const extra: RbAutoRailLabel[] = [];

  const above = close > hi + eps;
  const below = close < lo - eps;
  const nearHi = close >= hi - eps && !above;
  const nearLo = close <= lo + eps && !below;
  const settledUp = upState === '안착확정' || (above && close > hi + atr * 0.35);
  const settledLo = loState === '안착확정' || (below && close < lo - atr * 0.35);
  const failUp = upState === '돌파실패';
  const failLo = loState === '돌파실패';

  if (above) {
    upperRole = settledUp ? '안착' : '돌파';
    lowerRole = '지지';
    midRole = '안파';
    judgeKo = settledUp ? '상단돌파·안착' : '상단돌파·종가확인';
    extra.push({
      role: '돌파',
      price: hi,
      title: `돌파·${tag}`,
      color: ROLE_COLOR.돌파,
      dashed: !settledUp,
      active: true,
    });
    if (settledUp) {
      extra.push({
        role: '안착',
        price: hi,
        title: `안착·${tag}`,
        color: ROLE_COLOR.안착,
        active: true,
      });
    }
  } else if (below) {
    lowerRole = settledLo ? '안착' : '돌파';
    upperRole = '저항';
    midRole = '안파';
    judgeKo = settledLo ? '하단돌파·안착' : '하단돌파·종가확인';
    extra.push({
      role: '돌파',
      price: lo,
      title: `돌파·${tag}`,
      color: ROLE_COLOR.돌파,
      dashed: !settledLo,
      active: true,
    });
    if (settledLo) {
      extra.push({
        role: '안착',
        price: lo,
        title: `안착·${tag}`,
        color: ROLE_COLOR.안착,
        active: true,
      });
    }
  } else if (nearHi) {
    upperRole = descending ? '저항' : '지지';
    lowerRole = descending ? '지지' : '저항';
    midRole = '안파';
    judgeKo = `${upperRole}터치·종가판정`;
  } else if (nearLo) {
    lowerRole = descending ? '지지' : '저항';
    upperRole = descending ? '저항' : '지지';
    midRole = '안파';
    judgeKo = `${lowerRole}터치·종가판정`;
  } else {
    judgeKo = '안파·채널내';
  }

  if (failUp || failLo) {
    judgeKo = '돌파실패·복귀';
    if (failUp) upperRole = '저항';
    if (failLo) lowerRole = '지지';
  }

  const upper: RbAutoRailLabel = {
    role: upperRole,
    price: hi,
    title: `${upperRole}·${tag}`,
    color: ROLE_COLOR[upperRole],
    active: true,
  };
  const lower: RbAutoRailLabel = {
    role: lowerRole,
    price: lo,
    title: `${lowerRole}·${tag}`,
    color: ROLE_COLOR[lowerRole],
    active: true,
  };
  const mid: RbAutoRailLabel = {
    role: midRole,
    price: midPx,
    title: `${midRole}·${tag}`,
    color: ROLE_COLOR[midRole],
    dashed: true,
    active: !above && !below,
  };

  /** 축 가격선 — 이미지처럼 역할별 전부 표시 */
  const lineBag = new Map<string, AtlasPulsePriceLine>();
  const pushLine = (lab: RbAutoRailLabel) => {
    if (!lab.active || !(lab.price > 0)) return;
    const key = `${lab.role}:${Math.round(lab.price)}`;
    if (lineBag.has(key)) return;
    lineBag.set(key, {
      price: lab.price,
      title: lab.title.slice(0, 14),
      color: lab.color,
      lineWidth: lab.role === '돌파' || lab.role === '안착' ? 2 : 1,
      lineStyle: lab.dashed ? 'dashed' : 'solid',
      axisLabel: true,
    });
  };
  pushLine(upper);
  pushLine(lower);
  if (mid.active) pushLine(mid);
  for (const e of extra) pushLine(e);

  const bandCaptionKo = `🔒${tag}·문닫힘 · ${judgeKo} · ${upper.role}/${lower.role}/${mid.role}`;

  return {
    judgeKo,
    bandCaptionKo,
    upper,
    lower,
    mid,
    extra,
    priceLines: [...lineBag.values()],
  };
}

function ghostOverlay(geom: MergedDeskChannelGeom): OverlayItem {
  return {
    id: `merged-desk-rb-wave-ghost-${geom.horizon}`,
    kind: 'channelBand',
    label: '파동과거고정',
    zoneFaceBase: '과거고정',
    zoneFaceSignal: '테두리고정',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: geom.tStart,
    time2: geom.tEnd,
    price1: Math.max(geom.up1, geom.up2),
    price2: Math.min(geom.lo1, geom.lo2),
    confidence: 60,
    color: 'rgba(148,163,184,0.12)',
    category: 'chartPrimeTrendChannels',
    structureBias: geom.descending ? 'bearish' : 'bullish',
    zoneFillPreserve: true,
    channelBand: {
      time1: geom.tStart,
      time2: geom.tEnd,
      priceHigh1: geom.up1,
      priceHigh2: geom.up2,
      priceLow1: geom.lo1,
      priceLow2: geom.lo2,
    },
    overlayZoneExtraClass:
      'merged-desk-rb-channel merged-desk-rb-wave-ghost merged-desk-rb-wave-freeze merged-desk-channel-no-end-label',
    labelTooltip: '끝난 파동 · 테두리 안 움직임 · 참고(확정 아님)',
    lineLabelColor: '#cbd5e1',
    labelBackgroundColor: 'rgba(51,65,85,0.9)',
    labelTextColor: '#f8fafc',
    noProject: true,
  };
}

/**
 * 채널 상·하·중 추세선 라벨을 역할에 맞게 자동 교체.
 */
export function stampRbOverlaysWithWaveAutoLabels(
  overlays: OverlayItem[],
  pack: MergedDeskRbWaveStructureDrawPack | null
): OverlayItem[] {
  if (!pack || !overlays.length) return overlays;
  const upper = pack.rails?.upper;
  const lower = pack.rails?.lower;
  const mid = pack.rails?.mid;
  if (!upper || !lower || !mid) return overlays;

  const bandCaptionKo = pack.bandCaptionKo || `🔒${phaseTag(pack.phase)} · ${pack.judgeKo || '관찰'}`;
  const judgeKo = pack.judgeKo || '관찰';
  const phase = pack.phase || 'LIVE';
  const tag = phaseTag(phase);

  return overlays.map((o) => {
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const isRb =
      id.startsWith('merged-desk-rb-') ||
      cls.includes('merged-desk-rb-channel') ||
      cls.includes('merged-desk-blue-red-channel');
    if (!isRb) return o;

    const tipBase = [
      `구조파동 ${tag} · ${judgeKo}`,
      '추세선 고정 · 라벨만 종가 기준 자동갱신',
      '심지 관통 허용 · 확정수익 아님',
    ].join('\n');

    if (o.kind === 'channelBand' && cls.includes('merged-desk-rb-primary')) {
      return {
        ...o,
        label: bandCaptionKo,
        zoneFaceBase: `${upper.role}·${lower.role}`,
        zoneFaceSignal: judgeKo,
        labelTooltip: explainMergedDeskRbLabel(bandCaptionKo, tipBase),
        overlayZoneExtraClass: `${cls} merged-desk-rb-wave-${String(phase).toLowerCase()} merged-desk-rb-auto-label`.trim(),
      };
    }

    if (id.endsWith('-upper') || (id.includes('-upper') && o.kind === 'trendLine')) {
      return {
        ...o,
        label: upper.title,
        zoneFaceBase: upper.role,
        zoneFaceSignal: tag,
        color: upper.color,
        lineLabelColor: upper.color,
        labelTooltip: explainMergedDeskRbLabel(upper.title, tipBase),
        overlayZoneExtraClass: `${cls} merged-desk-rb-role-${upper.role}`.trim(),
      };
    }
    if (id.endsWith('-lower') || (id.includes('-lower') && o.kind === 'trendLine')) {
      return {
        ...o,
        label: lower.title,
        zoneFaceBase: lower.role,
        zoneFaceSignal: tag,
        color: lower.color,
        lineLabelColor: lower.color,
        labelTooltip: explainMergedDeskRbLabel(lower.title, tipBase),
        overlayZoneExtraClass: `${cls} merged-desk-rb-role-${lower.role}`.trim(),
      };
    }
    if (id.endsWith('-mid') || (id.includes('-mid') && o.kind === 'trendLine')) {
      return {
        ...o,
        label: mid.active ? mid.title : `안파·${tag}`,
        zoneFaceBase: '안파',
        zoneFaceSignal: tag,
        color: mid.color,
        lineLabelColor: mid.color,
        lineDash: '4 4',
        labelTooltip: explainMergedDeskRbLabel(mid.title, tipBase),
        overlayZoneExtraClass: `${cls} merged-desk-rb-role-안파`.trim(),
      };
    }
    return o;
  });
}

export function buildMergedDeskRbWaveStructureDraw(params: {
  candles: Candle[];
  wave: MergedDeskRbWaveLockPack | null;
  edgeRead?: EdgeReadLite;
  ghostKey?: string;
}): MergedDeskRbWaveStructureDrawPack {
  const candles = params.candles;
  const wave = params.wave;
  const geom = wave?.lockedGeom ?? null;
  const phase = wave?.phase ?? 'LIVE';

  const empty: MergedDeskRbWaveStructureDrawPack = {
    overlays: [],
    priceLines: [],
    summaryKo: '구조파동작도 — 채널 없음',
    phase: 'LIVE',
    judgeKo: '대기',
    bandCaptionKo: '파랑빨강띠·대기',
    rails: {
      upper: { role: '관찰', price: 0, title: '관찰', color: ROLE_COLOR.관찰, active: false },
      lower: { role: '관찰', price: 0, title: '관찰', color: ROLE_COLOR.관찰, active: false },
      mid: { role: '안파', price: 0, title: '안파', color: ROLE_COLOR.안파, active: false },
      extra: [],
    },
  };

  if (!geom || candles.length < 8) return empty;

  const atr = atrApprox(candles);
  const iLive = candles.length - 1;
  const tLive = Number(candles[iLive]!.time);
  const close = Number(candles[iLive]!.close);
  const resolved = resolveRbAutoRailLabels({
    close,
    tipUpper: geom.tipUpper,
    tipLower: geom.tipLower,
    atr,
    descending: geom.descending,
    phase,
    edgeRead: params.edgeRead,
  });

  const tag = phaseTag(phase);
  const whyUpper = geom.descending
    ? '하락채널 상단=고점저항(공급)'
    : '상승채널 상단=돌파·저항후보';
  const whyLower = geom.descending
    ? '하락채널 하단=저점지지(수요)'
    : '상승채널 하단=저점지지(수요)';
  const upperZoneLabel = `상단존 ${geom.tipUpper.toFixed(0)}·${resolved.upper.role}`;
  const lowerZoneLabel = `하단존 ${geom.tipLower.toFixed(0)}·${resolved.lower.role}`;
  const zonePad = Math.max(atr * 0.18, (geom.tipUpper - geom.tipLower) * 0.04);
  /** 존·핀 우측: 마지막봉 직전(겹침 방지) */
  const tZoneRight = iLive > 0 ? Number(candles[iLive - 1]!.time) : tLive;

  const badge: OverlayItem = {
    id: `merged-desk-rb-wave-badge-${geom.horizon}`,
    kind: 'label',
    label: resolved.bandCaptionKo,
    x1: 0.7,
    y1: 0.1,
    x2: 0.98,
    y2: 0.1,
      time1: tZoneRight,
      time2: tZoneRight,
      price1: geom.tipMid,
      price2: geom.tipMid,
    confidence: 82,
    color: phase === 'REBUILD' ? '#38bdf8' : geom.descending ? '#f87171' : '#4ade80',
    category: 'chartPrimeTrendChannels',
    overlayZoneExtraClass: `merged-desk-rb-wave-badge merged-desk-rb-wave-${String(phase).toLowerCase()}`,
    labelTooltip: [
      '파랑빨강띠 · 구조파동 고정 · 매봉 재적합 안 함',
      '라벨: 지지/저항/돌파/안파/안착 — 추세선·종가에 맞춰 자동',
      `상단: ${whyUpper}`,
      `하단: ${whyLower}`,
      '면·존=마지막봉연장 · 노란세로=구조문',
      resolved.judgeKo,
      '참고 · 확정수익 아님',
    ].join('\n'),
    lineLabelColor: '#f8fafc',
    labelBackgroundColor:
      phase === 'REBUILD'
        ? 'rgba(3,105,161,0.92)'
        : geom.descending
          ? 'rgba(127,29,29,0.92)'
          : 'rgba(21,128,61,0.92)',
    labelTextColor: '#f8fafc',
    noProject: true,
  };

  /** 상·하 고저 zone — 왜 위/아래인지 라벨 */
  const hiLoZones: OverlayItem[] = [
    {
      id: `merged-desk-rb-hi-zone-${geom.horizon}`,
      kind: 'supplyZone',
      label: upperZoneLabel,
      zoneFaceBase: '상단존',
      zoneFaceSignal: resolved.upper.role,
      x1: 0,
      y1: 0.2,
      x2: 1,
      y2: 0.2,
      time1: geom.tStart,
      time2: tZoneRight,
      price1: geom.tipUpper + zonePad,
      price2: geom.tipUpper - zonePad * 0.35,
      confidence: 84,
      color: 'rgba(248,113,113,0.28)',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass:
        'merged-desk-rb-hi-zone merged-desk-zone-caption-clean merged-desk-zone-label-on',
      labelTooltip: `${upperZoneLabel}\n${whyUpper}\n가격 ${geom.tipUpper.toFixed(0)} · 채널 고점레일`,
      lineLabelColor: '#fecaca',
      labelBackgroundColor: 'rgba(127,29,29,0.88)',
      labelTextColor: '#fff1f2',
    },
    {
      id: `merged-desk-rb-lo-zone-${geom.horizon}`,
      kind: 'demandZone',
      label: lowerZoneLabel,
      zoneFaceBase: '하단존',
      zoneFaceSignal: resolved.lower.role,
      x1: 0,
      y1: 0.8,
      x2: 1,
      y2: 0.8,
      time1: geom.tStart,
      time2: tZoneRight,
      price1: geom.tipLower + zonePad * 0.35,
      price2: geom.tipLower - zonePad,
      confidence: 84,
      color: 'rgba(74,222,128,0.28)',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass:
        'merged-desk-rb-lo-zone merged-desk-zone-caption-clean merged-desk-zone-label-on',
      labelTooltip: `${lowerZoneLabel}\n${whyLower}\n가격 ${geom.tipLower.toFixed(0)} · 채널 저점레일`,
      lineLabelColor: '#bbf7d0',
      labelBackgroundColor: 'rgba(20,83,45,0.88)',
      labelTextColor: '#f0fdf4',
    },
  ];

  /** 레일 옆에 짧은 역할 핀(마지막봉 쪽) */
  const rolePins: OverlayItem[] = [
    {
      id: 'merged-desk-rb-role-pin-upper',
      kind: 'label',
      label: `${resolved.upper.role}·고점`,
      x1: 0.9,
      y1: 0.2,
      x2: 0.99,
      y2: 0.2,
      time1: tZoneRight,
      time2: tZoneRight,
      price1: resolved.upper.price,
      price2: resolved.upper.price,
      confidence: 78,
      color: resolved.upper.color,
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-role-pin merged-desk-rb-signal-pin',
      labelTooltip: `${resolved.upper.title}\n${whyUpper}`,
      lineLabelColor: resolved.upper.color,
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#f8fafc',
      noProject: true,
    },
    {
      id: 'merged-desk-rb-role-pin-lower',
      kind: 'label',
      label: `${resolved.lower.role}·저점`,
      x1: 0.9,
      y1: 0.8,
      x2: 0.99,
      y2: 0.8,
      time1: tZoneRight,
      time2: tZoneRight,
      price1: resolved.lower.price,
      price2: resolved.lower.price,
      confidence: 78,
      color: resolved.lower.color,
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-role-pin merged-desk-rb-signal-pin',
      labelTooltip: `${resolved.lower.title}\n${whyLower}`,
      lineLabelColor: resolved.lower.color,
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#f8fafc',
      noProject: true,
    },
  ];
  if (resolved.mid.active) {
    rolePins.push({
      id: 'merged-desk-rb-role-pin-mid',
      kind: 'label',
      label: '안파·중선',
      x1: 0.9,
      y1: 0.5,
      x2: 0.99,
      y2: 0.5,
      time1: tZoneRight,
      time2: tZoneRight,
      price1: resolved.mid.price,
      price2: resolved.mid.price,
      confidence: 70,
      color: resolved.mid.color,
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-role-pin merged-desk-rb-signal-pin',
      labelTooltip: `${resolved.mid.title} · 채널 안쪽`,
      lineLabelColor: resolved.mid.color,
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#f8fafc',
      noProject: true,
    });
  }

  const overlays: OverlayItem[] = [badge, ...hiLoZones, ...rolePins];

  /**
   * 구조 세로문은 horizon tip zones에서만 그림.
   * 여기서 다시 그리면 마지막봉과 겹쳐 캔들이 안 보임.
   */

  const gKey = params.ghostKey || 'default';
  if (phase === 'REBUILD' || phase === 'FREEZE') {
    const prev = GHOST.get(gKey);
    if (prev && prev.untilBar > candles.length - 1) overlays.push(ghostOverlay(prev.geom));
    GHOST.set(gKey, { geom: { ...geom }, untilBar: candles.length + 40 });
  } else if (phase === 'LOCK') {
    const ghost = GHOST.get(gKey);
    if (ghost && ghost.untilBar > candles.length - 1 && ghost.geom.tEnd < geom.tStart) {
      overlays.push(ghostOverlay(ghost.geom));
    }
  }

  return {
    overlays,
    priceLines: [
      ...resolved.priceLines,
      {
        price: geom.tipUpper,
        title: `고점레일·${resolved.upper.role}`,
        color: 'rgba(248,113,113,0.85)',
        lineWidth: 1,
        lineStyle: 'dashed',
        axisLabel: true,
      },
      {
        price: geom.tipLower,
        title: `저점레일·${resolved.lower.role}`,
        color: 'rgba(74,222,128,0.85)',
        lineWidth: 1,
        lineStyle: 'dashed',
        axisLabel: true,
      },
    ],
    summaryKo: `구조파동 ${tag} · ${resolved.judgeKo} · 상${resolved.upper.role}/하${resolved.lower.role} · 존라벨`,
    phase,
    judgeKo: resolved.judgeKo,
    bandCaptionKo: resolved.bandCaptionKo,
    rails: {
      upper: resolved.upper,
      lower: resolved.lower,
      mid: resolved.mid,
      extra: resolved.extra,
    },
  };
}
