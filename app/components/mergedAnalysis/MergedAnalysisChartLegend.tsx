'use client';

import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  tradeSignal: MergedTradeSignal | null;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  timeframe: string;
};

export default function MergedAnalysisChartLegend({ tradeSignal, direction, timeframe }: Props) {
  const dirKo =
    direction === 'LONG' ? '▲ 롱' : direction === 'SHORT' ? '▼ 숏' : '◆ 관망';

  return (
    <div className={styles.chartLegend} aria-label="차트 색상·기능 안내">
      <div className={styles.chartLegendHead}>
        <span
          className={styles.chartLegendDir}
          style={{
            color: direction === 'LONG' ? '#4ade80' : direction === 'SHORT' ? '#f87171' : '#94a3b8',
          }}
        >
          {dirKo}
        </span>
        <span className={styles.chartLegendHint}>한눈에 보기</span>
      </div>
      <div className={styles.chartLegendGrid}>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendKeyDemand}`} />
          <span>청록 zone = 핵심·지지반등 (스윙)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendKeySupply}`} />
          <span>주황 zone = 핵심·저항거부 (스윙)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendDemand}`} />
          <span>파란 zone = Strike 수요(E/SL)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendSupply}`} />
          <span>빨간 zone = Strike 공급(TP)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendVrvp}`} />
          <span>좌측 VRVP = {timeframe} 캔들 가격축 동기</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendPoc}`} />
          <span>노란 점선 = {MERGED_VRVP_KO.poc} (거래 최다)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendVa}`} />
          <span>
            노란 점선 2줄 = {MERGED_VRVP_KO.vaHigh}·{MERGED_VRVP_KO.vaLow} (거래 70% 구간)
          </span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendVa}`} />
          <span>
            노란 박스 = {MERGED_VRVP_KO.vaBand} 밀집 구간 ({timeframe})
          </span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendSupply}`} />
          <span>TOP/BOT — 빨강 TOP · 초록 BOT 라벨 · BOT 저점 녹색 지지선</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendMirage}`} />
          <span>Mirage LSP — 스윕× · BSL/SSL · 손절/진입/익절 · 우측 대시보드</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendDemand}`} />
          <span>①~④ 시나리오 zone — 하락 leg · 지지터치 · 반등경로 · Tmax(크다/약)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendCloud}`} />
          <span>초록/빨강 구름 = ST 상·하한 · ▲ST/▼ST 전환 · L☁/S☁ 터치</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendE}`} />
          <span>우측축 E/SL/TP = 점선 가격</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendConfirmLong}`} />
          <span>▲ 롱확정 = ST·zone·종가 게이트 (롱확)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendConfirmShort}`} />
          <span>▼ 숏확정 = ST·zone·종가 게이트 (숏확)</span>
        </div>
        <div className={styles.chartLegendRow}>
          <span className={`${styles.legendSwatch} ${styles.legendJudgmentLong}`} />
          <span>차트 우측 큰 글자 = 지금 롱/숏 관점 + 6요소 근거</span>
        </div>
      </div>
      {tradeSignal && (
        <div className={styles.chartLegendLevels}>
          <span className={styles.legendE}>E {tradeSignal.entry.toFixed(2)}</span>
          <span className={styles.legendSl}>SL {tradeSignal.stopLoss.toFixed(2)}</span>
          <span className={styles.legendTp1}>TP1 {tradeSignal.tp1.toFixed(2)}</span>
          <span className={styles.legendTp2}>TP2 {tradeSignal.tp2.toFixed(2)}</span>
          <span className={styles.legendTp3}>TP3 {tradeSignal.tp3.toFixed(2)}</span>
        </div>
      )}
      <div className={styles.chartLegendFoot}>박스 안 글자 = zone 번호·역할 · SL 이탈 시 무효</div>
    </div>
  );
}
