/**
 * 통합분석 학습용 스냅샷 — 켜진 기능·합류·폭락존 TF보드.
 * 기록 먼저 → 나중에 유사도 매칭(과거↔현재)용.
 * 확정 승률·수익 보장 아님.
 */
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  buildConfluenceMeta,
  buildDeskSignalContextMeta,
  type DeskSignalContextInput,
} from '@/lib/mergedDeskSignalJournalContext';
import { DUMP_LIFE_KO } from '@/lib/mergedDeskDumpLifeCycle';

export const DESK_LEARNING_SCHEMA = 'desk-learning.v1';

/** 사용자가 데스크에서 켠 기능 스위치 */
export type DeskLearningFeatureFlags = {
  mtfDumpOn?: boolean;
  institutionalBandOn?: boolean;
  blueRedChannelsOn?: boolean;
  scalp200On?: boolean;
  practiceAiOn?: boolean;
  aiZoneOn?: boolean;
  volumeAiOn?: boolean;
  whaleDnaOn?: boolean;
};

export function dumpZoneStableId(params: {
  symbol: string;
  sourceTf: string;
  bandRole?: 'floor' | 'ceiling' | null;
  top: number;
  bot: number;
}): string {
  const role = params.bandRole === 'ceiling' ? 'C' : params.bandRole === 'floor' ? 'F' : 'X';
  const hi = Math.round(Math.max(params.top, params.bot));
  const lo = Math.round(Math.min(params.top, params.bot));
  /** 0.15% 버킷 — 미세 흔들림으로 새 ID 안 나게 */
  const bucket = Math.max(1, Math.round(hi * 0.0015));
  const hiB = Math.round(hi / bucket) * bucket;
  const loB = Math.round(lo / bucket) * bucket;
  return `${String(params.symbol).toUpperCase()}|${params.sourceTf}|${role}|${hiB}|${loB}`;
}

/** MTF 폭락존 보드 한 줄 — TF별 역할·라이프·가격 */
export function buildDumpBoardCompact(
  zones: MtfDumpZoneSpec[] | null | undefined,
  max = 12
): string {
  if (!zones?.length) return '';
  const bits: string[] = [];
  for (const z of zones.slice(0, max)) {
    const role = z.bandRole === 'ceiling' ? '저항' : z.bandRole === 'floor' ? '지지' : '?';
    const life = z.lifeState ? DUMP_LIFE_KO[z.lifeState] : '관찰';
    const mid = Math.round(z.mid);
    const sr =
      z.viewModel?.sr?.labelKo?.replace(/\s+/g, '') ??
      (typeof z.evidenceScore === 'number' ? `e${Math.round(z.evidenceScore)}` : '');
    bits.push(
      `${z.sourceTf}:${role}:${life}@${mid}${sr ? `:${sr}` : ''}`
    );
  }
  return bits.join('|');
}

export function buildFeatureOnCompact(flags: DeskLearningFeatureFlags | null | undefined): string {
  if (!flags) return '';
  const on: string[] = [];
  if (flags.mtfDumpOn) on.push('dump');
  if (flags.aiZoneOn) on.push('aiZone');
  if (flags.volumeAiOn) on.push('volAi');
  if (flags.institutionalBandOn) on.push('instBand');
  if (flags.blueRedChannelsOn) on.push('rb');
  if (flags.scalp200On) on.push('200x');
  if (flags.practiceAiOn) on.push('practice');
  if (flags.whaleDnaOn) on.push('whale');
  return on.join(',');
}

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * 학습 스냅샷 meta — 유사도 매칭용 fingerprint.
 * 문자열 위주(메타 타입 제약).
 */
export function buildDeskLearningSnapshotMeta(
  input: DeskSignalContextInput,
  flags?: DeskLearningFeatureFlags | null,
  doksuri?: {
    factHash?: string | null;
    dominantSide?: string | null;
    bigMoneyState?: string | null;
  } | null
): Record<string, string | number | boolean | null> {
  const ctx = buildDeskSignalContextMeta(input);
  const conf = buildConfluenceMeta(input, 'NEUTRAL');
  const majority = String(conf.confluenceMajority || 'NEUTRAL');
  const confForDir = buildConfluenceMeta(
    input,
    majority === 'LONG' || majority === 'SHORT' ? majority : 'NEUTRAL'
  );
  const featOn = buildFeatureOnCompact({
    mtfDumpOn: flags?.mtfDumpOn,
    institutionalBandOn: flags?.institutionalBandOn,
    blueRedChannelsOn: flags?.blueRedChannelsOn,
    scalp200On: flags?.scalp200On,
    practiceAiOn: flags?.practiceAiOn,
    aiZoneOn: flags?.aiZoneOn ?? Boolean(input.aiZonePack),
    volumeAiOn: flags?.volumeAiOn ?? Boolean(input.volumeAiZonePack),
    whaleDnaOn: flags?.whaleDnaOn,
  });
  const dumpBoard = buildDumpBoardCompact(input.dumpZones);
  const candleTime = ctx.candleTime;
  const doksuriFactHash = doksuri?.factHash ? String(doksuri.factHash) : null;
  const dominantSide = doksuri?.dominantSide ? String(doksuri.dominantSide) : null;
  const bigMoneyState = doksuri?.bigMoneyState ? String(doksuri.bigMoneyState) : null;
  const fpRaw = [
    input.symbol,
    input.chartTf,
    candleTime,
    majority,
    featOn,
    dumpBoard,
    confForDir.confluenceLong,
    confForDir.confluenceShort,
    ctx.rvol,
    ctx.dumpLifeKo,
    ctx.rbSide,
    ctx.masterSide,
    ctx.practiceState,
    doksuriFactHash,
    dominantSide,
    bigMoneyState,
  ].join('·');

  return {
    ...ctx,
    ...confForDir,
    feature: 'desk_learning',
    learningSchema: DESK_LEARNING_SCHEMA,
    featOn: featOn || null,
    dumpBoard: dumpBoard || null,
    fpHash: shortHash(fpRaw),
    doksuriFactHash,
    dominantSide,
    bigMoneyState,
    purposeKo: '기능합류·폭락보드·도달학습용',
  };
}

export function learningSnapshotDirection(
  meta: Record<string, string | number | boolean | null>
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  const m = String(meta.confluenceMajority || '');
  if (m === 'LONG') return 'LONG';
  if (m === 'SHORT') return 'SHORT';
  return 'NEUTRAL';
}
