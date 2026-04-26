/**
 * Trendoscope® ACP Pine 입력 구조에 맞춘 런타임 설정.
 * TV 비공개 라이브러리 없이 앱에서 병합·스캔에 사용 (동일 바이너리 아님).
 */
import type { UserSettings } from '@/lib/settings';

export type WhaleAcpPivotDir = 'up' | 'down' | 'both';

export type WhaleAcpZigzagRow = {
  use: boolean;
  length: number;
  depth: number;
};

export type WhaleAcpPatternEntry = {
  enabled: boolean;
  lastPivot: WhaleAcpPivotDir;
};

/** Pine pattern order 1..13 — allowedPatterns 배열과 동일 순서 */
export type WhaleAcpPatternKey =
  | 'uptrendChannel'
  | 'downtrendChannel'
  | 'rangingChannel'
  | 'risingWedgeExpanding'
  | 'fallingWedgeExpanding'
  | 'divergingTriangle'
  | 'risingTriangleExpanding'
  | 'fallingTriangleExpanding'
  | 'risingWedgeContracting'
  | 'fallingWedgeContracting'
  | 'convergingTriangle'
  | 'fallingTriangleContracting'
  | 'risingTriangleContracting';

const PATTERN_KEYS: WhaleAcpPatternKey[] = [
  'uptrendChannel',
  'downtrendChannel',
  'rangingChannel',
  'risingWedgeExpanding',
  'fallingWedgeExpanding',
  'divergingTriangle',
  'risingTriangleExpanding',
  'fallingTriangleExpanding',
  'risingWedgeContracting',
  'fallingWedgeContracting',
  'convergingTriangle',
  'fallingTriangleContracting',
  'risingTriangleContracting',
];

export type WhaleAcpRuntimeConfig = {
  zigzag: [WhaleAcpZigzagRow, WhaleAcpZigzagRow, WhaleAcpZigzagRow, WhaleAcpZigzagRow];
  scanning: {
    numberOfPivots: 5 | 6;
    errorPct: number;
    flatPct: number;
    lastPivotDirection: 'up' | 'down' | 'both' | 'custom';
    checkBarRatio: boolean;
    barRatioLimit: number;
    avoidOverlap: boolean;
    repaint: boolean;
  };
  groups: {
    allowChannels: boolean;
    allowWedges: boolean;
    allowTriangles: boolean;
    allowRising: boolean;
    allowFalling: boolean;
    allowNonDirectional: boolean;
    allowExpanding: boolean;
    allowContracting: boolean;
    allowParallelChannels: boolean;
  };
  patterns: Record<WhaleAcpPatternKey, WhaleAcpPatternEntry>;
  display: {
    patternLineWidth: number;
    showPatternLabel: boolean;
    showPivotLabels: boolean;
    showZigzag: boolean;
    zigzagHex: string;
    deleteOldPatterns: boolean;
    maxPatterns: number;
    useCustomColors: boolean;
    /** Pine customColorsArray 근사 — 패턴 ID 1..N 순 */
    customColors: string[];
  };
};

/** Pine 기본값에 가깝게 */
export const WHALE_ACP_PINE_DEFAULT: WhaleAcpRuntimeConfig = {
  zigzag: [
    { use: true, length: 8, depth: 55 },
    { use: false, length: 13, depth: 34 },
    { use: false, length: 21, depth: 21 },
    { use: false, length: 34, depth: 13 },
  ],
  scanning: {
    numberOfPivots: 5,
    errorPct: 20,
    flatPct: 20,
    lastPivotDirection: 'both',
    checkBarRatio: true,
    barRatioLimit: 0.382,
    avoidOverlap: true,
    repaint: false,
  },
  groups: {
    allowChannels: true,
    allowWedges: true,
    allowTriangles: true,
    allowRising: true,
    allowFalling: true,
    allowNonDirectional: true,
    allowExpanding: true,
    allowContracting: true,
    allowParallelChannels: true,
  },
  patterns: {
    uptrendChannel: { enabled: true, lastPivot: 'both' },
    downtrendChannel: { enabled: true, lastPivot: 'both' },
    rangingChannel: { enabled: true, lastPivot: 'both' },
    risingWedgeExpanding: { enabled: true, lastPivot: 'down' },
    fallingWedgeExpanding: { enabled: true, lastPivot: 'up' },
    divergingTriangle: { enabled: true, lastPivot: 'both' },
    risingTriangleExpanding: { enabled: true, lastPivot: 'up' },
    fallingTriangleExpanding: { enabled: true, lastPivot: 'down' },
    risingWedgeContracting: { enabled: true, lastPivot: 'down' },
    fallingWedgeContracting: { enabled: true, lastPivot: 'up' },
    convergingTriangle: { enabled: true, lastPivot: 'both' },
    fallingTriangleContracting: { enabled: true, lastPivot: 'down' },
    risingTriangleContracting: { enabled: true, lastPivot: 'up' },
  },
  display: {
    patternLineWidth: 2,
    showPatternLabel: true,
    showPivotLabels: true,
    showZigzag: true,
    zigzagHex: '#2962FF',
    deleteOldPatterns: true,
    maxPatterns: 20,
    useCustomColors: false,
    customColors: [],
  },
};

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base } as T;
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[k];
    if (pv === undefined) continue;
    const bv = base[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      (out as Record<string, unknown>)[k as string] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      (out as Record<string, unknown>)[k as string] = pv as unknown;
    }
  }
  return out;
}

/**
 * Pine `allowedPatterns` 배열 (인덱스 1..13, 0번 미사용).
 */
export function computeAllowedPatternMask(cfg: WhaleAcpRuntimeConfig): boolean[] {
  const g = cfg.groups;
  const p = cfg.patterns;
  const mask: boolean[] = [false];
  const c = g.allowChannels && g.allowParallelChannels;
  const w = g.allowWedges;
  const t = g.allowTriangles;
  mask.push(
    p.uptrendChannel.enabled && g.allowRising && c,
    p.downtrendChannel.enabled && g.allowFalling && c,
    p.rangingChannel.enabled && g.allowNonDirectional && c,
    p.risingWedgeExpanding.enabled && g.allowRising && g.allowExpanding && w,
    p.fallingWedgeExpanding.enabled && g.allowFalling && g.allowExpanding && w,
    p.divergingTriangle.enabled && g.allowNonDirectional && g.allowExpanding && t,
    p.risingTriangleExpanding.enabled && g.allowRising && g.allowExpanding && t,
    p.fallingTriangleExpanding.enabled && g.allowFalling && g.allowExpanding && t,
    p.risingWedgeContracting.enabled && g.allowRising && g.allowContracting && w,
    p.fallingWedgeContracting.enabled && g.allowFalling && g.allowContracting && w,
    p.convergingTriangle.enabled && g.allowNonDirectional && g.allowContracting && t,
    p.fallingTriangleContracting.enabled && g.allowFalling && g.allowContracting && t,
    p.risingTriangleContracting.enabled && g.allowRising && g.allowContracting && t
  );
  return mask;
}

function dirToInt(d: WhaleAcpPivotDir): number {
  if (d === 'up') return 1;
  if (d === 'down') return -1;
  return 0;
}

/** 패턴 ID 1..13 에 대한 마지막 피벗 방향 필터 (-1,0,1) */
export function computeLastPivotDirectionInts(cfg: WhaleAcpRuntimeConfig): number[] {
  const out: number[] = [0];
  const glob = cfg.scanning.lastPivotDirection;
  const globalInt = glob === 'up' ? 1 : glob === 'down' ? -1 : 0;
  for (let i = 0; i < 13; i++) {
    const key = PATTERN_KEYS[i]!;
    const per = cfg.patterns[key]!.lastPivot;
    if (glob === 'custom') out.push(dirToInt(per));
    else out.push(globalInt);
  }
  return out;
}

export function resolveWhaleAcpConfig(settings: UserSettings): WhaleAcpRuntimeConfig {
  let cfg = structuredClone(WHALE_ACP_PINE_DEFAULT) as WhaleAcpRuntimeConfig;
  cfg.zigzag[0]!.length = Math.max(1, Math.min(80, settings.whaleAcpZigzagLength ?? cfg.zigzag[0]!.length));
  cfg.zigzag[0]!.depth = Math.max(1, Math.min(500, settings.whaleAcpDepth ?? cfg.zigzag[0]!.depth));

  const raw = settings.whaleAcpSettingsJson;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const patch = JSON.parse(raw) as Partial<WhaleAcpRuntimeConfig>;
      cfg = deepMerge(cfg as unknown as Record<string, unknown>, patch as Record<string, unknown>) as WhaleAcpRuntimeConfig;
    } catch {
      /* invalid JSON — 기본 유지 */
    }
  }
  return cfg;
}

export { PATTERN_KEYS };
