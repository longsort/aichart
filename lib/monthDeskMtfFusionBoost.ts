import {
  chartTfToCloseSettleTf,
  type TfCloseSettleBoard,
  type TfCloseSettleRow,
  type TfCloseSettleTf,
} from '@/lib/tfCloseSettleAssessment';

const TF_WEIGHT: Record<TfCloseSettleTf, number> = {
  '15m': 0.75,
  '1h': 1,
  '4h': 1.35,
  '1d': 1.65,
  '1w': 2,
  '1M': 2.4,
};

function chartTfToSettleTf(chartTf: string): TfCloseSettleTf | null {
  return chartTfToCloseSettleTf(chartTf);
}

function rowBoost(row: TfCloseSettleRow): { long: number; short: number; reason?: string } {
  let long = 0;
  let short = 0;
  let reason: string | undefined;

  const w = TF_WEIGHT[row.tf] ?? 1;
  if (row.confirmedEdge === '롱 유리') {
    long += 1.1 * w;
    reason = `${row.tfKo} 마감·롱유리`;
  } else if (row.confirmedEdge === '숏 유리') {
    short += 1.1 * w;
    reason = `${row.tfKo} 마감·숏유리`;
  }

  if (row.formingVerdict === '안착') {
    if (row.vsPriorClose === '위' && row.confirmedEdge !== '숏 유리') {
      long += 0.85 * w;
      reason = reason ?? `${row.tfKo} 안착·상방`;
    } else if (row.vsPriorClose === '아래' && row.confirmedEdge !== '롱 유리') {
      short += 0.85 * w;
      reason = reason ?? `${row.tfKo} 안착·하방`;
    }
  } else if (row.formingVerdict === '실패') {
    if (row.confirmedEdge === '롱 유리') short += 0.5 * w;
    if (row.confirmedEdge === '숏 유리') long += 0.5 * w;
    reason = reason ?? `${row.tfKo} 안착실패`;
  } else if (row.formingVerdict === '불안') {
    long += 0.15 * w;
    short += 0.15 * w;
  }

  if (row.tailongTag === '종가안착' || row.tailongTag === '종가미갱신') {
    long += 0.7 * w;
    reason = reason ?? `${row.tfKo}·타이롱${row.tailongTag}`;
  } else if (row.tailongTag === '꼬리실패') {
    short += 0.7 * w;
    reason = reason ?? `${row.tfKo}·타이롱꼬리실패`;
  }

  return { long, short, reason };
}

export type MonthDeskMtfFusionBoost = {
  scoreLong: number;
  scoreShort: number;
  reasonsKo: string[];
  lineupKo: string;
  summaryKo: string;
  alignedTfCount: number;
  conflict: boolean;
};

export function computeMonthDeskMtfFusionBoost(
  board: TfCloseSettleBoard | null | undefined,
  chartTimeframe: string
): MonthDeskMtfFusionBoost | null {
  if (!board?.rows?.length) return null;

  const chartTf = chartTfToSettleTf(chartTimeframe);
  let scoreLong = 0;
  let scoreShort = 0;
  const reasonsKo: string[] = [];
  const lineupParts: string[] = ['mtfClose'];
  let alignedLong = 0;
  let alignedShort = 0;

  for (const row of board.rows) {
    const b = rowBoost(row);
    const focus = chartTf === row.tf;
    const mult = focus ? 1.35 : 1;
    scoreLong += b.long * mult;
    scoreShort += b.short * mult;
    if (b.long > b.short + 0.2) alignedLong++;
    if (b.short > b.long + 0.2) alignedShort++;
    if (b.reason && reasonsKo.length < 8) reasonsKo.push(b.reason);
    if (focus && b.reason) reasonsKo.unshift(`★${b.reason}`);
  }

  const conflict = alignedLong >= 2 && alignedShort >= 2;
  if (conflict) {
    scoreLong *= 0.92;
    scoreShort *= 0.92;
    reasonsKo.push('MTF 롱·숏 혼재');
  }

  const dominant =
    scoreLong > scoreShort + 0.8 ? 'LONG' : scoreShort > scoreLong + 0.8 ? 'SHORT' : null;
  const alignedTfCount = Math.max(alignedLong, alignedShort);
  const summaryKo = dominant
    ? `MTF ${alignedTfCount}구간·${dominant === 'LONG' ? '롱' : '숏'} 정렬`
    : `MTF 혼조 (롱 ${scoreLong.toFixed(1)} / 숏 ${scoreShort.toFixed(1)})`;

  return {
    scoreLong,
    scoreShort,
    reasonsKo: [...new Set(reasonsKo)].slice(0, 10),
    lineupKo: lineupParts.join('+'),
    summaryKo,
    alignedTfCount,
    conflict,
  };
}
