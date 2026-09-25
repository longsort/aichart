/**
 * 통합·분석 진입 하드게이트 — 뉴스창·1D/1W 상충.
 * 확정 수익·승률 아님. ENTER만 막음 (작도·관망은 유지).
 */
export type MergedDeskNewsHintLite = {
  title: string;
  timeMs: number;
};

export type MergedDeskNewsEntryGate = {
  blockEnter: boolean;
  reasonKo: string;
  hoursLeft: number;
};

const HIGH_IMPACT = /cpi|pce|nfp|fomc|payroll|nonfarm|rate decision|fed funds|ppi|gdp/i;

function shortNews(title: string): string {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (/cpi/i.test(t)) return 'CPI';
  if (/pce/i.test(t)) return 'PCE';
  if (/nfp|payroll|nonfarm/i.test(t)) return 'NFP';
  if (/fomc|fed funds|rate decision/i.test(t)) return 'FOMC';
  if (/ppi/i.test(t)) return 'PPI';
  if (/gdp/i.test(t)) return 'GDP';
  return t.slice(0, 12);
}

export function evalMergedDeskNewsEntryGate(
  hint: MergedDeskNewsHintLite | null | undefined,
  now = Date.now()
): MergedDeskNewsEntryGate | null {
  if (!hint || !Number.isFinite(hint.timeMs)) return null;
  const ms = hint.timeMs - now;
  const hours = ms / 3_600_000;
  if (hours < -1.25) return null;
  const impact = HIGH_IMPACT.test(hint.title);
  const windowH = impact ? 8 : 2.5;
  if (hours > windowH) return null;
  const when =
    hours <= 0 ? '진행중' : hours < 1 ? `${Math.max(10, Math.round(hours * 60))}분내` : `${Math.round(hours)}시간내`;
  return {
    blockEnter: true,
    reasonKo: `뉴스창 ${shortNews(hint.title)} ${when} · 진입보류`,
    hoursLeft: hours,
  };
}

export function mergedDeskHtfSplitBlocksEnter(params: {
  mtfAligned?: boolean | null;
  mtfAlignmentScore?: number | null;
}): { block: boolean; reasonKo: string } | null {
  if (params.mtfAligned === false) {
    return { block: true, reasonKo: '1D·1W(MTF) 불일치 · 진입보류' };
  }
  const a = Number(params.mtfAlignmentScore);
  if (Number.isFinite(a) && a < 40) {
    return { block: true, reasonKo: `MTF정렬 ${Math.round(a)} · 진입보류` };
  }
  return null;
}

/** 계좌 잔고 모름 — 1R 비중 참고 문구만 */
export function mergedDeskRiskSizeHintKo(entry: number, stop: number): string {
  if (!(entry > 0) || !(stop > 0)) return '참고 1R≈계좌1% · 확정 아님';
  const dist = (Math.abs(entry - stop) / entry) * 100;
  return `참고 1R≈계좌1% · 가격거리 ${dist.toFixed(2)}% · 확정 아님`;
}
