/**
 * Schematic compare — reference Wyckoff/SMC features vs current BTC vs historical sample.
 * Shape-only image match is forbidden. Missing sample → 통계 부족.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import { wyckoffKo, type StructureSnapshot } from './structureEngine';
import { smcWyckoffConfluence } from './smcConfluence';
import type { PocState } from './zoneEngine';
import type { Eagle1Bar } from './structureEngine';

export type SchematicFeature = {
  id: string;
  labelKo: string;
  hit: boolean | null;
  note: string;
};

export type SchematicCompareReport = {
  referenceKo: string;
  currentKo: string;
  chartLabelKo: string;
  tone: 'long' | 'short' | 'wait';
  features: SchematicFeature[];
  sampleSize: number;
  note: string;
};

function feat(id: string, labelKo: string, hit: boolean | null): SchematicFeature {
  return {
    id,
    labelKo,
    hit,
    note: hit == null ? '데이터 없음' : hit ? '겹침' : '불일치',
  };
}

export function runSchematicCompare(params: {
  structure: StructureSnapshot;
  candles?: Eagle1Bar[] | null;
  pocState?: PocState | null;
  sampleSize?: number;
  endExclusive?: number;
}): SchematicCompareReport {
  const st = params.structure;
  const wy = st.wyckoff?.label ?? 'NONE';
  const smc = smcWyckoffConfluence({
    structure: st,
    pocState: params.pocState,
    candles: params.candles,
    endExclusive: params.endExclusive,
  });
  const sample = params.sampleSize ?? 0;
  const lastSweep = [...st.events].reverse().find((e) => e.kind === 'SWEEP');
  const lastCho = [...st.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  const accumRef = wy === 'ACCUMULATION' || wy === 'SPRING' || st.regime === 'ACCUMULATION';
  const distRef = wy === 'DISTRIBUTION' || wy === 'UTAD' || wy === 'LPSY' || st.regime === 'DISTRIBUTION';

  const features: SchematicFeature[] = [
    feat('wy', '와이코프 맥락', wy === 'NONE' ? null : true),
    feat('sweep', '유동성털기', lastSweep != null),
    feat('shift', '추세전환/구조돌파', lastCho != null),
    feat('poc', 'POC 상태', params.pocState != null),
    feat('smcLong', '매집 컨플루언스', smc.longAligned ? true : smc.wyckoffOnly ? false : null),
    feat('smcShort', '분배 컨플루언스', smc.shortAligned ? true : smc.wyckoffOnly ? false : null),
    feat('sample', '과거 사례 표본', sample <= 0 ? null : sample >= EAGLE1_MIN_STAT_SAMPLE),
  ];

  let chartLabelKo = '대기';
  let tone: SchematicCompareReport['tone'] = 'wait';
  if (smc.longAligned || accumRef) {
    chartLabelKo = '매집 우세 ↑';
    tone = 'long';
  } else if (smc.shortAligned || distRef) {
    chartLabelKo = '분배 우세 ↓';
    tone = 'short';
  } else if (st.regime === 'BULL' || st.regime === 'STRONG_BULL') {
    chartLabelKo = '상승 구조';
    tone = 'long';
  } else if (st.regime === 'BEAR' || st.regime === 'STRONG_BEAR') {
    chartLabelKo = '하락 구조';
    tone = 'short';
  } else {
    chartLabelKo = wyckoffKo(st.wyckoff) || '대기';
  }

  const note =
    sample <= 0
      ? '데이터 없음 · 이미지 모양 비교 아님'
      : sample < EAGLE1_MIN_STAT_SAMPLE
        ? `통계 부족 (n=${sample}) · 도식은 참고`
        : `표본 ${sample} · 도식+현재구조+사례 겹침`;

  return {
    referenceKo: wy === 'NONE' ? '데이터 없음' : wyckoffKo(wy),
    currentKo: `${st.regime} · ${st.state}`,
    chartLabelKo,
    tone,
    features,
    sampleSize: sample,
    note,
  };
}
