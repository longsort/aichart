import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

/** 당(진행)봉 기준 참고 판정 — 타이롱식 종가 마감·안착·실패 */
export type FormingSettleVerdict = '안착' | '불안' | '실패' | '관망';

/** 15분·1시간·4시간·일·주·월 */
export type TfCloseSettleTf = '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export const TF_CLOSE_SETTLE_ORDER: TfCloseSettleTf[] = ['15m', '1h', '4h', '1d', '1w', '1M'];

/** 차트 TF → 종가 마감 보드 row.tf (하위 TF는 상위 보드로 매핑) */
export function chartTfToCloseSettleTf(chartTf: string): TfCloseSettleTf | null {
  const t = normalizeChartTimeframe(chartTf);
  if (t === '15m' || t === '1h' || t === '4h' || t === '1d' || t === '1w' || t === '1M') return t;
  if (t === '30m') return '15m';
  if (t === '2h' || t === '6h' || t === '8h' || t === '12h') return '4h';
  if (t === '3d') return '1d';
  return null;
}

/** 축 짧은 태그용 (15m고 / 1D저) */
export function closeSettleTfAxisLabel(tf: TfCloseSettleTf): string {
  if (tf === '1d') return '1D';
  if (tf === '1w') return '1W';
  return tf;
}

const TF_KO: Record<TfCloseSettleTf, string> = {
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일',
  '1w': '주',
  '1M': '월',
};

export type TfCloseSettleRow = {
  tf: TfCloseSettleTf;
  tfKo: string;
  priorOpen: number;
  priorHigh: number;
  priorLow: number;
  priorClose: number;
  priorBodyLabel: '양봉' | '음봉' | '도지';
  confirmedCloseLabel: string;
  confirmedCloseDetail: string;
  confirmedEdge: '롱 유리' | '숏 유리' | '중립';
  formingOpen: number;
  formingHigh: number;
  formingLow: number;
  formingClose: number;
  gapFromPriorClosePct: number;
  vsPriorClose: '위' | '아래' | '근접';
  vsPriorHigh: '돌파' | '미돌파' | '근접';
  vsPriorLow: '이탈' | '유지' | '근접';
  formingVerdict: FormingSettleVerdict;
  formingScore: number;
  formingBullets: string[];
  /** 타이롱: 꼬리만 돌파·종가 미돌파 / 종가 저점 미갱신 등 */
  tailongTag?: '종가안착' | '꼬리실패' | '종가미갱신' | null;
  entryPlan?: {
    long: { enabled: boolean; trigger: string; invalidation: string; context: string };
    short: { enabled: boolean; trigger: string; invalidation: string; context: string };
  };
};

export type TfCloseSettleBoard = {
  asOfUtcIso: string;
  rows: TfCloseSettleRow[];
  disclaimer: string;
};

export function fmtPrice(n: number, maxFrac = 6): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const frac = a >= 1000 ? 2 : a >= 1 ? 4 : maxFrac;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

function utcYmd(d: Date): { y: number; m: number; day: number } {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function epsPct(price: number): number {
  return Math.max(Math.abs(price) * 1e-6, 1e-9);
}

type ClosedDesc = {
  bull: boolean;
  bear: boolean;
  doji: boolean;
  closePosInRange: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  closeQualityKo: string;
  confirmedEdge: TfCloseSettleRow['confirmedEdge'];
  confirmedCloseDetail: string;
};

function describeClosedCandle(c: Candle, tfKo: string): ClosedDesc {
  const { open: o, high: h, low: l, close: cl } = c;
  const range = Math.max(1e-12, h - l);
  const bull = cl > o;
  const bear = cl < o;
  const doji = !bull && !bear;
  const closePosInRange = (cl - l) / range;
  const bodyTop = Math.max(o, cl);
  const bodyBot = Math.min(o, cl);
  const upperWickRatio = (h - bodyTop) / range;
  const lowerWickRatio = (bodyBot - l) / range;

  let closeQualityKo = '';
  if (doji) {
    closeQualityKo =
      closePosInRange >= 0.45 && closePosInRange <= 0.55
        ? `직전 마감 ${tfKo}봉은 도지에 가깝고 중앙 마감 — 방향은 다음 봉에 넘어감.`
        : `직전 마감 ${tfKo}봉은 도지에 가깝고 ${closePosInRange >= 0.55 ? '상단' : '하단'} 쪽 마감.`;
  } else if (bull) {
    if (closePosInRange >= 0.75 && upperWickRatio <= 0.12)
      closeQualityKo = `직전 ${tfKo} 양봉, 종가 상단 마감(타이롱·강한 마감).`;
    else if (closePosInRange >= 0.55 && upperWickRatio <= 0.22)
      closeQualityKo = `직전 ${tfKo} 양봉, 종가 중상단 마감 — 추세 유지형.`;
    else if (closePosInRange <= 0.35 || upperWickRatio >= 0.35)
      closeQualityKo = `직전 ${tfKo} 양봉이나 윗꼬리·하단 종가 — 상단 거부·실패 여지.`;
    else closeQualityKo = `직전 ${tfKo} 양봉 — 종가 중간권, 다음 봉이 분기.`;
  } else {
    if (closePosInRange <= 0.25 && lowerWickRatio <= 0.12)
      closeQualityKo = `직전 ${tfKo} 음봉, 종가 하단 마감(타이롱·강한 하단 마감).`;
    else if (closePosInRange <= 0.45 && lowerWickRatio <= 0.22)
      closeQualityKo = `직전 ${tfKo} 음봉, 종가 중하단 마감 — 하락 우위.`;
    else if (closePosInRange >= 0.65 || lowerWickRatio >= 0.35)
      closeQualityKo = `직전 ${tfKo} 음봉이나 아랫꼬리·상단 종가 — 반등 흡수 마감.`;
    else closeQualityKo = `직전 ${tfKo} 음봉 — 종가 중간권, 다음 봉 응답이 관건.`;
  }

  let confirmedEdge: TfCloseSettleRow['confirmedEdge'] = '중립';
  if (bull && closePosInRange >= 0.58 && upperWickRatio <= 0.25) confirmedEdge = '롱 유리';
  else if (bear && closePosInRange <= 0.42 && lowerWickRatio <= 0.25) confirmedEdge = '숏 유리';
  else if (bull && closePosInRange <= 0.38) confirmedEdge = '숏 유리';
  else if (bear && closePosInRange >= 0.62) confirmedEdge = '롱 유리';

  const confirmedCloseDetail =
    bull && closePosInRange >= 0.55
      ? `확정 마감: 상방 치우침 — 다음 ${tfKo}에서 전고·전종가 위 안착 여부 확인.`
      : bear && closePosInRange <= 0.45
        ? `확정 마감: 하방 치우침 — 다음 ${tfKo}에서 반등·종가 회복 여부 확인.`
        : `확정 마감: 중립~혼조 — 다음 ${tfKo} 종가가 시나리오를 가름.`;

  return {
    bull,
    bear,
    doji,
    closePosInRange,
    upperWickRatio,
    lowerWickRatio,
    closeQualityKo,
    confirmedEdge,
    confirmedCloseDetail,
  };
}

function applyTailongCloseRules(
  prev: Candle,
  cur: Candle,
  score: number,
  lines: string[]
): { score: number; lines: string[]; tag: TfCloseSettleRow['tailongTag'] } {
  let s = score;
  let tag: TfCloseSettleRow['tailongTag'] = null;
  const epsH = epsPct(prev.high);
  const epsL = epsPct(prev.low);

  if (cur.high > prev.high + epsH && cur.close <= prev.high + epsH) {
    s -= 1.55;
    lines.push('타이롱: 꼬리만 전고 돌파·종가 미돌파 → 실패(거부)');
    tag = '꼬리실패';
  }
  if (cur.close > prev.high + epsH) {
    s += 1.35;
    lines.push('타이롱: 종가가 전고 위 마감 → 돌파·안착');
    if (tag !== '꼬리실패') tag = '종가안착';
  }

  if (cur.low < prev.low - epsL && cur.close >= prev.low - epsL) {
    s += 1.15;
    lines.push('타이롱: 꼬리만 전저 이탈·종가 유지 → 종가 기준 저점 미갱신');
    if (tag !== '꼬리실패') tag = '종가미갱신';
  }
  if (cur.close < prev.low - epsL) {
    s -= 1.45;
    lines.push('타이롱: 종가가 전저 아래 마감 → 이탈·실패');
    tag = '꼬리실패';
  }

  if (cur.close > prev.close * 1.0008 && cur.low >= prev.low - epsL) {
    s += 0.55;
    lines.push('타이롱: 전종가 위·전저 유지 → 종가 안착');
    if (!tag) tag = '종가안착';
  } else if (cur.close < prev.close * 0.9992 && cur.high <= prev.high + epsH) {
    s -= 0.55;
    lines.push('타이롱: 전종가 아래·전고 아래 → 약세 안착');
  }

  return { score: s, lines, tag };
}

function scoreFormingVsPrior(
  prev: Candle,
  cur: Candle,
  desc: ClosedDesc,
  tf: TfCloseSettleTf,
  tfKo: string,
  nowMs: number,
  latestDaily: Candle | null
): {
  score: number;
  lines: string[];
  verdict: FormingSettleVerdict;
  tag: TfCloseSettleRow['tailongTag'];
} {
  const px = Number.isFinite(cur.close) && cur.close > 0 ? cur.close : cur.open;
  const range = prev.high - prev.low;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(epsPct(b), range * 0.002);

  let vsPriorClose: TfCloseSettleRow['vsPriorClose'] = '근접';
  if (px > prev.close * 1.0005) vsPriorClose = '위';
  else if (px < prev.close * 0.9995) vsPriorClose = '아래';

  let vsPriorHigh: TfCloseSettleRow['vsPriorHigh'] = '미돌파';
  if (px > prev.high + epsPct(prev.high)) vsPriorHigh = '돌파';
  else if (near(px, prev.high)) vsPriorHigh = '근접';

  let vsPriorLow: TfCloseSettleRow['vsPriorLow'] = '유지';
  if (px < prev.low - epsPct(prev.low)) vsPriorLow = '이탈';
  else if (near(px, prev.low)) vsPriorLow = '근접';

  let score = 0;
  const lines: string[] = [];

  if (desc.bull) {
    if (vsPriorClose === '위') {
      score += 1.25;
      lines.push(`직전 ${tfKo} 상승 마감 후 종가 위 — 연속성 우위.`);
    } else if (vsPriorClose === '아래') {
      score -= 0.85;
      lines.push(`직전 ${tfKo} 상승 마감인데 종가 아래 — 되돌림·검증.`);
    }
    if (vsPriorHigh === '돌파') {
      score += 1.1;
      lines.push(`직전 ${tfKo} 고점 종가 돌파 — 안착 후보.`);
    } else if (vsPriorHigh === '근접' && vsPriorClose !== '위') {
      score -= 0.35;
      lines.push(`고점 근처·종가 아래 — 저항 테스트.`);
    }
    if (vsPriorLow === '이탈') {
      score -= 1.6;
      lines.push(`직전 ${tfKo} 저점 종가 이탈 — 실패 신호.`);
    }
  } else if (desc.bear) {
    if (vsPriorClose === '아래') {
      score -= 1.15;
      lines.push(`직전 ${tfKo} 하락 마감 후 종가 아래 — 약세 연속.`);
    } else if (vsPriorClose === '위') {
      score += 0.95;
      lines.push(`직전 ${tfKo} 하락 마감 후 종가 위 회복 — 안착 검증.`);
    }
    if (vsPriorLow === '이탈') {
      score -= 1.2;
      lines.push(`저점 종가 갱신 — 하방 우위.`);
    } else if (vsPriorLow === '유지' && vsPriorClose === '위') {
      score += 0.55;
      lines.push(`저점 지키며 종가 위 — 약세 되돌림.`);
    }
    if (vsPriorHigh === '돌파') {
      score += 1.35;
      lines.push(`약세 마감 후 고점 종가 돌파 — 구조 전환 후보.`);
    }
  } else {
    lines.push(`직전 ${tfKo} 방향성 약함 — 종가 고저 돌파가 분기.`);
    if (vsPriorHigh === '돌파') score += 0.7;
    if (vsPriorLow === '이탈') score -= 0.7;
  }

  const gapPct =
    ((cur.open - prev.close) / Math.max(epsPct(prev.close), Math.abs(prev.close))) * 100;
  if (gapPct > 0.12) {
    lines.push(`갭 상향 약 ${gapPct.toFixed(2)}% — 갭 메우기·종가 안착이 포인트.`);
    if (px < cur.open && px < prev.close * 1.0002) score -= 0.65;
  } else if (gapPct < -0.12) {
    lines.push(`갭 하향 약 ${Math.abs(gapPct).toFixed(2)}% — 동일하게 종가 방어 확인.`);
    if (px > cur.open && px > prev.close * 0.9998) score += 0.55;
  }

  if (tf === '1M' && latestDaily) {
    const now = new Date(nowMs);
    const { day } = utcYmd(now);
    if (day === 1) {
      const d = latestDaily;
      const dr = Math.max(1e-12, d.high - d.low);
      const up = (d.high - Math.max(d.open, d.close)) / dr;
      const dn = (Math.min(d.open, d.close) - d.low) / dr;
      if (up > 0.45 && d.close < d.open) {
        score -= 0.55;
        lines.push('월초 일봉 윗꼬리·음봉 — 상단 거부 후보.');
      }
      if (dn > 0.45 && d.close > d.open) {
        score += 0.45;
        lines.push('월초 일봉 아랫꼬리·양봉 — 지지 시도.');
      }
    }
  }

  const tl = applyTailongCloseRules(prev, cur, score, lines);
  score = tl.score;
  lines.push(`진행 중 ${tfKo}봉 — 종가 마감 후 안착/실패 확정.`);

  let verdict: FormingSettleVerdict = '관망';
  if (score >= 1.25) verdict = '안착';
  else if (score <= -1.25) verdict = '실패';
  else if (score >= 0.4 || score <= -0.4) verdict = '불안';

  return { score: Math.round(score * 100) / 100, lines: tl.lines, verdict, tag: tl.tag };
}

export function buildTfCloseSettleRow(
  sortedAsc: Candle[],
  tf: TfCloseSettleTf,
  nowMs: number,
  latestDailyForMonth: Candle | null = null
): TfCloseSettleRow | null {
  if (!sortedAsc?.length || sortedAsc.length < 2) return null;
  const prev = sortedAsc[sortedAsc.length - 2]!;
  const cur = sortedAsc[sortedAsc.length - 1]!;
  for (const x of [prev, cur]) {
    if (
      ![x.open, x.high, x.low, x.close].every(
        (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
      )
    )
      return null;
  }

  const tfKo = TF_KO[tf];
  const desc = describeClosedCandle(prev, tfKo);
  const { score, lines, verdict, tag } = scoreFormingVsPrior(
    prev,
    cur,
    desc,
    tf,
    tfKo,
    nowMs,
    tf === '1M' ? latestDailyForMonth : null
  );

  const range = prev.high - prev.low;
  const px = Number.isFinite(cur.close) && cur.close > 0 ? cur.close : cur.open;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(epsPct(b), range * 0.002);
  let vsPriorClose: TfCloseSettleRow['vsPriorClose'] = '근접';
  if (px > prev.close * 1.0005) vsPriorClose = '위';
  else if (px < prev.close * 0.9995) vsPriorClose = '아래';
  let vsPriorHigh: TfCloseSettleRow['vsPriorHigh'] = '미돌파';
  if (px > prev.high + epsPct(prev.high)) vsPriorHigh = '돌파';
  else if (near(px, prev.high)) vsPriorHigh = '근접';
  let vsPriorLow: TfCloseSettleRow['vsPriorLow'] = '유지';
  if (px < prev.low - epsPct(prev.low)) vsPriorLow = '이탈';
  else if (near(px, prev.low)) vsPriorLow = '근접';

  const gapPct =
    ((cur.open - prev.close) / Math.max(epsPct(prev.close), Math.abs(prev.close))) * 100;

  const priorBodyLabel: TfCloseSettleRow['priorBodyLabel'] = desc.doji
    ? '도지'
    : desc.bull
      ? '양봉'
      : '음봉';

  return {
    tf,
    tfKo,
    priorOpen: prev.open,
    priorHigh: prev.high,
    priorLow: prev.low,
    priorClose: prev.close,
    priorBodyLabel,
    confirmedCloseLabel: desc.closeQualityKo,
    confirmedCloseDetail: desc.confirmedCloseDetail,
    confirmedEdge: desc.confirmedEdge,
    formingOpen: cur.open,
    formingHigh: cur.high,
    formingLow: cur.low,
    formingClose: cur.close,
    gapFromPriorClosePct: gapPct,
    vsPriorClose,
    vsPriorHigh,
    vsPriorLow,
    formingVerdict: verdict,
    formingScore: score,
    formingBullets: lines,
    tailongTag: tag,
  };
}

function htfForTf(tf: TfCloseSettleTf): { tf: TfCloseSettleTf; tag: string } | null {
  if (tf === '15m') return { tf: '1h', tag: '1h' };
  if (tf === '1h') return { tf: '4h', tag: '4h' };
  if (tf === '4h') return { tf: '1d', tag: '1d' };
  if (tf === '1d') return { tf: '1w', tag: '1w' };
  if (tf === '1w') return { tf: '1M', tag: '1M' };
  return null;
}

export function buildTfCloseSettleBoard(
  candlesByTf: Partial<Record<TfCloseSettleTf, Candle[]>>,
  nowMs: number,
  latestDailyForMonth: Candle | null
): TfCloseSettleBoard {
  const rows: TfCloseSettleRow[] = [];
  for (const tf of TF_CLOSE_SETTLE_ORDER) {
    const raw = candlesByTf[tf];
    if (!raw?.length) continue;
    const sorted = [...raw].sort((a, b) => a.time - b.time);
    const row = buildTfCloseSettleRow(sorted, tf, nowMs, tf === '1M' ? latestDailyForMonth : null);
    if (row) rows.push(row);
  }
  const byTf = new Map<TfCloseSettleTf, TfCloseSettleRow>();
  rows.forEach((r) => byTf.set(r.tf, r));

  for (const row of rows) {
    const htfLink = htfForTf(row.tf);
    if (!htfLink) continue;
    if (row.tf !== '15m' && row.tf !== '1h' && row.tf !== '4h') continue;
    const htf = byTf.get(htfLink.tf);
    const htfTag = htfLink.tag;
    const htfBull =
      htf != null &&
      (htf.confirmedEdge === '롱 유리' ||
        (htf.formingVerdict === '안착' && htf.formingScore >= 0.7));
    const htfBear =
      htf != null &&
      (htf.confirmedEdge === '숏 유리' ||
        (htf.formingVerdict === '실패' && htf.formingScore <= -0.7));
    const longBase =
      row.vsPriorClose !== '아래' &&
      (row.vsPriorHigh === '돌파' ||
        row.formingScore >= 0.55 ||
        row.formingVerdict === '안착' ||
        row.tailongTag === '종가안착' ||
        row.tailongTag === '종가미갱신');
    const shortBase =
      row.vsPriorClose !== '위' &&
      (row.vsPriorLow === '이탈' ||
        row.formingScore <= -0.55 ||
        row.formingVerdict === '실패' ||
        row.tailongTag === '꼬리실패');
    row.entryPlan = {
      long: {
        enabled: longBase,
        trigger:
          row.vsPriorHigh === '돌파' || row.tailongTag === '종가안착'
            ? `직전 ${row.tfKo} 고점·종가 위 유지(종가 안착).`
            : row.tailongTag === '종가미갱신'
              ? `종가 기준 저점 미갱신 확인 후 반등 이어갈 때.`
              : `진행 ${row.tfKo} 종가가 직전 종가 위에 안착하고, 저점이 직전 저점 위일 때.`,
        invalidation: `직전 ${row.tfKo} 저점 종가 이탈 시 롱 시나리오 폐기.`,
        context:
          htf == null
            ? '상위 TF 없음 — 보수적.'
            : `${htfTag}: ${htf.confirmedEdge}, ${htf.formingVerdict}(${htf.formingScore}). ${htfBull ? '상위 롱 동조.' : htfBear ? '상위 숏 우위.' : '상위 혼조.'}`,
      },
      short: {
        enabled: shortBase,
        trigger:
          row.vsPriorLow === '이탈' || row.tailongTag === '꼬리실패'
            ? `직전 ${row.tfKo} 저점 종가 아래 유지 또는 꼬리만 돌파 실패 확인.`
            : `진행 ${row.tfKo} 종가가 직전 종가 아래 안착, 고점이 직전 고점 아래일 때.`,
        invalidation: `직전 ${row.tfKo} 고점 종가 돌파 시 숏 시나리오 폐기.`,
        context:
          htf == null
            ? '상위 TF 없음 — 보수적.'
            : `${htfTag}: ${htf.confirmedEdge}, ${htf.formingVerdict}(${htf.formingScore}). ${htfBear ? '상위 숏 동조.' : htfBull ? '상위 롱 우위.' : '상위 혼조.'}`,
      },
    };
  }
  return {
    asOfUtcIso: new Date(nowMs).toISOString(),
    rows,
    disclaimer: '전봉=마감 확정, 진행봉=미마감. 타이롱식 종가 안착·실패 참고.',
  };
}

export function verdictColor(v: FormingSettleVerdict): string {
  switch (v) {
    case '안착':
      return '#4ade80';
    case '불안':
      return '#fbbf24';
    case '실패':
      return '#f87171';
    default:
      return '#94a3b8';
  }
}

export function confirmedEdgeColor(edge: TfCloseSettleRow['confirmedEdge']): string {
  switch (edge) {
    case '롱 유리':
      return '#86efac';
    case '숏 유리':
      return '#fca5a5';
    default:
      return '#cbd5e1';
  }
}

export function settleTfForChartTimeframe(tf: string): TfCloseSettleTf | null {
  const t = String(tf || '');
  if (t === '15m' || t === '1h' || t === '4h' || t === '1d' || t === '1w' || t === '1M') return t;
  return null;
}

/** 차트 TF의 직상위 종가마감 TF */
export function parentCloseSettleTf(tf: TfCloseSettleTf): TfCloseSettleTf | null {
  return htfForTf(tf)?.tf ?? null;
}

export function findCloseSettleRow(
  board: TfCloseSettleBoard | null | undefined,
  tf: TfCloseSettleTf | string | null | undefined
): TfCloseSettleRow | null {
  if (!board?.rows?.length || !tf) return null;
  const key = typeof tf === 'string' ? chartTfToCloseSettleTf(tf) ?? (tf as TfCloseSettleTf) : tf;
  return board.rows.find((r) => r.tf === key) ?? null;
}

export type SettleEntryGateSide = 'LONG' | 'SHORT';

/**
 * 종가마감 → 스윙 ENTER 게이트.
 * 실패 하드컷 · 마감(전봉) 확정 · 상위 TF 동조.
 * 조건부 필터 — 승률·수익 보장 아님.
 */
export type SettleEntryGateResult = {
  /** ENTER 허용 (실패 없음 + 마감 동조 + 상위 충돌 없음) */
  allowEnter: boolean;
  /** 되돌림 대기 허용 (실패만 아니면) */
  allowPullbackWait: boolean;
  confluenceDelta: number;
  hardBlockReasons: string[];
  boostReasons: string[];
  /** 직전 마감봉이 방향에 우호 */
  sealedOk: boolean;
  /** 상위 TF 동조(또는 상위 없음) */
  mtfAligned: boolean;
  /** 꼬리실패·진행실패·전봉 역방향 */
  failAgainst: boolean;
  summaryKo: string;
};

function settleFavorsSide(row: TfCloseSettleRow, side: SettleEntryGateSide): boolean {
  if (side === 'LONG') {
    return (
      row.confirmedEdge === '롱 유리' ||
      row.tailongTag === '종가안착' ||
      (row.formingVerdict === '안착' && row.formingScore >= 0.55 && row.vsPriorClose !== '아래')
    );
  }
  return (
    row.confirmedEdge === '숏 유리' ||
    (row.tailongTag === '종가안착' && row.vsPriorClose === '아래') ||
    (row.formingVerdict === '안착' && row.formingScore >= 0.55 && row.vsPriorClose === '아래') ||
    (row.tailongTag === '꼬리실패' && row.vsPriorClose !== '위')
  );
}

function settleSealedFavors(row: TfCloseSettleRow, side: SettleEntryGateSide): boolean {
  if (side === 'LONG') {
    return (
      row.confirmedEdge === '롱 유리' ||
      (row.tailongTag === '종가안착' && row.vsPriorClose !== '아래') ||
      (row.tailongTag === '종가미갱신' && row.vsPriorClose === '위')
    );
  }
  return (
    row.confirmedEdge === '숏 유리' ||
    (row.tailongTag === '종가안착' && row.vsPriorClose === '아래') ||
    (row.tailongTag === '종가미갱신' && row.vsPriorClose === '아래') ||
    (row.tailongTag === '꼬리실패' && row.confirmedEdge !== '롱 유리')
  );
}

function settleFailAgainst(row: TfCloseSettleRow, side: SettleEntryGateSide): boolean {
  if (side === 'LONG') {
    if (row.tailongTag === '꼬리실패') return true;
    if (row.formingVerdict === '실패') return true;
    if (row.confirmedEdge === '숏 유리' && row.vsPriorClose === '아래') return true;
    return false;
  }
  /* 숏: 상방 종가안착·롱 유리 마감이 하드 반대 */
  if (row.confirmedEdge === '롱 유리' && row.vsPriorClose === '위') return true;
  if (row.tailongTag === '종가안착' && row.vsPriorClose === '위') return true;
  if (row.formingVerdict === '안착' && row.formingScore >= 0.7 && row.vsPriorClose === '위') return true;
  return false;
}

function settleHtfConflict(htf: TfCloseSettleRow, side: SettleEntryGateSide): boolean {
  if (side === 'LONG') {
    return (
      htf.confirmedEdge === '숏 유리' ||
      (htf.formingVerdict === '실패' && htf.formingScore <= -0.55) ||
      htf.tailongTag === '꼬리실패'
    );
  }
  return (
    htf.confirmedEdge === '롱 유리' ||
    (htf.tailongTag === '종가안착' && htf.vsPriorClose === '위') ||
    (htf.formingVerdict === '안착' && htf.formingScore >= 0.7 && htf.vsPriorClose === '위')
  );
}

function settleHtfAligned(htf: TfCloseSettleRow, side: SettleEntryGateSide): boolean {
  if (side === 'LONG') {
    return (
      htf.confirmedEdge === '롱 유리' ||
      (htf.formingVerdict === '안착' && htf.formingScore >= 0.55) ||
      (htf.tailongTag === '종가안착' && htf.vsPriorClose !== '아래')
    );
  }
  return (
    htf.confirmedEdge === '숏 유리' ||
    (htf.tailongTag === '꼬리실패' && htf.vsPriorClose !== '위') ||
    (htf.formingVerdict === '안착' && htf.vsPriorClose === '아래') ||
    (htf.tailongTag === '종가안착' && htf.vsPriorClose === '아래')
  );
}

/**
 * 스윙·중투 ENTER용 종가마감 게이트 평가.
 */
export function evaluateSettleEntryGate(params: {
  side: SettleEntryGateSide;
  chartTf: string;
  settleBoard?: TfCloseSettleBoard | null;
  settleRow?: TfCloseSettleRow | null;
}): SettleEntryGateResult {
  const hardBlockReasons: string[] = [];
  const boostReasons: string[] = [];
  let confluenceDelta = 0;

  const chartSettleTf = chartTfToCloseSettleTf(params.chartTf);
  const row =
    params.settleRow ??
    (chartSettleTf ? findCloseSettleRow(params.settleBoard, chartSettleTf) : null);

  if (!row) {
    return {
      allowEnter: true,
      allowPullbackWait: true,
      confluenceDelta: 0,
      hardBlockReasons: [],
      boostReasons: [],
      sealedOk: false,
      mtfAligned: true,
      failAgainst: false,
      summaryKo: '종가보드 없음 — 게이트 미적용',
    };
  }

  const failAgainst = settleFailAgainst(row, params.side);
  const sealedOk = settleSealedFavors(row, params.side);

  const parentTf = parentCloseSettleTf(row.tf);
  const htf = parentTf ? findCloseSettleRow(params.settleBoard, parentTf) : null;
  let mtfAligned = true;
  if (htf) {
    if (settleHtfConflict(htf, params.side)) {
      mtfAligned = false;
      hardBlockReasons.push(`상위 ${htf.tfKo} 종가 역방향 — ENTER 금지`);
      confluenceDelta -= 10;
    } else if (settleHtfAligned(htf, params.side)) {
      mtfAligned = true;
      boostReasons.push(`상위 ${htf.tfKo} 종가 동조`);
      confluenceDelta += 8;
    } else {
      mtfAligned = false;
      hardBlockReasons.push(`상위 ${htf.tfKo} 종가 미동조 — ENTER 보류`);
      confluenceDelta -= 4;
    }
  }

  if (failAgainst) {
    hardBlockReasons.push(
      row.tailongTag === '꼬리실패'
        ? '종가 꼬리실패 — ENTER 금지'
        : row.formingVerdict === '실패'
          ? '종가 진행실패 — ENTER 금지'
          : '종가 역방향 마감 — ENTER 금지'
    );
    confluenceDelta -= 14;
  }

  if (sealedOk) {
    boostReasons.push(`직전 ${row.tfKo} 마감 우호`);
    confluenceDelta += 8;
  } else if (!failAgainst) {
    hardBlockReasons.push(`직전 ${row.tfKo} 마감 미확정 — ENTER 보류(되돌림만)`);
    confluenceDelta -= 5;
  }

  if (settleFavorsSide(row, params.side) && sealedOk && !failAgainst) {
    boostReasons.push('종가안착·방향 합류');
    confluenceDelta += 4;
  }

  const allowEnter = !failAgainst && sealedOk && mtfAligned;
  const allowPullbackWait = !failAgainst;

  const parts = [
    allowEnter ? '종가게이트 PASS' : '종가게이트 HOLD',
    sealedOk ? '마감OK' : '마감대기',
    htf ? (mtfAligned ? '상위동조' : '상위미동조') : '상위없음',
    failAgainst ? '실패컷' : null,
  ].filter(Boolean);

  return {
    allowEnter,
    allowPullbackWait,
    confluenceDelta: Math.max(-24, Math.min(20, confluenceDelta)),
    hardBlockReasons,
    boostReasons,
    sealedOk,
    mtfAligned,
    failAgainst,
    summaryKo: parts.join(' · '),
  };
}

