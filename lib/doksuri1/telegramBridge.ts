/**
 * Doksuri-1 — 텔레그램 번들/확정 알림용 브릿지.
 * 독수리전황 칩 ON이면 전문 전황 HTML을 우선 사용 (Deriv·오더플로 포함).
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { buildDumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import { buildMergedDeskMtfDumpZonePack } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  buildDoksuri1Pack,
  type BuildDoksuri1PackInput,
} from '@/lib/doksuri1/buildDoksuri1Pack';
import { fetchDoksuri1WhaleBeamPackServer } from '@/lib/doksuri1/whaleFetchServer';
import {
  buildDoksuri1StateFingerprint,
  shouldEmitDoksuri1StateChange,
} from '@/lib/doksuri1/stateDedupe';
import { formatDoksuri1TelegramCaptionHtml } from '@/lib/doksuri1/marketStory';
import type { Doksuri1Pack } from '@/lib/doksuri1/types';
import type { DualPlanSwingLite } from '@/lib/doksuri1/dualPlanBuilder';

export type DoksuriTelegramResult =
  | { status: 'disabled' }
  | { status: 'skipped' }
  | { status: 'ok'; pack: Doksuri1Pack; html: string; photoCaptionHtml: string };

export function isDoksuri1TelegramEnabled(settings: UserSettings): boolean {
  return settings.chartMergedDeskDoksuri1BriefingEnabled !== false;
}

/** 사진 캡션 — 방향·진입·손절·목표만 */
export function formatDoksuri1PhotoCaptionHtml(pack: Doksuri1Pack): string {
  return formatDoksuri1TelegramCaptionHtml(pack.fact);
}

export async function buildDoksuri1TelegramAlert(params: {
  settings: UserSettings;
  apiBase: string;
  symbol: string;
  timeframe: string;
  price: number;
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  swing?: DualPlanSwingLite | null;
  levels?: {
    entry?: number | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
  } | null;
  structureLabelKo?: string | null;
  structureSummaryKo?: string | null;
  structureVerdict?: string | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  hqEntryZones?: BuildDoksuri1PackInput['hqEntryZones'];
  deskHud?: BuildDoksuri1PackInput['deskHud'];
  masterGrade?: string | null;
  masterSide?: string | null;
  skipIfUnchanged?: boolean;
  eventKind?: string;
}): Promise<DoksuriTelegramResult> {
  if (!isDoksuri1TelegramEnabled(params.settings)) return { status: 'disabled' };

  const chartTf = normalizeChartTimeframe(params.timeframe);
  const whale = await fetchDoksuri1WhaleBeamPackServer({
    apiBase: params.apiBase,
    symbol: params.symbol,
    timeframe: chartTf,
    candles: params.candles,
  });

  let zones = params.dumpZones ?? null;
  if ((!zones || !zones.length) && params.candles.length >= 12) {
    try {
      const dumpPack = buildMergedDeskMtfDumpZonePack({
        chartCandles: params.candles,
        chartTf,
        candlesByTf: { [chartTf]: params.candles },
        displayMode: 'mtf',
      });
      zones = dumpPack?.zones?.length ? dumpPack.zones : null;
    } catch {
      zones = null;
    }
  }

  const srPath =
    zones && zones.length
      ? buildDumpSupportResistPath({
          zones: zones.map((z) => ({
            sourceTf: z.sourceTf,
            sourceTfKo: z.sourceTfKo || z.sourceTf,
            bandRole: z.bandRole,
            mid: z.mid,
            top: z.top,
            bot: z.bot,
            lifeState: z.lifeState,
            evidenceScore: z.evidenceScore,
          })),
          bounceCap: null,
          priceNow: params.price,
          chartCandles: params.candles,
        })
      : null;

  const structure =
    params.structureLabelKo
      ? {
          verdict:
            (params.structureVerdict as
              | 'BOUNCE'
              | 'WAIT'
              | 'DECLINE_CONFIRMED'
              | 'RISE_CONFIRMED'
              | 'PULLBACK') || 'WAIT',
          labelKo: params.structureLabelKo,
          summaryKo: params.structureSummaryKo || params.structureLabelKo,
          detailKo: '',
          confidence: 55,
          overlays: [],
        }
      : null;

  const accountUsdt = Number(params.settings.swingSeedUsdt) || 1000;
  const riskPct = Number(params.settings.chartMergedDeskDoksuri1RiskPct) || 5;

  const pack = buildDoksuri1Pack({
    symbol: params.symbol,
    timeframe: params.timeframe,
    price: params.price,
    candles: params.candles,
    dumpZones: zones,
    srPath,
    whale,
    structure,
    swing: params.swing,
    levels: params.levels,
    analysis: params.analysis,
    derivEnabled: true,
    orderflowEnabled: true,
    enabled: true,
    accountUsdt,
    riskPct,
    hqEntryZones: params.hqEntryZones,
    deskHud: params.deskHud,
    masterGrade: params.masterGrade,
    masterSide: params.masterSide,
  });
  if (!pack) return { status: 'disabled' };

  if (params.skipIfUnchanged) {
    const scope = `tg|${params.symbol}|${params.timeframe}`;
    const fp = buildDoksuri1StateFingerprint({
      factHash: pack.fact.factHash,
      dominantSide: pack.fact.dominantSide,
      bigMoneyState: pack.fact.bigMoneyState,
      action: pack.fact.action,
      zoneScores: pack.fact.zoneScores,
      candleEventFingerprint: pack.fact.candleEventFingerprint,
    });
    if (!shouldEmitDoksuri1StateChange(scope, fp) && params.eventKind === 'candidate') {
      return { status: 'skipped' };
    }
  }

  return {
    status: 'ok',
    pack,
    html: pack.storyHtml,
    photoCaptionHtml: formatDoksuri1PhotoCaptionHtml(pack),
  };
}
