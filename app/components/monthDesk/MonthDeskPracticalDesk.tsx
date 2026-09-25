'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import type { UIMode } from '@/lib/settings';
import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import { buildModeAnalysisInsight } from '@/lib/modeAnalysisInsight';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { buildTradeConfirmDesk, type TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';
import TradeConfirmAlertBanner from '@/app/components/TradeConfirmAlertBanner';
import TradeCommandStrip from './TradeCommandStrip';
import TradeConfirmZonesPanel from './TradeConfirmZonesPanel';
import TradePriceLadderBar from './TradePriceLadderBar';
import AiAnalysisTradePlanPanel from '@/app/components/aiZone/AiAnalysisTradePlanPanel';
import { buildAiAnalysisTradePlan } from '@/lib/aiAnalysisTradePlan';
import styles from '../MonthDeskAnalysisBoard.module.css';

const STATUS_COLOR: Record<string, string> = {
  at_entry: '#4ade80',
  near_entry: '#a78bfa',
  wait_pullback: '#fcd34d',
  wait_breakout: '#fb923c',
  invalid_hit: '#f87171',
  no_levels: '#94a3b8',
  neutral: '#94a3b8',
};

type Props = {
  metrics: MonthDeskBoardMetrics;
  levels: MonthDeskCoreLevels;
  whale: MonthDeskWhaleSnapshot | null;
  analysis: AnalyzeResponse | null;
  theme?: 'dark' | 'light';
  compact?: boolean;
  uiMode?: UIMode;
  confirmDesk?: TradeConfirmDesk | null;
  lastAlert?: TradeConfirmAlert | null;
  onDismissAlert?: () => void;
  /** 시각 중심 레이아웃 — 긴 텍스트는 접기 */
  visualFocus?: boolean;
};

export default function MonthDeskPracticalDesk({
  metrics,
  levels,
  whale,
  analysis,
  theme = 'dark',
  compact,
  uiMode,
  confirmDesk: confirmDeskProp,
  lastAlert,
  onDismissAlert,
  visualFocus,
}: Props) {
  const vt = getMonthDeskVisualTheme(theme);
  const ta = useMemo(
    () => buildMonthDeskTradeAction(metrics, levels, whale, analysis),
    [metrics, levels, whale, analysis]
  );
  const confirmDesk = useMemo(
    () => confirmDeskProp ?? buildTradeConfirmDesk(analysis, metrics, levels, ta),
    [confirmDeskProp, analysis, metrics, levels, ta]
  );
  const insight = useMemo(
    () => buildModeAnalysisInsight(uiMode, analysis, metrics, whale),
    [uiMode, analysis, metrics, whale]
  );
  const aiPlan = useMemo(
    () =>
      (uiMode === 'AI_ZONE' || uiMode === 'MONTH_START_DESK' || uiMode === 'ZONE_LINE_PRO') && analysis
        ? buildAiAnalysisTradePlan(analysis, metrics, levels, ta, confirmDesk, uiMode)
        : null,
    [uiMode, analysis, metrics, levels, ta, confirmDesk]
  );
  const statusColor = STATUS_COLOR[ta.status] ?? vt.textMuted;
  const accent = insight?.accent ?? (metrics.verdict === 'LONG' ? vt.long : metrics.verdict === 'SHORT' ? vt.short : vt.wait);

  if (compact) {
    return (
      <div className={styles.practicalCompact} style={{ borderColor: `${accent}44` }}>
        {lastAlert && onDismissAlert && <TradeConfirmAlertBanner alert={lastAlert} onDismiss={onDismissAlert} />}
        {confirmDesk && <TradeConfirmZonesPanel desk={confirmDesk} />}
        {aiPlan && <AiAnalysisTradePlanPanel plan={aiPlan} compact />}
        <TradeCommandStrip metrics={metrics} ta={ta} compact />
        <div style={{ fontWeight: 800, color: statusColor, fontSize: 11, marginTop: 8 }}>{ta.statusKo}</div>
        <div style={{ fontSize: 10, color: vt.text, lineHeight: 1.4 }}>{ta.actionKo}</div>
        <TradePriceLadderBar levels={levels} verdict={metrics.verdict} compact />
        {ta.rrLabel && <div style={{ fontSize: 9, color: '#38bdf8', marginTop: 4 }}>{ta.rrLabel}</div>}
      </div>
    );
  }

  return (
    <section
      className={`${styles.panel} ${styles.practicalPanel} ${styles.commandCenter}`}
      style={{ borderColor: `${accent}44`, boxShadow: `0 0 40px -16px ${accent}55` }}
    >
      <div className={styles.commandGlow} style={{ background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${accent}28, transparent 70%)` }} />
      <div className={styles.panelInner}>
        {lastAlert && onDismissAlert && <TradeConfirmAlertBanner alert={lastAlert} onDismiss={onDismissAlert} />}
        {!visualFocus && <TradeCommandStrip metrics={metrics} ta={ta} />}
        {confirmDesk && <TradeConfirmZonesPanel desk={confirmDesk} />}
        {aiPlan && !visualFocus && <AiAnalysisTradePlanPanel plan={aiPlan} />}

        {insight && insight.bullets.length > 0 && !visualFocus && (
          <div className={styles.modeInsight} style={{ borderColor: `${accent}44`, background: `${accent}12` }}>
            <div className={styles.modeInsightTitle} style={{ color: accent }}>
              {insight.title}
            </div>
            <ul className={styles.modeInsightList}>
              {insight.bullets.map((b, i) => (
                <li key={i} style={{ color: vt.text }}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.practicalActionBox} style={{ borderColor: `${statusColor}55`, background: `${statusColor}10` }}>
          <div className={styles.practicalStatusRow}>
            <span className={styles.practicalStatus} style={{ color: statusColor, borderColor: `${statusColor}66` }}>
              {ta.statusKo}
            </span>
            {ta.gateLine && <span className={styles.practicalGate}>{ta.gateLine}</span>}
          </div>
          {!visualFocus && (
            <p className={styles.practicalAction} style={{ color: vt.text, marginBottom: 0 }}>
              {ta.actionKo}
            </p>
          )}
        </div>

        <TradePriceLadderBar levels={levels} verdict={metrics.verdict} visual={visualFocus} />

        {visualFocus ? (
          <details className={styles.practicalDetails}>
            <summary className={styles.practicalDetailsSummary} style={{ color: vt.accent }}>
              상세 분석 텍스트 · 펼치기
            </summary>
            <div className={styles.practicalRules}>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#67e8f9' }}>
                  진입
                </span>
                <span style={{ color: vt.textMuted }}>{ta.entryPlanKo}</span>
              </div>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#38bdf8' }}>
                  목표
                </span>
                <span style={{ color: vt.textMuted }}>{ta.reboundPlanKo}</span>
              </div>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#4ade80' }}>
                  확인
                </span>
                <span style={{ color: vt.textMuted }}>{ta.confirmKo}</span>
              </div>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#f87171' }}>
                  무효
                </span>
                <span style={{ color: vt.textMuted }}>{ta.invalidKo}</span>
              </div>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#fda4af' }}>
                  손절
                </span>
                <span style={{ color: vt.textMuted }}>{ta.stopPlanKo}</span>
              </div>
              <div className={styles.practicalRule}>
                <span className={styles.practicalRuleLabel} style={{ color: '#fcd34d' }}>
                  리스크
                </span>
                <span style={{ color: vt.textMuted }}>{ta.riskPlanKo}</span>
              </div>
            </div>
            <p className={styles.practicalAction} style={{ color: vt.text, marginTop: 8 }}>
              {ta.actionKo}
            </p>
          </details>
        ) : (
          <div className={styles.practicalRules}>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#67e8f9' }}>
              진입
            </span>
            <span style={{ color: vt.textMuted }}>{ta.entryPlanKo}</span>
          </div>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#38bdf8' }}>
              목표
            </span>
            <span style={{ color: vt.textMuted }}>{ta.reboundPlanKo}</span>
          </div>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#4ade80' }}>
              확인
            </span>
            <span style={{ color: vt.textMuted }}>{ta.confirmKo}</span>
          </div>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#f87171' }}>
              무효
            </span>
            <span style={{ color: vt.textMuted }}>{ta.invalidKo}</span>
          </div>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#fda4af' }}>
              손절
            </span>
            <span style={{ color: vt.textMuted }}>{ta.stopPlanKo}</span>
          </div>
          <div className={styles.practicalRule}>
            <span className={styles.practicalRuleLabel} style={{ color: '#fcd34d' }}>
              리스크
            </span>
            <span style={{ color: vt.textMuted }}>{ta.riskPlanKo}</span>
          </div>
          </div>
        )}

        {ta.rrLabel && !visualFocus && <div className={styles.practicalRr}>{ta.rrLabel}</div>}

        {!visualFocus && (
        <table className={styles.practicalTable}>
          <thead>
            <tr>
              <th>구간</th>
              <th>가격</th>
              <th>거리</th>
            </tr>
          </thead>
          <tbody>
            {ta.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className={styles.practicalMono}>
                  {r.price != null
                    ? r.price >= 1000
                      ? r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : r.price.toFixed(2)
                    : '—'}
                </td>
                <td
                  className={styles.practicalMono}
                  style={{
                    color:
                      r.distPct == null
                        ? vt.textMuted
                        : r.role === 'invalid' && r.distPct < 0
                          ? '#f87171'
                          : r.role === 'tp'
                            ? '#38bdf8'
                            : Math.abs(r.distPct) < 0.2
                              ? '#4ade80'
                              : vt.text,
                  }}
                >
                  {r.distKo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}

        {!visualFocus && <p className={styles.practicalWhaleLine}>{ta.whaleLine}</p>}
        {!visualFocus && whale && whale.headlineKo !== '고래 신호 약함' && (
          <p className={styles.practicalWhaleLine} style={{ color: accent }}>
            {whale.headlineKo} · 매수 {whale.buyPressure}% / 매도 {whale.sellPressure}%
          </p>
        )}
      </div>
    </section>
  );
}
