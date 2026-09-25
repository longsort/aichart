/**
 * 차트 AIZONE·매도/매수면 스냅샷 — 자동진입 게이트용.
 * 확정 수익·승률 아님.
 */
export type AiZoneFaceBand = {
  kind: 'sell' | 'buy';
  lo: number;
  hi: number;
  mid: number;
  labelKo: string;
};

export type AiZoneHtfFaceSnap = {
  baseKo: string;
  signalKo: string;
  bias: 'up' | 'down';
  lo: number;
  hi: number;
  mid: number;
  labelKo: string;
};

export type AiZoneEntrySnapshot = {
  symbol: string;
  timeframe: string;
  updatedAt: number;
  price: number;
  longPct: number | null;
  shortPct: number | null;
  sellFace: AiZoneFaceBand | null;
  buyFace: AiZoneFaceBand | null;
  /** AIZONE 롱구간(지지) — 롱 SL은 이 하단 아래 */
  longZone?: AiZoneFaceBand | null;
  /** AIZONE 숏구간(저항) — 숏 SL은 이 상단 위 */
  shortZone?: AiZoneFaceBand | null;
  /** 다음 저항 (롱 TP 참고) */
  nextResist: number | null;
  /** 다음 지지 (숏 TP 참고) */
  nextSupport: number | null;
  volumeHeavy: boolean;
  /** 최근 레인지·스윙 (극단 진입 게이트) */
  rangeLo?: number | null;
  rangeHi?: number | null;
  swingLow?: number | null;
  swingHigh?: number | null;
  /** 상위TF면 — 예: 일봉면 상승 */
  htfFace?: AiZoneHtfFaceSnap | null;
  /** 차트TF면 — 예: 15분면 반등 */
  chartFace?: AiZoneHtfFaceSnap | null;
  /** 기관밴드 방향 */
  institutionalBias?: 'LONG' | 'SHORT' | null;
  /** 구조 로켓 방향 */
  rocketDir?: 'LONG' | 'SHORT' | null;
  /** 폭락·하락구간 근처 (숏 근거) */
  dumpDeclineNear?: boolean | null;
  noteKo?: string;
};

const KEY = 'ailongshort.mergedDesk.aiZoneEntrySnap.v1';
const MEM: Partial<Record<string, AiZoneEntrySnapshot>> = {};

/** 매매카드 3칸 즉시 갱신용 */
export const AI_ZONE_SNAP_EVENT = 'ailongshort:ai-zone-snap';

function emitAiZoneSnap(symbol: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(AI_ZONE_SNAP_EVENT, { detail: { symbol: normSym(symbol) } })
    );
  } catch {
    /* ignore */
  }
}

function normSym(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[_-]/g, '');
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeAiZoneEntrySnapshot(snap: AiZoneEntrySnapshot): void {
  const id = normSym(snap.symbol);
  if (!id) return;
  const next = { ...snap, symbol: id, updatedAt: Date.now() };
  MEM[id] = next;
  if (typeof window === 'undefined') return;
  try {
    const all = safeParse<Record<string, AiZoneEntrySnapshot>>(
      window.localStorage.getItem(KEY),
      {}
    );
    all[id] = next;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  emitAiZoneSnap(id);
}

export function readAiZoneEntrySnapshot(symbol: string): AiZoneEntrySnapshot | null {
  const id = normSym(symbol);
  if (!id) return null;
  if (MEM[id] && Date.now() - (MEM[id]!.updatedAt || 0) < 120_000) return MEM[id]!;
  if (typeof window === 'undefined') return MEM[id] ?? null;
  try {
    const all = safeParse<Record<string, AiZoneEntrySnapshot>>(
      window.localStorage.getItem(KEY),
      {}
    );
    const s = all[id];
    if (s) MEM[id] = s;
    return s ?? null;
  } catch {
    return MEM[id] ?? null;
  }
}

type OverlayFaceRow = {
  zoneFaceBase?: string | null;
  zoneFaceSignal?: string | null;
  label?: string | null;
  price1?: number | null;
  price2?: number | null;
  id?: string | null;
  overlayZoneExtraClass?: string | null;
};

/** 오버레이에서 매도면/매수면 추출 */
export function extractFacesFromOverlays(
  overlays: OverlayFaceRow[]
): { sellFace: AiZoneFaceBand | null; buyFace: AiZoneFaceBand | null } {
  let sellFace: AiZoneFaceBand | null = null;
  let buyFace: AiZoneFaceBand | null = null;
  for (const o of overlays) {
    const lab = `${o.zoneFaceBase || ''} ${o.zoneFaceSignal || ''} ${o.label || ''} ${o.id || ''} ${o.overlayZoneExtraClass || ''}`;
    const lo = Math.min(Number(o.price1) || 0, Number(o.price2) || 0);
    const hi = Math.max(Number(o.price1) || 0, Number(o.price2) || 0);
    if (!(lo > 0) || !(hi > lo)) continue;
    const mid = (lo + hi) / 2;
    if (/매도면|sellHeavy|ai-edge-sell|--sellHeavy/i.test(lab) && !sellFace) {
      sellFace = { kind: 'sell', lo, hi, mid, labelKo: '매도면' };
    }
    if (/매수면|buyHeavy|ai-edge-buy|--buyHeavy/i.test(lab) && !buyFace) {
      buyFace = { kind: 'buy', lo, hi, mid, labelKo: '매수면' };
    }
  }
  return { sellFace, buyFace };
}

function bandFromOverlay(o: OverlayFaceRow): { lo: number; hi: number; mid: number } | null {
  const lo = Math.min(Number(o.price1) || 0, Number(o.price2) || 0);
  const hi = Math.max(Number(o.price1) || 0, Number(o.price2) || 0);
  if (!(lo > 0) || !(hi > lo)) return null;
  return { lo, hi, mid: (lo + hi) / 2 };
}

function signalBias(signal: string): 'up' | 'down' | null {
  if (/상승|반등|매수강|up|bull/i.test(signal)) return 'up';
  if (/하락|매도강|down|bear/i.test(signal)) return 'down';
  return null;
}

/** 일봉면 상승 / 4시간면 하락 등 HTF·차트면 추출 */
export function extractTfFacesFromOverlays(overlays: OverlayFaceRow[]): {
  htfFace: AiZoneHtfFaceSnap | null;
  chartFace: AiZoneHtfFaceSnap | null;
} {
  let htfFace: AiZoneHtfFaceSnap | null = null;
  let chartFace: AiZoneHtfFaceSnap | null = null;
  for (const o of overlays) {
    const base = String(o.zoneFaceBase || '');
    const sig = String(o.zoneFaceSignal || '');
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const lab = `${base} ${sig} ${o.label || ''} ${id} ${cls}`;
    const band = bandFromOverlay(o);
    if (!band) continue;
    const bias =
      signalBias(sig) ||
      (/--up|ai-face--up|상승/i.test(lab)
        ? 'up'
        : /--down|ai-face--down|하락/i.test(lab)
          ? 'down'
          : null);
    if (!bias) continue;
    const snap: AiZoneHtfFaceSnap = {
      baseKo: base || '면',
      signalKo: sig || (bias === 'up' ? '상승' : '하락'),
      bias,
      lo: band.lo,
      hi: band.hi,
      mid: band.mid,
      labelKo: `${base || '면'} ${sig || (bias === 'up' ? '상승' : '하락')}`.trim(),
    };
    if (/rb-ai-htf|일봉면|4시간면|1시간면|주봉면|월봉면|상위면/i.test(lab) && !htfFace) {
      htfFace = snap;
    } else if (/rb-ai-ltf|분면|3분면|5분면|15분면|차트면/i.test(lab) && !chartFace) {
      chartFace = snap;
    } else if (
      /면/.test(base) &&
      /상승|하락|반등/.test(sig) &&
      !htfFace &&
      /일봉|4시간|1시간|주봉/.test(base)
    ) {
      htfFace = snap;
    }
  }
  return { htfFace, chartFace };
}

/** 기관밴드 방향 — 오버레이·터치면 라벨 */
export function extractInstitutionalBiasFromOverlays(
  overlays: OverlayFaceRow[]
): 'LONG' | 'SHORT' | null {
  let longHit = false;
  let shortHit = false;
  for (const o of overlays) {
    const lab = `${o.zoneFaceBase || ''} ${o.zoneFaceSignal || ''} ${o.label || ''} ${o.id || ''} ${o.overlayZoneExtraClass || ''}`;
    if (/기관지지|롱기관|롱터치|기관밴드.*롱|st.*support|--st-long/i.test(lab)) longHit = true;
    if (/기관저항|숏기관|숏터치|기관밴드.*숏|st.*resist|--st-short/i.test(lab)) shortHit = true;
  }
  if (longHit && !shortHit) return 'LONG';
  if (shortHit && !longHit) return 'SHORT';
  return null;
}

/** 폭락·하락구간 근처 여부 */
export function detectDumpDeclineNear(
  price: number,
  dumps: Array<{ bot?: number; top?: number; lo?: number; hi?: number }> | null | undefined,
  bufPct = 0.35
): boolean | null {
  if (!(price > 0) || !dumps?.length) return null;
  for (const z of dumps) {
    const lo = Number(z.bot ?? z.lo) || 0;
    const hi = Number(z.top ?? z.hi) || 0;
    if (!(lo > 0) || !(hi > lo)) continue;
    const mid = (lo + hi) / 2;
    const buf = Math.max(mid * (bufPct / 100), (hi - lo) * 0.4);
    if (price >= lo - buf && price <= hi + buf) return true;
  }
  return false;
}

/** 최근 봉 거래량 ≥ 평균×1.8 이면 과다 */
export function detectVolumeHeavyFromCandles(
  candles: Array<{ volume?: number | null }>,
  lookback = 20,
  mult = 1.8
): boolean {
  if (!candles.length || lookback < 4) return false;
  const slice = candles.slice(-lookback);
  const vols = slice.map((c) => Number(c.volume) || 0);
  const last = vols[vols.length - 1] || 0;
  const prev = vols.slice(0, -1);
  if (!prev.length) return false;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return avg > 0 && last >= avg * mult;
}
