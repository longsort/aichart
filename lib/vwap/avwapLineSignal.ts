/**
 * AVWAP 초록/빨강 **줄선 위** 시그널 — 카드/HUD 금지.
 * 교차·리클레임/거부 봉에 원형 마커 + 축 타이틀 한글 상태.
 * 확정 승률 문구 없음 · 표본/거리 애매하면 WAIT.
 */
import type { Candle } from '@/types';

export type AvwapLineSignalBias = 'long' | 'short' | 'wait';

export type AvwapLineSignalMarker = {
  time: number;
  position: 'inBar';
  shape: 'circle';
  color: string;
  text: string;
  size: number;
};

export type AvwapLineSignalPack = {
  markers: AvwapLineSignalMarker[];
  liveTitleKo: string;
  bias: AvwapLineSignalBias;
  lastVwap: number | null;
  distAtr: number | null;
};

function atrApprox(candles: Candle[], end: number): number {
  const n = Math.min(14, end);
  if (n < 2) return Math.abs(Number(candles[end]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, end - n + 1); i <= end; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[end]?.close) || 1) * 0.004;
}

/**
 * VWAP 줄선과 종가 교차 → 원형 마커 (선 위에 붙는 시그널).
 * @param lineTagKo 축 라벨 접두 (예: AVWAP 고·고가)
 */
export function buildAvwapLineSignalPack(params: {
  candles: Candle[];
  vwapLine: Array<{ time: number; value: number }>;
  lineTagKo: string;
  /** 고가선=초록 계열, 시가선=빨강 계열 */
  tone: 'green' | 'red' | 'cyan' | 'violet';
  maxMarkers?: number;
}): AvwapLineSignalPack {
  const candles = params.candles ?? [];
  const line = params.vwapLine ?? [];
  const maxMk = Math.max(2, Math.min(16, params.maxMarkers ?? 8));
  if (candles.length < 8 || line.length < 2) {
    return {
      markers: [],
      liveTitleKo: `${params.lineTagKo} · 대기`,
      bias: 'wait',
      lastVwap: null,
      distAtr: null,
    };
  }

  const byT = new Map<number, number>();
  for (const p of line) {
    if (Number.isFinite(p.time) && Number.isFinite(p.value)) byT.set(Number(p.time), Number(p.value));
  }

  const toneColor =
    params.tone === 'green'
      ? '#4ade80'
      : params.tone === 'red'
        ? '#f87171'
        : params.tone === 'cyan'
          ? '#38bdf8'
          : '#a78bfa';

  const markers: AvwapLineSignalMarker[] = [];
  /** 형성봉 제외 */
  const end = candles.length - 2;
  for (let i = 1; i <= end; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const t = Number(cur.time);
    const v = byT.get(t);
    const pv = byT.get(Number(prev.time));
    if (v == null || pv == null) continue;
    const c = Number(cur.close);
    const pc = Number(prev.close);
    if (!Number.isFinite(c) || !Number.isFinite(pc)) continue;

    if (pc < pv && c >= v) {
      markers.push({
        time: t,
        position: 'inBar',
        shape: 'circle',
        color: toneColor,
        text: '리클',
        size: 1.2,
      });
    } else if (pc > pv && c <= v) {
      markers.push({
        time: t,
        position: 'inBar',
        shape: 'circle',
        color: toneColor,
        text: '거부',
        size: 1.2,
      });
    }
  }

  const kept = markers.slice(-maxMk);
  const lastBar = candles[Math.max(0, candles.length - 2)]!;
  const lastT = Number(lastBar.time);
  const lastV = byT.get(lastT) ?? line[line.length - 1]?.value ?? null;
  const lastC = Number(lastBar.close);
  const atr = atrApprox(candles, Math.max(1, candles.length - 2));
  const distAtr =
    lastV != null && atr > 0 && Number.isFinite(lastC) ? Math.abs(lastC - lastV) / atr : null;

  let bias: AvwapLineSignalBias = 'wait';
  let liveTitleKo = `${params.lineTagKo} · 대기`;
  if (lastV != null && Number.isFinite(lastC) && atr > 0) {
    const near = distAtr != null && distAtr <= 0.35;
    if (near) {
      bias = 'wait';
      liveTitleKo = `${params.lineTagKo} · 접촉`;
    } else if (lastC > lastV) {
      bias = 'long';
      liveTitleKo = `${params.lineTagKo} · 상단`;
    } else {
      bias = 'short';
      liveTitleKo = `${params.lineTagKo} · 하단`;
    }
  }

  /** 최신 봉에 라이브 원 1개 — 줄선 끝(하얀동그라미 자리) */
  if (lastV != null && Number.isFinite(lastT)) {
    kept.push({
      time: lastT,
      position: 'inBar',
      shape: 'circle',
      color: '#f8fafc',
      text: bias === 'long' ? '↑' : bias === 'short' ? '↓' : '·',
      size: 1.6,
    });
  }

  return {
    markers: kept,
    liveTitleKo,
    bias,
    lastVwap: lastV,
    distAtr,
  };
}
