/**
 * Phase 4 — Structure POC + Profile (HVN/LVN) 표기·실전 cap.
 */
import type { VolumeProfileSlice } from './zoneEngine';
import type { Eagle1ChartMode } from './chartUx';

export type ProfileLevelRow = {
  kind: 'POC' | 'VAH' | 'VAL' | 'HVN' | 'LVN';
  price: number;
  labelKo: string;
  labelEn: string;
  showInPractical: boolean;
};

export type ProfileLevelsReport = {
  rows: ProfileLevelRow[];
  poc: number | null;
  vah: number | null;
  val: number | null;
  hvn: number[];
  lvn: number[];
  pocState: string | null;
  practicalCapNote: string;
  summaryKo: string;
};

const PRACTICAL_MAX_HVN = 1;
const PRACTICAL_MAX_LVN = 0;

export function runProfileLevelsEngine(params: {
  profile?: VolumeProfileSlice | null;
  mode?: Eagle1ChartMode;
}): ProfileLevelsReport {
  const p = params.profile;
  const mode = params.mode ?? 'practical';
  const rows: ProfileLevelRow[] = [];
  if (!p) {
    return {
      rows: [],
      poc: null,
      vah: null,
      val: null,
      hvn: [],
      lvn: [],
      pocState: null,
      practicalCapNote: '실전: POC만 · HVN≤1 · LVN 숨김',
      summaryKo: '데이터 없음',
    };
  }

  if (p.poc != null) {
    rows.push({
      kind: 'POC',
      price: p.poc,
      labelKo: '최다거래가격(POC)',
      labelEn: 'POC',
      showInPractical: true,
    });
  }
  if (p.vah != null) {
    rows.push({
      kind: 'VAH',
      price: p.vah,
      labelKo: '거래량상단(VAH)',
      labelEn: 'VAH',
      showInPractical: false,
    });
  }
  if (p.val != null) {
    rows.push({
      kind: 'VAL',
      price: p.val,
      labelKo: '거래량하단(VAL)',
      labelEn: 'VAL',
      showInPractical: false,
    });
  }
  p.hvn.forEach((price, i) => {
    rows.push({
      kind: 'HVN',
      price,
      labelKo: `고거래(HVN)${i + 1}`,
      labelEn: `HVN${i + 1}`,
      showInPractical: i < PRACTICAL_MAX_HVN,
    });
  });
  p.lvn.forEach((price, i) => {
    rows.push({
      kind: 'LVN',
      price,
      labelKo: `저거래(LVN)${i + 1}`,
      labelEn: `LVN${i + 1}`,
      showInPractical: i < PRACTICAL_MAX_LVN,
    });
  });

  const visible =
    mode === 'practical' ? rows.filter((r) => r.showInPractical) : rows;

  return {
    rows: visible,
    poc: p.poc,
    vah: p.vah,
    val: p.val,
    hvn: p.hvn.slice(0, mode === 'practical' ? PRACTICAL_MAX_HVN : 4),
    lvn: p.lvn.slice(0, mode === 'practical' ? PRACTICAL_MAX_LVN : 4),
    pocState: p.pocState ?? null,
    practicalCapNote: '실전: POC + HVN≤1 · VAH/VAL/LVN은 분석·연구',
    summaryKo: visible.length
      ? `프로파일 ${visible.map((r) => r.labelEn).join(' · ')}`
      : '데이터 없음',
  };
}

/** 차트 전폭 가격선용 (모드별 필터된 rows) */
export function profileLevelsToPriceLines(
  report: ProfileLevelsReport
): Array<{
  price: number;
  title: string;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed';
  axisLabel: boolean;
}> {
  return report.rows.map((r) => {
    let color = '#94a3b8';
    if (r.kind === 'POC') color = '#22d3ee';
    else if (r.kind === 'VAH') color = '#f87171';
    else if (r.kind === 'VAL') color = '#34d399';
    else if (r.kind === 'HVN') color = '#a78bfa';
    else if (r.kind === 'LVN') color = '#64748b';
    return {
      price: r.price,
      title: r.labelKo,
      color,
      lineWidth: r.kind === 'POC' ? 2 : 1,
      lineStyle: r.kind === 'POC' || r.kind === 'HVN' ? 'solid' : 'dashed',
      axisLabel: true,
    };
  });
}
