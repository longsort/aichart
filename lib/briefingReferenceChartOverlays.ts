import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  buildBriefingVisionGeometryOverlays,
  pickVisionPatternLinkedToBriefing,
} from '@/lib/briefingVisionLinkOverlays';
import { buildRecallWaveScenarioOverlays } from '@/lib/briefingWavePath';

/**
 * 서버가 tap-entry/3파를 안 내려도(존 stale 등) 브리핑 카드에 숫자만 있으면
 * 진입·손절·TP1 가로선을 클라이언트에서 보강한다.
 */
function buildClientBriefingEslTpOverlays(analysis: AnalyzeResponse, candles: Candle[]): OverlayItem[] {
  const existing = analysis.overlays ?? [];
  if (
    existing.some(
      (o) =>
        o.id === 'tap-entry' ||
        String(o.id || '').startsWith('tap-beam-path-main') ||
        o.id === 'client-briefing-entry'
    )
  ) {
    return [];
  }
  const entry = parseFloat(String(analysis.entry ?? ''));
  if (!Number.isFinite(entry) || entry <= 0) return [];
  const stop = parseFloat(String(analysis.stopLoss ?? ''));
  const tp1 = parseFloat(String((analysis.targets ?? [])[0] ?? ''));

  const { min, max } = minMaxChart(candles);
  const n = candles.length;
  const t0 = Number(candles[0].time);
  const t1 = Number(candles[n - 1].time);

  const row = (
    id: string,
    label: string,
    price: number,
    color: string,
    lineDash?: string
  ): OverlayItem => ({
    id,
    kind: 'keyLevel',
    label,
    x1: 0.04,
    y1: toYRatio(price, min, max),
    x2: 0.98,
    y2: toYRatio(price, min, max),
    time1: t0,
    time2: t1,
    price1: price,
    price2: price,
    confidence: 86,
    color,
    category: 'keyLevel',
    lineStrokeWidth: 3,
    noProject: true,
    labelTooltip: '브리핑 카드의 진입·손절·목표(참고, 투자 권유 아님)',
    ...(lineDash ? { lineDash } : {}),
  });

  const out: OverlayItem[] = [];
  out.push(row('client-briefing-entry', `진입 ${Math.round(entry).toLocaleString()}`, entry, 'rgba(250,204,21,0.98)'));
  if (Number.isFinite(stop) && stop > 0) {
    out.push(row('client-briefing-sl', `손절 ${Math.round(stop).toLocaleString()}`, stop, 'rgba(248,113,113,0.98)'));
  }
  if (Number.isFinite(tp1) && tp1 > 0) {
    out.push(row('client-briefing-tp1', `TP1 ${Math.round(tp1).toLocaleString()}`, tp1, 'rgba(74,222,128,0.98)', '6 4'));
  }
  return out;
}

function minMaxChart(candles: Candle[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}

function toYRatio(price: number, min: number, max: number): number {
  const r = max - min;
  if (r < 1e-12) return 0.5;
  return (price - min) / r;
}

/**
 * 브리핑「유사 참조」「과거 학습 패턴」과 엔진 구조 가격을 연결한 참고용 가로선.
 * 라이브러리 템플릿의 정확한 기하가 아니라, 매칭된 키워드에 맞는 **현재 차트 엔진 레벨**을 강조합니다.
 */
export function buildBriefingReferenceChartOverlays(
  analysis: AnalyzeResponse | null,
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (!analysis || candles.length < 2) return [];

  const recallWaveOverlays = buildRecallWaveScenarioOverlays(analysis, candles, timeframe);
  const clientBriefingEsl = buildClientBriefingEslTpOverlays(analysis, candles);

  const visionPicked = pickVisionPatternLinkedToBriefing(analysis);
  const visionLinked = visionPicked ? buildBriefingVisionGeometryOverlays(visionPicked, candles) : [];

  const eng = (analysis.engine || {}) as Record<string, unknown>;
  const topRefs = analysis.topReferences || [];
  const learned = analysis.learnedPatternsTop5 || [];

  const topRef = topRefs[0];
  const topLearned = learned[0];
  const refOk = topRef && typeof topRef.score === 'number' && topRef.score >= 0.22;
  const learnedOk = topLearned && typeof topLearned.score === 'number' && topLearned.score >= 0.18;

  if (!refOk && !learnedOk && visionLinked.length === 0 && recallWaveOverlays.length === 0 && clientBriefingEsl.length === 0) {
    return [];
  }

  const refTitle = refOk ? String(topRef!.title || '').toLowerCase() : '';
  const learnedTitle = learnedOk ? String(topLearned!.title || '').toLowerCase() : '';

  const { min, max } = minMaxChart(candles);
  const n = candles.length;
  const t0 = Number(candles[0].time);
  const t1 = Number(candles[n - 1].time);

  const eqhArr = (eng.eqh || []) as Array<{ price: number }>;
  const eqlArr = (eng.eql || []) as Array<{ price: number }>;
  const bosArr = (eng.bos || []) as Array<{ price: number }>;
  const chochArr = (eng.choch || []) as Array<{ price: number }>;
  const sweepsArr = (eng.sweeps || []) as Array<{ price: number }>;

  const pushLine = (
    id: string,
    label: string,
    price: number,
    color: string,
    tooltip: string
  ): OverlayItem => ({
    id,
    kind: 'keyLevel',
    label,
    x1: 0.02,
    y1: toYRatio(price, min, max),
    x2: 0.98,
    y2: toYRatio(price, min, max),
    time1: t0,
    time2: t1,
    price1: price,
    price2: price,
    confidence: 88,
    color,
    category: 'keyLevel',
    lineDash: '7 5',
    lineStrokeWidth: 2.25,
    labelTooltip: tooltip,
  });

  const out: OverlayItem[] = [];
  const seen = new Set<string>();

  const addPrice = (id: string, label: string, price: number, color: string, tip: string) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const key = `${Math.round(price * 1e6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(pushLine(id, label, price, color, tip));
  };

  /** 유사 참조 키워드 → 엔진 레벨 */
  if (refOk) {
    const tipBase = `브리핑 유사 참조「${topRef!.title}」과 연동(참고)`;
    if (refTitle.includes('eqh') || refTitle.includes('eql') || refTitle.includes('eqh/eql')) {
      const lastE = eqhArr.length ? eqhArr[eqhArr.length - 1] : null;
      const lastL = eqlArr.length ? eqlArr[eqlArr.length - 1] : null;
      if (lastE) addPrice('briefing-ref-ref-eqh', '참조·EQH', lastE.price, 'rgba(251,191,36,0.95)', tipBase);
      if (lastL) addPrice('briefing-ref-ref-eql', '참조·EQL', lastL.price, 'rgba(56,189,248,0.95)', tipBase);
    }
    if (refTitle.includes('bos')) {
      const lastB = bosArr.length ? bosArr[bosArr.length - 1] : null;
      if (lastB) addPrice('briefing-ref-ref-bos', '참조·BOS', lastB.price, 'rgba(167,139,250,0.95)', tipBase);
    }
    if (refTitle.includes('choch')) {
      const lastC = chochArr.length ? chochArr[chochArr.length - 1] : null;
      if (lastC) addPrice('briefing-ref-ref-choch', '참조·CHOCH', lastC.price, 'rgba(244,114,182,0.95)', tipBase);
    }
    if (refTitle.includes('liquidity') || refTitle.includes('sweep')) {
      const lastS = sweepsArr.length ? sweepsArr[sweepsArr.length - 1] : null;
      if (lastS) addPrice('briefing-ref-ref-sweep', '참조·유동성 스윕', lastS.price, 'rgba(248,113,113,0.95)', tipBase);
    }
    if (refTitle.includes('flag') || refTitle.includes('bull flag')) {
      const sup = analysis.nearestSupportOb;
      const res = analysis.nearestResistanceOb;
      if (sup) addPrice('briefing-ref-ref-ob-sup', '참조·지지 OB', (sup.low + sup.high) / 2, 'rgba(34,197,94,0.9)', tipBase);
      if (res) addPrice('briefing-ref-ref-ob-res', '참조·저항 OB', (res.low + res.high) / 2, 'rgba(239,68,68,0.9)', tipBase);
    }
  }

  /** 학습 패턴(웨지 등) → 최근 봉 고저 근사 구간 — Vision 브리핑 연동 기하가 있으면 생략 */
  if (learnedOk && visionLinked.length === 0 && (learnedTitle.includes('wedge') || learnedTitle.includes('웨지'))) {
    const look = Math.min(56, n);
    const slice = candles.slice(-look);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const tip = `브리핑 학습「${String(topLearned?.title || '')}」근사 구간(최근 ${look}봉 고저, 참고)`;
    addPrice('briefing-ref-learned-wedge-hi', '학습·웨지(상단 근사)', hi, 'rgba(98,239,224,0.92)', tip);
    addPrice('briefing-ref-learned-wedge-lo', '학습·웨지(하단 근사)', lo, 'rgba(98,239,224,0.92)', tip);
  } else if (learnedOk && out.length === 0) {
    /** 참조 키워드와 안 맞을 때 학습 1위만 보조선 */
    const br = analysis.breakoutLevel?.price;
    const sup = analysis.supportLevel?.price;
    const res = analysis.resistanceLevel?.price;
    const tip = `브리핑 학습「${String(topLearned?.title || '')}」·시나리오 레벨(참고)`;
    if (typeof sup === 'number' && Number.isFinite(sup)) addPrice('briefing-ref-learned-sup', '학습·지지 시나리오', sup, 'rgba(52,211,153,0.88)', tip);
    if (typeof res === 'number' && Number.isFinite(res)) addPrice('briefing-ref-learned-res', '학습·저항 시나리오', res, 'rgba(251,146,60,0.88)', tip);
    if (typeof br === 'number' && Number.isFinite(br)) addPrice('briefing-ref-learned-brk', '학습·돌파 레벨', br, 'rgba(96,165,250,0.88)', tip);
  }

  return [...visionLinked, ...out, ...recallWaveOverlays, ...clientBriefingEsl].slice(0, 44);
}
