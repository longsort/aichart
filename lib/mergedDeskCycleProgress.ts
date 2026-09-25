/**
 * 통합·분석 — 차트 상단 사이클·학파 ‘지금 자리’.
 * 와이코프 TR 작도 + 다학파 합류 + 학파별 교재 도식. 확정 예측·승률 보장 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import {
  buildMergedDeskWyckoffPack,
  type MergedDeskWyckoffRead,
} from '@/lib/mergedDeskWyckoffCycle';
import { buildMergedDeskReaccZonePack, type MergedDeskReaccZoneRead } from '@/lib/mergedDeskReaccumulationZone';
import {
  buildMergedDeskElliottPack,
  type MergedDeskElliottRead,
} from '@/lib/mergedDeskElliottWave';
import {
  detectMergedDeskSchoolSeats,
  type MergedDeskSchoolSeat,
  type SchoolSeatKind,
} from '@/lib/mergedDeskSchoolSeat';
import type { ClickableSchool, SchoolSchematicPin } from '@/lib/mergedDeskSchoolSchematicCatalog';
import { buildSchoolSchematicBlinks, buildSchoolSchematicPins } from '@/lib/mergedDeskSchoolSchematicResolve';
import { formatSchematicPrice, schematicPathPriceLines } from '@/lib/mergedDeskSchematicSeatPrice';
import type { PriceBand } from '@/lib/mergedDeskSchematicTightZone';

const FILL_SCHOOLS: Array<{ kind: ClickableSchool; tagKo: string }> = [
  { kind: 'wyckoff', tagKo: '와이코프' },
  { kind: 'elliott', tagKo: '엘리엇' },
  { kind: 'dow', tagKo: '다우' },
  { kind: 'classical', tagKo: '고전패턴' },
  { kind: 'harmonic', tagKo: '하모닉' },
  { kind: 'smc', tagKo: 'SMC' },
  { kind: 'ichimoku', tagKo: '일목' },
  { kind: 'chan', tagKo: '찬론' },
  { kind: 'fib', tagKo: '피보' },
  { kind: 'vsa', tagKo: 'VSA' },
  { kind: 'brooks', tagKo: 'Brooks' },
  { kind: 'wolfe', tagKo: 'Wolfe' },
  { kind: 'pitchfork', tagKo: 'Pitchfork' },
  { kind: 'profile', tagKo: '프로파일' },
  { kind: 'pnf', tagKo: 'P&F' },
  { kind: 'nison', tagKo: 'Nison' },
  { kind: 'turtle', tagKo: '터틀' },
  { kind: 'macro', tagKo: '장기국면' },
];

function fillMissingSchoolSeats(seats: MergedDeskSchoolSeat[]): MergedDeskSchoolSeat[] {
  const have = new Set(seats.map((s) => s.kind));
  const extra: MergedDeskSchoolSeat[] = FILL_SCHOOLS.filter((f) => !have.has(f.kind)).map((f) => ({
    kind: f.kind,
    tagKo: f.tagKo,
    headlineKo: `지금은 ${f.tagKo} 도식 대기`,
    detailKo: '조건 미충족 · 교재 도식만 열림. 확정 아님.',
    confidence: 40,
    tone: 'neutral',
  }));
  return extra.length ? [...seats, ...extra] : seats;
}

export type CycleProgressKind = SchoolSeatKind;
export type CycleProgressTone = MergedDeskSchoolSeat['tone'];
export type MergedDeskCycleCandidate = MergedDeskSchoolSeat;

export type MergedDeskCycleProgressPack = {
  primary: MergedDeskCycleCandidate | null;
  others: MergedDeskCycleCandidate[];
  wyckoff: MergedDeskWyckoffRead | null;
  reacc: MergedDeskReaccZoneRead | null;
  elliott: MergedDeskElliottRead | null;
  schematics: Partial<Record<ClickableSchool, SchoolSchematicPin>>;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  nowKo: string;
};

export function buildMergedDeskCycleProgressPack(params: {
  candles: Candle[];
  timeframe: string;
  enabled?: boolean;
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
  buyBand?: PriceBand | null;
  sellBand?: PriceBand | null;
}): MergedDeskCycleProgressPack {
  const empty: MergedDeskCycleProgressPack = {
    primary: null,
    others: [],
    wyckoff: null,
    reacc: null,
    elliott: null,
    schematics: {},
    overlays: [],
    priceLines: [],
    nowKo: '',
  };
  if (params.enabled === false || params.candles.length < 24) return empty;

  const wk = buildMergedDeskWyckoffPack({
    candles: params.candles,
    timeframe: params.timeframe,
    enabled: true,
  });
  /** 추가: 재매집/재분배 zone — 기존 와이코프와 병행 */
  const reacc = buildMergedDeskReaccZonePack({
    candles: params.candles,
    timeframe: params.timeframe,
    enabled: true,
  });
  const ew = buildMergedDeskElliottPack(params.candles);
  const detected = detectMergedDeskSchoolSeats({
    candles: params.candles,
    wyckoff: wk.read,
    elliott: ew.read,
    analysis: params.analysis,
    smcLeading: params.smcLeading,
  });
  const seats = fillMissingSchoolSeats(detected);
  const primary = detected.find((s) => s.kind === 'seat') ?? detected[0] ?? seats[0] ?? null;
  const rest = seats.filter((s) => s !== primary);
  const pinOrder: SchoolSeatKind[] = [
    'wyckoff',
    'elliott',
    'dow',
    'classical',
    'harmonic',
    'smc',
    'ichimoku',
    'chan',
    'fib',
    'vsa',
    'brooks',
    'wolfe',
    'pitchfork',
    'profile',
    'pnf',
    'nison',
    'turtle',
    'macro',
  ];
  const others = [
    ...pinOrder.map((k) => rest.find((s) => s.kind === k)).filter((s): s is MergedDeskSchoolSeat => !!s),
    ...rest.filter((s) => !pinOrder.includes(s.kind)),
  ];
  const schematics = buildSchoolSchematicPins({
    candles: params.candles,
    seats,
    wyckoff: wk.read,
    elliott: ew.read,
    buyBand: params.buyBand,
    sellBand: params.sellBand,
  });
  const extraBlinks = buildSchoolSchematicBlinks(schematics, params.candles);
  const overlays = stampSchematicBlinkLabels(
    [...wk.overlays, ...ew.overlays, ...extraBlinks],
    schematics
  );

  return {
    primary,
    others,
    wyckoff: wk.read,
    reacc: reacc.read,
    elliott: ew.read,
    schematics,
    overlays,
    priceLines: [
      ...wk.priceLines,
      ...(schematics.elliott ? schematicPathPriceLines(schematics.elliott) : []),
    ],
    nowKo: primary?.headlineKo ?? '',
  };
}

function stampSchematicBlinkLabels(
  overlays: OverlayItem[],
  pins: Partial<Record<ClickableSchool, SchoolSchematicPin>>
): OverlayItem[] {
  return overlays.map((o) => {
    const id = String(o.id || '');
    const m = id.match(/merged-desk-([a-z]+)-blink-(low|high)/i);
    if (!m) return o;
    const pin = pins[m[1] as ClickableSchool];
    if (!pin?.seatKo || !Number.isFinite(pin.eventPrice)) return o;
    const primary = m[2] === 'low' ? pin.eventLow : !pin.eventLow;
    if (!primary) return o;
    return { ...o, label: `${pin.seatKo} ${formatSchematicPrice(pin.eventPrice)}` };
  });
}
