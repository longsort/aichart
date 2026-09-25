/**
 * 상단 심볼 선택 드롭다운 후보.
 * 코인: 바이낸스 USDT 현물(+Bybit 폴백). 환율: USDKRW/CNYKRW (Yahoo chart).
 */
export const SYMBOLS = [
  // 환율(FX)
  'USDKRW',
  'CNYKRW',
  // 메이저
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'DOTUSDT',
  'LINKUSDT',
  'TRXUSDT',
  'LTCUSDT',
  'NEARUSDT',
  'TONUSDT',
  'ATOMUSDT',
  'APTUSDT',
  'OPUSDT',
  'ARBUSDT',
  // 밈·커뮤니티(대형 유동성 위주)
  'DOGEUSDT',
  'SHIBUSDT',
  'PEPEUSDT',
  'WIFUSDT',
  'FLOKIUSDT',
  'BONKUSDT',
  // AI·데이터·인프라 등(시총·거래량 큰 종목 위주)
  'FETUSDT',
  'RENDERUSDT',
  'WLDUSDT',
  'TAOUSDT',
  'ARUSDT',
  'GRTUSDT',
  'INJUSDT',
  'SEIUSDT',
  'THETAUSDT',
  'FILUSDT',
];

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];

/** 가늘 → 굵음 (교차 TF 로켓: 현재보다 굵은 차트에서 온 것만 합침) */
export const TIMEFRAME_ORDER = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'] as const;

/** 거래소·쿼리 문자열 차이(대소문자, 240→4h 등)를 TIMEFRAMES 토큰으로 맞춤 */
const CHART_TF_ALIASES: Record<string, string> = {
  '240': '4h',
  '4hr': '4h',
  h4: '4h',
  '60': '1h',
  '60m': '1h',
  '1440': '1d',
  '1day': '1d',
  '10080': '1w',
  '43200': '1M',
  '1mo': '1M',
};

export function normalizeChartTimeframe(tf: string): string {
  const raw = String(tf ?? '').trim();
  if (!raw) return '';
  /** 1M(월) vs 1m(분) — 대소문자 구분 토큰 우선 */
  const exact = TIMEFRAMES.find((x) => x === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase();
  if (CHART_TF_ALIASES[lower]) return CHART_TF_ALIASES[lower];
  const hit = TIMEFRAMES.find((x) => x !== '1M' && x.toLowerCase() === lower);
  if (hit) return hit;
  if (lower === '1mo' || lower === '1month') return '1M';
  return raw;
}

/** Binance kline open time (UTC) — 분·시봉 버킷 스냅용 (1d/1w/1M은 Bitget 16:00 UTC 때문에 버킷 생략) */
const CHART_TF_STEP_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
};

/**
 * 갭 메움·공백 제거용 명목 step — 분·시·일·주·월 **공동**.
 * 버킷 스냅(`chartTimeframeStepSeconds`)과 분리: 1d는 자정으로 강제하지 않고 간격만 86400.
 */
const CHART_TF_NOMINAL_STEP_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
  '1w': 604_800,
  /** 월·년은 가변 — sanitize에서 중앙값과 혼합 */
  '1M': 2_592_000,
  '1Y': 31_536_000,
};

export function chartTimeframeStepSeconds(tf: string): number {
  const n = normalizeChartTimeframe(tf);
  return CHART_TF_STEP_SEC[n] ?? 0;
}

/** 전 TF 공통 — 빠진 봉 슬롯 메움·공백(뛰엄뛰엄) 제거용 */
export function chartTimeframeNominalStepSeconds(tf: string): number {
  const n = normalizeChartTimeframe(tf);
  return CHART_TF_NOMINAL_STEP_SEC[n] ?? 0;
}

/** 차트 `timeframe`과 analyze 응답의 `timeframe`을 동일 TF로 볼지(문자열 엄격 비교 금지) */
export function analysisMatchesSymbolAndTf(
  analysis: { symbol?: string; timeframe?: string } | null | undefined,
  symbol: string,
  timeframe: string
): boolean {
  if (!analysis || analysis.symbol !== symbol) return false;
  return normalizeChartTimeframe(String(analysis.timeframe ?? '')) === normalizeChartTimeframe(timeframe);
}

export function timeframeRank(tf: string): number {
  const n = normalizeChartTimeframe(tf);
  const i = TIMEFRAME_ORDER.indexOf(n as (typeof TIMEFRAME_ORDER)[number]);
  return i >= 0 ? i : Math.floor(TIMEFRAME_ORDER.length / 2);
}

/**
 * BOS 리테스트 + (RSI 다이버 정렬 또는 종가 안착) — 모든 TF에서 허용되는 “확정” 계열.
 */
export const STRUCTURE_ROCKET_CONFIRMED_SOURCES = [
  'bos_retest_both',
  'bos_retest_rsi',
  'bos_retest_settlement',
] as const;

/** CHOCH·단순 리테스트·존 — 1m~1w 만 허용(월봉은 봉 수가 적어 동일 로직이 과밀) */
export const STRUCTURE_ROCKET_LOOSE_SOURCES = [
  'struct_choch_break',
  'struct_retest_only',
  'zone_support_bounce',
  'zone_support_break',
  'zone_resist_reject',
  'zone_resist_break',
] as const;

/** rank ≤ 이 인덱스인 TF에서만 loose — 1M·1Y 는 확정(BOS+리테스트/RSI/안착)만 */
const LOOSE_UNTIL_RANK = TIMEFRAME_ORDER.indexOf('1w');

export function structureRocketSourceAllowedForTimeframe(timeframe: string, source: string): boolean {
  if ((STRUCTURE_ROCKET_CONFIRMED_SOURCES as readonly string[]).includes(source)) return true;
  const rank = timeframeRank(timeframe);
  if (rank <= LOOSE_UNTIL_RANK) {
    return (STRUCTURE_ROCKET_LOOSE_SOURCES as readonly string[]).includes(source);
  }
  return false;
}

/** 병합 후 structureRocketSignals 최대 개수 (TF별) — 달봉은 봉 수·가로 넓이 대비 희소하게 */
export function structureRocketMergeMax(timeframe: string): number {
  const m: Record<string, number> = {
    '1m': 52,
    '3m': 50,
    '5m': 48,
    '15m': 44,
    '1h': 40,
    '4h': 32,
    '1d': 38,
    '1w': 30,
    '1M': 10,
    '1Y': 10,
  };
  return m[timeframe] ?? 36;
}

/** analyze 내부 후보 상한 — 굵은 TF에서 존/CHOCH 스캔량 자체를 줄임 */
export function structureRocketBuilderBudget(timeframe: string): {
  mergeMax: number;
  bosRocketMax: number;
  candleMax: number;
  zoneMax: number;
} {
  const mergeMax = structureRocketMergeMax(timeframe);
  const m: Record<string, { b: number; c: number; z: number }> = {
    '1m': { b: 26, c: 22, z: 44 },
    '3m': { b: 26, c: 22, z: 42 },
    '5m': { b: 24, c: 20, z: 40 },
    '15m': { b: 22, c: 20, z: 36 },
    '1h': { b: 20, c: 18, z: 32 },
    '4h': { b: 16, c: 14, z: 24 },
    '1d': { b: 22, c: 16, z: 30 },
    '1w': { b: 18, c: 14, z: 24 },
    '1M': { b: 6, c: 4, z: 6 },
    '1Y': { b: 6, c: 4, z: 4 },
  };
  const row = m[timeframe] ?? { b: 18, c: 14, z: 28 };
  return { mergeMax, bosRocketMax: row.b, candleMax: row.c, zoneMax: row.z };
}

/** 고래·기관 zone 표시 가격 구간 (캔들 구간 무관, 120k ~ 8k 고정) */
export const ZONE_PRICE_CEIL = 120_000;
export const ZONE_PRICE_FLOOR = 8_000;

/** RSI 다이버전스: TF 미지정 폴백 L/S 점수 (대부분 `divergenceSignalEngine`의 lsThresholdsByTf 사용) */
export const RSI_SWING_LS_THRESHOLD = 80;
/** RSI 다이버전스: TF 미지정 폴백 WATCH 최소 점수 */
export const RSI_SWING_WATCH_THRESHOLD = 60;

/** 각 TF별 분석용 캔들 개수 — 과도한 봉 수는 analyze/패턴비전/학습에서 CPU·메모리 폭증(분 단위 지연) 유발 */
/** 구조 세트업(E/SL/TP) 동시 표시 상한 — 축 라벨 과밀 방지 */
export const STRUCTURE_PRICE_LINES_MAX = 8;

/**
 * true면 차트 캔들 본봉의 Pre3·줄·존 근접·구조 단계·핫존 등 반짝/펄스 색 전부 끔(기본 상승·하락만).
 * 다시 켜려면 false로 바꾸면 됨.
 */
export const CHART_DISABLE_ALL_CANDLE_SPARKLE = true;

/**
 * 15m/1h/4h: 시장 fetch·차트·패턴 예측 maxBars 공통 상한.
 * 15m 전환 시 4k+ 봉이면 HTML 오버레이·lightweight-charts setData가 메인 스레드를 오래 점유 → 상한 추가 축소.
 */
export const MARKET_BARS_3Y: Record<string, number> = {
  '15m': 2_800, // ~29d × 96
  '1h': 960, // ~40d × 24
  '4h': 880, // ~147d × 6
};

/**
 * 분석용 가시 캔들 수 — 스윙·중기 맥락(15m 기준 약 10거래일·상위 TF는 월·분기 단위)에 맞춤.
 * (너무 크면 /api/analyze·패턴 지연 증가 — market fetch 상한과 함께 조정)
 */
export function visibleLimit(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 1440, // ~1일 — 오버레이 map·근접 스캔 비용 완화
    '3m': 1000, // ~2.1일
    '5m': 720, // ~2.5일
    '15m': 400, // ~4.2일 @96 — 15m TF 전환 체감 개선
    '1h': 200, // ~8.3일
    '4h': 340, // ~56일
    /**
     * 분석·오버레이 work 윈도 (차트 전량 히스토리와 분리).
     * 1d/1w/1M 차트 setData는 `/api/market` chart 모드 2017~ 전량.
     */
    '1d': 900, // analyze work
    '1w': 520, // ~10년
    '1M': 200, // 월봉 전량 여유
    '1Y': 24, // 24년(데이터 존재 시)
  };
  const k = normalizeChartTimeframe(timeframe);
  return map[k] ?? 700;
}

/** 상장일~전량 차트 히스토리 TF (1d/1w/1M) */
export function isListingFullHistoryTf(timeframe: string): boolean {
  const k = normalizeChartTimeframe(timeframe);
  return k === '1d' || k === '1w' || k === '1M';
}
