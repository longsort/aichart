'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { buildCandleTradeAtlas } from '@/lib/candleTradeAtlas';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import styles from '../MonthDeskAnalysisBoard.module.css';

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function distKo(close: number, target: number): string {
  const d = ((target - close) / close) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;
}

export default function CandleTradeAtlasBoard({
  analysis,
  candles,
  timeframe,
  theme: vt,
}: {
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  timeframe: string;
  theme: MonthDeskVisualTheme;
}) {
  const atlas = useMemo(
    () => (analysis && candles?.length ? buildCandleTradeAtlas(analysis, candles, timeframe) : null),
    [analysis, candles, timeframe]
  );

  if (!atlas) return null;

  const accent =
    atlas.verdict === 'LONG' ? vt.long : atlas.verdict === 'SHORT' ? vt.short : vt.wait;
  const close = atlas.currentPrice;

  const ladder = [
    { key: 'tp3', label: 'TP3', price: atlas.takeProfits[2]?.price, color: '#2dd4bf' },
    { key: 'tp2', label: 'TP2', price: atlas.takeProfits[1]?.price, color: '#34d399' },
    { key: 'tp1', label: 'TP1', price: atlas.takeProfits[0]?.price, color: '#4ade80' },
    { key: 'entry', label: '★ 타점 E', price: atlas.entry, color: '#fde047', strong: true },
    { key: 'sl', label: '⛔ 손절 SL', price: atlas.stopLoss, color: '#f87171', strong: true },
  ].filter((r) => r.price != null && Number.isFinite(r.price)) as Array<{
    key: string;
    label: string;
    price: number;
    color: string;
    strong?: boolean;
  }>;

  return (
    <section className={styles.atlasBoard} style={{ borderColor: `${accent}44` }}>
      <div className={styles.atlasBoardHead}>
        <div>
          <div className={styles.atlasBoardTitle} style={{ color: vt.text }}>
            타점 · 손절 · 수익 (Trade Atlas)
          </div>
          <div className={styles.atlasBoardSub} style={{ color: vt.textMuted }}>
            {timeframe} — 롱/숏 구간 + 진입 후 SL·TP — 차트와 동일
          </div>
        </div>
        <div className={styles.atlasVerdictPill} style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}>
          {atlas.verdictLabel}
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 9 }}>L{atlas.longPct}/S{atlas.shortPct}</span>
        </div>
      </div>

      <div className={styles.atlasStatusBar} style={{ borderColor: `${accent}33`, color: accent, background: `${accent}10` }}>
        <strong>{atlas.statusKo}</strong>
        <span style={{ color: vt.text, fontWeight: 500, marginLeft: 6 }}>{atlas.actionKo}</span>
      </div>

      <div className={styles.atlasZoneRow}>
        {atlas.longZone && (
          <div className={styles.atlasZoneBox} style={{ borderColor: 'rgba(74,222,128,0.4)', background: 'rgba(34,197,94,0.08)' }}>
            <div className={styles.atlasZoneLabel} style={{ color: '#4ade80' }}>
              ▲ 롱 구간
            </div>
            <div className={styles.atlasZonePrice}>
              {fmtPx(atlas.longZone.low)} ~ {fmtPx(atlas.longZone.high)}
            </div>
            <div className={styles.atlasZoneHint}>{atlas.longZone.labelKo}</div>
          </div>
        )}
        {atlas.shortZone && (
          <div className={styles.atlasZoneBox} style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(239,68,68,0.08)' }}>
            <div className={styles.atlasZoneLabel} style={{ color: '#f87171' }}>
              ▼ 숏 구간
            </div>
            <div className={styles.atlasZonePrice}>
              {fmtPx(atlas.shortZone.low)} ~ {fmtPx(atlas.shortZone.high)}
            </div>
            <div className={styles.atlasZoneHint}>{atlas.shortZone.labelKo}</div>
          </div>
        )}
      </div>

      <div className={styles.atlasLadder}>
        {ladder.map((row) => (
          <div
            key={row.key}
            className={`${styles.atlasLadderRow} ${row.strong ? styles.atlasLadderRowStrong : ''}`}
            style={{ borderColor: `${row.color}44` }}
          >
            <span className={styles.atlasLadderLabel} style={{ color: row.color }}>
              {row.label}
            </span>
            <span className={styles.atlasLadderPrice}>{fmtPx(row.price)}</span>
            <span className={styles.atlasLadderDist}>{distKo(close, row.price)}</span>
          </div>
        ))}
      </div>

      <div className={styles.atlasMetaRow}>
        {atlas.gateLine && <span style={{ color: '#67e8f9' }}>{atlas.gateLine}</span>}
        <span style={{ color: atlas.rrTp1 >= 1 ? '#86efac' : '#fde047' }}>
          TP1 R≈ {atlas.rrTp1 >= 0.01 ? atlas.rrTp1.toFixed(2) : '–'}
        </span>
        <span style={{ color: vt.textMuted }}>현재 {fmtPx(close)}</span>
      </div>
    </section>
  );
}
