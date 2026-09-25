/**
 * 다중 분석 증거 합류 → 지지/저항 zone (최소 N개 근거).
 * 피보 선·면은 그리지 않고, GP·AVWAP·스윙·EMA·존·POC 등만 내부 증거로 사용.
 * 확정 승률·수익 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { ema } from '@/lib/indicators';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';
import {
  buildAvwapFibConfluencePack,
  type AvwapFibConfluencePack,
} from '@/lib/vwap/avwapFibConfluence';
import { formatZoneFacePrice } from '@/lib/mergedDeskDumpLifeCycle';
import { loadSettings } from '@/lib/settings';
import {
  appendSrProbToLabel,
  computePriceBandSrProb,
} from '@/lib/zoneSupportResistProb';

export const EVIDENCE_ZONE_MIN = 3;
export const EVIDENCE_ZONE_CLASS = 'merged-desk-evidence-zone';

export type EvidenceKind =
  | 'avwap'
  | 'fibGp'
  | 'fibLevel'
  | 'ema20'
  | 'ema50'
  | 'ema200'
  | 'swingHi'
  | 'swingLo'
  | 'hot'
  | 'channel'
  | 'poc'
  | 'ob'
  | 'fvg'
  | 'supply'
  | 'demand'
  | 'hq'
  | 'stBand'
  | 'active';

export type EvidenceAtom = {
  kind: EvidenceKind;
  labelKo: string;
  price: number;
  role: 'support' | 'resistance' | 'both';
  weight: number;
};

export type EvidenceConfluenceZone = {
  id: string;
  role: 'support' | 'resistance';
  top: number;
  bot: number;
  mid: number;
  evidenceCount: number;
  kinds: EvidenceKind[];
  labelsKo: string[];
  score: number;
};

export type EvidenceConfluencePack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  zones: EvidenceConfluenceZone[];
  summaryKo: string;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 15); i < n - 1; i++) {
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
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
}

function pushAtom(
  out: EvidenceAtom[],
  kind: EvidenceKind,
  labelKo: string,
  price: number,
  role: EvidenceAtom['role'],
  weight: number
): void {
  if (!(price > 0) || !Number.isFinite(price)) return;
  out.push({ kind, labelKo, price, role, weight });
}

function lastVwap(line: Array<{ time: number; value: number }> | undefined): number | null {
  if (!line?.length) return null;
  const v = Number(line[line.length - 1]!.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function collectFromAvwap(
  out: EvidenceAtom[],
  high: MergedDeskAnchoredVwapPack | null,
  low: MergedDeskAnchoredVwapPack | null
): void {
  if (high) {
    const e = lastVwap(high.extremeLine);
    const o = lastVwap(high.openLine);
    if (e != null) pushAtom(out, 'avwap', 'AVWAP고·고가', e, 'resistance', 14);
    if (o != null) pushAtom(out, 'avwap', 'AVWAP고·시가', o, 'resistance', 12);
  }
  if (low) {
    const e = lastVwap(low.extremeLine);
    const o = lastVwap(low.openLine);
    if (e != null) pushAtom(out, 'avwap', 'AVWAP저·고가', e, 'support', 14);
    if (o != null) pushAtom(out, 'avwap', 'AVWAP저·시가', o, 'support', 12);
  }
}

/** 피보는 그리지 않고 GP·핵심가만 증거로 — 먼 레벨은 제외(선물 구간 축소) */
function collectFromFibPack(out: EvidenceAtom[], fib: AvwapFibConfluencePack | null, price: number, atr: number): void {
  if (!fib?.legs?.length) return;
  for (const leg of fib.legs) {
    const tag = leg.role === 'high' ? '고점' : '저점';
    const role: EvidenceAtom['role'] = leg.role === 'high' ? 'resistance' : 'support';
    const gpMid = (leg.goldenTop + leg.goldenBot) / 2;
    const near = Math.abs(gpMid - price) <= atr * 2.2;
    if (near) {
      pushAtom(out, 'fibGp', `${tag}골든포켓`, gpMid, role, 16);
      pushAtom(out, 'fibGp', `${tag}GP상`, Math.max(leg.goldenTop, leg.goldenBot), role, 10);
      pushAtom(out, 'fibGp', `${tag}GP하`, Math.min(leg.goldenTop, leg.goldenBot), role, 10);
      pushAtom(out, 'fibLevel', `${tag}피보0.5`, (leg.fibHigh + leg.fibLow) / 2, 'both', 8);
    }
    /** 얕은 되돌림은 항상 후보 */
    const shallow382 = leg.fibHigh - 0.382 * (leg.fibHigh - leg.fibLow);
    const shallow236 = leg.fibHigh - 0.236 * (leg.fibHigh - leg.fibLow);
    if (Math.abs(shallow382 - price) <= atr * 2.2) {
      pushAtom(out, 'fibLevel', `${tag}얕은0.382`, shallow382, role, 12);
    }
    if (Math.abs(shallow236 - price) <= atr * 2.2) {
      pushAtom(out, 'fibLevel', `${tag}얕은0.236`, shallow236, role, 10);
    }
  }
  for (const c of fib.precision?.candidates ?? []) {
    pushAtom(
      out,
      'fibLevel',
      c.side === 'LONG' ? '정밀롱E' : '정밀숏E',
      c.entry,
      c.side === 'LONG' ? 'support' : 'resistance',
      18
    );
  }
}

function collectFromEma(out: EvidenceAtom[], candles: Candle[]): void {
  const n = candles.length;
  if (n < 30) return;
  const e20 = ema(candles, 20);
  const e50 = ema(candles, 50);
  const e200 = ema(candles, 200);
  const i = n - 2;
  if (e20[i] != null) pushAtom(out, 'ema20', 'EMA20', e20[i]!, 'both', 8);
  if (e50[i] != null) pushAtom(out, 'ema50', 'EMA50', e50[i]!, 'both', 11);
  if (e200[i] != null) pushAtom(out, 'ema200', 'EMA200', e200[i]!, 'both', 12);
}

function collectSwings(out: EvidenceAtom[], candles: Candle[]): void {
  const n = candles.length;
  const end = Math.max(0, n - 2);
  const L = 3;
  const R = 3;
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = Math.max(L, end - 80); i <= end - R; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    let isH = true;
    let isL = true;
    for (let j = i - L; j <= i + R; j++) {
      if (j === i) continue;
      if (Number(candles[j]!.high) >= h) isH = false;
      if (Number(candles[j]!.low) <= l) isL = false;
    }
    if (isH) highs.push(h);
    if (isL) lows.push(l);
  }
  for (const h of highs.slice(-4)) pushAtom(out, 'swingHi', '스윙고', h, 'resistance', 10);
  for (const l of lows.slice(-4)) pushAtom(out, 'swingLo', '스윙저', l, 'support', 10);
}

function classifyOverlay(o: OverlayItem): {
  kind: EvidenceKind;
  role: EvidenceAtom['role'];
  labelKo: string;
  weight: number;
} | null {
  const id = String(o.id || '').toLowerCase();
  const lab = String(o.label || o.zoneFaceBase || '');
  const blob = `${id} ${lab} ${o.category || ''} ${o.kind || ''}`.toLowerCase();
  if (/avwap-fib|evidence-zone/.test(blob)) return null;
  if (/hotzone|hot-zone|\$\$\$\$/.test(blob)) {
    const short = /short|숏|저항|sell/.test(blob);
    return {
      kind: 'hot',
      role: short ? 'resistance' : 'support',
      labelKo: lab || (short ? 'Hot저항' : 'Hot지지'),
      weight: 13,
    };
  }
  if (/hq-entry|hq진입/.test(blob)) {
    return { kind: 'hq', role: 'both', labelKo: lab || 'HQ', weight: 12 };
  }
  if (/channel|rb-|청적|파랑|빨강/.test(blob)) {
    return { kind: 'channel', role: 'both', labelKo: lab || '채널', weight: 9 };
  }
  if (/poc|vrvp|최다거래/.test(blob)) {
    return { kind: 'poc', role: 'both', labelKo: lab || 'POC', weight: 14 };
  }
  if (/\bob\b|order.?block|주문블록/.test(blob)) {
    const short = /short|숏|bear|저항/.test(blob);
    return {
      kind: 'ob',
      role: short ? 'resistance' : 'support',
      labelKo: lab || (short ? 'OB저항' : 'OB지지'),
      weight: 12,
    };
  }
  if (/fvg|fair.?value|가격빈틈/.test(blob)) {
    const short = /short|숏|bear|저항/.test(blob);
    return {
      kind: 'fvg',
      role: short ? 'resistance' : 'support',
      labelKo: lab || 'FVG',
      weight: 10,
    };
  }
  if (/supply|공급/.test(blob)) {
    return { kind: 'supply', role: 'resistance', labelKo: lab || '공급', weight: 11 };
  }
  if (/demand|수요/.test(blob)) {
    return { kind: 'demand', role: 'support', labelKo: lab || '수요', weight: 11 };
  }
  if (/institutional|st.?band|기관/.test(blob)) {
    const short = /short|숏|저항/.test(blob);
    return {
      kind: 'stBand',
      role: short ? 'resistance' : 'support',
      labelKo: lab || '기관ST',
      weight: 9,
    };
  }
  if (/active|entry|진입/.test(blob) && /sl|tp|손절|목표/.test(blob) === false) {
    return { kind: 'active', role: 'both', labelKo: lab || '진입', weight: 8 };
  }
  return null;
}

function collectFromOverlays(out: EvidenceAtom[], overlays: OverlayItem[] | null | undefined): void {
  if (!overlays?.length) return;
  let n = 0;
  for (const o of overlays) {
    if (n >= 48) break;
    const cls = classifyOverlay(o);
    if (!cls) continue;
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    const mid =
      Number.isFinite(p1) && Number.isFinite(p2) ? (p1 + p2) / 2 : Number.isFinite(p1) ? p1 : p2;
    if (!(mid > 0)) continue;
    pushAtom(out, cls.kind, cls.labelKo, mid, cls.role, cls.weight);
    n += 1;
  }
}

type Cluster = {
  atoms: EvidenceAtom[];
  mid: number;
  lo: number;
  hi: number;
};

function clusterAtoms(atoms: EvidenceAtom[], mergeDist: number): Cluster[] {
  if (!atoms.length) return [];
  const sorted = [...atoms].sort((a, b) => a.price - b.price);
  const clusters: Cluster[] = [];
  let cur: EvidenceAtom[] = [sorted[0]!];
  let lo = sorted[0]!.price;
  let hi = sorted[0]!.price;

  const flush = () => {
    if (!cur.length) return;
    const mid = cur.reduce((s, a) => s + a.price * a.weight, 0) / cur.reduce((s, a) => s + a.weight, 0);
    clusters.push({ atoms: cur, mid, lo, hi });
    cur = [];
  };

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i]!;
    if (a.price - hi <= mergeDist) {
      cur.push(a);
      hi = Math.max(hi, a.price);
      lo = Math.min(lo, a.price);
    } else {
      flush();
      cur = [a];
      lo = a.price;
      hi = a.price;
    }
  }
  flush();
  return clusters;
}

function uniqueKinds(atoms: EvidenceAtom[]): EvidenceKind[] {
  const s = new Set<EvidenceKind>();
  for (const a of atoms) s.add(a.kind);
  return [...s];
}

function resolveRole(
  cluster: Cluster,
  price: number
): 'support' | 'resistance' {
  let sup = 0;
  let res = 0;
  for (const a of cluster.atoms) {
    if (a.role === 'support') sup += a.weight;
    else if (a.role === 'resistance') res += a.weight;
    else if (a.price <= price) sup += a.weight * 0.6;
    else res += a.weight * 0.6;
  }
  if (cluster.mid < price * 0.998) return 'support';
  if (cluster.mid > price * 1.002) return 'resistance';
  return res >= sup ? 'resistance' : 'support';
}

function toZones(
  clusters: Cluster[],
  price: number,
  atr: number,
  minEvidence: number
): EvidenceConfluenceZone[] {
  const out: EvidenceConfluenceZone[] = [];
  for (const c of clusters) {
    const kinds = uniqueKinds(c.atoms);
    if (kinds.length < minEvidence) continue;
    const role = resolveRole(c, price);
    const pad = Math.max(atr * 0.08, Math.min((c.hi - c.lo) * 0.08, atr * 0.22), price * 0.00025);
    /** 핵심 얇은 밴드 — mid ± 제한 (너무 넓은 면 방지) */
    const half = Math.min(Math.max(pad, atr * 0.14), atr * 0.28);
    const bot = c.mid - half;
    const top = c.mid + half;
    const score = c.atoms.reduce((s, a) => s + a.weight, 0) + kinds.length * 6;
    const labelsKo = [...new Set(c.atoms.map((a) => a.labelKo))].slice(0, 6);
    out.push({
      id: `merged-desk-evidence-${role}-${Math.round(c.mid)}`,
      role,
      top,
      bot,
      mid: c.mid,
      evidenceCount: kinds.length,
      kinds,
      labelsKo,
      score,
    });
  }
  return out;
}

function pickBest(
  zones: EvidenceConfluenceZone[],
  price: number,
  maxSup: number,
  maxRes: number
): EvidenceConfluenceZone[] {
  const sup = zones
    .filter((z) => z.role === 'support' && z.mid <= price * 1.01)
    .sort((a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price))
    .slice(0, maxSup);
  const res = zones
    .filter((z) => z.role === 'resistance' && z.mid >= price * 0.99)
    .sort((a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price))
    .slice(0, maxRes);
  return [...sup, ...res].sort((a, b) => a.mid - b.mid);
}

function buildOverlays(
  zones: EvidenceConfluenceZone[],
  candles: Candle[],
  timeframe: string
): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  const n = candles.length;
  if (n < 2) return { overlays: [], priceLines: [] };
  const tLast = Number(candles[n - 1]!.time);
  const barSec = candleBarDurationSec(timeframe, tLast);
  const t1 = Number(candles[Math.max(0, n - 48)]!.time);
  const t2 = tLast + 8 * barSec;
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];

  for (const z of zones) {
    const isSup = z.role === 'support';
    const nameKo = isSup ? '핵심지지' : '핵심저항';
    const priceOnly = loadSettings().chartMergedDeskZonePriceOnlyLabels === true;
    const facePack = formatZoneFacePrice({
      nameKo,
      mid: z.mid,
      priceOnly,
      signalKo: `×${z.evidenceCount}`,
    });
    const tip = `${facePack.tip} · ${z.labelsKo.join('·')} (조건부 참고 · 확정 아님)`;
    const fill = isSup ? 'rgba(34,197,94,0.22)' : 'rgba(248,113,113,0.22)';
    const line = isSup ? '#4ade80' : '#f87171';
    const sr = computePriceBandSrProb(candles, z.bot, z.top);
    const mark = Number(candles[candles.length - 1]?.close) || z.mid;
    const faceWithSr = appendSrProbToLabel(facePack.face, sr, {
      price: mark,
      zoneLo: z.bot,
      zoneHi: z.top,
    });
    const signalWithSr =
      (isSup && sr.supportProb != null
        ? `지지${sr.supportProb}%`
        : !isSup && sr.resistanceProb != null
          ? `저항${sr.resistanceProb}%`
          : null) || facePack.signal;
    overlays.push({
      id: z.id,
      kind: 'zone',
      label: faceWithSr,
      zoneFaceBase: faceWithSr,
      zoneFaceSignal: signalWithSr,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: z.top,
      price2: z.bot,
      confidence: sr.confidence ?? Math.min(92, 55 + z.evidenceCount * 8),
      supportProb: sr.supportProb,
      resistanceProb: sr.resistanceProb,
      probSamples: sr.samples,
      color: fill,
      lineLabelColor: line,
      category: 'chartPrimeTrendChannels',
      zoneFillPreserve: true,
      structureBias: isSup ? 'bullish' : 'bearish',
      overlayZoneExtraClass: `${EVIDENCE_ZONE_CLASS} merged-desk-hotzone-entry merged-desk-zone-label-on merged-desk-core-sr-zone`,
      labelTooltip: `${tip} · ${sr.labelKo}`,
      labelBackgroundColor: isSup ? 'rgba(20,83,45,0.92)' : 'rgba(127,29,29,0.92)',
      labelTextColor: isSup ? '#bbf7d0' : '#fecaca',
    });
    priceLines.push({
      price: z.mid,
      color: line,
      title: `${nameKo} ${Math.round(z.mid)}`.slice(0, 18),
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  return { overlays, priceLines };
}

/**
 * 캔들·AVWAP·(내부)피보GP·오버레이 → 증거≥min 합류 지지/저항 zone.
 * 피보 선/면은 출력하지 않음.
 */
export function buildMergedDeskEvidenceConfluencePack(params: {
  candles: Candle[];
  timeframe: string;
  highPack?: MergedDeskAnchoredVwapPack | null;
  lowPack?: MergedDeskAnchoredVwapPack | null;
  overlays?: OverlayItem[] | null;
  /** 이미 계산된 피보 팩 — 없으면 내부 계산(작도 없음) */
  fibPack?: AvwapFibConfluencePack | null;
  minEvidence?: number;
  maxSupport?: number;
  maxResist?: number;
}): EvidenceConfluencePack {
  const candles = params.candles ?? [];
  const empty: EvidenceConfluencePack = {
    overlays: [],
    priceLines: [],
    zones: [],
    summaryKo: '합류존 · 대기',
  };
  if (candles.length < 48) return empty;

  const atr = atrApprox(candles);
  const price = Number(candles[Math.max(0, candles.length - 2)]!.close);
  if (!(price > 0)) return empty;

  const atoms: EvidenceAtom[] = [];
  collectFromAvwap(atoms, params.highPack ?? null, params.lowPack ?? null);

  const fib =
    params.fibPack ??
    buildAvwapFibConfluencePack({
      candles,
      timeframe: params.timeframe,
      highPack: params.highPack ?? null,
      lowPack: params.lowPack ?? null,
    });
  collectFromFibPack(atoms, fib, price, atr);
  collectFromEma(atoms, candles);
  collectSwings(atoms, candles);
  collectFromOverlays(atoms, params.overlays);

  const mergeDist = Math.max(atr * 0.55, price * 0.0012);
  const clusters = clusterAtoms(atoms, mergeDist);
  const minEv = Math.max(3, Math.min(6, params.minEvidence ?? EVIDENCE_ZONE_MIN));
  const raw = toZones(clusters, price, atr, minEv);
  const zones = pickBest(
    raw,
    price,
    params.maxSupport ?? 2,
    params.maxResist ?? 2
  );

  if (!zones.length) {
    return {
      ...empty,
      summaryKo: `합류존 · 근거${minEv}개 미만`,
    };
  }

  const { overlays, priceLines } = buildOverlays(zones, candles, params.timeframe);
  const sN = zones.filter((z) => z.role === 'support').length;
  const rN = zones.filter((z) => z.role === 'resistance').length;
  return {
    overlays,
    priceLines,
    zones,
    summaryKo: `합류존 지지${sN}·저항${rN} (근거≥${minEv})`,
  };
}
