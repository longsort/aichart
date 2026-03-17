/** TF별 봉 주기(초) - 거래소 정렬 기준 근사 */
const TF_PERIOD_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 15 * 60,
  '1h': 3600,
  '4h': 4 * 3600,
  '1d': 86400,
  '1w': 7 * 86400,
  '1M': 30 * 86400,
  '1Y': 365 * 86400,
};

export type CloseSettlementItem = {
  tf: string;
  label: string;
  /** 진행중 | 거의확정 | 확정 */
  status: '진행중' | '거의확정' | '확정';
  /** 다음 봉 마감까지 남은 초 */
  remainingSec: number;
  /** 직전 봉 종가 마감 품질: 롱에 유리/숏에 유리/중립 */
  goodBad: 'good' | 'bad' | 'neutral';
  /** 직전 봉 양봉/음봉 */
  lastCandleBullish: boolean;
  /** 현재 봉 진행률 0~1 */
  progress: number;
};

/**
 * 기준 시각(초 단위 UTC) 기준으로 각 TF별 다음 봉 마감 시각 계산.
 * 거래소는 보통 0시 UTC 정렬이므로 1d = 00:00 UTC, 1h = 0,1,2,... 정각.
 */
function getNextCloseTime(nowSec: number, periodSec: number): number {
  let currentOpen = Math.floor(nowSec / periodSec) * periodSec;
  let nextClose = currentOpen + periodSec;
  while (nextClose <= nowSec) nextClose += periodSec;
  return nextClose;
}

export function computeCloseSettlement(
  nowSec: number,
  verdict: 'LONG' | 'SHORT' | 'WATCH'
): CloseSettlementItem[] {
  const tfs: Array<{ tf: string; label: string }> = [
    { tf: '15m', label: '15m' },
    { tf: '1h', label: '1h' },
    { tf: '4h', label: '4h' },
    { tf: '1d', label: '1D' },
    { tf: '1w', label: '1W' },
    { tf: '1M', label: '1M' },
  ];
  const result: CloseSettlementItem[] = [];
  for (const { tf, label } of tfs) {
    const periodSec = TF_PERIOD_SEC[tf] ?? 3600;
    const nextClose = getNextCloseTime(nowSec, periodSec);
    const remainingSec = Math.max(0, Math.floor(nextClose - nowSec));
    const currentOpen = nextClose - periodSec;
    const elapsed = nowSec - currentOpen;
    const progress = periodSec > 0 ? elapsed / periodSec : 0;

    let status: '진행중' | '거의확정' | '확정' = '진행중';
    if (remainingSec <= 0) status = '확정';
    else if (progress >= 0.85 || remainingSec <= periodSec * 0.15) status = '거의확정';

    result.push({
      tf,
      label,
      status,
      remainingSec,
      goodBad: 'neutral',
      lastCandleBullish: true,
      progress: Math.min(1, Math.max(0, progress)),
    });
  }
  return result;
}

/**
 * 직전 캔들 OHLC로 해당 TF 종가 마감 품질(좋음/나쁨) 계산.
 * 롱일 때 양봉이면 good, 음봉이면 bad. 숏일 때 반대.
 */
export function setCloseQualityFromCandle(
  items: CloseSettlementItem[],
  lastCandle: { open: number; close: number } | null,
  tf: string,
  verdict: 'LONG' | 'SHORT' | 'WATCH'
): CloseSettlementItem[] {
  if (!lastCandle) return items;
  const bullish = lastCandle.close >= lastCandle.open;
  let goodBad: 'good' | 'bad' | 'neutral' = 'neutral';
  if (verdict === 'LONG') goodBad = bullish ? 'good' : 'bad';
  else if (verdict === 'SHORT') goodBad = !bullish ? 'good' : 'bad';

  return items.map((it) =>
    it.tf === tf ? { ...it, goodBad, lastCandleBullish: bullish } : it
  );
}

/**
 * 서버/클라이언트 현재 시각(초)과 캔들 데이터로 종가마감 보드용 배열 생성.
 * 현재 분석 중인 TF의 직전 봉으로 goodBad 설정.
 */
export function buildCloseSettlementBoard(
  nowSec: number,
  verdict: 'LONG' | 'SHORT' | 'WATCH',
  lastCandleByTf?: Record<string, { open: number; close: number }>
): CloseSettlementItem[] {
  let items = computeCloseSettlement(nowSec, verdict);
  if (lastCandleByTf) {
    for (const tf of ['15m', '1h', '4h', '1d', '1w', '1M']) {
      const last = lastCandleByTf[tf];
      if (last) items = setCloseQualityFromCandle(items, last, tf, verdict);
    }
  }
  return items;
}
