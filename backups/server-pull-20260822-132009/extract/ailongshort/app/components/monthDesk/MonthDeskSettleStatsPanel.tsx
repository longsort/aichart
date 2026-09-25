'use client';

import type { MonthDeskSettleBoardStats } from '@/lib/monthDeskSettleBoardStats';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { ArcGauge, Sparkline } from './MonthDeskSvgGauges';
import { MonthDeskBoardHeatmap, MonthDeskVerdictStackBar } from './MonthDeskMtfHeatCell';
import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  stats: MonthDeskSettleBoardStats;
  boardRows: TfCloseSettleRow[];
  theme: MonthDeskVisualTheme;
  chartTf: string;
};

function StatChip({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className={styles.settleStatChip} style={{ borderColor: `${color}55` }}>
      <div className={styles.settleStatChipLabel}>{label}</div>
      <div className={styles.settleStatChipValue} style={{ color }}>
        {value}
      </div>
      {sub && <div className={styles.settleStatChipSub}>{sub}</div>}
    </div>
  );
}

function TfScoreBar({
  row,
  theme,
}: {
  row: MonthDeskSettleBoardStats['tfRows'][0];
  theme: MonthDeskVisualTheme;
}) {
  const pct = row.scorePct;
  const isLong = pct >= 50;
  const barW = Math.abs(pct - 50) * 2;
  const color = isLong ? theme.long : theme.short;
  return (
    <div className={styles.settleTfBarRow}>
      <div
        className={styles.settleTfBarLabel}
        style={{ color: row.isChartTf ? theme.accent : theme.textMuted, fontWeight: row.isChartTf ? 900 : 700 }}
      >
        {row.tf}
      </div>
      <div className={styles.settleTfBarTrack}>
        <div className={styles.settleTfBarCenter} />
        <div
          className={styles.settleTfBarFill}
          style={{
            width: `${barW / 2}%`,
            left: isLong ? '50%' : `${50 - barW / 2}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
          }}
        />
      </div>
      <div className={styles.settleTfBarMeta} style={{ color: theme.textMuted }}>
        <span style={{ color: row.formingVerdict === '안착' ? theme.long : row.formingVerdict === '실패' ? theme.short : theme.wait }}>
          {row.formingVerdict}
        </span>
        <span>{row.formingScore >= 0 ? '+' : ''}{row.formingScore.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function MonthDeskSettleStatsPanel({ stats, boardRows, theme, chartTf }: Props) {
  const accent =
    stats.settleStrength >= 58 ? theme.long : stats.settleStrength <= 42 ? theme.short : theme.wait;
  const alignColor = stats.mtfConflict ? theme.short : stats.mtfAlignPct >= 60 ? theme.long : theme.wait;

  return (
    <section className={`${styles.panel} ${styles.settleStatsPanel}`}>
      <div className={styles.panelInner}>
        <div className={styles.settleStatsHeader}>
          <div>
            <div className={styles.panelLabel} style={{ color: theme.accent }}>
              마감 · 안착 통계 보드
            </div>
            <div className={styles.settleStatsSub} style={{ color: theme.textMuted }}>
              MTF 게이지 · 히트맵 · envelope 검증 — 참고용, 승률·확정 아님
            </div>
          </div>
          <Sparkline points={stats.sparklineScores} width={140} height={40} color={theme.accent} animated />
        </div>

        <div className={styles.settleGaugeRow}>
          <ArcGauge
            value={stats.settleStrength}
            max={100}
            size={118}
            stroke={9}
            color={accent}
            trackColor={theme.track}
            textColor={theme.gaugeText}
            subtextColor={theme.textMuted}
            label="마감·안착 강도"
            sublabel={stats.settleStrengthLabel}
            animated
          />
          <ArcGauge
            value={stats.mtfAlignPct}
            max={100}
            size={118}
            stroke={9}
            color={alignColor}
            trackColor={theme.track}
            textColor={theme.gaugeText}
            subtextColor={theme.textMuted}
            label="MTF 정렬"
            sublabel={`${stats.alignedTfCount}/5 · ${stats.mtfAlignLabel}`}
            animated
          />
          <ArcGauge
            value={stats.chartTfFormingPct}
            max={100}
            size={118}
            stroke={9}
            color={stats.chartTfRow && stats.chartTfRow.formingScore >= 0 ? theme.long : theme.short}
            trackColor={theme.track}
            textColor={theme.gaugeText}
            subtextColor={theme.textMuted}
            label={`차트 ${chartTf}`}
            sublabel={stats.chartTfRow?.formingVerdict ?? '–'}
            animated
          />
          {stats.validation && (
            <ArcGauge
              value={stats.validation.okPct}
              max={100}
              size={118}
              stroke={9}
              color={theme.long}
              trackColor={theme.track}
              textColor={theme.gaugeText}
              subtextColor={theme.textMuted}
              label="envelope 안착"
              sublabel={`${stats.validation.bars}봉 · 참고`}
              animated
            />
          )}
        </div>

        <div className={styles.settleChipRow}>
          <StatChip label="안착 TF" value={stats.formingCounts.안착} color={theme.long} sub="/ 5 MTF" />
          <StatChip label="불안 TF" value={stats.formingCounts.불안} color={theme.wait} />
          <StatChip label="실패 TF" value={stats.formingCounts.실패} color={theme.short} />
          <StatChip label="롱 유리" value={stats.edgeCounts.long} color={theme.long} sub="마감" />
          <StatChip label="숏 유리" value={stats.edgeCounts.short} color={theme.short} sub="마감" />
        </div>

        <div className={styles.settleStatsGrid}>
          <div className={styles.settleHeatCol}>
            <div className={styles.settleSectionTitle} style={{ color: theme.textMuted }}>
              MTF 히트맵
            </div>
            <MonthDeskBoardHeatmap rows={boardRows} chartTf={chartTf} theme={theme} />
          </div>
          <div className={styles.settleBarCol}>
            <div className={styles.settleSectionTitle} style={{ color: theme.textMuted }}>
              TF별 forming score
            </div>
            {stats.tfRows.map((row) => (
              <TfScoreBar key={row.tf} row={row} theme={theme} />
            ))}
          </div>
        </div>

        {stats.validationWindows.length > 0 && (
          <div className={styles.settleValidationBlock}>
            <div className={styles.settleSectionTitle} style={{ color: theme.textMuted }}>
              차트 envelope 검증 (SuperTrend 마감존)
            </div>
            <div className={styles.settleValidationRows}>
              {stats.validationWindows.map((w) => (
                <div key={w.bars} className={styles.settleValidationRow}>
                  <span className={styles.settleValidationLabel} style={{ color: theme.textMuted }}>
                    {w.bars}봉
                  </span>
                  <MonthDeskVerdictStackBar ok={w.ok} fail={w.fail} nervous={w.nervous} theme={theme} width={160} />
                  <span className={styles.settleValidationPct} style={{ color: theme.long }}>
                    안착 {w.okPct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.summaryLines.length > 0 && (
          <ul className={styles.settleSummaryList} style={{ color: theme.textMuted }}>
            {stats.summaryLines.slice(0, 4).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
