/**
 * 돌파·안착 이후 **연동 시나리오 체인** — 한 번의 분석 스냅샷으로
 * 「여기 돌파 → 상·하방 어디까지」를 패널·차트·GPT에 동일하게 전달.
 * 투자 권유·확정 수익 표현 없음.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

export type BreakoutFollowPhase = 'idle' | 'approach' | 'broke' | 'confirmed' | 'failed';

export type BreakoutFollowPathNode = {
  price: number;
  labelKo: string;
  distPct: number | null;
  role: 'trigger' | 'tp' | 'extension' | 'floor' | 'invalid';
};

export type BreakoutFollowChain = {
  phase: BreakoutFollowPhase;
  bias: 'LONG' | 'SHORT' | 'WAIT';
  close: number | null;
  triggerPrice: number | null;
  triggerLabelKo: string;
  invalidationPrice: number | null;
  invalidationLabelKo: string;
  /** 상방 연속(돌파·안착 후) */
  upPath: BreakoutFollowPathNode[];
  /** 하방 연속(이탈·실패 시) */
  downPath: BreakoutFollowPathNode[];
  headlineKo: string;
  actionLineKo: string;
  oppositeLineKo: string;
  bullets: string[];
  /** Gemini 보강(클라이언트가 채움) */
  narrativeLlm?: string;
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTargets(analysis: AnalyzeResponse): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (x: number | null) => {
    if (x == null || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };
  for (const t of analysis.targets ?? []) {
    const n = typeof t === 'string' ? parseFloat(t.replace(/,/g, '')) : Number(t);
    if (Number.isFinite(n) && n > 0) push(n);
  }
  for (const line of analysis.nextTargets ?? []) {
    const m = String(line).replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
    if (m) push(parseFloat(m[0]));
  }
  const fr = analysis.frontRunSignal;
  if (fr?.tp1) push(fr.tp1);
  if (fr?.tp2) push(fr.tp2);
  if (fr?.tp3) push(fr.tp3);
  const ls = analysis.lsSignalPlan;
  if (ls?.targets?.length) {
    for (const t of ls.targets) push(num(t));
  }
  if (ls?.maxTarget) push(ls.maxTarget);
  return out;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function distPct(close: number, target: number): number {
  return ((target - close) / close) * 100;
}

function node(
  price: number | null,
  labelKo: string,
  close: number | null,
  role: BreakoutFollowPathNode['role']
): BreakoutFollowPathNode | null {
  if (price == null) return null;
  return {
    price,
    labelKo,
    distPct: close != null && close > 0 ? distPct(close, price) : null,
    role,
  };
}

function sortUp(nodes: BreakoutFollowPathNode[], close: number | null): BreakoutFollowPathNode[] {
  const c = close ?? 0;
  return [...nodes].sort((a, b) => a.price - b.price).filter((n, i, arr) => i === 0 || Math.abs(n.price - arr[i - 1]!.price) > c * 0.0003);
}

function sortDown(nodes: BreakoutFollowPathNode[], close: number | null): BreakoutFollowPathNode[] {
  const c = close ?? 0;
  return [...nodes].sort((a, b) => b.price - a.price).filter((n, i, arr) => i === 0 || Math.abs(n.price - arr[i - 1]!.price) > c * 0.0003);
}

export function buildBreakoutFollowChain(analysis: AnalyzeResponse | null | undefined): BreakoutFollowChain | null {
  if (!analysis) return null;

  const close =
    num(analysis.currentPrice) ??
    (() => {
      const c = analysis.candles;
      if (c?.length) return num(c[c.length - 1]?.close);
      return null;
    })();

  const settle = analysis.settlementZone;
  const br = analysis.breakoutLevel?.price ?? null;
  const inv = analysis.invalidationLevel?.price ?? analysis.aiUnifiedLongShort?.invalidation?.price ?? null;
  const res = analysis.resistanceLevel?.price ?? null;
  const sup = analysis.supportLevel?.price ?? null;
  const breaks = analysis.aiUnifiedLongShort?.breaks;

  let phase: BreakoutFollowPhase = 'idle';
  if (settle?.state === 'confirmed') phase = 'confirmed';
  else if (settle?.state === 'failed') phase = 'failed';
  else if (settle?.state === 'candidate') phase = 'broke';
  else if (br != null && close != null) {
    const brokeUp = close >= br * 0.9995;
    const brokeDn = inv != null && close <= inv * 1.0005;
    if (brokeUp || brokeDn) phase = 'broke';
    else phase = 'approach';
  } else if (br != null) phase = 'approach';

  const cs = analysis.confirmedSignal;
  let bias: BreakoutFollowChain['bias'] = 'WAIT';
  if (settle?.direction === 'LONG' || settle?.direction === 'SHORT') bias = settle.direction;
  else if (cs?.direction === 'LONG' || cs?.direction === 'SHORT') bias = cs.direction;
  else if (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT') bias = analysis.verdict;
  else if (analysis.aiUnifiedLongShort?.primary === 'LONG' || analysis.aiUnifiedLongShort?.primary === 'SHORT') {
    bias = analysis.aiUnifiedLongShort.primary;
  }

  const triggerPrice = settle?.level ?? br ?? res ?? null;
  const triggerLabelKo = settle?.level != null
    ? `안착·트리거 ${fmtPx(settle.level)}`
    : br != null
      ? `돌파선 ${fmtPx(br)}`
      : res != null
        ? `저항 ${fmtPx(res)}`
        : '트리거 미정';

  const invalidationPrice = inv ?? (bias === 'LONG' ? sup : res) ?? null;
  const invalidationLabelKo =
    inv != null ? `무효 ${fmtPx(inv)}` : sup != null ? `지지 ${fmtPx(sup)}` : '무효 미정';

  const tps = parseTargets(analysis);
  const upRaw: Array<BreakoutFollowPathNode | null> = [];
  const downRaw: Array<BreakoutFollowPathNode | null> = [];

  if (br != null) upRaw.push(node(br, '돌파선', close, 'trigger'));
  if (breaks?.forMoreUp?.price) upRaw.push(node(breaks.forMoreUp.price, breaks.forMoreUp.label.slice(0, 28), close, 'extension'));
  if (res != null && res > (close ?? 0)) upRaw.push(node(res, '저항·확장', close, 'extension'));
  for (let i = 0; i < tps.length; i++) {
    const p = tps[i];
    if (close != null && p > close * 1.0002) upRaw.push(node(p, `TP${i + 1}`, close, 'tp'));
  }
  const fp = analysis.futurePaths?.[0];
  if (fp?.direction === 'up' && fp.targets?.length) {
    for (let i = 0; i < Math.min(2, fp.targets.length); i++) {
      upRaw.push(node(fp.targets[i], `빔·상${i + 1}`, close, 'extension'));
    }
  }

  if (inv != null) downRaw.push(node(inv, '무효·이탈', close, 'invalid'));
  if (breaks?.forMoreDown?.price) downRaw.push(node(breaks.forMoreDown.price, breaks.forMoreDown.label.slice(0, 28), close, 'floor'));
  if (sup != null && (close == null || sup < close * 0.9998)) downRaw.push(node(sup, '지지·하방', close, 'floor'));
  const sl = num(analysis.stopLoss);
  if (sl != null) downRaw.push(node(sl, '손절 참고', close, 'floor'));
  for (let i = tps.length - 1; i >= 0; i--) {
    const p = tps[i];
    if (close != null && p < close * 0.9998) downRaw.push(node(p, `하방 TP${tps.length - i}`, close, 'tp'));
  }
  const fpDn = analysis.futurePaths?.find((x) => x.direction === 'down');
  if (fpDn?.targets?.length) {
    downRaw.push(node(fpDn.targets[0], '빔·하방', close, 'floor'));
  }

  const upPath = sortUp(upRaw.filter(Boolean) as BreakoutFollowPathNode[], close).slice(0, 4);
  const downPath = sortDown(downRaw.filter(Boolean) as BreakoutFollowPathNode[], close).slice(0, 4);

  const upTxt =
    upPath.length > 0
      ? upPath.map((n) => `${n.labelKo} ${fmtPx(n.price)}`).join(' → ')
      : '상방 목표 미산출';
  const dnTxt =
    downPath.length > 0
      ? downPath.map((n) => `${n.labelKo} ${fmtPx(n.price)}`).join(' → ')
      : '하방 참고 미산출';

  let headlineKo = '관망 — 돌파·안착 대기';
  let actionLineKo = analysis.mustBreak?.slice(0, 120) ?? '핵심 레벨 돌파·마감 확인 후 시나리오 활성';
  let oppositeLineKo = analysis.mustHold?.slice(0, 120) ?? analysis.invalidation?.slice(0, 120) ?? '—';

  if (phase === 'approach' && br != null) {
    headlineKo = `${fmtPx(br)} 돌파·마감 대기`;
    actionLineKo =
      bias === 'SHORT'
        ? `돌파 시 → ${upTxt} (숏 무효) / 이탈 시 → ${dnTxt}`
        : `돌파·안착 시 → ${upTxt} / 이탈·실패 시 → ${dnTxt}`;
    oppositeLineKo = `이탈 ${invalidationLabelKo} — 하방 시나리오`;
  } else if (phase === 'broke') {
    headlineKo = `${triggerLabelKo} — 돌파·안착 검증 중`;
    actionLineKo =
      bias === 'LONG'
        ? `상방 유지 시 → ${upTxt}`
        : bias === 'SHORT'
          ? `하방 유지 시 → ${dnTxt}`
          : `상방: ${upTxt} · 하방: ${dnTxt}`;
    oppositeLineKo = `무효 ${invalidationLabelKo}`;
  } else if (phase === 'confirmed') {
    headlineKo =
      bias === 'LONG'
        ? `돌파·안착 확정 — 상방 ${upTxt}`
        : bias === 'SHORT'
          ? `안착·하방 확정 — ${dnTxt}`
          : `안착 확정 — 상·하 경로 병기`;
    actionLineKo =
      bias === 'LONG'
        ? `↑ 연속: ${upTxt}`
        : bias === 'SHORT'
          ? `↓ 연속: ${dnTxt}`
          : `↑ ${upTxt} · ↓ ${dnTxt}`;
    oppositeLineKo = `무효 ${invalidationLabelKo} 이탈 시 시나리오 중단`;
  } else if (phase === 'failed') {
    headlineKo = '안착·마감 실패 — 반대 경로 우선';
    actionLineKo = `↓ 참고: ${dnTxt}`;
    oppositeLineKo = `재돌파 ${triggerLabelKo} 전까지 상방 보류`;
  }

  const bullets: string[] = [];
  if (settle && settle.state !== 'none') {
    bullets.push(`안착 ${settle.state} · ${settle.direction} · ${settle.grade} (${Math.round(settle.score)})`);
  }
  if (analysis.bullishScenario) bullets.push(analysis.bullishScenario.slice(0, 100));
  if (analysis.bearishScenario) bullets.push(analysis.bearishScenario.slice(0, 100));
  if (analysis.aiFusionSignal?.markerLabel) bullets.push(`융합 ${analysis.aiFusionSignal.markerLabel}`.slice(0, 80));
  bullets.push('참고용 — 구조·무효·MTF 교차 확인');

  return {
    phase,
    bias,
    close,
    triggerPrice,
    triggerLabelKo,
    invalidationPrice,
    invalidationLabelKo,
    upPath,
    downPath,
    headlineKo,
    actionLineKo,
    oppositeLineKo,
    bullets: bullets.slice(0, 5),
  };
}

/** 차트: 마지막 봉 → 우측 **가로** 목표 레일 (대각 점선 대신 TV식) */
export function buildBreakoutFollowPathOverlays(
  chain: BreakoutFollowChain | null | undefined,
  candles: Candle[],
  timeframe?: string
): OverlayItem[] {
  if (!chain || candles.length < 6 || chain.close == null) return [];
  if (chain.phase === 'idle') return [];

  const last = candles[candles.length - 1];
  const tNow = Number(last.time);
  const barSec = candleBarDurationSec(timeframe ?? '1h', tNow);
  const hopBars = Math.max(4, Math.min(14, Math.round(6 * Math.sqrt(3600 / Math.max(60, barSec)))));
  const px = chain.close;

  const nodes =
    chain.bias === 'SHORT'
      ? chain.downPath
      : chain.bias === 'LONG'
        ? chain.upPath
        : chain.upPath.length > 0
          ? chain.upPath
          : chain.downPath;
  if (!nodes.length) return [];

  const isUp = chain.bias !== 'SHORT';
  const color = isUp ? 'rgba(74,222,128,0.78)' : 'rgba(248,113,113,0.72)';
  const out: OverlayItem[] = [];
  let seg = 0;

  /** 현재가 → 첫 목표: 짧은 수직(1봉) + 가로 레일 */
  for (let i = 0; i < Math.min(3, nodes.length); i++) {
    const node = nodes[i]!;
    const p = node.price;
    const tRailStart = tNow + i * hopBars * barSec;
    const tRailEnd = tRailStart + hopBars * barSec;
    const tVert = tRailStart;

    if (i === 0) {
      out.push({
        id: `breakout-follow-v-${seg++}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        time1: tNow,
        time2: tVert,
        price1: px,
        price2: p,
        confidence: 70,
        color: 'rgba(148,163,184,0.55)',
        lineDash: '4 5',
        lineStrokeWidth: 1,
        category: 'scenario',
        overlayZoneExtraClass: 'overlay-line--breakout-follow-v',
        noProject: true,
      });
    } else {
      const prevP = nodes[i - 1]!.price;
      out.push({
        id: `breakout-follow-v-${seg++}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        time1: tVert,
        time2: tVert,
        price1: prevP,
        price2: p,
        confidence: 70,
        color: 'rgba(148,163,184,0.45)',
        lineDash: '3 4',
        lineStrokeWidth: 1,
        category: 'scenario',
        noProject: true,
      });
    }

    out.push({
      id: `breakout-follow-h-${seg++}`,
      kind: 'trendLine',
      label: `${isUp ? '↑' : '↓'} ${node.labelKo}`,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      time1: tVert,
      time2: tRailEnd,
      price1: p,
      price2: p,
      confidence: 75,
      color,
      lineDash: '10 5',
      lineStrokeWidth: i === 0 ? 2 : 1,
      category: 'scenario',
      labelTooltip: `${fmtPx(p)} · ${node.labelKo} (연동·참고)`,
      overlayZoneExtraClass: `overlay-line--breakout-follow-h overlay-line--breakout-follow-${isUp ? 'up' : 'dn'}`,
      noProject: true,
    });
  }

  return out;
}
