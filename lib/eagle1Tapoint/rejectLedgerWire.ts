/**
 * §34 MISSED OPPORTUNITY + §33 REJECT 기록 와이어.
 * 브라우저 LS + 서버 메모리 병행.
 */
import {
  appendTapReject,
  listTapRejects,
  tagMissedOpportunity,
  type TapRejectRecord,
} from './rejectLedger';
import type { TapointDecisionReport } from './types';

type ServerBag = TapRejectRecord;

const g = globalThis as unknown as {
  __tapRejectServer?: ServerBag[];
};

function serverList(): ServerBag[] {
  if (!g.__tapRejectServer) g.__tapRejectServer = [];
  return g.__tapRejectServer;
}

export function wireTapRejectFromReport(
  report: TapointDecisionReport,
  price: number
): string | null {
  if (report.decision === 'CONFIRMED_LONG' || report.decision === 'CONFIRMED_SHORT') {
    return null;
  }

  const id = `rej-${report.symbol}-${report.timeframe}-${report.decidedAt}`;
  const rec: TapRejectRecord = {
    id,
    symbol: report.symbol,
    timeframe: report.timeframe,
    at: report.decidedAt,
    direction: report.direction,
    decision: report.decision,
    reasonKo:
      report.rejectReasonKo ||
      report.gate.failReasons.slice(0, 3).join('·') ||
      'WAIT',
    scores: {
      direction: report.scores.direction,
      location: report.scores.location,
      setup: report.scores.setup,
      entry: report.scores.entry,
      flow: report.scores.flow,
      event: report.scores.event,
    },
    price,
    followUp: { checkedAt: 0, tag: 'PENDING' },
  };

  try {
    appendTapReject(rec);
  } catch {
    /* browser only */
  }

  const sl = serverList();
  if (!sl.some((x) => x.id === id)) {
    sl.push(rec);
    g.__tapRejectServer = sl.slice(-500);
  }
  return id;
}

export function evaluateTapMissedFromReturns(params: {
  id: string;
  direction: 'LONG' | 'SHORT' | null;
  ret3?: number | null;
  ret5?: number | null;
  ret10?: number | null;
}): 'MISSED_WINNER' | 'GOOD_REJECTION' | 'PENDING' | null {
  try {
    tagMissedOpportunity(params);
  } catch {
    /* ignore */
  }
  const sl = serverList();
  const i = sl.findIndex((x) => x.id === params.id);
  if (i < 0) return null;
  const ret = params.ret5 ?? params.ret3 ?? params.ret10 ?? 0;
  const goodDir =
    (params.direction === 'LONG' && ret > 0.004) ||
    (params.direction === 'SHORT' && ret < -0.004);
  const goodReject =
    (params.direction === 'LONG' && ret < -0.003) ||
    (params.direction === 'SHORT' && ret > 0.003);
  const tag = goodDir ? 'MISSED_WINNER' : goodReject ? 'GOOD_REJECTION' : 'PENDING';
  sl[i]!.followUp = {
    checkedAt: Date.now(),
    ret3: params.ret3 ?? null,
    ret5: params.ret5 ?? null,
    ret10: params.ret10 ?? null,
    tag,
  };
  return tag;
}

export function listServerTapRejects(limit = 40): TapRejectRecord[] {
  return serverList().slice(-limit).reverse();
}

export function summarizeTapRejectStats(): {
  pending: number;
  missedWinner: number;
  goodRejection: number;
  noteKo: string;
} {
  const all = [...serverList()];
  try {
    all.push(...listTapRejects(200));
  } catch {
    /* */
  }
  let pending = 0;
  let missedWinner = 0;
  let goodRejection = 0;
  for (const r of all) {
    const t = r.followUp?.tag || 'PENDING';
    if (t === 'MISSED_WINNER') missedWinner += 1;
    else if (t === 'GOOD_REJECTION') goodRejection += 1;
    else pending += 1;
  }
  return {
    pending,
    missedWinner,
    goodRejection,
    noteKo: `거절 ${all.length} · 놓친승 ${missedWinner} · 좋은거절 ${goodRejection} · 대기추적 ${pending}`,
  };
}
