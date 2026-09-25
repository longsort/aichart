'use client';

import { useMemo } from 'react';
import type { MonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import styles from '../MonthDeskAnalysisBoard.module.css';

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

type TileSpec = {
  key: string;
  label: string;
  color: string;
  price: number | null;
  distKo: string;
  distPct: number | null;
  hint: string;
};

export default function MonthDeskActionLevelTiles({
  ta,
  levels,
  verdict,
  theme: vt,
}: {
  ta: MonthDeskTradeAction;
  levels: MonthDeskCoreLevels;
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  theme: MonthDeskVisualTheme;
}) {
  const tiles = useMemo((): TileSpec[] => {
    const byKey = (k: string) => ta.rows.find((r) => r.key === k);
    const entryRow = byKey('entry-mid') ?? byKey('entry');
    const invRow = byKey('inv');
    const tpRow = byKey('tp1');
    const supRow = byKey('sup');
    const resRow = byKey('res');

    const entryPrice =
      levels.entryMid ??
      (levels.entryLow != null && levels.entryHigh != null
        ? (levels.entryLow + levels.entryHigh) / 2
        : entryRow?.price ?? null);

    return [
      {
        key: 'entry',
        label: '진입 타점',
        color: vt.accent,
        price: entryPrice,
        distKo: entryRow?.distKo ?? '—',
        distPct: entryRow?.distPct ?? null,
        hint: verdict === 'LONG' ? '▲ 롱 구간' : verdict === 'SHORT' ? '▼ 숏 구간' : '대기',
      },
      {
        key: 'stop',
        label: '손절 · 무효',
        color: '#f87171',
        price: levels.invalidation ?? invRow?.price ?? null,
        distKo: invRow?.distKo ?? '—',
        distPct: invRow?.distPct ?? null,
        hint: '이탈 시 시나리오 폐기',
      },
      {
        key: 'target',
        label: '반등 · 목표',
        color: '#38bdf8',
        price: tpRow?.price ?? levels.targets[0] ?? null,
        distKo: tpRow?.distKo ?? '—',
        distPct: tpRow?.distPct ?? null,
        hint: levels.targets.length > 1 ? `TP1~${levels.targets.length}` : 'TP1',
      },
      {
        key: 'structure',
        label: verdict === 'LONG' ? '지지' : verdict === 'SHORT' ? '저항' : '구조',
        color: verdict === 'LONG' ? vt.long : verdict === 'SHORT' ? vt.short : vt.wait,
        price:
          verdict === 'LONG'
            ? (levels.support ?? supRow?.price ?? null)
            : verdict === 'SHORT'
              ? (levels.resistance ?? resRow?.price ?? null)
              : (levels.support ?? levels.resistance ?? null),
        distKo: (verdict === 'LONG' ? supRow : resRow)?.distKo ?? '—',
        distPct: (verdict === 'LONG' ? supRow : resRow)?.distPct ?? null,
        hint: verdict === 'LONG' ? '지지 유지' : verdict === 'SHORT' ? '저항 유지' : '관망',
      },
    ];
  }, [ta, levels, verdict, vt]);

  const span = useMemo(() => {
    const prices = tiles.map((t) => t.price).filter((p): p is number => p != null);
    if (levels.close != null) prices.push(levels.close);
    if (prices.length < 2) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.06 || 1;
    return { min: min - pad, max: max + pad };
  }, [tiles, levels.close]);

  const closePct =
    span && levels.close != null ? ((levels.close - span.min) / (span.max - span.min)) * 100 : null;

  return (
    <div className={styles.actionTilesWrap}>
      <div className={styles.actionTilesHead}>
        <span style={{ color: vt.accent, fontWeight: 900, fontSize: 11, letterSpacing: '0.06em' }}>
          실행 레벨 · 한눈에
        </span>
        {ta.rrLabel && <span className={styles.actionTilesRr}>{ta.rrLabel}</span>}
      </div>
      <div className={styles.actionTilesGrid}>
        {tiles.map((t) => {
          const barPct =
            span && t.price != null ? Math.max(4, Math.min(96, ((t.price - span.min) / (span.max - span.min)) * 100)) : null;
          return (
            <div
              key={t.key}
              className={styles.actionTile}
              style={{ borderColor: `${t.color}55`, boxShadow: `0 0 20px -8px ${t.color}66` }}
            >
              <div className={styles.actionTileBar} style={{ background: t.color }} />
              <div className={styles.actionTileLabel} style={{ color: t.color }}>
                {t.label}
              </div>
              <div className={styles.actionTilePrice} style={{ color: vt.text }}>
                {t.price != null ? fmtPx(t.price) : '—'}
              </div>
              <div className={styles.actionTileDist} style={{ color: t.color }}>
                {t.distKo}
              </div>
              <div className={styles.actionTileTrack}>
                {barPct != null && (
                  <>
                    <div className={styles.actionTileFill} style={{ width: `${barPct}%`, background: `${t.color}88` }} />
                    {closePct != null && (
                      <div className={styles.actionTileCloseDot} style={{ left: `${closePct}%` }} title="현재가" />
                    )}
                  </>
                )}
              </div>
              <div className={styles.actionTileHint} style={{ color: vt.textMuted }}>
                {t.hint}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
