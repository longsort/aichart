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

export function timeframePeriodSec(tf: string): number {
  return TF_PERIOD_SEC[tf] ?? 3600;
}

/** 차트 캔들 소스 — 통합·분석 USDT 선물은 bitget 기본 (알트 포함), 환율은 forex */
export type CandleCloseExchange = 'binance' | 'bitget';

/** Bitget USDT-M 일·주·월 시가 = 16:00 UTC (= 한국 01:00) */
const BITGET_HTF_OPEN_HOUR_UTC = 16;

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

function getNextWeeklyCloseTime(nowSec: number): number {
  // 월요일 09:00 KST = 월요일 00:00 UTC (Binance)
  const d = new Date(nowSec * 1000);
  const day = d.getUTCDay(); // 0=Sun,1=Mon
  const daysFromMonday = (day + 6) % 7;
  const weekStartMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysFromMonday,
    0, 0, 0, 0
  );
  const nextWeekStartSec = Math.floor(weekStartMs / 1000) + 7 * 86400;
  return nextWeekStartSec > nowSec ? nextWeekStartSec : nextWeekStartSec + 7 * 86400;
}

function getNextMonthlyCloseTime(nowSec: number): number {
  // 매월 1일 09:00 KST = 1일 00:00 UTC (Binance)
  const d = new Date(nowSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const nextMonthStart = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
  return Math.floor(nextMonthStart / 1000);
}

function getNextYearlyCloseTime(nowSec: number): number {
  // 1/1 09:00 KST = 1/1 00:00 UTC
  const d = new Date(nowSec * 1000);
  const y = d.getUTCFullYear();
  const nextYearStart = Date.UTC(y + 1, 0, 1, 0, 0, 0, 0);
  return Math.floor(nextYearStart / 1000);
}

/** 매일 09:00 KST (= UTC 00:00) — Binance */
function getNextDailyCloseTimeUtc(nowSec: number): number {
  const open = Math.floor(nowSec / 86400) * 86400;
  return open + 86400;
}

/** Bitget 일봉 마감 = 다음 16:00 UTC */
function getNextBitgetDailyCloseSec(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  let close =
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      BITGET_HTF_OPEN_HOUR_UTC,
      0,
      0,
      0
    ) / 1000;
  if (close <= nowSec) close += 86400;
  return close;
}

/** Bitget 주봉 마감 = 다음 월요일 16:00 UTC */
function getNextBitgetWeeklyCloseSec(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const day = d.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  let weekOpen =
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - daysFromMonday,
      BITGET_HTF_OPEN_HOUR_UTC,
      0,
      0,
      0
    ) / 1000;
  if (nowSec < weekOpen) return weekOpen;
  return weekOpen + 7 * 86400;
}

/** Bitget 월봉 마감 = 다음 달 1일 16:00 UTC */
function getNextBitgetMonthlyCloseSec(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const thisOpen =
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      1,
      BITGET_HTF_OPEN_HOUR_UTC,
      0,
      0,
      0
    ) / 1000;
  if (nowSec < thisOpen) return thisOpen;
  return (
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      1,
      BITGET_HTF_OPEN_HOUR_UTC,
      0,
      0,
      0
    ) / 1000
  );
}

/** 분·시·4h: 거래소 UTC period 정렬 */
function nextUtcPeriodCloseSec(nowSec: number, periodSec: number): number {
  const open = Math.floor(nowSec / periodSec) * periodSec;
  return open + periodSec;
}

/**
 * TF 칩·차트 타이머 봉 마감 — **거래소식**.
 * - 분·시·4h: UTC period (Bitget·Binance 공통, 4h 첫 세션 = KST 09:00)
 * - Binance 1d/1w/1M: 09:00 KST (= UTC 00:00)
 * - Bitget 1d/1w/1M: 16:00 UTC (= 한국 01:00) — USDT-M 선물 시가
 */
export function nextCandleCloseUnixSec(
  nowSec: number,
  tf: string,
  exchange: CandleCloseExchange = 'binance'
): number {
  if (exchange === 'bitget') {
    if (tf === '1d') return getNextBitgetDailyCloseSec(nowSec);
    if (tf === '1w') return getNextBitgetWeeklyCloseSec(nowSec);
    if (tf === '1M') return getNextBitgetMonthlyCloseSec(nowSec);
    if (tf === '1Y') return getNextYearlyCloseTime(nowSec);
    return nextUtcPeriodCloseSec(nowSec, timeframePeriodSec(tf));
  }
  if (tf === '1d') return getNextDailyCloseTimeUtc(nowSec);
  if (tf === '1w') return getNextWeeklyCloseTime(nowSec);
  if (tf === '1M') return getNextMonthlyCloseTime(nowSec);
  if (tf === '1Y') return getNextYearlyCloseTime(nowSec);
  return nextUtcPeriodCloseSec(nowSec, timeframePeriodSec(tf));
}

export function candleCloseRemainSec(
  nowSec: number,
  tf: string,
  exchange: CandleCloseExchange = 'binance'
): number {
  return Math.max(0, Math.floor(nextCandleCloseUnixSec(nowSec, tf, exchange) - nowSec));
}

export function candleCloseSessionTipKo(exchange: CandleCloseExchange = 'binance'): string {
  if (exchange === 'bitget') {
    return 'Bitget 선물 · 일·주·월 시가 16:00 UTC(한국 01:00) · 분·시·4h UTC격자';
  }
  return 'Binance · 일·주·월 09:00 KST · 분·시·4h UTC격자';
}

/** UI용: 3:42 · 1:12:05 · 2d 5h */
export function formatCandleCloseRemain(remainSec: number): string {
  const s = Math.max(0, Math.floor(remainSec));
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

/**
 * 종가마감 보드용(기존): 주·월은 Binance UTC 00:00, 일은 period 정렬.
 * TF 칩 카운트다운은 `nextCandleCloseUnixSec` 사용.
 */
function getNextCloseTime(nowSec: number, tf: string, periodSec: number): number {
  if (tf === '1w') return getNextWeeklyCloseTime(nowSec);
  if (tf === '1M') return getNextMonthlyCloseTime(nowSec);
  if (tf === '1Y') return getNextYearlyCloseTime(nowSec);
  const currentOpen = Math.floor(nowSec / periodSec) * periodSec;
  const nextClose = currentOpen + periodSec;
  return nextClose > nowSec ? nextClose : nextClose + periodSec;
}

export function computeCloseSettlement(
  nowSec: number,
  verdict: 'LONG' | 'SHORT' | 'WATCH'
): CloseSettlementItem[] {
  const tfs: Array<{ tf: string; label: string }> = [
    { tf: '1m', label: '1m' },
    { tf: '5m', label: '5m' },
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
    const nextClose = getNextCloseTime(nowSec, tf, periodSec);
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
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']) {
      const last = lastCandleByTf[tf];
      if (last) items = setCloseQualityFromCandle(items, last, tf, verdict);
    }
  }
  return items;
}
