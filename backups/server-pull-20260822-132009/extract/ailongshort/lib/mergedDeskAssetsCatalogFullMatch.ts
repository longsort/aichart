/**
 * assets overlays 353(차트 가능 ~324) 전량 유사도 매칭 → 라이브 캔들 ZONE 작도.
 * 조건 유사 시 drawTemplate을 차트에 반영. 카드/HUD 없음. 확정 수익 문구 금지.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import {
  applyAssetsDrawTemplate,
  buildLiveStructureFeatures,
  matchAssetsImagesToLive,
  type AssetsChartAiMatch,
} from '@/lib/assetsChartAiDraw';
import {
  getAssetsCatalogEntryById,
  getChartableAssetsEntries,
  getAssetsImageCatalog,
} from '@/lib/assetsImageCatalog';
import { mergedDeskAutoZoneDetectCandles } from '@/lib/mergedDesk4hReference';
import { normalizeChartTimeframe } from '@/lib/constants';

export type AssetsCatalogFullMatchPack = {
  overlays: OverlayItem[];
  matches: AssetsChartAiMatch[];
  summaryKo: string;
  catalogTotal: number;
  catalogChartable: number;
  matchedCount: number;
  drawnCount: number;
};

/** TF별 적용 상한 — 렉 방지 (전량 스코어는 하고 상위만 작도) */
function matchApplyLimit(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = {
    '1m': 6,
    '3m': 7,
    '5m': 8,
    '15m': 10,
    '1h': 10,
    '4h': 9,
    '1d': 12,
    '1w': 10,
    '1M': 8,
  };
  return map[tf] ?? 8;
}

function roleLabelKo(role: string, kind: string): string {
  const r = role.toLowerCase();
  if (r === 'demand' || kind === 'demandZone') return '카탈로그매수ZONE';
  if (r === 'supply' || kind === 'supplyZone') return '카탈로그매도ZONE';
  if (r === 'bos') return '카탈로그BOS';
  if (r === 'choch' || r === 'ch') return '카탈로그ChoCH';
  if (r === 'entry') return '카탈로그진입';
  if (r === 'stop') return '카탈로그손절';
  if (r === 'target') return '카탈로그목표';
  if (r === 'prz') return '카탈로그PRZ';
  if (r === 'resistance') return '카탈로그저항';
  if (r === 'support') return '카탈로그지지';
  if (r === 'flag') return '카탈로그플래그ZONE';
  return `카탈로그·${role || kind}`;
}

/** 기존 assets-ai 오버레이 → desk asset whitelist·한글 라벨 */
function restampCatalogOverlay(
  raw: OverlayItem,
  match: AssetsChartAiMatch,
  elIdx: number
): OverlayItem {
  const id0 = String(raw.id || '');
  const extra0 = String(raw.overlayZoneExtraClass || '');
  const role =
    extra0.match(/merged-desk-assets-ai-([a-z0-9_-]+)/)?.[1] ||
    String(raw.kind || 'zone');
  const kind = String(raw.kind || 'zone');
  const isZone =
    kind === 'zone' ||
    kind === 'demandZone' ||
    kind === 'supplyZone' ||
    kind === 'fvg' ||
    kind === 'ob';
  const label = isZone
    ? `${roleLabelKo(role, kind)}·${match.id.replace(/^img/, '')}`
    : roleLabelKo(role, kind);
  const isLong =
    role === 'demand' ||
    role === 'support' ||
    role === 'flag' ||
    kind === 'demandZone' ||
    /long|bull|매수|지지/i.test(label);

  const newKind =
    kind === 'zone'
      ? isLong
        ? 'demandZone'
        : 'supplyZone'
      : (kind as OverlayItem['kind']);

  return {
    ...raw,
    id: `merged-desk-asset-cat-${match.id}-${elIdx}-${id0.slice(-12)}`,
    kind: newKind,
    label,
    zoneFaceBase: label,
    labelTooltip: `${match.titleKo} · ${match.reasonKo} · 점수 ${(match.score * 100).toFixed(0)}% · 카탈로그 ${match.id} (참고)`,
    confidence: Math.round(55 + match.score * 40),
    category: 'zones',
    zoneFillPreserve: true,
    zonePulse: match.score >= 0.55 && isZone,
    lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
    labelBackgroundColor: isLong ? 'rgba(6,78,59,0.92)' : 'rgba(127,29,29,0.92)',
    labelTextColor: '#f8fafc',
    overlayZoneExtraClass: [
      'merged-desk-asset-auto-zone',
      'merged-desk-asset-catalog',
      'merged-desk-zone-caption-clean',
      'merged-desk-pill-zone',
      'merged-desk-zone-pro-hero',
      isLong ? 'overlay-zone--asset-auto-long' : 'overlay-zone--asset-auto-short',
      `merged-desk-asset-catalog--${role}`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * 카탈로그 전량 스코어 → TF 상한만큼 템플릿 작도.
 */
export function buildMergedDeskAssetsCatalogFullMatchPack(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
  tradePlan?: UnifiedDeskTradePlan | null;
}): AssetsCatalogFullMatchPack {
  const catalog = getAssetsImageCatalog();
  const chartable = getChartableAssetsEntries();
  const empty: AssetsCatalogFullMatchPack = {
    overlays: [],
    matches: [],
    summaryKo: '카탈로그 매칭용 봉 부족',
    catalogTotal: catalog.total,
    catalogChartable: chartable.length,
    matchedCount: 0,
    drawnCount: 0,
  };

  const work = mergedDeskAutoZoneDetectCandles(params.candles, params.timeframe);
  if (work.length < 24 || chartable.length === 0) return empty;

  const live = buildLiveStructureFeatures({
    analysis: params.analysis,
    smcLeading: params.smcLeading,
    dominantPatternType: params.analysis?.dominantPattern?.type ?? null,
    dominantPatternBias: params.analysis?.dominantPattern?.bias ?? null,
  });

  /** 분석/SMC 약할 때 캔들만으로 구조 힌트 보강 — 매칭 공백 방지 */
  if (!live.bos && !live.choch && work.length >= 30) {
    const n = work.length;
    const last = work[n - 1]!;
    const prev = work[n - 5]!;
    if (last.close > prev.high) live.bos = true;
    if (last.close < prev.low) live.bos = true;
    let fvgN = 0;
    for (let i = Math.max(2, n - 40); i < n; i++) {
      if (work[i - 2]!.high < work[i]!.low || work[i - 2]!.low > work[i]!.high) fvgN += 1;
    }
    live.fvg = Math.max(live.fvg ?? 0, Math.min(3, fvgN));
    if (last.close >= last.open) live.bias = live.bias === 'neutral' ? 'bullish' : live.bias;
    else live.bias = live.bias === 'neutral' ? 'bearish' : live.bias;
  }

  const limit = matchApplyLimit(params.timeframe);
  /** 전량 스코어 후 상위 limit (minScore 낮게 — 커버리지) */
  const matches = matchAssetsImagesToLive(live, Math.max(limit, 24), 0.22).slice(0, limit);

  const hasPlan =
    (params.tradePlan?.entry ?? 0) > 0 && params.tradePlan?.direction !== 'NEUTRAL';

  const overlays: OverlayItem[] = [];
  const seenRoles = new Set<string>();
  let drawnEntries = 0;

  for (const m of matches) {
    const entry = getAssetsCatalogEntryById(m.id);
    if (!entry?.drawTemplate?.elements?.length) continue;

    const raw = applyAssetsDrawTemplate(entry, work, { skipTradeLevels: hasPlan });
    if (!raw.length) continue;

    let added = 0;
    raw.forEach((o, i) => {
      const kind = String(o.kind || '');
      /** 라벨 핀 REF 는 스킵 — zone/선만 */
      if (kind === 'label') return;
      const stamped = restampCatalogOverlay(o, m, i);
      const roleKey = `${stamped.kind}:${Math.round(Number(stamped.price1) || 0)}`;
      /** 같은 가격대 과다 중복 완화 */
      if (seenRoles.has(roleKey) && added > 0) return;
      seenRoles.add(roleKey);
      overlays.push(stamped);
      added += 1;
    });
    if (added > 0) drawnEntries += 1;
    /** 엔트리당 zone 과다 방지 */
    if (overlays.length >= limit * 6) break;
  }

  const summaryKo =
    matches.length === 0
      ? `카탈로그 ${chartable.length}장 · 유사 매칭 없음`
      : `카탈로그 ${chartable.length}/${catalog.total} · 매칭${matches.length} · 작도${drawnEntries}장·${overlays.length}면 · top ${matches[0]?.id ?? '—'}`;

  return {
    overlays,
    matches,
    summaryKo,
    catalogTotal: catalog.total,
    catalogChartable: chartable.length,
    matchedCount: matches.length,
    drawnCount: drawnEntries,
  };
}

export function summarizeMergedDeskAssetsCatalogFullMatchKo(
  pack: AssetsCatalogFullMatchPack
): string {
  return pack.summaryKo;
}
