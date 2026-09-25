'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MirageDashboard } from '@/lib/mirageLiquiditySweepIndicator';
import { MIRAGE_LSP_VERSION } from '@/lib/mirageLiquiditySweepIndicator';
import styles from './MergedAnalysisDesk.module.css';

const MIRAGE_DASH_COLLAPSED_KEY = 'ailongshort-mirage-dash-collapsed';

type Props = {
  dashboard: MirageDashboard | null | undefined;
  theme?: 'dark' | 'light';
};

export default function MergedAnalysisMirageDashboard({ dashboard, theme = 'dark' }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MIRAGE_DASH_COLLAPSED_KEY);
      if (raw === '1' || raw === 'true') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MIRAGE_DASH_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (!dashboard) return null;

  const headerClass =
    dashboard.headerTone === 'bull'
      ? styles.mirageDashHeaderBull
      : dashboard.headerTone === 'bear'
        ? styles.mirageDashHeaderBear
        : styles.mirageDashHeaderFlat;

  return (
    <div
      className={`${styles.mirageDash}${collapsed ? ` ${styles.mirageDashCollapsed}` : ''}`}
      data-theme={theme}
      aria-label="Mirage LSP 대시보드"
    >
      <button
        type="button"
        className={`${styles.mirageDashHeader} ${styles.mirageDashHeaderBtn} ${headerClass}`}
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="mirage-lsp-dash-body"
        title={collapsed ? 'Mirage 대시보드 펼치기' : 'Mirage 대시보드 접기'}
      >
        <span className={styles.mirageDashHeaderTitle}>{dashboard.headerKo}</span>
        <span className={styles.mirageDashToggle} aria-hidden>
          {collapsed ? '펼치기 ▸' : '접기 ▾'}
        </span>
      </button>

      {!collapsed && (
      <div id="mirage-lsp-dash-body">
      <div className={styles.mirageDashSection}>— 시장 —</div>
      <div className={styles.mirageDashRow}>
        <span className={styles.mirageDashKey}>추세</span>
        <span className={styles.mirageDashVal}>{dashboard.market.trendKo}</span>
      </div>
      <div className={styles.mirageDashRowAlt}>
        <span className={styles.mirageDashKey}>상위 프레임 편향</span>
        <span className={styles.mirageDashVal}>{dashboard.market.htfBiasKo}</span>
      </div>
      <div className={styles.mirageDashRow}>
        <span className={styles.mirageDashKey}>신호</span>
        <span className={styles.mirageDashVal}>{dashboard.market.signalKo}</span>
      </div>
      <div className={styles.mirageDashRowAlt}>
        <span className={styles.mirageDashKey}>마지막 스윕</span>
        <span className={styles.mirageDashVal}>{dashboard.market.lastSweepKo}</span>
      </div>
      <div className={styles.mirageDashRow}>
        <span className={styles.mirageDashKey}>타임프레임</span>
        <span className={styles.mirageDashVal}>{dashboard.market.timeframe}</span>
      </div>

      <div className={styles.mirageDashSection}>— 매매 —</div>
      {dashboard.trade.flat ? (
        <div className={styles.mirageDashFlat}>{dashboard.trade.statusKo}</div>
      ) : (
        <>
          <div className={styles.mirageDashRow}>
            <span className={styles.mirageDashKey}>손절</span>
            <span className={styles.mirageDashValSl}>{dashboard.trade.sl}</span>
          </div>
          <div className={styles.mirageDashRowAlt}>
            <span className={styles.mirageDashKey}>익절1</span>
            <span className={styles.mirageDashValTp}>{dashboard.trade.tp1}</span>
          </div>
          <div className={styles.mirageDashRow}>
            <span className={styles.mirageDashKey}>익절2</span>
            <span className={styles.mirageDashValTp}>{dashboard.trade.tp2}</span>
          </div>
          <div className={styles.mirageDashRowAlt}>
            <span className={styles.mirageDashKey}>익절3</span>
            <span className={styles.mirageDashValTp}>{dashboard.trade.tp3}</span>
          </div>
          <div className={styles.mirageDashRow}>
            <span className={styles.mirageDashKey}>R:R (익절1)</span>
            <span className={styles.mirageDashVal}>{dashboard.trade.rr}</span>
          </div>
          <div className={styles.mirageDashRowAlt}>
            <span className={styles.mirageDashKey}>손절 거리 %</span>
            <span className={styles.mirageDashVal}>{dashboard.trade.slDistPct}</span>
          </div>
        </>
      )}

      <div className={styles.mirageDashSection}>— 통계 —</div>
      <div className={styles.mirageDashRow}>
        <span className={styles.mirageDashKey}>총 거래</span>
        <span className={styles.mirageDashVal}>{dashboard.stats.trades}</span>
      </div>
      <div className={styles.mirageDashRowAlt}>
        <span className={styles.mirageDashKey}>승 / 패</span>
        <span className={styles.mirageDashVal}>
          {dashboard.stats.wins} / {dashboard.stats.losses}
        </span>
      </div>
      <div className={styles.mirageDashRow}>
        <span className={styles.mirageDashKey}>승률</span>
        <span className={styles.mirageDashValWr}>{dashboard.stats.winRateKo}</span>
      </div>
      <div className={styles.mirageDashRowAlt}>
        <span className={styles.mirageDashKey}>최근 성과</span>
        <span className={styles.mirageDashValForm}>{dashboard.stats.formKo}</span>
      </div>

      <div className={styles.mirageDashFooter}>Mirage LSP · {MIRAGE_LSP_VERSION}</div>
      </div>
      )}
    </div>
  );
}
