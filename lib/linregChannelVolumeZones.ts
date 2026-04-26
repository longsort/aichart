/**
 * LinReg 대밴드 **안**에서의 거래량 분포·돌파 맥락, 하단 **반복 접촉** 누적 구간을 존으로 표시.
 * 확정 매매·고정 승률 아님 — 사후 해석용 휴리스틱.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { computeLinRegLargeChannelBounds } from '@/lib/parkfLinregTrendlineEngine';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

const CAT: OverlayItem['category'] = 'smcDesk';

function recentStructureHints(overlays: OverlayItem[], lastTime: number, timeframe: string, lookbackBars: number): string[] {
  const barSec = candleBarDurationSec(timeframe, lastTime);
  const winMs = lookbackBars * barSec * 1000;
  const tMin = lastTime - winMs;
  const candidates = overlays.filter((o) => {
    const k = String(o.kind || '');
    if (k !== 'bos' && k !== 'choch') return false;
    const t1 = o.time1;
    return typeof t1 === 'number' && t1 >= tMin && t1 <= lastTime;
  });
  candidates.sort((a, b) => (b.time1 ?? 0) - (a.time1 ?? 0));
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const o of candidates) {
    const k = String(o.kind || '');
    const tag = k === 'bos' ? 'BOS' : 'CHOCH';
    const lab = String(o.label || '').slice(0, 28);
    const line = lab ? `${tag}: ${lab}` : tag;
    if (!seen.has(line)) {
      seen.add(line);
      hints.push(line);
    }
    if (hints.length >= 2) break;
  }
  return hints;
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return '–';
  return `${(x * 100).toFixed(0)}%`;
}

function fmtRatio(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return '–';
  return `${x.toFixed(2)}×`;
}

/** 바이낸스 등 kline[9] — 있으면 봉별 테이커 매수 비중(체결 방향 근사) */
function takerBuyRatio(c: Candle): number | null {
  const v = c.volume ?? 0;
  const tb = c.takerBuyBaseVolume;
  if (v <= 0 || tb === undefined || tb === null || !Number.isFinite(tb) || tb < 0) return null;
  if (tb > v * 1.02) return null;
  return tb / v;
}

type TakerAgg = {
  barsWithTaker: number;
  avgBuyShareInside: number | null;
  avgBuyShareOutside: number | null;
  lastBuyShare: number | null;
  prevAvgBuyShare: number | null;
};

function aggregateTakerInsideOutside(
  candles: Candle[],
  i0: number,
  n: number,
  upperAt: (t: number) => number,
  lowerAt: (t: number) => number,
  lastClose: number
): TakerAgg {
  let barsWithTaker = 0;
  let sumIn = 0;
  let cntIn = 0;
  let sumOut = 0;
  let cntOut = 0;
  let prevSum = 0;
  let prevCnt = 0;

  const last = candles[n - 1];
  const prevFrom = Math.max(i0, n - 11);

  for (let i = i0; i < n; i++) {
    const c = candles[i];
    const r = takerBuyRatio(c);
    if (r === null) continue;
    barsWithTaker++;
    const t = c.time as number;
    const up = upperAt(t);
    const lo = lowerAt(t);
    const chH = up - lo;
    const pad = Math.max(chH * 0.03, lastClose * 1e-6);
    const inside = c.close <= up + pad && c.close >= lo - pad;
    if (inside) {
      sumIn += r;
      cntIn++;
    } else {
      sumOut += r;
      cntOut++;
    }
    if (i >= prevFrom && i < n - 1) {
      prevSum += r;
      prevCnt++;
    }
  }

  return {
    barsWithTaker,
    avgBuyShareInside: cntIn > 0 ? sumIn / cntIn : null,
    avgBuyShareOutside: cntOut > 0 ? sumOut / cntOut : null,
    lastBuyShare: takerBuyRatio(last),
    prevAvgBuyShare: prevCnt > 0 ? prevSum / prevCnt : null,
  };
}

function takerNarrative(ta: TakerAgg, volLookback: number, brokeUp: boolean, brokeDn: boolean): string {
  const span = volLookback;
  if (ta.barsWithTaker < Math.max(5, Math.floor(span * 0.25))) {
    return `〔테이커〕 이 구간에서 테이커 매수 체결량 필드가 충분하지 않아 방향 가중 생략(거래소·수집 경로에 따라 없음).`;
  }
  const parts: string[] = [];
  if (ta.avgBuyShareInside !== null && ta.avgBuyShareOutside !== null) {
    parts.push(
      `밴드 안 봉 평균 테이커 매수 비중 ${fmtPct(ta.avgBuyShareInside)}, 밖은 ${fmtPct(ta.avgBuyShareOutside)}(봉별 비중 산술평균 근사).`
    );
  } else if (ta.avgBuyShareInside !== null) {
    parts.push(`밴드 안 봉만 보면 평균 테이커 매수 비중 ${fmtPct(ta.avgBuyShareInside)}.`);
  }
  if (ta.lastBuyShare !== null && ta.prevAvgBuyShare !== null) {
    const diff = ta.lastBuyShare - ta.prevAvgBuyShare;
    parts.push(
      `최종봉 테이커 매수 ${fmtPct(ta.lastBuyShare)}(직전 최대 10봉 평균 ${fmtPct(ta.prevAvgBuyShare)}, 차 ${diff >= 0 ? '+' : ''}${fmtPct(diff)}).`
    );
  } else if (ta.lastBuyShare !== null) {
    parts.push(`최종봉 테이커 매수 비중 ${fmtPct(ta.lastBuyShare)}.`);
  }
  if (brokeUp && ta.lastBuyShare !== null) {
    if (ta.lastBuyShare >= 0.55) {
      parts.push('상단 밖 종가 맥락에서 테이커 매수 비중이 상대적으로 큼 — 상방 체결 우세로 볼 여지(확정 아님).');
    } else if (ta.lastBuyShare <= 0.45) {
      parts.push('상단 밖이나 테이커 매수 비중은 약한 편 — 돌파 후 추세 확인에 유리.');
    }
  }
  if (brokeDn && ta.lastBuyShare !== null && ta.lastBuyShare <= 0.42) {
    parts.push('하단 이탈 맥락에서 테이커 매도 우세(매수 비중 낮음)로 볼 여지 — 추가 확인 필요.');
  }
  if (!parts.length) {
    return `〔테이커〕 테이커 매수 비중 필드는 있으나 요약 생략.`;
  }
  return `〔테이커〕 ${parts.join(' ')}`;
}

/**
 * 1) 최근 구간 LinReg 대밴드 **리본** + 채널 내·외 거래량 비중, 돌파 시도 여부(맥락)
 * 2) 하단 밴드 **반복 접촉**으로 보이는 가격 띠(지지 누적 후 상승까지의 사전 구간을 가리키는 참고)
 */
export function buildLinRegChannelVolumeZones(params: {
  candles: Candle[];
  analysis: AnalyzeResponse | null | undefined;
  overlays: OverlayItem[];
  timeframe: string;
}): OverlayItem[] {
  const { candles, analysis, overlays, timeframe } = params;
  const n = candles.length;
  if (n < 24) return [];

  const bounds = computeLinRegLargeChannelBounds(candles, {});
  if (!bounds) return [];

  const { upperAt, lowerAt } = bounds;
  const last = candles[n - 1];
  const lastTime = last.time as number;

  const volLookback = Math.min(56, n - 1);
  const i0 = n - volLookback;
  let volInside = 0;
  let volOutside = 0;
  let minLo = Infinity;
  let maxUp = -Infinity;

  for (let i = i0; i < n; i++) {
    const c = candles[i];
    const t = c.time as number;
    const up = upperAt(t);
    const lo = lowerAt(t);
    const chH = up - lo;
    const pad = Math.max(chH * 0.03, last.close * 1e-6);
    minLo = Math.min(minLo, lo);
    maxUp = Math.max(maxUp, up);
    /** 종가 기준 채널 안팎(플래그/채널 내 체결 비중 근사) */
    const inside = c.close <= up + pad && c.close >= lo - pad;
    const v = Math.max(0, c.volume ?? 0);
    if (inside) volInside += v;
    else volOutside += v;
  }

  const volTotal = volInside + volOutside;
  const shareIn = volTotal > 0 ? volInside / volTotal : 0;

  const prevStart = Math.max(i0, n - 11);
  let sumPrev = 0;
  let cntPrev = 0;
  for (let i = prevStart; i < n - 1; i++) {
    sumPrev += Math.max(0, candles[i].volume ?? 0);
    cntPrev++;
  }
  const avgPrev = cntPrev > 0 ? sumPrev / cntPrev : 0;
  const lastVol = Math.max(0, last.volume ?? 0);
  const lastVsAvg = avgPrev > 0 ? lastVol / avgPrev : 0;

  const tLast = lastTime;
  const upLast = upperAt(tLast);
  const loLast = lowerAt(tLast);
  const epsBr = Math.max((upLast - loLast) * 0.015, last.close * 0.00025);
  const brokeUp = last.close > upLast + epsBr;
  const brokeDn = last.close < loLast - epsBr;

  let brLabel = '채널 안(횡보·압축 맥락)';
  if (brokeUp) brLabel = '상단 밖 종가 — 상방 돌파 시도로 볼 수 있음(확정 아님)';
  else if (brokeDn) brLabel = '하단 밖 종가 — 하방 이탈 시도로 볼 수 있음(확정 아님)';

  let volNarr = '';
  if (shareIn >= 0.62) volNarr = `최근 ${volLookback}봉 합산 거래량의 ${fmtPct(shareIn)}가 밴드(종가 기준) 안에서 체결된 비중이 큼 — 박스·플래그 안에서 주로 거래된 셈.`;
  else if (shareIn <= 0.38) volNarr = `같은 구간에서 밴드 밖 종가 비중이 상대적으로 큼 — 채널 경계·돌파 시도가 잦았을 수 있음.`;
  else volNarr = `밴드 안·밖 거래량 비중이 비슷함(${fmtPct(shareIn)} 안).`;

  let spikeNarr = '';
  if (lastVsAvg >= 1.75) spikeNarr = ` 최종봉 거래량은 직전 평균 대비 ${fmtRatio(lastVsAvg)} — 돌파·이탈 봉으로 볼 여지(추가 확인 필요).`;
  else if (lastVsAvg <= 0.75) spikeNarr = ` 최종봉 거래량은 평균 이하 — 돌파를 거래량이 강하게 뒷받침했다고 보긴 어려움.`;
  else spikeNarr = ` 최종봉 거래량은 평균 부근.`;

  const ta = aggregateTakerInsideOutside(candles, i0, n, upperAt, lowerAt, last.close);
  const takerLine = takerNarrative(ta, volLookback, brokeUp, brokeDn);

  const struct = recentStructureHints(overlays, lastTime, timeframe, 40);
  const structLine = struct.length ? ` 최근 구조: ${struct.join(', ')}.` : '';

  const obN = analysis?.nearestSupportOb;
  const obLine =
    obN && last.close >= obN.low - epsBr * 2 && last.close <= obN.high + epsBr * 2
      ? ` 엔진 지지 OB ${obN.low.toFixed(2)}~${obN.high.toFixed(2)}와 종가 링크 가능.`
      : '';

  const tipRibbon = [
    `〔의미〕 '돌파'는 확정이 아님 — 마지막 봉이 대밴드 안/밖 어디에 닫혔는지·거래량·테이커로 본 참고 상태만 표시.`,
    `〔신호와의 관계〕 이 띠는 채널 안 거래·체결 요약일 뿐, 패널의 종합 신호(롱/숏)나 SMC 합류·L/S와 동일하지 않을 수 있음.`,
    `〔구간〕 LinReg 대밴드(폭×${bounds.mult.toFixed(0)}, σ·고저 혼합 band)과 같은 기하의 최근 ${volLookback}봉.`,
    `〔거래량〕 ${volNarr}${spikeNarr}`,
    takerLine,
    `〔막대〕 ${brLabel}`,
    structLine + obLine,
    `회귀 길이 ${bounds.length}봉 · σ=${bounds.stdDev.toFixed(6)} · band=${bounds.bandDev.toFixed(6)}`,
  ].join(' ');

  const out: OverlayItem[] = [];

  out.push({
    id: 'smc-linreg-vol-ribbon',
    kind: 'zone',
    label: 'LinReg대밴드·거래/체결',
    x1: 0,
    y1: 0,
    time1: candles[i0].time as number,
    time2: lastTime,
    price1: maxUp,
    price2: minLo,
    confidence: 48,
    color: 'rgba(99,102,241,0.09)',
    lineLabelColor: 'rgba(165,180,252,0.85)',
    category: CAT,
    zoneSpanOnly: true,
    labelTooltip: tipRibbon,
  });

  /** 하단 밴드 반복 접촉 — 지지 "왜"에 대한 휴리스틱 설명 */
  const baseLookback = Math.min(90, n - 8);
  const j0 = n - baseLookback;
  const touchIdx: number[] = [];
  for (let j = j0; j < n - 1; j++) {
    const c = candles[j];
    const t = c.time as number;
    const up = upperAt(t);
    const lo = lowerAt(t);
    const chH = up - lo;
    if (chH <= last.close * 1e-9) continue;
    const nearLower = (c.low - lo) / chH;
    if (nearLower >= -0.04 && nearLower <= 0.14) touchIdx.push(j);
  }

  if (touchIdx.length >= 4) {
    let minL = Infinity;
    let maxH = -Infinity;
    for (const j of touchIdx) {
      minL = Math.min(minL, candles[j].low);
      maxH = Math.max(maxH, candles[j].high);
    }
    const padY = Math.max((maxH - minL) * 0.12, last.close * 0.00035);
    const t1 = candles[touchIdx[0]].time as number;
    const t2 = candles[touchIdx[touchIdx.length - 1]].time as number;

    let touchTakerExtra = '';
    let sumTouch = 0;
    let cntTouch = 0;
    for (const j of touchIdx) {
      const r = takerBuyRatio(candles[j]);
      if (r !== null) {
        sumTouch += r;
        cntTouch++;
      }
    }
    let sumWin = 0;
    let cntWin = 0;
    for (let j = j0; j < n - 1; j++) {
      const r = takerBuyRatio(candles[j]);
      if (r !== null) {
        sumWin += r;
        cntWin++;
      }
    }
    if (cntTouch >= 3 && cntWin >= 6) {
      const at = sumTouch / cntTouch;
      const aw = sumWin / cntWin;
      touchTakerExtra = `〔테이커〕 하단 접촉 봉 평균 테이커 매수 비중 ${fmtPct(at)}, 같은 구간 전체 평균 ${fmtPct(aw)}${at > aw + 0.03 ? ' — 접촉 구간에서 매수 체결 비중이 다소 높았음(흡수·지지 시도 맥락, 확정 아님).' : at < aw - 0.03 ? ' — 접촉 구간은 매도 체결 비중이 상대적으로 큼(하방 압력·스탑 헌팅 맥락 가능).' : '.'}`;
    }

    const why = [
      `〔왜 이 가격〕 최근 ${baseLookback}봉 안에서 LinReg **하단 대밴드** 근처에 저가가 ${touchIdx.length}회 이상 모였음(통계 채널 하단 반복 테스트).`,
      `〔무엇을 보냄〕 유동성·매물 소진·재진입 전 **누적·흡수** 구간으로 해석할 수 있는 자리(사후적으로 큰 상승이 나왔다면 "출발 전 베이스"로 볼 수 있음, 선행 확정 아님).`,
      touchTakerExtra,
      obN && minL <= obN.high + padY && maxH >= obN.low - padY
        ? `엔진 지지 OB와 겹치거나 인접하면 근거가 한 겹 더 쌓임.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    out.push({
      id: 'smc-linreg-base-accum',
      kind: 'demandZone',
      label: '하단밴드·누적/지지',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: maxH + padY * 0.5,
      price2: minL - padY * 0.5,
      confidence: 46,
      color: 'rgba(52,211,153,0.11)',
      lineLabelColor: 'rgba(52,211,153,0.78)',
      category: CAT,
      zoneSpanOnly: true,
      labelTooltip: why,
    });
  }

  return out;
}
