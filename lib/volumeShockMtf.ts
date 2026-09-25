import { normalizeChartTimeframe } from '@/lib/constants';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import {
  VOLUME_SHOCK_MTF_TIMEFRAMES,
  type VolumeShockMtfTimeframe,
} from '@/lib/volumeShockThresholds';
import { computeVolumeShockForecast, type VolumeShockForecastResult } from '@/lib/volumeShockForecast';

export type VolumeShockMtfRow = {
  timeframe: string;
  ok: boolean;
  error?: string;
  source?: 'bitget-futures-csv' | 'binance-spot';
  result?: VolumeShockForecastResult;
  /** 현재 봉 쇼크 요약 */
  activeSide?: 'LONG' | 'SHORT' | 'MIXED' | 'NONE';
  headlineKo?: string;
};

export type VolumeShockMtfBundle = {
  symbol: string;
  lookbackDays: number;
  rows: VolumeShockMtfRow[];
  updatedAt: number;
};

function activeSideFromResult(r: VolumeShockForecastResult): 'LONG' | 'SHORT' | 'MIXED' | 'NONE' {
  const longHits =
    r.current.hitThresholdsBull.length + r.current.hitThresholdsBuy.length;
  const shortHits =
    r.current.hitThresholdsBear.length + r.current.hitThresholdsSell.length;
  if (longHits > 0 && shortHits > 0) return 'MIXED';
  if (longHits > 0) return 'LONG';
  if (shortHits > 0) return 'SHORT';
  return 'NONE';
}

function headlineForRow(r: VolumeShockForecastResult): string {
  const side = activeSideFromResult(r);
  const h4 =
    (side === 'SHORT'
      ? r.sellEventStats.find((s) => s.sampleCount >= 5) ?? r.bearEventStats.find((s) => s.sampleCount >= 5)
      : r.buyEventStats.find((s) => s.sampleCount >= 5) ?? r.bullEventStats.find((s) => s.sampleCount >= 5)) ??
    r.bullEventStats[0];
  const hz = h4?.horizons.find((x) => x.bars === 4) ?? h4?.horizons[0];
  if (!hz || !h4) {
    return side === 'NONE' ? '쇼크 없음' : `${side} 쇼크 · 표본 부족`;
  }
  const band = hz.usdBand;
  const usd =
    band != null
      ? `$${Math.round(Math.min(band.p25, band.p75))}~$${Math.round(Math.max(Math.abs(band.p25), Math.abs(band.p90)))}`
      : hz.medianMoveUsd != null
        ? `$${Math.round(hz.medianMoveUsd)}`
        : '—';
  const pct = Number.isFinite(hz.medianPct) ? `${hz.medianPct >= 0 ? '+' : ''}${hz.medianPct.toFixed(2)}%` : '—';
  const fav = (hz.probFavorable * 100).toFixed(0);
  const bias = side === 'SHORT' ? '숏' : side === 'LONG' ? '롱' : side === 'MIXED' ? '혼조' : '—';
  return `${bias} +${hz.bars}봉 ${fav}% · ${pct} · ${usd}`;
}

export async function computeVolumeShockMtfBundle(
  symbol: string,
  timeframes: readonly string[] = VOLUME_SHOCK_MTF_TIMEFRAMES,
  lookbackDays = 30
): Promise<VolumeShockMtfBundle> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tfs = timeframes.map((t) => normalizeChartTimeframe(t)).filter(Boolean);

  const rows = await Promise.all(
    tfs.map(async (tf): Promise<VolumeShockMtfRow> => {
      const loaded = await loadVolumeShockCandles(sym, tf, lookbackDays);
      if ('error' in loaded) {
        return { timeframe: tf, ok: false, error: loaded.error };
      }
      const out = computeVolumeShockForecast(loaded.candles, {
        thresholds: loaded.fixedThresholds,
        timeframe: tf,
        lookbackBars: loaded.lookbackBars,
        dataSource: loaded.source,
      });
      if ('error' in out) {
        return { timeframe: tf, ok: false, error: out.error, source: loaded.source };
      }
      return {
        timeframe: tf,
        ok: true,
        source: loaded.source,
        result: out,
        activeSide: activeSideFromResult(out),
        headlineKo: headlineForRow(out),
      };
    })
  );

  return { symbol: sym, lookbackDays, rows, updatedAt: Date.now() };
}

export type { VolumeShockMtfTimeframe };
