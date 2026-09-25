'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import {
  buildMonthDeskWhaleSnapshot,
  type MonthDeskWhalePhase,
  type MonthDeskWhaleSnapshot,
  type MonthDeskWhaleZone,
} from '@/lib/monthDeskWhaleDesk';
import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { ArcGauge, DualVerdictGauge } from './MonthDeskSvgGauges';
import MonthDeskWhaleFlowRail from './MonthDeskWhaleFlowRail';
import MonthDeskWhaleTimeline from './MonthDeskWhaleTimeline';
import styles from '../MonthDeskAnalysisBoard.module.css';

const PHASE_STYLE: Record<MonthDeskWhalePhase, { color: string; icon: string; pulse: boolean }> = {
  buy_incoming: { color: '#22d3ee', icon: '▲', pulse: true },
  buy_done: { color: '#4ade80', icon: '●', pulse: true },
  sell_incoming: { color: '#fb923c', icon: '▼', pulse: true },
  sell_done: { color: '#f87171', icon: '●', pulse: true },
  defend_long: { color: '#2dd4bf', icon: '🛡', pulse: false },
  defend_short: { color: '#f472b6', icon: '🛡', pulse: false },
  sell_zone: { color: '#fb7185', icon: '▽', pulse: false },
  neutral: { color: '#94a3b8', icon: '—', pulse: false },
};

export function useMonthDeskWhaleSnapshot(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
  symbol: string,
  timeframe: string
): MonthDeskWhaleSnapshot {
  const [memoryZones, setMemoryZones] = useState<MonthDeskWhaleZone[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/whale-memory?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      { credentials: 'same-origin', cache: 'no-store' }
    )
      .then((r) => r.json() as Promise<{ ok?: boolean; zones?: Array<{ id: string; label: string; price1: number; price2: number }> }>)
      .then((j) => {
        if (cancelled || !j.ok || !Array.isArray(j.zones)) return;
        setMemoryZones(
          j.zones.slice(0, 8).map((z) => ({
            id: z.id,
            side: (/buy|매수|bull|long|지지/i.test(z.label) ? 'buy' : 'sell') as 'buy' | 'sell',
            low: Math.min(z.price1, z.price2),
            high: Math.max(z.price1, z.price2),
            label: z.label.slice(0, 14),
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  return useMemo(
    () => buildMonthDeskWhaleSnapshot(analysis, candles, memoryZones),
    [analysis, candles, memoryZones]
  );
}

type Props = {
  snapshot: MonthDeskWhaleSnapshot;
  theme?: 'dark' | 'light';
  compact?: boolean;
};

export default function MonthDeskWhalePanel({ snapshot: snap, theme = 'dark', compact }: Props) {
  const vt = getMonthDeskVisualTheme(theme);
  const ps = PHASE_STYLE[snap.phase];
  const zoneAccent =
    snap.priceZoneStatus === 'inside_buy'
      ? '#22d3ee'
      : snap.priceZoneStatus === 'inside_sell'
        ? '#fb7185'
        : snap.priceZoneStatus === 'between'
          ? '#a78bfa'
          : ps.color;

  if (compact) {
    return (
      <div className={styles.chartHudWhaleStack}>
        <div
          className={`${styles.chartHudWhale} ${ps.pulse ? styles.whaleHeadlinePulse : ''}`}
          style={{
            color: ps.color,
            borderColor: `${ps.color}55`,
            background: `${ps.color}14`,
            boxShadow: `0 0 20px ${ps.color}33`,
          }}
        >
          <span>{ps.icon}</span>
          <span style={{ fontWeight: 900 }}>{snap.headlineKo}</span>
          <span style={{ color: vt.textMuted, fontWeight: 600, fontSize: 9 }}>
            활동 {snap.activityScore}% · {snap.flowStageKo}
          </span>
        </div>
        <MonthDeskWhaleTimeline bars={snap.timeline} compact />
      </div>
    );
  }

  return (
    <section className={`${styles.panel} ${styles.whalePanel}`}>
      <div className={styles.whalePanelGlow} style={{ background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${ps.color}33, transparent 70%)` }} />
      <div className={styles.panelInner}>
        <div className={styles.whalePanelHead}>
          <span className={styles.panelLabel} style={{ color: '#67e8f9', marginBottom: 0 }}>
            🐋 세력 · 고래
          </span>
          <span className={styles.whaleActivityBadge} style={{ color: ps.color, borderColor: `${ps.color}66`, background: `${ps.color}18` }}>
            활동 {snap.activityScore}%
          </span>
        </div>

        <div
          className={`${styles.whaleZoneBanner} ${snap.priceZoneStatus !== 'outside' ? styles.whaleZoneBannerHot : ''}`}
          style={{
            borderColor: `${zoneAccent}88`,
            background: `linear-gradient(90deg, ${zoneAccent}22, transparent)`,
            color: zoneAccent,
            boxShadow: snap.priceZoneStatus !== 'outside' ? `0 0 32px ${zoneAccent}44` : undefined,
          }}
        >
          {snap.zoneBannerKo}
        </div>

        <div
          className={`${styles.whaleHeadline} ${ps.pulse ? styles.whaleHeadlinePulse : ''}`}
          style={{
            color: ps.color,
            borderColor: `${ps.color}66`,
            background: `${ps.color}18`,
            boxShadow: `0 0 40px ${ps.color}55, inset 0 1px 0 rgba(255,255,255,0.12)`,
          }}
        >
          <span className={styles.whaleHeadlineIcon}>{ps.icon}</span>
          <span>{snap.headlineKo}</span>
        </div>

        <MonthDeskWhaleFlowRail activeStage={snap.flowStage} activeIndex={snap.flowStageIndex} accent={ps.color} />

        <p className={styles.whaleDetail} style={{ color: vt.textMuted }}>
          {snap.detailKo}
        </p>

        <MonthDeskWhaleTimeline bars={snap.timeline} />

        <div className={styles.whaleGaugeRow}>
          <div className={styles.whaleGaugeCluster}>
            <ArcGauge
              value={snap.activityScore}
              max={100}
              size={120}
              stroke={10}
              color={ps.color}
              trackColor={vt.track}
              textColor={vt.gaugeText}
              subtextColor={vt.textMuted}
              label="고래 활동"
              sublabel="%"
              displayValue={`${snap.activityScore}`}
              animated
            />
            <DualVerdictGauge
              longPct={snap.buyPressure}
              shortPct={snap.sellPressure}
              size={200}
              longColor="#22d3ee"
              shortColor="#fb7185"
              trackColor={vt.track}
              animated
            />
          </div>
          <div className={styles.whaleChips}>
            <WhaleChip on={snap.lastBarBuy} onColor="#86efac" onBorder="#4ade80" label={snap.lastBarBuy ? '● 매수 WAD' : '○ 매수 WAD'} muted={vt.textMuted} track={vt.track} pulse={snap.lastBarBuy} />
            <WhaleChip on={snap.lastBarSell} onColor="#fca5a5" onBorder="#f87171" label={snap.lastBarSell ? '● 매도 WAD' : '○ 매도 WAD'} muted={vt.textMuted} track={vt.track} pulse={snap.lastBarSell} />
            <WhaleChip on={snap.inBuyZone} onColor="#5eead4" onBorder="#2dd4bf" label={snap.inBuyZone ? '● 매수존(지킴)' : '○ 매수존'} muted={vt.textMuted} track={vt.track} pulse={snap.inBuyZone} />
            <WhaleChip on={snap.inSellZone} onColor="#fdba74" onBorder="#fb923c" label={snap.inSellZone ? '● 매도존(분산)' : '○ 매도존'} muted={vt.textMuted} track={vt.track} pulse={snap.inSellZone} />
            <WhaleChip on={snap.confluentLong} onColor="#a5f3fc" onBorder="#22d3ee" label={`유입×${snap.recentConfluentLong}`} muted={vt.textMuted} track={vt.track} pulse={snap.confluentLong} />
            <WhaleChip on={snap.confluentShort} onColor="#fda4af" onBorder="#fb7185" label={`유출×${snap.recentConfluentShort}`} muted={vt.textMuted} track={vt.track} pulse={snap.confluentShort} />
            {snap.defendPrice != null && (
              <div className={`${styles.whaleChip} ${styles.whaleChipGlow}`} style={{ borderColor: '#2dd4bf', color: '#5eead4' }}>
                🛡 {snap.defendLabel ?? '방어'} {fmt(snap.defendPrice)}
              </div>
            )}
            {snap.attackPrice != null && (
              <div className={`${styles.whaleChip} ${styles.whaleChipGlow}`} style={{ borderColor: '#fb7185', color: '#fda4af' }}>
                ▽ {snap.attackLabel ?? '매도'} {fmt(snap.attackPrice)}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function WhaleChip({
  on,
  onColor,
  onBorder,
  label,
  muted,
  track,
  pulse,
}: {
  on: boolean;
  onColor: string;
  onBorder: string;
  label: string;
  muted: string;
  track: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={`${styles.whaleChip} ${on ? styles.whaleChipOn : ''} ${pulse ? styles.whaleChipPulse : ''}`}
      style={{ borderColor: on ? onBorder : track, color: on ? onColor : muted } as CSSProperties}
    >
      {label}
    </div>
  );
}
