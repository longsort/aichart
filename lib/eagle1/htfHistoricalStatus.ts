/**
 * Phase 2 — HTF Historical 상태.
 * fs/CSV 직접 접근 없음 (클라이언트 번들·Turbopack TP1004 방지).
 * coverage sidecar 요약(analyze/pipeline 입력)만 사용. 빈 봉 날조 금지.
 */

export type HtfTf = '1M' | '1W' | '1D' | '12H' | '4H' | '1H' | '15m' | '5m' | '1m';

export type HtfCoverageRow = {
  tf: HtfTf;
  rows: number;
  gaps: number;
  bytes: number;
  firstIso: string | null;
  lastIso: string | null;
  status: 'ok' | 'thin' | 'missing' | '통계 부족';
  note: string;
};

export type HtfHistoricalStatus = {
  rows: HtfCoverageRow[];
  priorityDownload: HtfTf[];
  summaryKo: string;
  blockConfirmedHint: boolean;
};

export type HtfCoverageInput = {
  tf: string;
  rows: number;
  gaps: number;
  firstIso?: string | null;
  lastIso?: string | null;
  bytes?: number;
};

const HTF_ORDER: HtfTf[] = ['1M', '1W', '1D', '12H', '4H', '1H', '15m', '5m', '1m'];

const MIN_ROWS: Record<HtfTf, number> = {
  '1M': 24,
  '1W': 52,
  '1D': 180,
  '12H': 120,
  '4H': 200,
  '1H': 300,
  '15m': 400,
  '5m': 500,
  '1m': 500,
};

function asHtf(tf: string): HtfTf | null {
  const t = String(tf || '').trim();
  return (HTF_ORDER as string[]).includes(t) ? (t as HtfTf) : null;
}

export function runHtfHistoricalStatus(params: {
  symbol?: string;
  /** analyze/pipeline이 이미 읽은 coverage 요약 — 여기서 fs 안 씀 */
  coverage?: HtfCoverageInput[] | null;
}): HtfHistoricalStatus {
  void params.symbol;
  const byTf = new Map<string, HtfCoverageInput>();
  for (const c of params.coverage ?? []) {
    const tf = asHtf(c.tf);
    if (tf) byTf.set(tf, c);
  }

  const rows: HtfCoverageRow[] = HTF_ORDER.map((tf) => {
    const lite = byTf.get(tf);
    const n = lite?.rows ?? 0;
    const gaps = lite?.gaps ?? 0;
    const bytes = lite?.bytes ?? 0;
    let status: HtfCoverageRow['status'] = 'missing';
    let note = '커버리지 없음 · 다운로드 필요';
    if (n <= 0 && bytes <= 0) {
      status = 'missing';
    } else if (n > 0 && n < MIN_ROWS[tf]) {
      status = 'thin';
      note = `봉 ${n} < 권장 ${MIN_ROWS[tf]} · 보강 필요`;
    } else if (n >= MIN_ROWS[tf]) {
      status = gaps > Math.max(20, Math.floor(n * 0.05)) ? 'thin' : 'ok';
      note = status === 'ok' ? `봉 ${n} · gap ${gaps}` : `봉 ${n} · gap 많음 ${gaps}`;
    } else if (bytes > 0 && n === 0) {
      status = '통계 부족';
      note = 'CSV 메타만 · coverage row 없음';
    }
    return {
      tf,
      rows: n,
      gaps,
      bytes,
      firstIso: lite?.firstIso ?? null,
      lastIso: lite?.lastIso ?? null,
      status,
      note,
    };
  });

  const priorityDownload = rows
    .filter((r) => r.status === 'missing' || r.status === 'thin' || r.status === '통계 부족')
    .map((r) => r.tf);

  const htfBad = rows
    .filter((r) => ['1M', '1W', '1D', '4H'].includes(r.tf))
    .some((r) => r.status === 'missing');

  const summaryKo = priorityDownload.length
    ? `HTF 보강 필요 · ${priorityDownload.slice(0, 4).join(', ')}`
    : 'HTF 커버리지 양호';

  return {
    rows,
    priorityDownload,
    summaryKo,
    blockConfirmedHint: htfBad,
  };
}

export function htfToBitgetGranularity(tf: HtfTf): string {
  return tf;
}
