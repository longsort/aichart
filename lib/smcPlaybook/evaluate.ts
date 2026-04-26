/**
 * SMC 엔트리 플레이북 — 엔진(bos·choch·sweep·eqh/eql·fvg·ob) + 캔들로 단계·존 근사. 휴리스틱·참고용.
 * 단계 라벨·순서는 `playbook.steps.json` + `mergeStepsWithCompletion`.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import {
  atrApprox,
  impulseRangeLong,
  impulseRangeShort,
  mitigationInZone,
  narrowLtfPoi,
  oteZoneLong,
  oteZoneShort,
  pickIfvgLong,
  pickIfvgShort,
  pickInducementEqlBetween,
  pickInducementEqhBetween,
  pickLongZone,
  pickLqLong,
  pickLqShort,
  pickShortZone,
  htfPoiBandLong,
  htfPoiBandShort,
  zoneMid,
  approxStopShort,
  approxStopLong,
  tieredTargetsLong,
  tieredTargetsShort,
} from '@/lib/smcPlaybook/helpers';
import { idleStepsPlaceholder, mergeStepsWithCompletion } from '@/lib/smcPlaybook/steps';
import type { EngineSlice, SmcEntryPlaybook, SmcPlaybookStepId } from '@/lib/smcPlaybook/types';

const emptyPlaybook = (phaseLabel: string, detail: string, steps = idleStepsPlaceholder()): SmcEntryPlaybook => ({
  active: false,
  direction: null,
  phaseLabel,
  detail,
  steps,
  zone: null,
  oteZone: null,
  inducement: null,
  sweep: null,
  htfPoi: null,
  ltfPoi: null,
  ifvgZone: null,
  liquidityPoolTarget: null,
  mitigationTouched: false,
  entryRefPrice: null,
  stopPrice: null,
  targetPrices: null,
  targetSourceNote: '',
  targetPrice: null,
});

export function computeSmcEntryPlaybook(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[] | null | undefined
): SmcEntryPlaybook {
  const cdl = candles ?? [];
  const atr = atrApprox(cdl, 14);
  const last = cdl.length ? cdl[cdl.length - 1] : null;

  const idleSteps = idleStepsPlaceholder();

  if (!analysis?.engine) {
    return emptyPlaybook('SMC 플레이북', '분석 엔진 데이터가 없습니다.', idleSteps);
  }
  const eng = analysis.engine as EngineSlice;
  const bos = eng.bos ?? [];
  const choch = eng.choch ?? [];
  const sweeps = eng.sweeps ?? [];
  const lastClose = analysis.currentPrice ?? 0;
  if (!Number.isFinite(lastClose) || lastClose <= 0) {
    return emptyPlaybook('SMC 플레이북', '현재가 없음.', idleSteps);
  }

  const chBear = [...choch].filter((c) => c.bias === 'bearish').sort((a, b) => b.index - a.index)[0];
  if (chBear) {
    const swBuy = [...sweeps].filter((s) => s.side === 'buy' && s.index < chBear.index).sort((a, b) => b.index - a.index)[0];
    const bosBear = swBuy
      ? [...bos].filter((b) => b.bias === 'bearish' && b.index < swBuy.index).sort((a, b) => b.index - a.index)[0]
      : undefined;
    const seqOk = !!(bosBear && swBuy && chBear.index > swBuy.index && swBuy.index > bosBear.index);
    const zone = seqOk ? pickShortZone(analysis, eng, chBear) : null;
    const imp = seqOk && cdl.length ? impulseRangeShort(cdl, bosBear!.index, swBuy!.index, chBear.index) : null;
    const oteZone = imp ? oteZoneShort(imp) : null;
    const inducement = bosBear && swBuy ? pickInducementEqhBetween(eng.eqh, bosBear.index, swBuy.index) : null;
    const ifvgZone = seqOk && swBuy ? pickIfvgShort(eng.fvg, swBuy.index, chBear.index) : null;
    const htfPoi = htfPoiBandShort(analysis, atr);
    const ltfPoi = narrowLtfPoi(zone);
    const sweep = swBuy ? { index: swBuy.index, price: swBuy.price, side: 'buy' as const } : null;
    const liquidityPoolTarget = seqOk ? pickLqShort(eng.eql, chBear.index) : null;
    const tierShort = tieredTargetsShort(analysis, lastClose);
    const tgt = tierShort.levels[0] ?? null;
    const mitigationTouched = !!(last && zone && mitigationInZone(last, zone));
    const entryRef = zoneMid(zone);
    const stopPx = seqOk && zone ? approxStopShort(zone, sweep, atr) : null;

    const completionShort: Partial<Record<SmcPlaybookStepId, boolean>> = {
      htf_poi: !!htfPoi,
      bos: !!bosBear,
      idm: !!inducement,
      lqs: !!swBuy,
      mss_choch: !!chBear,
      ob_fvg: !!zone,
      ote: !!oteZone,
      ifvg: !!ifvgZone,
      ltf_poi: !!ltfPoi,
      lq_pool: liquidityPoolTarget != null,
      mitigation: mitigationTouched,
      target: tierShort.levels.some((p) => p != null),
    };
    const steps = mergeStepsWithCompletion('short', completionShort);

    if (seqOk) {
      const doneN = steps.filter((s) => s.done).length;
      return {
        active: true,
        direction: 'SHORT',
        phaseLabel: `SMC 숏 시나리오 (${doneN}/${steps.length})`,
        detail:
          '이미지 순서: HTF POI → BOS → IDM → LQS → MSS/CHoCH → IFVG → OB/FVG → OTE → LTF POI → 완화 → EQL 타깃 → 목표(TP1~3는 분석 targets·지지 정렬)',
        steps,
        zone,
        oteZone,
        inducement,
        sweep,
        htfPoi,
        ltfPoi,
        ifvgZone,
        liquidityPoolTarget,
        mitigationTouched,
        entryRefPrice: entryRef,
        stopPrice: stopPx,
        targetPrices: tierShort.levels,
        targetSourceNote: tierShort.sourceNote,
        targetPrice: tgt,
      };
    }
  }

  const chBull = [...choch].filter((c) => c.bias === 'bullish').sort((a, b) => b.index - a.index)[0];
  if (chBull) {
    const swSell = [...sweeps].filter((s) => s.side === 'sell' && s.index < chBull.index).sort((a, b) => b.index - a.index)[0];
    const bosBull = swSell
      ? [...bos].filter((b) => b.bias === 'bullish' && b.index < swSell.index).sort((a, b) => b.index - a.index)[0]
      : undefined;
    const seqOk = !!(bosBull && swSell && chBull.index > swSell.index && swSell.index > bosBull.index);
    const zone = seqOk ? pickLongZone(analysis, eng, chBull) : null;
    const imp = seqOk && cdl.length ? impulseRangeLong(cdl, bosBull!.index, swSell!.index, chBull.index) : null;
    const oteZone = imp ? oteZoneLong(imp) : null;
    const inducement = bosBull && swSell ? pickInducementEqlBetween(eng.eql, bosBull.index, swSell.index) : null;
    const ifvgZone = seqOk && swSell ? pickIfvgLong(eng.fvg, swSell.index, chBull.index) : null;
    const htfPoi = htfPoiBandLong(analysis, atr);
    const ltfPoi = narrowLtfPoi(zone);
    const sweep = swSell ? { index: swSell.index, price: swSell.price, side: 'sell' as const } : null;
    const liquidityPoolTarget = seqOk ? pickLqLong(eng.eqh, chBull.index) : null;
    const tierLong = tieredTargetsLong(analysis, lastClose);
    const tgt = tierLong.levels[0] ?? null;
    const mitigationTouched = !!(last && zone && mitigationInZone(last, zone));
    const entryRef = zoneMid(zone);
    const stopPx = seqOk && zone ? approxStopLong(zone, sweep, atr) : null;

    const completionLong: Partial<Record<SmcPlaybookStepId, boolean>> = {
      htf_poi: !!htfPoi,
      bos: !!bosBull,
      idm: !!inducement,
      lqs: !!swSell,
      mss_choch: !!chBull,
      ob_fvg: !!zone,
      ote: !!oteZone,
      ifvg: !!ifvgZone,
      ltf_poi: !!ltfPoi,
      lq_pool: liquidityPoolTarget != null,
      mitigation: mitigationTouched,
      target: tierLong.levels.some((p) => p != null),
    };
    const steps = mergeStepsWithCompletion('long', completionLong);

    if (seqOk) {
      const doneN = steps.filter((s) => s.done).length;
      return {
        active: true,
        direction: 'LONG',
        phaseLabel: `SMC 롱 시나리오 (${doneN}/${steps.length})`,
        detail:
          '이미지 순서: HTF POI → BOS → IDM → LQS → MSS/CHoCH → IFVG → OB/FVG → OTE → LTF POI → 완화 → EQH 타깃 → 목표(TP1~3는 분석 targets·저항 정렬)',
        steps,
        zone,
        oteZone,
        inducement,
        sweep,
        htfPoi,
        ltfPoi,
        ifvgZone,
        liquidityPoolTarget,
        mitigationTouched,
        entryRefPrice: entryRef,
        stopPrice: stopPx,
        targetPrices: tierLong.levels,
        targetSourceNote: tierLong.sourceNote,
        targetPrice: tgt,
      };
    }
  }

  return emptyPlaybook(
    'SMC 플레이북: 대기',
    'BOS→스윕→CHoCH 순서가 맞으면 이미지 순서대로 단계·존을 채웁니다.',
    idleSteps
  );
}
