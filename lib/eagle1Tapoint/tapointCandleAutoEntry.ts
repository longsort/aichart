/**
 * 타점엔진 캔들·구조 합류 점수.
 * 단독 지표로 주문하지 않음. 확정 승률 아님.
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';

export type CandleVote = { id: string; ko: string; w: number };

export type TapointCandleAutoPack = {
  direction: 'LONG' | 'SHORT' | null;
  votes: CandleVote[];
  weight: number;
  chase: boolean;
  qualityBad: boolean;
};

function add(votes: CandleVote[], id: string, ko: string, w: number) {
  if (w <= 0) return;
  votes.push({ id, ko, w });
}

export function buildTapointCandleAutoPack(
  report: TapointDecisionReport | null | undefined,
  prefer: 'LONG' | 'SHORT' | null
): TapointCandleAutoPack {
  const votes: CandleVote[] = [];
  if (!report || !prefer) {
    return { direction: prefer, votes, weight: 0, chase: false, qualityBad: true };
  }
  const qualityBad = report.qualityOk === false;
  const ib = report.instBandPlan;
  const sw = report.sweepLive;
  const dir = prefer;

  if (ib?.actionable && ib.direction === dir) {
    add(votes, 'bandReady', `밴드READY ${ib.candleKo || ''}`.trim(), 3);
  } else if (String(ib?.status || '').includes(dir === 'LONG' ? 'LONG' : 'SHORT')) {
    add(votes, 'bandWatch', `밴드관망 ${ib?.candleKo || ''}`.trim(), 1);
  }

  if (sw?.direction === dir && sw.alignsWithDir) {
    if (sw.consecutive2 || sw.fired) add(votes, 'sweep2', sw.noteKo || '연속스윕', 3);
    else if (sw.reclaimed) add(votes, 'sweep1', '1회스윕·회수', 2);
    else add(votes, 'sweepHint', '스윕힌트', 1);
  }

  const dec = String(report.decision || '');
  if ((dir === 'LONG' && dec === 'CONFIRMED_LONG') || (dir === 'SHORT' && dec === 'CONFIRMED_SHORT')) {
    add(votes, 'confirmed', '타점확정', 2);
  } else if ((dir === 'LONG' && dec === 'ARMED_LONG') || (dir === 'SHORT' && dec === 'ARMED_SHORT')) {
    add(votes, 'armed', '타점무장', 1);
  }

  const flow = report.flowSnap;
  if (flow?.alignsWithDir && (Number(flow.score) || 0) >= 58) {
    add(votes, 'flow', flow.summaryKo || '흐름정렬', 2);
  } else if ((report.scores?.flow ?? 0) >= 65) {
    add(votes, 'flowScore', `흐름${report.scores?.flow}`, 1);
  }

  const vb = report.volRoeBurst;
  if (vb?.fired && vb.direction === dir) add(votes, 'volBurst', vb.noteKo || '볼륨폭발', 2);

  const av = report.sharedMerged?.advVolume;
  if (dir === 'LONG' && av?.action === 'long-ref') add(votes, 'adv', av.actionKo || '선진롱', av.notable ? 2 : 1);
  if (dir === 'SHORT' && av?.action === 'short-ref') add(votes, 'adv', av.actionKo || '선진숏', av.notable ? 2 : 1);

  const face = report.sharedMerged?.dailyFace;
  if (dir === 'LONG' && face?.bias === 'up') add(votes, 'face', '일봉면상승', 1);
  if (dir === 'SHORT' && face?.bias === 'down') add(votes, 'face', '일봉면하락', 1);

  const ex = report.extreme;
  if (ex?.kind && ex.kind !== 'NONE') add(votes, 'extreme', String(ex.kind), 1);

  const marks = report.chartSignals?.markers || [];
  const bos = marks.some((m) => /bos|choch/i.test(String(m.label || '')));
  const fail = marks.some((m) => /fail|fake/i.test(String(m.label || '')));
  const sweepMk = marks.some((m) => /sweep/i.test(String(m.label || '')));
  if (bos) add(votes, 'bos', 'BOS/CHoCH마크', 1);
  if (fail) add(votes, 'fail', 'FAILED_BREAK마크', 1);
  if (sweepMk) add(votes, 'sweepMk', 'SWEEP마크', 1);

  if ((report.scores?.setup ?? 0) >= 70) add(votes, 'setup', `셋업${report.scores?.setup}`, 1);
  if ((report.scores?.entry ?? 0) >= 62) add(votes, 'entry', `타점${report.scores?.entry}`, 1);

  const loc = (report.macro || []).find((m) => m.location && m.location !== 'UNKNOWN');
  if (dir === 'LONG' && loc?.location === 'DISCOUNT') add(votes, 'disc', '할인위치', 1);
  if (dir === 'SHORT' && loc?.location === 'PREMIUM') add(votes, 'prem', '프리미엄위치', 1);

  const upper = Number(ib?.upper);
  const lower = Number(ib?.lower);
  const entry = Number(ib?.entry) || Number(report.entry);
  let chase = false;
  if (upper > lower && entry > 0) {
    const mid = (upper + lower) / 2;
    const span = upper - lower;
    if (dir === 'LONG' && entry > mid + span * 0.28) chase = true;
    if (dir === 'SHORT' && entry < mid - span * 0.28) chase = true;
  }

  const weight = votes.reduce((s, v) => s + v.w, 0);
  return { direction: dir, votes, weight, chase, qualityBad };
}
