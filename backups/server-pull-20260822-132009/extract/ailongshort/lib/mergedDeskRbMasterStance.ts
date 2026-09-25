/**
 * 파랑빨강띠 마스터 방향 — 묶어 둔 기능을 한 표결로 합친다.
 * 게이트가 봉마다 롱↔숏을 바꾸지 않게 히스테리시스.
 * 확정 매매·승률 아님. 관점 표시.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import type { MergedDeskActionablePatternBrief } from '@/lib/mergedDeskActionablePattern';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import {
  computeInstitutionalSuperTrendMeta,
  getLastInstitutionalBandEdges,
} from '@/lib/institutionalSuperBand';
import {
  evaluateMergedDeskRbPocRelation,
  mergedDeskRbStyleWeights,
  type MergedDeskRbTradeStyle,
} from '@/lib/mergedDeskRbAiStyleBrain';

export type RbMasterSide = 'LONG' | 'SHORT' | 'WAIT';

export type MergedDeskRbMasterStance = {
  side: RbMasterSide;
  actionKo: '매수관점' | '매도관점' | '관망';
  phaseKo: string;
  captionKo: string;
  conviction: 'strong' | 'ok' | 'weak' | 'none';
  scoreLong: number;
  scoreShort: number;
  margin: number;
  sticky: boolean;
  flipOk: boolean;
  reasonsKo: string[];
  summaryKo: string;
};

type Mem = {
  side: 'LONG' | 'SHORT';
  barTime: number;
  scoreLong: number;
  scoreShort: number;
};

const MEM = new Map<string, Mem>();

const FLIP_MARGIN = 24;
const DECLARE_MARGIN = 16;

function vote(
  long: { n: number; why: string[] },
  short: { n: number; why: string[] },
  side: RbMasterSide | null,
  pts: number,
  ko: string
) {
  if (!side || side === 'WAIT' || !(pts > 0)) return;
  if (side === 'LONG') {
    long.n += pts;
    long.why.push(`+${pts} ${ko}`);
  } else {
    short.n += pts;
    short.why.push(`+${pts} ${ko}`);
  }
}

function geomSide(g: MergedDeskChannelGeom | null | undefined): RbMasterSide {
  if (!g) return 'WAIT';
  if (Math.abs(g.slopePct) < 0.0032) return 'WAIT';
  return g.descending ? 'SHORT' : 'LONG';
}

export function computeMergedDeskRbMasterStance(params: {
  candles: Candle[];
  geoms?: MergedDeskChannelGeom[] | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  analysis?: AnalyzeResponse | null;
  cycle?: MergedDeskCycleProgressPack | null;
  pattern?: MergedDeskActionablePatternBrief | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  rocketDir?: 'LONG' | 'SHORT' | null;
  aiFaceSummaryKo?: string | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  tradeStyle?: MergedDeskRbTradeStyle | null;
}): MergedDeskRbMasterStance {
  const long = { n: 0, why: [] as string[] };
  const short = { n: 0, why: [] as string[] };
  const styleW = mergedDeskRbStyleWeights(params.tradeStyle);

  const primary =
    params.geoms?.find((g) => g.primary) ??
    params.geoms?.find((g) => g.horizon === styleW.preferredHorizon) ??
    params.geoms?.find((g) => g.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const longG = params.geoms?.find((g) => g.horizon === 'long') ?? null;
  const shortG = params.geoms?.find((g) => g.horizon === 'short') ?? null;

  const longSide = geomSide(longG);
  const shortSide = geomSide(shortG ?? primary);
  vote(
    long,
    short,
    longSide,
    Math.round(22 * styleW.longMult),
    `장기채널 ${longSide === 'WAIT' ? '평탄' : longSide === 'LONG' ? '상승' : '하락'}`
  );
  vote(
    long,
    short,
    shortSide,
    Math.round(12 * styleW.shortMult),
    `단기채널 ${shortSide === 'WAIT' ? '평탄' : shortSide === 'LONG' ? '상승' : '하락'}`
  );

  const stMeta = computeInstitutionalSuperTrendMeta(params.candles);
  const stDir: RbMasterSide =
    stMeta?.lastDir === 'long' ? 'LONG' : stMeta?.lastDir === 'short' ? 'SHORT' : 'WAIT';
  vote(long, short, stDir === 'WAIT' ? null : stDir, 14, `기관밴드 ${stDir === 'LONG' ? '롱' : '숏'}`);
  const stEdges = getLastInstitutionalBandEdges(params.candles);
  if (stEdges && primary && stDir !== 'WAIT') {
    vote(long, short, stDir, 4, '기관레일 존재');
  }

  const vs = params.volSync;
  if (vs) {
    const volSide: RbMasterSide =
      vs.side === 'up' ? 'LONG' : vs.side === 'down' ? 'SHORT' : 'WAIT';
    const rm = styleW.reactionMult;
    if (volSide !== 'WAIT' && vs.confirm === 'confirm') {
      vote(long, short, volSide, Math.round(12 * rm), `수급동의 매수${Math.round(vs.buyPct * 100)}%`);
    } else if (volSide !== 'WAIT' && vs.confirm === 'diverge') {
      vote(long, short, volSide === 'LONG' ? 'SHORT' : 'LONG', Math.round(8 * rm), '수급괴리·반대가중');
    } else if (volSide !== 'WAIT') {
      vote(long, short, volSide, Math.round(4 * rm), '수급약함');
    }
  }

  const close = Number(params.candles[params.candles.length - 1]?.close) || 0;
  const pocRel = evaluateMergedDeskRbPocRelation({
    close,
    poc: params.vrvpPoc,
    vaLow: params.vrvpVaLow,
    vaHigh: params.vrvpVaHigh,
  });
  if (pocRel.side === 'LONG' || pocRel.side === 'SHORT') {
    vote(long, short, pocRel.side, Math.round(pocRel.pts * styleW.pocMult), `POC ${pocRel.ko}`);
  }

  const v = params.analysis?.verdict;
  if (v === 'LONG' || v === 'SHORT') vote(long, short, v, 10, `분석 ${v}`);

  const cs = params.analysis?.confirmedSignal;
  if (cs?.confirmed && (cs.direction === 'LONG' || cs.direction === 'SHORT')) {
    vote(long, short, cs.direction, 10, `확정게이트 ${cs.gatesPassCount ?? '?'}/5`);
  }

  const mtf = params.analysis?.mtf;
  if (mtf && typeof mtf.alignmentScore === 'number' && (v === 'LONG' || v === 'SHORT')) {
    const a = Number(mtf.alignmentScore);
    if (a >= 70) vote(long, short, v, 8, `MTF정렬 ${a}`);
    else if (a < 40) vote(long, short, v === 'LONG' ? 'SHORT' : 'LONG', 6, `MTF낮음 ${a}`);
  }

  if (params.rocketDir) {
    vote(long, short, params.rocketDir, Math.round(6 * styleW.reactionMult), '구조로켓');
  }

  for (const z of params.hotZones ?? []) {
    vote(
      long,
      short,
      z.side,
      Math.round((z.primary ? 8 : 4) * styleW.reactionMult),
      `Hot ${String(z.labelKo || z.side).slice(0, 18)}`
    );
  }

  const money = params.moneyHud;
  if (money?.long && !money.short) vote(long, short, 'LONG', 6, '$$$$롱');
  else if (money?.short && !money.long) vote(long, short, 'SHORT', 6, '$$$$숏');
  else if (money?.long && money.short) {
    vote(long, short, 'LONG', 3, '$$$$양존·롱');
    vote(long, short, 'SHORT', 3, '$$$$양존·숏');
  }

  const cycSeats = [
    ...(params.cycle?.primary ? [params.cycle.primary] : []),
    ...(params.cycle?.others ?? []),
  ];
  for (const cyc of cycSeats) {
    if (/도식 대기/.test(cyc.headlineKo) || cyc.kind === 'seat') continue;
    const blob = `${cyc.tone || ''} ${cyc.headlineKo || ''} ${cyc.tagKo || ''}`;
    const w = Math.max(2, Math.min(6, Math.round(cyc.confidence / 18)));
    const bull = cyc.tone === 'bull' || /매집|마크업|상승|스프링|구름위|CHoCH\+|BOS\+/.test(blob);
    const bear = cyc.tone === 'bear' || /분산|마크다운|하락|업스러스트|구름아래|CHoCH−|BOS−/.test(blob);
    if (bull) vote(long, short, 'LONG', w, `칩 ${cyc.tagKo}`);
    else if (bear) vote(long, short, 'SHORT', w, `칩 ${cyc.tagKo}`);
  }

  const pat = params.pattern;
  if (pat && pat.confidence >= 72) {
    if (pat.bias === 'bullish') vote(long, short, 'LONG', 6, `패턴 ${pat.labelShort}`);
    else if (pat.bias === 'bearish') vote(long, short, 'SHORT', 6, `패턴 ${pat.labelShort}`);
  }

  const ai = String(params.aiFaceSummaryKo || '');
  if (/상위역방향/.test(ai)) {
    /* 양쪽 삭감 — 관망 쪽으로 */
    long.n = Math.max(0, long.n - 10);
    short.n = Math.max(0, short.n - 10);
    long.why.push('AI면 상위역방향');
  } else if (/매수강|롱우세|기관지지|안착/.test(ai)) {
    vote(long, short, 'LONG', 6, 'AI면 매수쪽');
  } else if (/매도강|숏우세|기관저항/.test(ai)) {
    vote(long, short, 'SHORT', 6, 'AI면 매도쪽');
  }

  const channelConflict = longSide !== 'WAIT' && shortSide !== 'WAIT' && longSide !== shortSide;
  if (channelConflict) {
    long.n = Math.round(long.n * 0.82);
    short.n = Math.round(short.n * 0.82);
    long.why.push('단기·장기 채널 역행·감점');
  }

  const scoreLong = Math.round(long.n);
  const scoreShort = Math.round(short.n);
  const margin = scoreLong - scoreShort;
  const absM = Math.abs(margin);

  let side: RbMasterSide = 'WAIT';
  if (absM >= DECLARE_MARGIN) side = margin > 0 ? 'LONG' : 'SHORT';
  if (channelConflict && absM < DECLARE_MARGIN + 8) side = 'WAIT';
  if (/상위역방향/.test(ai) && absM < 28) side = 'WAIT';

  const structureAgrees =
    (side === 'LONG' && (longSide === 'LONG' || stDir === 'LONG')) ||
    (side === 'SHORT' && (longSide === 'SHORT' || stDir === 'SHORT'));
  const volAgrees =
    !!vs &&
    vs.confirm === 'confirm' &&
    ((side === 'LONG' && vs.side === 'up') || (side === 'SHORT' && vs.side === 'down'));
  const flipOk = structureAgrees || volAgrees;

  if (side !== 'WAIT' && !structureAgrees && absM < 22) side = 'WAIT';

  const actionKo: MergedDeskRbMasterStance['actionKo'] =
    side === 'LONG' ? '매수관점' : side === 'SHORT' ? '매도관점' : '관망';
  const conviction: MergedDeskRbMasterStance['conviction'] =
    side === 'WAIT' ? 'none' : absM >= 32 && structureAgrees ? 'strong' : absM >= 22 ? 'ok' : 'weak';
  const phaseKo =
    side === 'WAIT' ? '방향불명' : conviction === 'strong' ? '정렬강' : conviction === 'ok' ? '정렬' : '약함대기';
  const captionKo =
    side === 'WAIT'
      ? `◆${styleW.styleKo}관망·매수매도불명`
      : `◆${styleW.styleKo}·${actionKo}·${phaseKo}`;
  const reasonsKo = [...(margin >= 0 ? long.why : short.why), ...(margin >= 0 ? short.why.slice(0, 2) : long.why.slice(0, 2))].slice(
    0,
    8
  );
  const summaryKo = `${captionKo} · 매수${scoreLong} 매도${scoreShort} 차${absM}${
    pocRel.ko ? ` · ${pocRel.ko}` : ''
  } · 참고(확정아님)`;

  return {
    side,
    actionKo,
    phaseKo,
    captionKo,
    conviction,
    scoreLong,
    scoreShort,
    margin,
    sticky: false,
    flipOk,
    reasonsKo,
    summaryKo,
  };
}

/** 같은 심볼·TF에서 반대 증거가 충분할 때만 방향 전환 */
export function applyRbMasterStanceHysteresis(
  key: string,
  next: MergedDeskRbMasterStance,
  barTime: number
): MergedDeskRbMasterStance {
  const k = String(key || '').trim() || 'default';
  const prev = MEM.get(k);
  if (!prev) {
    if (next.side === 'LONG' || next.side === 'SHORT') {
      MEM.set(k, {
        side: next.side,
        barTime,
        scoreLong: next.scoreLong,
        scoreShort: next.scoreShort,
      });
    }
    return next;
  }

  if (next.side === prev.side) {
    MEM.set(k, {
      side: prev.side,
      barTime,
      scoreLong: next.scoreLong,
      scoreShort: next.scoreShort,
    });
    return { ...next, sticky: true };
  }

  const oppMargin =
    prev.side === 'LONG' ? next.scoreShort - next.scoreLong : next.scoreLong - next.scoreShort;
  const allowFlip =
    next.side !== 'WAIT' &&
    next.flipOk &&
    oppMargin >= FLIP_MARGIN &&
    barTime !== prev.barTime;

  if (!allowFlip) {
    const actionKo = prev.side === 'LONG' ? '매수관점' : '매도관점';
    const phaseKo = next.side === 'WAIT' ? '유지·대기' : '반대증거부족·유지';
    return {
      ...next,
      side: prev.side,
      actionKo,
      phaseKo,
      captionKo: `◆${actionKo}·${phaseKo}`,
      conviction: next.conviction === 'strong' ? 'ok' : next.conviction === 'none' ? 'weak' : next.conviction,
      sticky: true,
      summaryKo: `◆${actionKo}·유지 · 매수${next.scoreLong} 매도${next.scoreShort} · 히스테리시스`,
      reasonsKo: [`이전 ${actionKo} 유지`, `전환차 ${oppMargin.toFixed(0)} < ${FLIP_MARGIN}`, ...next.reasonsKo].slice(
        0,
        8
      ),
    };
  }

  const flipped: 'LONG' | 'SHORT' = next.side === 'SHORT' ? 'SHORT' : 'LONG';
  MEM.set(k, {
    side: flipped,
    barTime,
    scoreLong: next.scoreLong,
    scoreShort: next.scoreShort,
  });
  return {
    ...next,
    side: flipped,
    sticky: false,
    captionKo: flipped === 'LONG' ? '◆매수관점·전환확인' : '◆매도관점·전환확인',
    phaseKo: '전환확인',
    reasonsKo: ['마스터 방향 전환(증거충족)', ...next.reasonsKo].slice(0, 8),
  };
}

export function lockEdgeCandidatesToMaster<
  T extends { direction: 'LONG' | 'SHORT'; score: number; reasons: string[] },
>(candidates: T[], stance: MergedDeskRbMasterStance): T[] {
  if (stance.side === 'WAIT') return [];
  return candidates
    .filter((c) => c.direction === stance.side)
    .map((c) => ({
      ...c,
      score: c.score + (stance.conviction === 'strong' ? 20 : stance.conviction === 'ok' ? 14 : 8),
      reasons: [...c.reasons, stance.actionKo].slice(0, 6),
    }));
}
