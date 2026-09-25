'use client';

import {
  confirmedEdgeColor,
  fmtPrice,
  TF_CLOSE_SETTLE_ORDER,
  verdictColor,
} from '@/lib/tfCloseSettleAssessment';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { MonthDeskMtfHeatCell, MonthDeskVerdictStackBar } from './monthDesk/MonthDeskMtfHeatCell';
import styles from './MonthDeskAnalysisBoard.module.css';

type Props = {
  symbol: string;
  onRequestChartTf?: (tf: string) => void;
  chartTimeframe?: string;
  chartVerdictValidation?: MonthDeskVerdictValidationSummary | null;
  theme?: 'dark' | 'light';
};

export default function MonthStartDeskCard({
  symbol,
  onRequestChartTf,
  chartTimeframe,
  chartVerdictValidation,
  theme = 'dark',
}: Props) {
  const { board, error, loading, reload } = useTfCloseSettleBoard(symbol, true);
  const vt = getMonthDeskVisualTheme(theme);

  return (
    <div className={styles.deskCard} data-theme={theme} style={{ borderColor: vt.panelBorder, color: vt.text }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: vt.accent }}>마감 · 안착 데스크</div>
          <div style={{ fontSize: 10, color: vt.textMuted, marginTop: 4, lineHeight: 1.45 }}>
            {symbol} · 1h / 4h / 일 / 주 / 월 · <strong>히트맵</strong> = 마감·안착·갭·편향
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {onRequestChartTf &&
            TF_CLOSE_SETTLE_ORDER.map((tf) => (
              <button
                key={tf}
                type="button"
                className={`tool-chip tool-chip-button ${chartTimeframe === tf ? 'tool-chip-active' : ''}`}
                style={{ fontSize: 10, padding: '4px 8px' }}
                onClick={() => onRequestChartTf(tf)}
              >
                차트 {tf}
              </button>
            ))}
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ fontSize: 10, padding: '4px 8px' }}
            onClick={() => void reload(true)}
            disabled={loading}
          >
            {loading ? '로딩…' : '새로고침'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: board && board.rows.length > 0 ? vt.wait : vt.short, marginBottom: 8 }}>{error}</div>
      )}

      {chartVerdictValidation && chartVerdictValidation.windows.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${vt.long}44`,
            background: theme === 'light' ? 'rgba(220,252,231,0.5)' : 'rgba(6,78,59,0.18)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: vt.long, marginBottom: 8 }}>
            차트 TF 과거 검증 · {chartVerdictValidation.chartTf}
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${vt.panelBorder}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 480 }}>
              <thead>
                <tr style={{ background: theme === 'light' ? 'rgba(241,245,249,0.95)' : 'rgba(30,41,59,0.9)', color: vt.textMuted, textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 700 }}>구간(봉)</th>
                  <th style={{ padding: '6px 10px', fontWeight: 700 }}>분포</th>
                  <th style={{ padding: '6px 10px', fontWeight: 700 }}>안착</th>
                  <th style={{ padding: '6px 10px', fontWeight: 700 }}>실패</th>
                  <th style={{ padding: '6px 10px', fontWeight: 700 }}>불안</th>
                </tr>
              </thead>
              <tbody>
                {chartVerdictValidation.windows.map((w) => (
                  <tr key={w.bars} style={{ borderTop: `1px solid ${vt.panelBorder}`, color: vt.text }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>최근 {w.bars}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <MonthDeskVerdictStackBar ok={w.ok} fail={w.fail} nervous={w.nervous} theme={vt} width={100} />
                    </td>
                    <td style={{ padding: '8px 10px', color: vt.long }}>{w.ok}</td>
                    <td style={{ padding: '8px 10px', color: vt.short }}>{w.fail}</td>
                    <td style={{ padding: '8px 10px', color: vt.wait }}>{w.nervous}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 9, lineHeight: 1.5, color: vt.textMuted }}>{chartVerdictValidation.footnote}</p>
        </div>
      )}

      {board && board.rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${vt.panelBorder}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 780 }}>
              <thead>
                <tr style={{ background: theme === 'light' ? 'rgba(241,245,249,0.95)' : 'rgba(30,41,59,0.9)', color: vt.textMuted, textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>TF</th>
                  <th className={styles.heatCol} style={{ padding: '8px 6px', fontWeight: 700 }}>
                    히트
                  </th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, width: '20%' }}>전봉 마감 (확정)</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>유리 쪽</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>진행 봉 (미마감)</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>종가 대비</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>갭 %</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => {
                  const isFocus = chartTimeframe === row.tf;
                  return (
                    <tr
                      key={row.tf}
                      style={{
                        borderTop: `1px solid ${vt.panelBorder}`,
                        verticalAlign: 'top',
                        background: isFocus ? (theme === 'light' ? 'rgba(237,233,254,0.45)' : 'rgba(49,46,129,0.25)') : undefined,
                      }}
                    >
                      <td style={{ padding: '10px', fontWeight: 800, color: isFocus ? vt.accent : vt.text, whiteSpace: 'nowrap' }}>
                        {row.tf}
                        {isFocus ? ' ★' : ''}
                      </td>
                      <td className={styles.heatCol} style={{ padding: '8px 6px' }}>
                        <MonthDeskMtfHeatCell row={row} theme={vt} size={54} />
                      </td>
                      <td style={{ padding: '10px', color: vt.text, lineHeight: 1.45 }}>
                        <div style={{ fontSize: 9, color: vt.long, fontWeight: 700, marginBottom: 4 }}>마감 확정 · {row.priorBodyLabel}</div>
                        <div>{row.confirmedCloseLabel}</div>
                        <div style={{ fontSize: 9, color: vt.textMuted, marginTop: 4 }}>{row.confirmedCloseDetail}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 800,
                            fontSize: 10,
                            color: confirmedEdgeColor(row.confirmedEdge),
                            border: `1px solid ${confirmedEdgeColor(row.confirmedEdge)}44`,
                          }}
                        >
                          {row.confirmedEdge}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: verdictColor(row.formingVerdict), marginBottom: 6 }}>
                          {row.formingVerdict}
                        </div>
                        <div style={{ fontSize: 9, color: vt.textMuted }}>스코어 {row.formingScore}</div>
                      </td>
                      <td style={{ padding: '10px', color: vt.text, lineHeight: 1.5, whiteSpace: 'nowrap', fontSize: 10 }}>
                        종가 {row.vsPriorClose}
                        <br />
                        고점 {row.vsPriorHigh}
                        <br />
                        저점 {row.vsPriorLow}
                      </td>
                      <td
                        style={{
                          padding: '10px',
                          fontWeight: 800,
                          color: row.gapFromPriorClosePct >= 0 ? vt.long : vt.short,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.gapFromPriorClosePct >= 0 ? '+' : ''}
                        {row.gapFromPriorClosePct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 9, color: vt.textMuted, lineHeight: 1.5 }}>
            기준 시각 UTC: {board.asOfUtcIso}
            <br />
            {board.disclaimer}
          </div>
        </>
      )}
    </div>
  );
}
