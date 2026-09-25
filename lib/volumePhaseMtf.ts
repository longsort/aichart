import { normalizeChartTimeframe } from '@/lib/constants';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import {
  computeVolumePhaseStatsFromCandles,
  matchCurrentPhase,
  type VolumePhaseCurrentMatch,
  type VolumePhaseStatsFile,
} from '@/lib/volumePhaseStats';
import { readVolumePhaseStats, writeVolumePhaseStats } from '@/lib/volumePhaseStatsStore';
import {
  parentHtfForPhaseStats,
  phaseHorizonsForTf,
  phaseLookbackDaysForTf,
  VOLUME_PHASE_STATS_TIMEFRAMES,
  volumePhaseStatsTfLabel,
} from '@/lib/volumePhaseTimeframes';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import type { Candle } from '@/types';

export type VolumePhaseMtfRow = {
  timeframe: string;
  labelKo: string;
  ok: boolean;
  error?: string;
  stats?: VolumePhaseStatsFile;
  current?: VolumePhaseCurrentMatch | null;
  headlineKo?: string;
};

export type VolumePhaseMtfBundle = {
  symbol: string;
  timeframes: string[];
  rows: VolumePhaseMtfRow[];
  updatedAt: number;
};

async function loadHtfCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const parent = parentHtfForPhaseStats(timeframe);
  if (!parent) return [];
  try {
    const csv = await readBitgetFuturesCsv(symbol, parent);
    if (csv.length >= 30) return csv;
  } catch {
    /* binance fallback */
  }
  const loaded = await loadVolumeShockCandles(symbol, parent, phaseLookbackDaysForTf(parent));
  if ('error' in loaded) return [];
  return loaded.candles;
}

function headlineFromCurrent(tf: string, cur: VolumePhaseCurrentMatch | null): string {
  if (!cur) return '매칭 없음';
  const h = cur.horizons.find((x) => x.bars === cur.primaryHorizon) ?? cur.horizons[0];
  if (!h) return cur.label;
  const prob = Math.round(h.probFavorable * 100);
  const med = h.medianUsd != null ? `$${Math.round(h.medianUsd)}` : '—';
  const n = h.sampleCount;
  const side = cur.eventType === 'RANGE_DIST' ? '하락' : cur.eventType === 'RANGE_ACC' ? '상승' : '방향';
  return `${volumePhaseStatsTfLabel(tf)} · n=${n} +${h.bars} ${side} ${med} ${prob}%`;
}

export async function computeVolumePhaseMtfBundle(
  symbol: string,
  timeframes: readonly string[] = VOLUME_PHASE_STATS_TIMEFRAMES,
  options?: { rebuildMissing?: boolean }
): Promise<VolumePhaseMtfBundle> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tfs = timeframes.map((t) => normalizeChartTimeframe(t)).filter(Boolean);

  const rows = await Promise.all(
    tfs.map(async (tf): Promise<VolumePhaseMtfRow> => {
      const labelKo = volumePhaseStatsTfLabel(tf);
      try {
        let file = await readVolumePhaseStats(sym, tf);
        let candles: Candle[] = [];

        if (!file || options?.rebuildMissing) {
          const loaded = await loadVolumeShockCandles(sym, tf, phaseLookbackDaysForTf(tf));
          if ('error' in loaded) {
            return { timeframe: tf, labelKo, ok: false, error: loaded.error };
          }
          candles = loaded.candles;
          const htfCandles = await loadHtfCandles(sym, tf);
          file = computeVolumePhaseStatsFromCandles(sym, tf, candles, {
            htfCandles: htfCandles.length >= 30 ? htfCandles : undefined,
            horizons: phaseHorizonsForTf(tf),
          });
          if (file.eventCount >= 5) {
            await writeVolumePhaseStats(file).catch(() => undefined);
          }
        } else {
          try {
            candles = await readBitgetFuturesCsv(sym, tf);
          } catch {
            const loaded = await loadVolumeShockCandles(sym, tf, phaseLookbackDaysForTf(tf));
            if (!('error' in loaded)) candles = loaded.candles;
          }
        }

        const htfCandles = candles.length >= 80 ? await loadHtfCandles(sym, tf) : [];
        const current =
          candles.length >= 80 && file
            ? matchCurrentPhase(candles, tf, file, htfCandles.length >= 30 ? htfCandles : undefined)
            : null;

        return {
          timeframe: tf,
          labelKo,
          ok: true,
          stats: file ?? undefined,
          current,
          headlineKo: headlineFromCurrent(tf, current),
        };
      } catch (e: unknown) {
        return {
          timeframe: tf,
          labelKo,
          ok: false,
          error: e instanceof Error ? e.message : 'failed',
        };
      }
    })
  );

  return {
    symbol: sym,
    timeframes: tfs,
    rows,
    updatedAt: Date.now(),
  };
}
