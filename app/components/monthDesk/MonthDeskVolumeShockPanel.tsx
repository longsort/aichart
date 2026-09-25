'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VolumeShockForecastResult, VolumeShockStat } from '@/lib/volumeShockForecast';
import type { VolumeShockMtfBundle, VolumeShockMtfRow } from '@/lib/volumeShockMtf';
import {
  bestVolumeShockStat,
  fmtUsdBandKo,
  fmtVolPct,
  fmtVolUsd,
  horizonAt,
} from '@/lib/volumeShockFormat';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  symbol: string;
  timeframe: string;
  theme: MonthDeskVisualTheme;
};

function StatBlock({
  title,
  color,
  stat,
  close,
  favorableLabel,
}: {
  title: string;
  color: string;
  stat: VolumeShockStat | null;
  close: number;
  favorableLabel: string;
}) {
  if (!stat || stat.sampleCount < 1) return null;
  const h1 = horizonAt(stat, 1);
  const h4 = horizonAt(stat, 4);
  const h12 = horizonAt(stat, 12);
  const side = stat.eventSide === 'bear' || stat.eventSide === 'sell' ? 'short' : 'long';
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 700, color, marginBottom: 4, fontSize: 11 }}>{title}</div>
      <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>{stat.thresholdLabel} · n={stat.sampleCount}</div>
      {[h1, h4, h12].map((h) =>
        h ? (
          <div key={h.bars} style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.5 }}>
            +{h.bars}봉 {favorableLabel} {(h.probFavorable * 100).toFixed(0)}% · 중앙 {fmtVolUsd(h.medianMoveUsd)} ({fmtVolPct(h.medianPct)})
            {h.usdBand ? ` · 구간 ${fmtUsdBandKo(h.usdBand, side)}` : ''}
          </div>
        ) : null
      )}
      {stat.sampleLowTrust && (
        <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 4 }}>표본 30 미만 — 참고용</div>
      )}
    </div>
  );
}

function MtfGrid({ rows, theme, activeTf }: { rows: VolumeShockMtfRow[]; theme: MonthDeskVisualTheme; activeTf: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
        gap: 6,
        marginTop: 10,
      }}
    >
      {rows.map((row) => {
        const accent =
          row.activeSide === 'LONG'
            ? theme.long
            : row.activeSide === 'SHORT'
              ? theme.short
              : row.activeSide === 'MIXED'
                ? theme.wait
                : theme.textMuted;
        const isActive = row.timeframe === activeTf;
        return (
          <div
            key={row.timeframe}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: isActive ? `1px solid ${accent}` : '1px solid rgba(148,163,184,0.2)',
              background: isActive ? 'rgba(34,211,238,0.08)' : 'rgba(15,23,42,0.5)',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 800, color: isActive ? '#22d3ee' : '#e2e8f0' }}>{row.timeframe}</div>
            {row.ok ? (
              <>
                <div style={{ color: accent, fontWeight: 700 }}>{row.activeSide ?? 'NONE'}</div>
                <div style={{ color: theme.textMuted, marginTop: 2 }}>{row.headlineKo}</div>
              </>
            ) : (
              <div style={{ color: '#f87171' }}>{row.error ?? '—'}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MonthDeskVolumeShockPanel({ symbol, timeframe, theme }: Props) {
  const [vs, setVs] = useState<VolumeShockForecastResult | null>(null);
  const [mtf, setMtf] = useState<VolumeShockMtfBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tf = useMemo(() => {
    const t = String(timeframe || '15m');
    return ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'].includes(t) ? t : '15m';
  }, [timeframe]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({
        symbol: String(symbol || 'BTCUSDT').toUpperCase(),
        timeframe: tf,
        horizons: '1,4,12',
        lookbackDays: '30',
      });
      const mtfQ = new URLSearchParams({
        symbol: String(symbol || 'BTCUSDT').toUpperCase(),
        lookbackDays: '30',
      });
      const [res, mtfRes] = await Promise.all([
        fetch(`/api/volume-shock-forecast?${q.toString()}`, { cache: 'no-store' }),
        fetch(`/api/volume-shock-mtf?${mtfQ.toString()}`, { cache: 'no-store' }),
      ]);
      const j = (await res.json()) as { ok?: boolean; result?: VolumeShockForecastResult; error?: string };
      const mj = (await mtfRes.json()) as { ok?: boolean; bundle?: VolumeShockMtfBundle; error?: string };
      if (!res.ok || !j.ok || !j.result) {
        setErr(j.error || '통계 로드 실패');
        setVs(null);
      } else {
        setVs(j.result);
      }
      if (mj.ok && mj.bundle) setMtf(mj.bundle);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '요청 실패');
      setVs(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = vs?.current.close ?? 0;
  const bullBest = useMemo(() => bestVolumeShockStat(vs?.bullEventStats ?? []), [vs]);
  const bearBest = useMemo(() => bestVolumeShockStat(vs?.bearEventStats ?? []), [vs]);
  const buyBest = useMemo(() => bestVolumeShockStat(vs?.buyEventStats ?? []), [vs]);
  const sellBest = useMemo(() => bestVolumeShockStat(vs?.sellEventStats ?? []), [vs]);

  const liveHint = useMemo(() => {
    if (!vs) return null;
    const lines: string[] = [];
    const c = vs.current;
    lines.push(
      `총량 ${c.volume.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} · 매수 ${c.buyVolume.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} · 매도 ${c.sellVolume.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
    );
    if (c.hitThresholdsBuy.length || c.hitThresholdsBull.length) {
      lines.push('현재: 매수/양봉 대량 쇼크 — 과거 롱 방향 분포 참고');
    }
    if (c.hitThresholdsSell.length || c.hitThresholdsBear.length) {
      lines.push('현재: 매도/음봉 대량 쇼크 — 과거 숏·하락 분포 참고');
    }
    if (!c.hitThresholdsBuy.length && !c.hitThresholdsSell.length && !c.hitThresholdsBull.length && !c.hitThresholdsBear.length) {
      lines.push('현재 봉: 대량 쇼크 미충족 — 아래 MTF·과거 표 참고');
    }
    lines.push(
      `참고 구간: 과거 ${vs.lookbackBars.toLocaleString('ko-KR')}봉 · ${vs.shortTermRegime.label} (Δ ${fmtVolPct(vs.shortTermRegime.changePct)}) · 확정 예측 아님`
    );
    return lines;
  }, [vs]);

  return (
    <section
      className={styles.panel}
      style={{
        marginTop: 10,
        borderColor: 'rgba(34,211,238,0.22)',
        background: 'linear-gradient(165deg, rgba(8,20,32,0.92), rgba(6,12,22,0.88))',
      }}
    >
      <div className={styles.panelInner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#22d3ee' }}>거래량 쇼크 · MTF · 매수/매도</div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4, lineHeight: 1.45 }}>
              통계: 비트겟 CSV/API. <strong style={{ color: '#22d3ee' }}>차트 캔들·거래량</strong>은 마감·안착 시 Bitget BTCUSDT.P 직결(
              <code style={{ fontSize: 9 }}>/api/market-bitget</code>).
            </div>
          </div>
          <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => void load()}>
            {loading ? '계산…' : '전 TF 재계산'}
          </button>
        </div>

        {err && <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{err}</div>}

        {mtf?.rows?.length ? <MtfGrid rows={mtf.rows} theme={theme} activeTf={tf} /> : null}

        {vs && (
          <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.55, color: '#cbd5e1' }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: theme.textMuted }}>선택 {tf} · </span>
              <strong style={{ color: vs.dataSource === 'bitget-futures-csv' ? '#22d3ee' : '#fbbf24' }}>
                {vs.dataSource === 'bitget-futures-csv' ? 'Bitget CSV' : 'Binance'}
              </strong>
              <span style={{ color: theme.textMuted }}> · 종가 </span>
              <strong>${close.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
              <span style={{ color: theme.textMuted }}> · 강도 </span>
              <strong>{vs.currentEventScore}</strong>
            </div>

            <StatBlock title="양봉·총량 (롱 참고)" color={theme.long} stat={bullBest} close={close} favorableLabel="상승" />
            <StatBlock title="매수거래량 급증 (롱 참고)" color="#34d399" stat={buyBest} close={close} favorableLabel="상승" />
            <StatBlock title="음봉·총량 (숏 참고)" color={theme.short} stat={bearBest} close={close} favorableLabel="하락" />
            <StatBlock title="매도거래량 급증 (숏 참고)" color="#fb7185" stat={sellBest} close={close} favorableLabel="하락" />

            {liveHint?.map((line, i) => (
              <div key={i} style={{ color: i === 0 ? '#e2e8f0' : theme.textMuted, marginTop: i > 0 ? 4 : 0 }}>
                {line}
              </div>
            ))}

            {vs.lowSampleWarning && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#fbbf24' }}>
                일부 임계 표본 부족 — %·USD 구간은 과거 분포 참고이며 확정 수익이 아닙니다.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
