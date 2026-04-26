/**
 * 눌림(핫존) 작도 모드 — 교육·참고용 휴리스틱.
 * OHLCV로 피보·눌림 구간·TP/SL·예상 파동 경로를 근사합니다. 투자 권유·고정 승률 없음.
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries, rsi } from '@/lib/indicators';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import { normalizeChartTimeframe, TIMEFRAME_ORDER } from '@/lib/constants';

/** 참고 이미지 하단 — 눌림 구간에서 볼 캔들 휴리스틱(교육용) */
export type HotZoneCandleLegendItem = { icon: string; title: string; detail: string };

/** 미니 차트 가격선용 */
export type HotZoneKeyLevels = {
  swingLow: number;
  swingHigh: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
};

export type PullbackHotZonePack = {
  /** 정규화된 차트 TF (1m~1Y) */
  chartTf: string;
  /** 상단 타이틀 보조 (심볼) */
  displaySymbol: string;
  overlays: OverlayItem[];
  /** HUD 우측 요약표 */
  strategyRows: Array<{ label: string; value: string }>;
  /** 시나리오 단계 (이미지 하단 패널 스타일) */
  scenarioLines: string[];
  /** MTF 스트립과 동일 순서의 TF별 엔진 요약(차트 존·피보와 별개) */
  mtfRows: Array<{ tf: string; verdict: string; confidence: number }>;
  /** 캔들 시그널 범례(4칸) */
  candleLegend: HotZoneCandleLegendItem[];
  /** 예상 파동 단계 (번호 1~5) */
  waveSteps: string[];
  /** 우측 카드 — 진입 */
  entryCardLines: string[];
  /** 우측 카드 — 목표 */
  tpCardLines: string[];
  /** 우측 카드 — 리스크 */
  riskBullets: string[];
  /** 1D/1W 미니 차트 가격선 */
  keyLevels: HotZoneKeyLevels | null;
  /** 핫 캔들(●)로 표시된 봉 time — 차트 캔들 본봉 강조색 연동용 */
  hotCandleTimes: number[];
  rsiNote: string;
  volumeNote: string;
  biasNote: string;
  legendLines: string[];
};

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function smaAt(values: number[], period: number, i: number): number {
  if (i < period - 1) return values[i];
  let s = 0;
  for (let k = i - period + 1; k <= i; k++) s += values[k];
  return s / period;
}

/** 긴 하단 꼬리 (핀바 근사) */
function longLowerWickRatio(c: Candle): { ratio: number; body: number; lower: number } {
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  const denom = body > 1e-12 * Math.max(1, c.close) ? body : Math.max(lower, upper, 1e-12);
  return { ratio: lower / denom, body, lower };
}

function retracementPrice(high: number, low: number, ratioFromLow: number): number {
  return low + ratioFromLow * (high - low);
}

/** 핫 캔들 가중 점수 — long-tail(0.40) + vol-spike(0.35) + 다음봉 양봉 추격(0.25) */
type HotCandle = {
  index: number;
  time: number;
  low: number;
  high: number;
  close: number;
  score: number;
  pin: number;
  vol: number;
  follow: number;
  tag: string;
};

function detectHotCandles(
  arr: Candle[],
  vols: number[],
  scanN: number
): HotCandle[] {
  const out: HotCandle[] = [];
  const start = Math.max(1, arr.length - scanN);
  for (let i = start; i < arr.length; i++) {
    const cur = arr[i];
    const { ratio } = longLowerWickRatio(cur);
    const vm = smaAt(vols, 20, i);
    const volRatio = vm > 0 ? (cur.volume || 0) / vm : 1;
    const nxt = i + 1 < arr.length ? arr[i + 1] : null;
    const prevClose = arr[i - 1].close;
    const followBull = nxt
      ? nxt.close > nxt.open && nxt.close > prevClose
        ? 1
        : 0
      : cur.close > cur.open && cur.close > prevClose
        ? 0.6
        : 0;
    const pinScore = Math.min(1, Math.max(0, (ratio - 1.1) / 1.4));
    const volScore = Math.min(1, Math.max(0, (volRatio - 1.2) / 1.3));
    const score = pinScore * 0.4 + volScore * 0.35 + followBull * 0.25;
    /** 문서 예시는 합계 >0.7 을 ‘핫’으로 둠 — 약한 신호는 0.52 미만 제외 */
    if (score < 0.52) continue;
    const tagParts: string[] = [];
    if (pinScore >= 0.5) tagParts.push('핀바');
    if (volScore >= 0.5) tagParts.push('거래량');
    if (followBull >= 0.6) tagParts.push('추격');
    out.push({
      index: i,
      time: Number(cur.time),
      low: cur.low,
      high: cur.high,
      close: cur.close,
      score,
      pin: pinScore,
      vol: volScore,
      follow: followBull,
      tag: tagParts.join('·') || '관심',
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** 저점 피벗 → 클러스터 박스 (최소 N회 터치)
 *  가중치: touches(0.5) + MA 밀집(0.3) + 거래량(0.2) */
type LowCluster = {
  top: number;
  bot: number;
  mid: number;
  touches: number;
  confidence: number;
  times: number[];
};

function findLowCluster(
  arr: Candle[],
  atrLast: number,
  ma5: number,
  ma10: number,
  ma20: number,
  avgVolRatio: number
): LowCluster | null {
  const piv: { t: number; p: number; volR: number }[] = [];
  const look = 3;
  const volsLocal = arr.map((c) => c.volume || 0);
  for (let i = look; i < arr.length - look; i++) {
    let isPiv = true;
    for (let k = 1; k <= look; k++) {
      if (arr[i - k].low < arr[i].low || arr[i + k].low < arr[i].low) {
        isPiv = false;
        break;
      }
    }
    if (!isPiv) continue;
    const vm = smaAt(volsLocal, 20, i);
    piv.push({ t: Number(arr[i].time), p: arr[i].low, volR: vm > 0 ? volsLocal[i] / vm : 1 });
  }
  if (piv.length < 3) return null;
  const tol = Math.max(atrLast * 0.9, arr[arr.length - 1].close * 0.006);
  let best: LowCluster | null = null;
  for (let i = 0; i < piv.length; i++) {
    const anchor = piv[i].p;
    const mates = piv.filter((p) => Math.abs(p.p - anchor) <= tol);
    if (mates.length < 3) continue;
    const top = Math.max(...mates.map((m) => m.p)) + tol * 0.35;
    const bot = Math.min(...mates.map((m) => m.p)) - tol * 0.35;
    const mid = (top + bot) / 2;
    const touchScore = Math.min(1, mates.length / 5) * 0.5;
    const maSpread = Math.max(ma5, ma10, ma20) - Math.min(ma5, ma10, ma20);
    const maTight = maSpread > 0 ? Math.min(1, (atrLast * 1.2) / Math.max(maSpread, 1e-9)) : 0.5;
    const maClusterScore = maTight * 0.3;
    const volAvg = mates.reduce((s, m) => s + m.volR, 0) / mates.length;
    const volScore = Math.min(1, Math.max(0, (volAvg + avgVolRatio) / 2 / 1.6)) * 0.2;
    const conf = Math.round((touchScore + maClusterScore + volScore) * 100);
    if (!best || conf > best.confidence) {
      best = {
        top,
        bot,
        mid,
        touches: mates.length,
        confidence: conf,
        times: mates.map((m) => m.t),
      };
    }
  }
  return best;
}

function sortMtfRows(
  rows: Array<{ tf: string; verdict: string; confidence: number }>
): Array<{ tf: string; verdict: string; confidence: number }> {
  const order = TIMEFRAME_ORDER as readonly string[];
  return [...rows].sort((a, b) => {
    const ia = order.indexOf(normalizeChartTimeframe(a.tf));
    const ib = order.indexOf(normalizeChartTimeframe(b.tf));
    const ra = ia >= 0 ? ia : 999;
    const rb = ib >= 0 ? ib : 999;
    if (ra !== rb) return ra - rb;
    return String(a.tf).localeCompare(String(b.tf));
  });
}

export function buildPullbackHotZonePack(params: {
  candles: Candle[];
  timeframe: string;
  symbol: string;
  /** 홈 MTF 스트립과 동기 — 각 TF별 엔진 verdict(차트 핫존 오버레이와 별개) */
  mtfSignals?: Array<{ tf: string; verdict: string; confidence: number; signalTime?: number | null }>;
  /** 기본 40 — 1W 미니 차트 등 짧은 히스토리에서만 낮출 것 */
  minBars?: number;
}): PullbackHotZonePack {
  const { candles, timeframe, symbol, mtfSignals, minBars = 40 } = params;
  const chartTf = normalizeChartTimeframe(timeframe) || String(timeframe || '').trim() || '—';
  const mtfRowsSorted = sortMtfRows(
    (mtfSignals ?? []).map((m) => ({
      tf: normalizeChartTimeframe(m.tf) || m.tf,
      verdict: String(m.verdict ?? 'WATCH'),
      confidence: Number(m.confidence) || 0,
    }))
  );

  const empty = (): PullbackHotZonePack => ({
    chartTf,
    displaySymbol: symbol.includes('/') ? symbol : symbol.replace(/USDT$/i, '/USDT'),
    overlays: [],
    strategyRows: [{ label: '상태', value: `캔들 부족 (최소 약 ${minBars}봉)` }],
    scenarioLines: ['데이터를 불러오면 눌림·피보 구간이 표시됩니다.'],
    mtfRows: mtfRowsSorted,
    candleLegend: [],
    waveSteps: [],
    entryCardLines: [],
    tpCardLines: [],
    riskBullets: [],
    keyLevels: null,
    hotCandleTimes: [],
    rsiNote: '—',
    volumeNote: '—',
    biasNote: '—',
    legendLines: [],
  });
  if (!candles?.length || candles.length < minBars) return empty();

  const lastAll = candles[candles.length - 1];
  const tProbe = Number(lastAll.time);
  const barSec = candleBarDurationSec(chartTf, tProbe) || 3600;
  /** 약 8주 일봉 분량을 TF 봉 수로 환산 — 1m~1Y 전 TF에서 동일 '시간 폭' 감각 */
  const focusDays = 56;
  let lookWanted = Math.round((focusDays * 86400) / Math.max(1, barSec));
  lookWanted = Math.max(50, Math.min(800, lookWanted));
  const lookback = Math.min(lookWanted, candles.length);
  const arr = candles.slice(-lookback);
  const tStart = Number(arr[0].time);
  const last = arr[arr.length - 1];
  const tLast = Number(last.time);
  const tEnd = tLast + Math.round(22 * barSec);

  let recentHigh = -Infinity;
  let recentLow = Infinity;
  for (const c of arr) {
    recentHigh = Math.max(recentHigh, c.high);
    recentLow = Math.min(recentLow, c.low);
  }
  const range = Math.max(1e-12 * Math.max(recentHigh, 1), recentHigh - recentLow);
  const mid = (recentHigh + recentLow) / 2;
  const lastClose = last.close;
  const inUpperHalf = lastClose >= mid;

  const atr = atrSeries(arr, 14);
  const atrLast = atr[atr.length - 1] || range * 0.02;
  const rsiArr = rsi(arr, 14);
  const rsiLast = rsiArr[rsiArr.length - 1] ?? 50;

  const closes = arr.map((c) => c.close);
  const ma5 = smaAt(closes, 5, closes.length - 1);
  const ma10 = smaAt(closes, 10, closes.length - 1);
  const ma20 = smaAt(closes, 20, closes.length - 1);

  const vols = arr.map((c) => c.volume || 0);
  const volMa20 = smaAt(vols, 20, vols.length - 1);
  const volLast = last.volume || 0;
  const volRatio = volMa20 > 0 ? volLast / volMa20 : 1;

  /** 롱 눌림 전제: 최근 박스 내 상단에 있으면 "고점 부근 조정" 문맥 */
  const biasLongContext = inUpperHalf || lastClose > retracementPrice(recentHigh, recentLow, 0.5);

  const fibRatios = [0.382, 0.5, 0.618, 0.786];
  const fibPrices = fibRatios.map((r) => retracementPrice(recentHigh, recentLow, r));

  const band = (center: number, fracOfRange: number): { top: number; bot: number } => {
    const half = Math.max(range * fracOfRange * 0.5, atrLast * 0.35);
    return { top: center + half, bot: center - half };
  };

  const supplyBand = { top: recentHigh, bot: Math.max(recentLow, recentHigh - range * 0.12) };
  const coreBand = { top: Math.min(recentHigh, recentLow + range * 0.08), bot: recentLow };

  const p1 = band(fibPrices[0], 0.11);
  const p2 = band(fibPrices[1], 0.11);
  const p3 = band(fibPrices[2], 0.12);

  const stopRaw = recentLow - Math.max(atrLast * 1.6, range * 0.04);
  const stop = Math.max(stopRaw, recentLow * 0.85);

  const tp1 = lastClose + (recentHigh - lastClose) * 0.38;
  const tp2 = lastClose + (recentHigh - lastClose) * 0.62;
  const tp3 = recentHigh + range * 0.14;

  const overlays: OverlayItem[] = [];

  const pushZone = (
    id: string,
    top: number,
    bot: number,
    label: string,
    color: string,
    lineLabelColor: string,
    kind: 'supplyZone' | 'demandZone' | 'zone' = 'zone',
  ) => {
    overlays.push({
      id: `phz-${symbol}-${chartTf}-${id}`,
      kind,
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tStart,
      time2: tEnd,
      price1: top,
      price2: bot,
      confidence: 58,
      color,
      lineLabelColor,
      category: 'zones',
      labelTooltip: `${label} — 참고용 근사 구간 (자동)`,
    });
  };

  /** 면 알파 낮춤 — 레퍼런스: 상단 저항(적) · 연두 눌림매수 · 진녹 코어 누적 */
  pushZone(
    'supply',
    supplyBand.top,
    supplyBand.bot,
    '단기 저항·거래량(상단)',
    'rgba(239,68,68,0.11)',
    '#f87171',
    'supplyZone',
  );
  pushZone(
    'pull-1',
    p1.top,
    p1.bot,
    '눌림 매수 존(1차)',
    'rgba(74,222,128,0.11)',
    '#4ade80',
    'demandZone',
  );
  pushZone('pull-2', p2.top, p2.bot, '눌림 2차(피보)', 'rgba(59,130,246,0.09)', '#60a5fa', 'demandZone');
  pushZone('pull-3', p3.top, p3.bot, '눌림 3차(피보)', 'rgba(37,99,235,0.1)', '#3b82f6', 'demandZone');
  pushZone(
    'core',
    coreBand.top,
    coreBand.bot,
    '강한 누적·코어 지지',
    'rgba(21,128,61,0.12)',
    '#22c55e',
    'demandZone',
  );

  const pushFib = (ratio: number, dashed: boolean) => {
    const p = retracementPrice(recentHigh, recentLow, ratio);
    overlays.push({
      id: `phz-fib-${String(ratio).replace('.', '-')}-${chartTf}-${symbol}`,
      kind: 'fibLine',
      label: `${ratio}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: p,
      price2: p,
      confidence: 55,
      color: 'rgba(148,163,184,0.28)',
      lineLabelColor: 'rgba(203,213,225,0.65)',
      lineDash: dashed ? '5 5' : undefined,
      lineStrokeWidth: 1,
      category: 'fib',
      noProject: true,
      labelTooltip: `피보 ${ratio} (스윙 ${fmtPrice(recentLow)}–${fmtPrice(recentHigh)})`,
    });
  };
  /** 참고 작도: 0.382 / 0.618 / 0.786 */
  for (const r of [0.382, 0.618, 0.786]) pushFib(r, true);

  overlays.push({
    id: `phz-sl-${chartTf}-${symbol}`,
    kind: 'keyLevel',
    label: `무효화·SL 근사 ${fmtPrice(stop)}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: tStart,
    time2: tEnd,
    price1: stop,
    price2: stop,
    confidence: 52,
    color: 'rgba(244,63,94,0.55)',
    lineLabelColor: '#fb7185',
    lineDash: '4 4',
    category: 'keyLevel',
    noProject: true,
    labelTooltip: '스윙 저점·ATR 하단 근사 — 종가 이탈 시 시나리오 재검토',
  });

  const pushTp = (idx: number, price: number, hint: string) => {
    overlays.push({
      id: `phz-tp${idx}-${chartTf}-${symbol}`,
      kind: 'label',
      label: `TP${idx} ${fmtPrice(price)}`,
      x1: tEnd,
      y1: price,
      time1: tEnd,
      price1: price,
      confidence: 50,
      color: 'rgba(168,85,247,0.9)',
      lineLabelColor: '#c084fc',
      labelBackgroundColor: 'rgba(88,28,135,0.75)',
      labelTextColor: '#f5f3ff',
      category: 'labels',
      labelTooltip: hint,
    });
  };
  pushTp(1, tp1, '단기 되돌림·첫 저항 테스트 근처(근사)');
  pushTp(2, tp2, '스윙 고점 부근(근사)');
  pushTp(3, tp3, '확장·중기 목표(근사)');

  overlays.push({
    id: `phz-ref-${chartTf}-${symbol}`,
    kind: 'label',
    label: `현재 ${fmtPrice(lastClose)}`,
    x1: tLast,
    y1: lastClose,
    time1: tLast,
    price1: lastClose,
    confidence: 60,
    color: 'rgba(15,23,42,0.78)',
    lineLabelColor: '#e2e8f0',
    labelBackgroundColor: 'rgba(15,23,42,0.72)',
    labelTextColor: '#f8fafc',
    category: 'labels',
    labelTooltip: biasLongContext ? '박스 상반부 — 눌림 감시 맥락(참고)' : '박스 하반부 — 반등·눌림 혼재(참고)',
  });

  /** 상승 시나리오 경로(녹색) + 번호 — 참고 이미지 스타일 */
  const tWave0 = tLast - Math.round(22 * barSec);
  const bullPts: { t: number; p: number }[] = [
    { t: tWave0, p: (p3.bot + p3.top) / 2 },
    { t: tLast - Math.round(14 * barSec), p: (p2.bot + p2.top) / 2 },
    { t: tLast - Math.round(5 * barSec), p: Math.max(p1.bot, Math.min(lastClose, p1.top)) },
    { t: tLast + Math.round(4 * barSec), p: tp1 },
    { t: tLast + Math.round(12 * barSec), p: Math.min(tp2, recentHigh * 0.998) },
  ];
  for (let s = 0; s < bullPts.length - 1; s++) {
    overlays.push({
      id: `phz-bullpath-${s}-${chartTf}-${symbol}`,
      kind: 'trendLine',
      label: s === 0 ? '상승 경로(참고)' : '',
      x1: 0,
      y1: 0,
      time1: Math.round(bullPts[s].t),
      price1: bullPts[s].p,
      time2: Math.round(bullPts[s + 1].t),
      price2: bullPts[s + 1].p,
      confidence: 44,
      color: 'rgba(34,197,94,0.72)',
      lineDash: s % 2 === 1 ? '4 4' : undefined,
      lineStrokeWidth: 1.6,
      category: 'labels',
      noProject: true,
    });
  }
  /** 레퍼런스: 녹색 경로 꼭짓점에 1~5 번호(원형 라벨 느낌) */
  const bullStepTips = [
    '① 지지·눌림 구간 반응',
    '② 핫캔들·거래량 확인',
    '③ 눌림 재진입 / 돌파 시도',
    '④ TP1 근처',
    '⑤ TP2·스윙 고점 부근',
  ];
  bullPts.forEach((pt, s) => {
    const n = s + 1;
    overlays.push({
      id: `phz-bullnum-${s}-${chartTf}-${symbol}`,
      kind: 'label',
      label: `${n}`,
      x1: Math.round(pt.t),
      y1: pt.p,
      time1: Math.round(pt.t),
      price1: pt.p,
      confidence: 46,
      color: 'rgba(22,163,74,0.95)',
      lineLabelColor: '#ecfdf5',
      labelBackgroundColor: 'rgba(21,128,61,0.88)',
      labelTextColor: '#ffffff',
      category: 'labels',
      labelTooltip: `${bullStepTips[s] ?? '상승 경로'} — 교육·참고용`,
    });
  });

  /** 약세 대안 경로(적색 점선) — 지지 이탈 시 참고 */
  const bearPts: { t: number; p: number }[] = [
    { t: tLast, p: lastClose },
    { t: tLast + Math.round(8 * barSec), p: (p2.bot + p3.top) / 2 },
    { t: tLast + Math.round(16 * barSec), p: Math.min(stop + atrLast * 0.15, p3.bot) },
  ];
  for (let s = 0; s < bearPts.length - 1; s++) {
    overlays.push({
      id: `phz-bearpath-${s}-${chartTf}-${symbol}`,
      kind: 'trendLine',
      label: s === 0 ? '약세 대안(참고)' : '',
      x1: 0,
      y1: 0,
      time1: Math.round(bearPts[s].t),
      price1: bearPts[s].p,
      time2: Math.round(bearPts[s + 1].t),
      price2: bearPts[s + 1].p,
      confidence: 40,
      color: 'rgba(248,113,113,0.65)',
      lineDash: '5 5',
      lineStrokeWidth: 1.35,
      category: 'labels',
      noProject: true,
    });
  }

  /** 핫 캔들 — 롱 꼬리·거래량 급증·추격봉 가중 점수 (빨강 동그라미) */
  const hotScanN = Math.min(Math.max(18, Math.round(arr.length * 0.12)), arr.length - 1);
  const hotCandles = detectHotCandles(arr, vols, hotScanN).slice(0, 4);
  hotCandles.forEach((hc, idx) => {
    const pct = Math.round(hc.score * 100);
    const tip = `핫 캔들 ${pct}% — 핀${Math.round(hc.pin * 100)}·거래량${Math.round(hc.vol * 100)}·추격${Math.round(hc.follow * 100)} (가중)`;
    overlays.push({
      id: `phz-hot-dot-${hc.time}-${chartTf}-${symbol}`,
      kind: 'label',
      label: '●',
      x1: hc.time,
      y1: hc.low - Math.max(atrLast * 0.35, range * 0.006),
      time1: hc.time,
      price1: hc.low - Math.max(atrLast * 0.35, range * 0.006),
      confidence: 55 + pct / 4,
      color: 'rgba(239,68,68,0.95)',
      lineLabelColor: '#fecaca',
      labelBackgroundColor: 'rgba(239,68,68,0.92)',
      labelTextColor: '#ffffff',
      category: 'labels',
      labelTooltip: tip,
    });
    if (idx === 0) {
      const tier = hc.score >= 0.72 ? '강핫' : hc.score >= 0.62 ? '핫' : '관심';
      overlays.push({
        id: `phz-hot-tag-${hc.time}-${chartTf}-${symbol}`,
        kind: 'label',
        label: `${tier} ${pct}% · ${hc.tag}`,
        x1: hc.time,
        y1: hc.low - Math.max(atrLast * 0.9, range * 0.018),
        time1: hc.time,
        price1: hc.low - Math.max(atrLast * 0.9, range * 0.018),
        confidence: 52,
        color: 'rgba(239,68,68,0.9)',
        lineLabelColor: '#fecaca',
        labelBackgroundColor: 'rgba(127,29,29,0.72)',
        labelTextColor: '#fff5f5',
        category: 'labels',
        labelTooltip: tip,
      });
    }
  });

  /** 저점 피벗 클러스터 Zone — 3회 이상 터치 시 박스로 그려 '눌림 누적 존' 강조 */
  const avgVolRatio = volRatio;
  const cluster = findLowCluster(arr, atrLast, ma5, ma10, ma20, avgVolRatio);
  if (cluster && cluster.touches >= 3) {
    overlays.push({
      id: `phz-cluster-${chartTf}-${symbol}`,
      kind: 'demandZone',
      label: `지지 누적 ${cluster.touches}회 · ${cluster.confidence}%`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: Math.min(...cluster.times),
      time2: tEnd,
      price1: cluster.top,
      price2: cluster.bot,
      confidence: cluster.confidence,
      color: 'rgba(34,197,94,0.14)',
      lineLabelColor: '#4ade80',
      category: 'zones',
      zonePulse: true,
      labelTooltip: `최근 ${arr.length}봉에서 저점 ${cluster.touches}회가 ${fmtPrice(cluster.bot)}–${fmtPrice(cluster.top)} 구간에 누적 (MA 밀집·거래량 가중).`,
    });
  }

  const rsiNote =
    rsiLast >= 70
      ? `RSI(14)≈${rsiLast.toFixed(1)} — 상단권(추격·신규 롱 리스크 참고)`
      : rsiLast <= 30
        ? `RSI(14)≈${rsiLast.toFixed(1)} — 하단권(반등·숏 커버 참고)`
        : `RSI(14)≈${rsiLast.toFixed(1)} — 중립~완만 (${biasLongContext ? '눌림 감시' : '방향 확인'} 참고)`;

  const volumeNote =
    volRatio >= 1.85
      ? `거래량: 최근 봉이 20봉 평균 대비 ${volRatio.toFixed(2)}× — 확인·지속성 필요`
      : `거래량: 최근 봉 / 20봉 평균 ≈ ${volRatio.toFixed(2)}×`;

  const biasNote = biasLongContext
    ? `맥락: 스윙 박스 상반부 — 눌림·재테스트 시나리오 위주(참고). MA5/10/20: ${fmtPrice(ma5)} / ${fmtPrice(ma10)} / ${fmtPrice(ma20)}`
    : `맥락: 스윙 박스 하반부 — 지지·반등 vs 추가 하락 구분 필요. MA5/10/20: ${fmtPrice(ma5)} / ${fmtPrice(ma10)} / ${fmtPrice(ma20)}`;

  const displaySymbol = symbol.includes('/') ? symbol : symbol.replace(/USDT$/i, '/USDT');

  const hotTop = hotCandles[0];

  const candleLegend: HotZoneCandleLegendItem[] = [
    { icon: '●', title: '핫 캔들(빨강 동그라미)', detail: '핀바(0.40) + 거래량급증(0.35) + 추격봉(0.25) 가중 — 합계 ≥ 0.55 표시' },
    { icon: '📍', title: '긴 하단 꼬리', detail: '하방 거절·유동성 스윕 후 반등 힌트(단독 확정 아님)' },
    { icon: '▲', title: '장대 양봉', detail: '종가 강세·매수 압력(이후 봉으로 확인)' },
    { icon: '⋯', title: '저점 클러스터', detail: '같은 가격대에 저점 3회 이상 누적 시 연초록 Zone으로 강조' },
  ];

  const waveSteps = [
    `① 지지 확인 — ${cluster && cluster.touches >= 3 ? `저점 클러스터 ${fmtPrice(cluster.bot)}–${fmtPrice(cluster.top)} (${cluster.touches}회)` : `스윙 저 ${fmtPrice(recentLow)} 부근 반응`}.`,
    `② 반응 — 핫캔들(핀바+거래량+추격봉 가중) 감지 시 ●로 표시. ${hotTop ? `현재 최고 ${Math.round(hotTop.score * 100)}%` : '감지 없음'}.`,
    `③ 눌림 돌파 — 1차 ${fmtPrice(p1.bot)}–${fmtPrice(p1.top)} · 2차 ${fmtPrice(p2.bot)}–${fmtPrice(p2.top)} · 3차 ${fmtPrice(p3.bot)}–${fmtPrice(p3.top)}.`,
    `④ TP1 ${fmtPrice(tp1)} → ⑤ TP2 ${fmtPrice(tp2)} → TP3 ${fmtPrice(tp3)} (근사).`,
    `⊘ 무효화 — ${fmtPrice(stop)} 아래 종가 마감 시 이동경로 무효, 약세 대안 참고.`,
  ];

  const entryCardLines = [
    `눌림 구간에서 분할 관심 (근사): ① ${fmtPrice(p1.bot)}–${fmtPrice(p1.top)} ② ${fmtPrice(p2.bot)}–${fmtPrice(p2.top)} ③ ${fmtPrice(p3.bot)}–${fmtPrice(p3.top)}`,
    `손절(참고): ${fmtPrice(stop)} — 이 가격 **아래** 종가 시 무효화·재평가.`,
    `앱은 **한 면(현재 차트 TF)** 만 그립니다. 일봉+주봉 동시 화면은 상단 MTF로 각각 전환해 비교하세요.`,
  ];

  const tpCardLines = [
    `TP1 (근사): ${fmtPrice(tp1)}`,
    `TP2 (근사): ${fmtPrice(tp2)}`,
    `TP3 / 확장 (근사): ${fmtPrice(tp3)}`,
    `스윙 고점: ${fmtPrice(recentHigh)} — 돌파·안착 여부는 상위 TF와 함께 확인.`,
  ];

  const riskBullets = [
    '저항·공급 위에서 무리한 추격은 변동성 리스크가 큼.',
    '거래량 급증만으로 추세 확정하지 말 것 — 지속성·종가 확인.',
    '자동 박스·경로는 휴리스틱이며 실제 호가·뉴스·상위 TF와 다를 수 있음.',
  ];

  const scenarioLines = [
    `① [차트 TF: ${chartTf}] 존·피보·파동은 **이 TF 캔들만** 사용합니다. 1m·3m·5m·15m·1h·4h·1d·1w·1M·1Y는 상단 MTF 칩으로 바꿀 때마다 이 패널·오버레이가 **해당 TF로 다시 계산**됩니다.`,
    `② 현재가 ${fmtPrice(lastClose)} 기준 — 상단 공급 존 ${fmtPrice(supplyBand.bot)}–${fmtPrice(supplyBand.top)} 부근은 되돌림·청산 참고.`,
    `③ 눌림 분할 관심: 1차 ${fmtPrice(p1.bot)}–${fmtPrice(p1.top)}, 2차 ${fmtPrice(p2.bot)}–${fmtPrice(p2.top)}, 3차 ${fmtPrice(p3.bot)}–${fmtPrice(p3.top)} (자동 근사).`,
    `④ 목표(근사): TP1 ${fmtPrice(tp1)} → TP2 ${fmtPrice(tp2)} → TP3 ${fmtPrice(tp3)}. 무효화·SL 참고 ${fmtPrice(stop)} 아래 종가 이탈 시 시나리오 재점검.`,
    `⑤ 상위 TF·뉴스·유동성 확인 필수 — 아래 MTF 표는 엔진 요약이며 차트 박스와 숫자가 다를 수 있습니다.`,
  ];

  const strategyRows: Array<{ label: string; value: string }> = [
    { label: '심볼·차트 TF', value: `${symbol} · ${chartTf} (봉 길이·lookback TF 반영)` },
    { label: '스윙 박스', value: `${fmtPrice(recentLow)} – ${fmtPrice(recentHigh)}` },
    { label: '진입 1차', value: `${fmtPrice(p1.bot)} – ${fmtPrice(p1.top)}` },
    { label: '진입 2차', value: `${fmtPrice(p2.bot)} – ${fmtPrice(p2.top)}` },
    { label: '진입 3차', value: `${fmtPrice(p3.bot)} – ${fmtPrice(p3.top)}` },
    { label: '손절(참고)', value: `${fmtPrice(stop)} (종가 기준 이탈 시 재검토)` },
    { label: 'TP1 / TP2 / TP3', value: `${fmtPrice(tp1)} / ${fmtPrice(tp2)} / ${fmtPrice(tp3)}` },
  ];

  const hotLine = hotTop
    ? `핫캔들 최고점수 ${Math.round(hotTop.score * 100)}% (핀 ${Math.round(hotTop.pin * 100)}·거래량 ${Math.round(hotTop.vol * 100)}·추격 ${Math.round(hotTop.follow * 100)}) @ ${fmtPrice(hotTop.close)}`
    : '핫캔들: 최근 스캔 구간에서 가중점수 0.52 이상 없음';
  const clusterLine = cluster && cluster.touches >= 3
    ? `저점 클러스터: ${cluster.touches}회 터치 · ${fmtPrice(cluster.bot)}–${fmtPrice(cluster.top)} (신뢰 ${cluster.confidence}%)`
    : '저점 클러스터: 3회 이상 터치 누적 미감지';

  const legendLines = [
    `차트 TF ${chartTf} — 녹색 실선+번호: 상승 이동경로 · 적색 점선: 약세 대안`,
    '적색 면: 단기 저항 · 연두 면: 눌림 매수(1차) · 파랑 면: 눌림 2~3차 · 진녹 면: 코어 누적 · 연초록 면: 저점 클러스터',
    '빨강 동그라미 ●: 핫 캔들 (핀바+거래량+추격봉 가중 점수)',
    '보라 라벨: TP · 회색 점선: 피보(0.382·0.618·0.786) · 적색 점선: SL 근사',
    hotLine,
    clusterLine,
  ];

  return {
    chartTf,
    displaySymbol,
    overlays,
    strategyRows,
    scenarioLines,
    mtfRows: mtfRowsSorted,
    candleLegend,
    waveSteps,
    entryCardLines,
    tpCardLines,
    riskBullets,
    keyLevels: {
      swingLow: recentLow,
      swingHigh: recentHigh,
      stop,
      tp1,
      tp2,
      tp3,
    },
    hotCandleTimes: hotCandles.map((hc) => Number(hc.time)),
    rsiNote,
    volumeNote,
    biasNote,
    legendLines,
  };
}
