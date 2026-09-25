'use client';

import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  rows: MergedIntegratedMtfTfRow[];
  chartTf: string;
  loading?: boolean;
};

function dirClass(d: string): string {
  if (d === 'LONG') return styles.mtfTfBoardCellLong;
  if (d === 'SHORT') return styles.mtfTfBoardCellShort;
  if (d === 'WAIT') return styles.mtfTfBoardCellWait;
  return styles.mtfTfBoardCellNeutral;
}

function dirLabel(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  if (d === 'WAIT') return '—';
  return '중립';
}

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

export default function MergedAnalysisMtfTfBoard({ rows, chartTf, loading }: Props) {
  return (
    <div className={styles.mtfTfBoard} aria-label="전 타임프레임 분석 보드">
      <div className={styles.mtfTfBoardHead}>
        <span className={styles.mtfTfBoardTitle}>전 TF 분석</span>
        <span className={styles.mtfTfBoardSub}>
          차트 전환 없이 1분~월봉 · 현재 차트 {chartTf}
          {loading ? ' · 갱신…' : ''}
        </span>
      </div>
      <div className={styles.mtfTfBoardGrid}>
        {rows.map((row) => (
          <div
            key={row.tf}
            className={`${styles.mtfTfBoardCell}${row.isChartTf ? ` ${styles.mtfTfBoardCellChart}` : ''}`}
            title={row.summaryKo}
          >
            <div className={styles.mtfTfBoardCellTop}>
              <span className={styles.mtfTfBoardTf}>{row.tf}</span>
              {row.isChartTf ? <span className={styles.mtfTfBoardChartTag}>차트</span> : null}
            </div>
            <div className={`${styles.mtfTfBoardDir} ${dirClass(row.direction)}`}>{dirLabel(row.direction)}</div>
            <div className={styles.mtfTfBoardScores}>
              <span style={{ color: '#22c55e' }}>L{row.longScore}</span>
              <span style={{ color: '#ef4444' }}>S{row.shortScore}</span>
            </div>
            <div className={styles.mtfTfBoardMeta}>
              {row.verdictKo} · {fmtPrice(row.price)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
