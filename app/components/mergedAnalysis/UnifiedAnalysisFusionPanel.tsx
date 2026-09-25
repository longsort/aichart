'use client';

import type { UnifiedAnalysisFusion } from '@/lib/unifiedAnalysisFusion';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import IntegratedTradePnLCalculator from './IntegratedTradePnLCalculator';
import styles from './MergedAnalysisDesk.module.css';

type TradeCalcProps = {
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  currentPrice?: number | null;
  initialSeedUsdt?: number;
  tradePlan?: UnifiedDeskTradePlan | null;
};

type Props = {
  fusion: UnifiedAnalysisFusion;
  tradeCalc?: TradeCalcProps;
};

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

function toneClass(tone: string): string {
  if (tone === 'strong') return styles.fusionDimStrong;
  if (tone === 'conflict') return styles.fusionDimConflict;
  if (tone === 'weak') return styles.fusionDimWeak;
  return styles.fusionDimNeutral;
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#4ade80';
  if (grade === 'B') return '#2dd4bf';
  if (grade === 'C') return '#fcd34d';
  return '#f87171';
}

export default function UnifiedAnalysisFusionPanel({ fusion: f, tradeCalc }: Props) {
  const met = f.confirmationPoints.filter((p) => p.met).length;

  return (
    <section className={styles.fusionPanel} aria-label="심층 분석 융합">
      <header className={styles.fusionHead}>
        <div>
          <span className={styles.fusionTag}>심층 융합</span>
          <h3 className={styles.fusionTitle}>다차원 분석 · 확인 포인트</h3>
          <p className={styles.fusionSub}>{f.depthLabelKo}</p>
        </div>
        <div className={styles.fusionDepthRing} style={{ borderColor: `${gradeColor(f.depthGrade)}55` }}>
          <span className={styles.fusionDepthGrade} style={{ color: gradeColor(f.depthGrade) }}>
            {f.depthGrade}
          </span>
          <span className={styles.fusionDepthScore}>{f.depthScore}pt</span>
        </div>
      </header>

      <div className={styles.fusionMetaStrip}>
        {f.rsiContextKo ? <span>{f.rsiContextKo}</span> : null}
        {f.regimeContextKo ? <span>{f.regimeContextKo}</span> : null}
        {f.mtfAlignmentKo ? <span>{f.mtfAlignmentKo}</span> : null}
      </div>

      <div className={styles.fusionDimGrid} aria-label="분석 차원">
        {f.dimensions.map((d) => (
          <div key={d.key} className={`${styles.fusionDimCell} ${toneClass(d.tone)}`}>
            <div className={styles.fusionDimTop}>
              <span>{d.labelKo}</span>
              <strong>{d.score}</strong>
            </div>
            <div className={styles.fusionDimBar}>
              <div className={styles.fusionDimFill} style={{ width: `${d.score}%` }} />
            </div>
            <p className={styles.fusionDimDetail}>{d.detailKo}</p>
          </div>
        ))}
      </div>

      <div className={styles.fusionConfirmBlock} aria-label="확인 포인트">
        <span className={styles.fusionConfirmLabel}>
          확인 {met}/{f.confirmationPoints.length}
        </span>
        <div className={styles.fusionConfirmGrid}>
          {f.confirmationPoints.map((p) => (
            <div
              key={p.labelKo}
              className={`${styles.fusionConfirmCell}${p.met ? ` ${styles.fusionConfirmMet}` : ''}`}
              title={p.detailKo}
            >
              <span>{p.met ? '✓' : '○'}</span>
              {p.labelKo}
            </div>
          ))}
        </div>
      </div>

      {tradeCalc ? (
        <IntegratedTradePnLCalculator
          masterDirection={tradeCalc.masterDirection}
          entry={tradeCalc.entry}
          stopLoss={tradeCalc.stopLoss}
          tp1={tradeCalc.tp1}
          tp2={tradeCalc.tp2}
          tp3={tradeCalc.tp3}
          currentPrice={tradeCalc.currentPrice}
          initialSeedUsdt={tradeCalc.initialSeedUsdt}
          tradePlan={tradeCalc.tradePlan}
        />
      ) : null}

      {f.keyLevels.length > 0 && (
        <div className={styles.fusionLevels} aria-label="핵심 레벨">
          <span className={styles.fusionLevelsLabel}>핵심 레벨</span>
          <div className={styles.fusionLevelRow}>
            {f.keyLevels.slice(0, 8).map((lv) => (
              <span key={`${lv.kind}-${lv.labelKo}-${lv.price}`} className={styles.fusionLevelChip} data-kind={lv.kind}>
                {lv.labelKo} {fmtPrice(lv.price)}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className={styles.fusionFoot}>{f.summaryKo} — 조건부 참고, 과거·현재 신호가 미래를 보장하지 않음.</p>
    </section>
  );
}
