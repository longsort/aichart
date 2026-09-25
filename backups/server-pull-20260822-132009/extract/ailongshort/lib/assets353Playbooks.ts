/**
 * assets 353 — 패턴·SMC·카테고리별 작도·롱숏 플레이북 (이미지 좌표 추출 아님).
 */
import type { AssetsImageCatalogEntry } from '@/lib/assetsImageCatalog';
import type { StructureFeatures } from '@/types/reference';

export type Assets353PlaybookDraw = {
  demandZone: boolean;
  supplyZone: boolean;
  ob: boolean;
  fvg: boolean;
  neckLine: boolean;
  patternLines: boolean;
  liquidity: boolean;
  structureMark: boolean;
  entrySlTp: boolean;
};

export type Assets353Playbook = {
  id: string;
  labelEn: string;
  scenarioKo: string;
  draw: Assets353PlaybookDraw;
  longWeight: number;
  shortWeight: number;
};

const DEFAULT_DRAW: Assets353PlaybookDraw = {
  demandZone: true,
  supplyZone: true,
  ob: true,
  fvg: true,
  neckLine: true,
  patternLines: true,
  liquidity: true,
  structureMark: true,
  entrySlTp: true,
};

const PLAYBOOKS: Record<string, Assets353Playbook> = {
  smc: {
    id: 'smc',
    labelEn: 'SMC',
    scenarioKo: '구조돌파·OB·FVG·유동성 스윕 후 반전',
    draw: { ...DEFAULT_DRAW, patternLines: false },
    longWeight: 0.55,
    shortWeight: 0.45,
  },
  double_top: {
    id: 'double_top',
    labelEn: 'DTop',
    scenarioKo: '이중 천장 + 목선 이탈 시 하방',
    draw: { ...DEFAULT_DRAW, ob: false, fvg: false },
    longWeight: 0.15,
    shortWeight: 0.85,
  },
  double_bottom: {
    id: 'double_bottom',
    labelEn: 'DBot',
    scenarioKo: '이중 바닥 + 목선 돌파 시 상방',
    draw: { ...DEFAULT_DRAW, ob: false, fvg: false },
    longWeight: 0.85,
    shortWeight: 0.15,
  },
  head_shoulders: {
    id: 'head_shoulders',
    labelEn: 'H&S',
    scenarioKo: '헤드앤숄더 목선 이탈 시 하방',
    draw: DEFAULT_DRAW,
    longWeight: 0.12,
    shortWeight: 0.88,
  },
  inverse_hs: {
    id: 'inverse_hs',
    labelEn: 'InvH&S',
    scenarioKo: '역헤드앤숄더 목선 돌파 시 상방',
    draw: DEFAULT_DRAW,
    longWeight: 0.88,
    shortWeight: 0.12,
  },
  bull_flag: {
    id: 'bull_flag',
    labelEn: 'BFlag',
    scenarioKo: '상승 깃발 돌파 후 추세 연장',
    draw: { ...DEFAULT_DRAW, supplyZone: false },
    longWeight: 0.78,
    shortWeight: 0.22,
  },
  bear_flag: {
    id: 'bear_flag',
    labelEn: 'BFlag',
    scenarioKo: '하락 깃발 이탈 후 추세 연장',
    draw: { ...DEFAULT_DRAW, demandZone: false },
    longWeight: 0.22,
    shortWeight: 0.78,
  },
  rising_wedge: {
    id: 'rising_wedge',
    labelEn: 'RWedge',
    scenarioKo: '상승 쐐기 하단 이탈 시 하방',
    draw: DEFAULT_DRAW,
    longWeight: 0.25,
    shortWeight: 0.75,
  },
  falling_wedge: {
    id: 'falling_wedge',
    labelEn: 'FWedge',
    scenarioKo: '하락 쐐기 상단 돌파 시 상방',
    draw: DEFAULT_DRAW,
    longWeight: 0.75,
    shortWeight: 0.25,
  },
  harmonic: {
    id: 'harmonic',
    labelEn: 'Harm',
    scenarioKo: '하모닉 PRZ 반응 + 피보나치 목표',
    draw: { ...DEFAULT_DRAW, liquidity: false },
    longWeight: 0.5,
    shortWeight: 0.5,
  },
  triangle: {
    id: 'triangle',
    labelEn: 'Tri',
    scenarioKo: '삼각 수렴 후 돌파 방향 추종',
    draw: DEFAULT_DRAW,
    longWeight: 0.5,
    shortWeight: 0.5,
  },
  channel: {
    id: 'channel',
    labelEn: 'Ch',
    scenarioKo: '채널 경계 터치 후 반등·이탈',
    draw: DEFAULT_DRAW,
    longWeight: 0.5,
    shortWeight: 0.5,
  },
  generic: {
    id: 'generic',
    labelEn: 'Pat',
    scenarioKo: '353 자료 패턴 + 현재 캔들 구조 대조',
    draw: DEFAULT_DRAW,
    longWeight: 0.5,
    shortWeight: 0.5,
  },
};

function patternKey(pattern: string): string {
  const p = String(pattern || '').toLowerCase();
  if (!p) return 'generic';
  if (p.includes('double_top')) return 'double_top';
  if (p.includes('double_bottom')) return 'double_bottom';
  if (p.includes('inverse') || p.includes('inv_hs')) return 'inverse_hs';
  if (p.includes('head')) return 'head_shoulders';
  if (p.includes('bull_flag')) return 'bull_flag';
  if (p.includes('bear_flag')) return 'bear_flag';
  if (p.includes('rising_wedge')) return 'rising_wedge';
  if (p.includes('falling_wedge')) return 'falling_wedge';
  if (p.includes('harmonic')) return 'harmonic';
  if (p.includes('triangle')) return 'triangle';
  if (p.includes('channel')) return 'channel';
  return 'generic';
}

export function resolvePlaybookForEntry(entry: AssetsImageCatalogEntry): Assets353Playbook {
  const sf = entry.structureFeatures;
  if (entry.category === 'smc_candle' || sf.bos || sf.choch || (sf.ob ?? 0) > 0) {
    return PLAYBOOKS.smc!;
  }
  const key = patternKey(String(sf.pattern || ''));
  return PLAYBOOKS[key] ?? PLAYBOOKS.generic!;
}

export function resolvePlaybookForLive(
  live: StructureFeatures & { pattern?: string }
): Assets353Playbook {
  if (live.bos || live.choch || (live.ob ?? 0) > 0) return PLAYBOOKS.smc!;
  const key = patternKey(String(live.pattern || ''));
  return PLAYBOOKS[key] ?? PLAYBOOKS.generic!;
}

export function playbookVoteWeights(
  playbook: Assets353Playbook,
  sim: number,
  entryBias: string,
  liveBias: string
): { long: number; short: number } {
  let lw = playbook.longWeight * sim;
  let sw = playbook.shortWeight * sim;
  if (entryBias === 'bullish') lw += sim * 0.35;
  else if (entryBias === 'bearish') sw += sim * 0.35;
  if (liveBias === 'bullish') lw += sim * 0.12;
  else if (liveBias === 'bearish') sw += sim * 0.12;
  return { long: lw, short: sw };
}

export function mergePlaybookDrawFlags(playbooks: Assets353Playbook[]): Assets353PlaybookDraw {
  const merged = { ...DEFAULT_DRAW };
  for (const key of Object.keys(merged) as (keyof Assets353PlaybookDraw)[]) {
    merged[key] = playbooks.some((p) => p.draw[key]);
  }
  return merged;
}
