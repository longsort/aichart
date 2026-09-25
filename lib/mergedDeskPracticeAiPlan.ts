/**
 * 실전 AI 플랜 — 안착×합류존×ActiveTrade×통계×AVWAP×카드 → 단일 상태.
 * 차트: 상태 + E/SL/TP/무효 전폭선 + 합류존(최대 1지지·1저항).
 * 확정 승률·수익 보장 문구 없음.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import {
  buildMergedDeskActiveTradePriceLines,
} from '@/lib/mergedDeskActiveTradePlan';
import type { EvidenceConfluencePack, EvidenceConfluenceZone } from '@/lib/mergedDeskEvidenceConfluenceZones';
import type { AvwapStatsConfluenceHub } from '@/lib/vwap/avwapStatsConfluenceHub';
import type { CandleCardConfluencePack } from '@/lib/mergedDeskCandleCardConfluence';
import type { SuperStatsHubPack } from '@/lib/mergedDeskSuperStatsHub';
import { formatZoneFacePrice } from '@/lib/mergedDeskDumpLifeCycle';
import { loadSettings } from '@/lib/settings';

export type PracticeAiPlanState =
  | 'WAIT'
  | 'LONG_WATCH'
  | 'SHORT_WATCH'
  | 'CONFIRMED_LONG'
  | 'CONFIRMED_SHORT'
  | 'LONG_MISSED'
  | 'SHORT_MISSED';

export type PracticeAiSettleHint =
  | '안착확정'
  | '안착대기'
  | '돌파실패'
  | '헌팅열림'
  | '관찰'
  | '없음';

export type PracticeAiPlanPack = {
  state: PracticeAiPlanState;
  stateKo: string;
  settleKo: PracticeAiSettleHint;
  entryAllowed: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  rr: number;
  reasonsKo: string[];
  blockersKo: string[];
  summaryKo: string;
  titleKo: string;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  disclaimerKo: string;
};

const STATE_KO: Record<PracticeAiPlanState, string> = {
  WAIT: '대기',
  LONG_WATCH: '롱감시',
  SHORT_WATCH: '숏감시',
  CONFIRMED_LONG: '확정롱',
  CONFIRMED_SHORT: '확정숏',
  LONG_MISSED: '롱놓침',
  SHORT_MISSED: '숏놓침',
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 15); i < n - 1; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
}

function pickZones(
  pack: EvidenceConfluencePack | null | undefined,
  price: number
): { support: EvidenceConfluenceZone | null; resist: EvidenceConfluenceZone | null } {
  const zones = pack?.zones ?? [];
  const support =
    zones
      .filter((z) => z.role === 'support' && z.mid <= price * 1.005)
      .sort((a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price))[0] ??
    null;
  const resist =
    zones
      .filter((z) => z.role === 'resistance' && z.mid >= price * 0.995)
      .sort((a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price))[0] ??
    null;
  return { support, resist };
}

function inferSettle(
  active: MergedDeskActiveTradePlan | null | undefined,
  hub: AvwapStatsConfluenceHub | null | undefined
): PracticeAiSettleHint {
  const fromHub = hub?.targets?.settleKo || '';
  if (/안착확정/.test(fromHub)) return '안착확정';
  if (/안착대기|돌파/.test(fromHub)) return '안착대기';
  if (/헌팅/.test(fromHub)) return '헌팅열림';
  if (/실패/.test(fromHub)) return '돌파실패';
  const sk = String(active?.statusKo || '');
  if (/안착/.test(sk) && /확정|가능|ENTER/i.test(sk)) return '안착확정';
  if (/대기|WATCH|TOUCH/i.test(sk)) return '안착대기';
  if (/실패|INVALID/i.test(sk)) return '돌파실패';
  if (active?.status === 'ENTER' && active.entryAllowed) return '안착확정';
  if (active?.status === 'TOUCH') return '안착대기';
  if (active?.status === 'INVALID') return '돌파실패';
  return hub ? '관찰' : '없음';
}

function lateMissed(
  dir: 'LONG' | 'SHORT',
  entry: number,
  price: number,
  atr: number
): boolean {
  if (!(entry > 0) || !(atr > 0)) return false;
  const dist = Math.abs(price - entry);
  if (dist < atr * 0.85) return false;
  if (dir === 'LONG') return price > entry + atr * 0.85;
  return price < entry - atr * 0.85;
}

function zoneAlign(
  dir: 'LONG' | 'SHORT',
  price: number,
  support: EvidenceConfluenceZone | null,
  resist: EvidenceConfluenceZone | null,
  atr: number
): { ok: boolean; noteKo: string } {
  const pad = atr * 0.55;
  if (dir === 'LONG') {
    if (!support) return { ok: false, noteKo: '지지합류존 없음' };
    const near =
      price <= support.top + pad && price >= support.bot - pad * 0.5;
    return near
      ? { ok: true, noteKo: `지지합류×${support.evidenceCount}` }
      : { ok: false, noteKo: '가격이 지지합류존에서 멀음' };
  }
  if (!resist) return { ok: false, noteKo: '저항합류존 없음' };
  const near = price >= resist.bot - pad && price <= resist.top + pad * 0.5;
  return near
    ? { ok: true, noteKo: `저항합류×${resist.evidenceCount}` }
    : { ok: false, noteKo: '가격이 저항합류존에서 멀음' };
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 이미지 실전AI지지 ×N — 면 우측 확률 서브라인 (조건부·확정 아님) */
function buildPracticeAiZoneSignalKo(params: {
  evidenceCount: number;
  isSup: boolean;
  hub: AvwapStatsConfluenceHub | null;
  superStatsHub: SuperStatsHubPack | null;
  card: CandleCardConfluencePack | null;
}): string {
  const lines: string[] = [`×${params.evidenceCount}`];
  const stats = params.superStatsHub?.stats ?? null;
  const buyPct =
    stats?.longPct ??
    (() => {
      const ls = params.hub?.longScore ?? 0;
      const ss = params.hub?.shortScore ?? 0;
      const t = ls + ss;
      return t > 0 ? clampPct((ls / t) * 100) : null;
    })();
  const centerPct =
    params.card?.levels?.agreeScore ??
    (params.hub?.confidence != null && params.hub.confidence > 0 ? params.hub.confidence : null);
  const zonePct =
    params.isSup && params.card?.levels?.direction === 'LONG'
      ? params.card.levels.agreeScore
      : !params.isSup && params.card?.levels?.direction === 'SHORT'
        ? params.card.levels.agreeScore
        : params.isSup
          ? stats?.longPct ?? null
          : stats?.shortPct ?? null;

  if (params.isSup && buyPct != null) lines.push(`매수확률 ${clampPct(buyPct)}%`);
  else if (!params.isSup && stats?.shortPct != null) {
    lines.push(`매도확률 ${clampPct(stats.shortPct)}%`);
  } else if (!params.isSup && buyPct != null) {
    lines.push(`매도확률 ${clampPct(100 - buyPct)}%`);
  }
  if (centerPct != null && centerPct > 0 && !lines.some((l) => l.includes(String(clampPct(centerPct))))) {
    lines.push(`중심 추정 ${clampPct(centerPct)}%`);
  }
  if (
    zonePct != null &&
    zonePct > 0 &&
    !lines.some((l) => l.endsWith(`${clampPct(zonePct)}%`))
  ) {
    lines.push(`${params.isSup ? '롱구간' : '숏구간'} 추정 ${clampPct(zonePct)}%`);
  }
  return lines.join('\n');
}

function retitleLines(
  lines: AtlasPulsePriceLine[],
  stateKo: string
): AtlasPulsePriceLine[] {
  return lines.map((pl) => {
    const t = String(pl.title || '');
    let title = t;
    if (/^진입/.test(t)) title = `실전AI·진입·${stateKo}`;
    else if (/^손절/.test(t)) title = `실전AI·손절`;
    else if (/^목표2/.test(t)) title = t.replace(/^목표2/, '실전AI·TP2');
    else if (/^목표3/.test(t)) title = t.replace(/^목표3/, '실전AI·TP3');
    else if (/^목표/.test(t)) title = t.replace(/^목표/, '실전AI·TP1');
    else if (/^무효/.test(t)) title = `실전AI·무효`;
    return { ...pl, title, axisLabel: true };
  });
}

/**
 * 실전 AI 플랜 팩.
 */
export function buildMergedDeskPracticeAiPlan(params: {
  candles: Candle[];
  activeTrade?: MergedDeskActiveTradePlan | null;
  evidence?: EvidenceConfluencePack | null;
  avwapHub?: AvwapStatsConfluenceHub | null;
  candleCard?: CandleCardConfluencePack | null;
  superStatsHub?: SuperStatsHubPack | null;
}): PracticeAiPlanPack {
  const disclaimerKo =
    '실전 AI 플랜은 조건부 합류입니다. 확정 승률·수익 보장 아님 · 손절 필수.';
  const empty: PracticeAiPlanPack = {
    state: 'WAIT',
    stateKo: STATE_KO.WAIT,
    settleKo: '없음',
    entryAllowed: false,
    direction: 'NEUTRAL',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    invalidationPrice: 0,
    rr: 0,
    reasonsKo: [],
    blockersKo: ['데이터 부족'],
    summaryKo: '실전AI · 대기',
    titleKo: '실전AI · 대기',
    overlays: [],
    priceLines: [],
    disclaimerKo,
  };

  const candles = params.candles ?? [];
  if (candles.length < 24) return empty;

  const price = Number(candles[Math.max(0, candles.length - 2)]!.close);
  if (!(price > 0)) return empty;
  const atr = atrApprox(candles);
  const active = params.activeTrade ?? null;
  const hub = params.avwapHub ?? null;
  const card = params.candleCard ?? null;
  const superStatsHub = params.superStatsHub ?? null;
  const { support, resist } = pickZones(params.evidence, price);
  const settleKo = inferSettle(active, hub);

  const reasonsKo: string[] = [];
  const blockersKo: string[] = [];

  /** 방향 후보 */
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (active && active.direction !== 'NEUTRAL') {
    bias = active.direction;
    reasonsKo.push(`ActiveTrade ${active.direction === 'LONG' ? '롱' : '숏'}·${active.statusKo}`);
  } else if (hub?.bias === 'long') {
    bias = 'LONG';
    reasonsKo.push(`AVWAP·AI 롱 (${hub.confidence})`);
  } else if (hub?.bias === 'short') {
    bias = 'SHORT';
    reasonsKo.push(`AVWAP·AI 숏 (${hub.confidence})`);
  } else if (card?.levels?.direction === 'LONG' || card?.levels?.direction === 'SHORT') {
    bias = card.levels.direction;
    reasonsKo.push(`캔들카드 ${bias === 'LONG' ? '롱' : '숏'}`);
  }

  if (settleKo === '안착확정') reasonsKo.push('안착확정');
  else if (settleKo === '안착대기') blockersKo.push('안착대기 · 진입 금지');
  else if (settleKo === '돌파실패') blockersKo.push('돌파실패 · 대기');
  else if (settleKo === '헌팅열림') blockersKo.push('헌팅열림 · 회수 전 대기');

  if (bias === 'NEUTRAL') {
    blockersKo.push('방향 합의 없음');
  }

  const align =
    bias === 'LONG' || bias === 'SHORT'
      ? zoneAlign(bias, price, support, resist, atr)
      : { ok: false, noteKo: '합류존 미선정' };
  if (align.ok) reasonsKo.push(align.noteKo);
  else if (bias !== 'NEUTRAL') blockersKo.push(align.noteKo);

  const rr = active?.rr ?? 0;
  if (active && active.direction !== 'NEUTRAL' && rr > 0 && rr < 1.05) {
    blockersKo.push(`RR ${rr.toFixed(2)} 부족`);
  }

  if (hub && hub.confidence > 0 && hub.confidence < 40 && hub.bias !== 'wait') {
    blockersKo.push(`합류신뢰 ${hub.confidence} 낮음`);
  }

  const hasPlanLevels =
    !!active &&
    active.direction !== 'NEUTRAL' &&
    active.entry > 0 &&
    active.stopLoss > 0 &&
    active.tp1 > 0;

  let state: PracticeAiPlanState = 'WAIT';
  let entryAllowed = false;

  const hardBlock =
    settleKo === '안착대기' ||
    settleKo === '돌파실패' ||
    settleKo === '헌팅열림' ||
    !align.ok ||
    bias === 'NEUTRAL' ||
    (rr > 0 && rr < 1.05);

  if (bias === 'LONG' || bias === 'SHORT') {
    if (hasPlanLevels && lateMissed(bias, active!.entry, price, atr)) {
      state = bias === 'LONG' ? 'LONG_MISSED' : 'SHORT_MISSED';
      blockersKo.push('늦은진입 · 추격 금지');
    } else if (
      !hardBlock &&
      settleKo === '안착확정' &&
      hasPlanLevels &&
      (active!.status === 'ENTER' || active!.entryAllowed || hub?.entryAllowed)
    ) {
      state = bias === 'LONG' ? 'CONFIRMED_LONG' : 'CONFIRMED_SHORT';
      entryAllowed = true;
      reasonsKo.push('안착확정×합류존×플랜');
    } else if (!hardBlock && align.ok) {
      state = bias === 'LONG' ? 'LONG_WATCH' : 'SHORT_WATCH';
      reasonsKo.push('합류 정렬 · 안착/진입 확인 중');
    } else {
      state = 'WAIT';
    }
  }

  /** 충돌 시 WAIT */
  if (hub && hub.bias !== 'wait' && bias !== 'NEUTRAL') {
    if ((hub.bias === 'long' && bias === 'SHORT') || (hub.bias === 'short' && bias === 'LONG')) {
      state = 'WAIT';
      entryAllowed = false;
      blockersKo.push('AVWAP·AI ↔ ActiveTrade 방향 충돌');
    }
  }

  const stateKo = STATE_KO[state];
  const titleKo = `실전AI · ${stateKo}`;
  const summaryKo = [
    titleKo,
    settleKo !== '없음' ? settleKo : null,
    hasPlanLevels ? `E${Math.round(active!.entry)}` : null,
    blockersKo[0] || reasonsKo[0] || null,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 64);

  /** 합류존 — 방향에 맞는 1개(+반대 1개는 WAIT만) · 얇은 밴드로 재작도 */
  const zoneOverlays: OverlayItem[] = [];
  const zoneLines: AtlasPulsePriceLine[] = [];
  const keepZones = [support, resist].filter(Boolean) as EvidenceConfluenceZone[];
  const priceOnly = loadSettings().chartMergedDeskZonePriceOnlyLabels === true;
  for (const z of keepZones) {
    const prefer =
      (state.includes('LONG') && z.role === 'support') ||
      (state.includes('SHORT') && z.role === 'resistance') ||
      state === 'WAIT';
    if (!prefer && keepZones.length > 1) {
      if (state !== 'WAIT') continue;
    }
    const isSup = z.role === 'support';
    const nameKo = isSup ? '실전AI지지' : '실전AI저항';
    const zoneSignalKo = buildPracticeAiZoneSignalKo({
      evidenceCount: z.evidenceCount,
      isSup,
      hub,
      superStatsHub,
      card,
    });
    const facePack = formatZoneFacePrice({
      nameKo,
      mid: z.mid,
      priceOnly,
      signalKo: `×${z.evidenceCount}`,
    });
    const half = Math.min(Math.max(atr * 0.16, Math.abs(z.mid) * 0.00045), atr * 0.28);
    const top = z.mid + half;
    const bot = z.mid - half;
    const tip = `${facePack.tip} · ${stateKo} · ${(z.labelsKo || []).join('·')} (조건부 · 확정 아님)`;
    zoneOverlays.push({
      id: `merged-desk-practice-ai-${z.role}`,
      kind: 'zone',
      label: tip,
      zoneFaceBase: facePack.face,
      zoneFaceSignal: zoneSignalKo,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: Number(candles[Math.max(0, candles.length - 48)]?.time) || 0,
      time2: Number(candles[candles.length - 1]?.time) || 0,
      price1: top,
      price2: bot,
      confidence: Math.min(90, 58 + z.evidenceCount * 7),
      color: isSup ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)',
      category: 'chartPrimeTrendChannels',
      zoneFillPreserve: true,
      structureBias: isSup ? 'bullish' : 'bearish',
      overlayZoneExtraClass:
        'merged-desk-practice-ai-zone merged-desk-zone-label-on merged-desk-core-sr-zone merged-desk-hotzone-entry',
      labelTooltip: tip,
      labelBackgroundColor: isSup ? 'rgba(20,83,45,0.94)' : 'rgba(127,29,29,0.94)',
      labelTextColor: isSup ? '#bbf7d0' : '#fecaca',
      noProject: true,
    });
    zoneLines.push({
      price: z.mid,
      color: isSup ? '#4ade80' : '#f87171',
      title: `${nameKo} ${Math.round(z.mid)}`.slice(0, 18),
      lineWidth: prefer ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  let priceLines: AtlasPulsePriceLine[] = [...zoneLines];
  if (hasPlanLevels && active) {
    const tradeLines = buildMergedDeskActiveTradePriceLines({
      ...active,
      status:
        entryAllowed
          ? 'ENTER'
          : state.includes('WATCH')
            ? 'TOUCH'
            : state.includes('MISSED') || state === 'WAIT'
              ? 'WAIT'
              : active.status,
      entryAllowed,
      statusKo: stateKo,
    });
    priceLines = [...retitleLines(tradeLines, stateKo), ...zoneLines];
  }

  /** 상태 기준가 — 플랜 없을 때만 (합류 중선·현재가) */
  if (!hasPlanLevels) {
    const anchor =
      bias === 'LONG' && support
        ? support.mid
        : bias === 'SHORT' && resist
          ? resist.mid
          : price;
    priceLines.unshift({
      price: anchor,
      color:
        state === 'CONFIRMED_LONG'
          ? '#2DD4BF'
          : state === 'CONFIRMED_SHORT'
            ? '#F87171'
            : state.includes('WATCH')
              ? '#FBBF24'
              : 'rgba(148,163,184,0.75)',
      title: titleKo,
      lineWidth: entryAllowed ? 2 : 1,
      lineStyle: entryAllowed ? 'solid' : 'dotted',
      axisLabel: true,
    });
  }

  return {
    state,
    stateKo,
    settleKo,
    entryAllowed,
    direction: bias,
    entry: hasPlanLevels && active ? active.entry : 0,
    stopLoss: hasPlanLevels && active ? active.stopLoss : 0,
    tp1: hasPlanLevels && active ? active.tp1 : 0,
    tp2: hasPlanLevels && active ? active.tp2 : 0,
    tp3: hasPlanLevels && active ? active.tp3 : 0,
    invalidationPrice: hasPlanLevels && active ? active.invalidationPrice || active.stopLoss : 0,
    rr,
    reasonsKo: reasonsKo.slice(0, 8),
    blockersKo: blockersKo.slice(0, 8),
    summaryKo,
    titleKo,
    overlays: zoneOverlays,
    priceLines,
    disclaimerKo,
  };
}
