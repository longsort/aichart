'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import { buildMonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { buildMonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { DualVerdictGauge } from './MonthDeskSvgGauges';
import MonthDeskPriceMap from './MonthDeskPriceMap';
import TradePracticalDesk from '@/app/components/TradePracticalDesk';
import MonthDeskWhalePanel, { useMonthDeskWhaleSnapshot } from './MonthDeskWhalePanel';
import styles from '../MonthDeskAnalysisBoard.module.css';

const HUD_COLLAPSE_KEY = 'month-desk-chart-hud-collapsed';

type Props = {
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  board: TfCloseSettleBoard | null;
  isNarrowUi?: boolean;
};

export default function MonthDeskChartHud({
  symbol,
  timeframe,
  theme: themeId,
  analysis,
  candles,
  board,
  isNarrowUi,
}: Props) {
  const vt = getMonthDeskVisualTheme(themeId);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(HUD_COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const m = useMemo(
    () => buildMonthDeskBoardMetrics({ analysis, candles, board, timeframe }),
    [analysis, candles, board, timeframe]
  );
  const levels = useMemo(
    () => buildMonthDeskCoreLevels(analysis, m.ucm, m.closePrice),
    [analysis, m.ucm, m.closePrice]
  );
  const whale = useMonthDeskWhaleSnapshot(analysis, candles, symbol, timeframe);
  const hudDecision = useMemo(() => {
    const close = levels.close;
    const targetRef =
      levels.targets[0] ??
      (m.verdict === 'LONG'
        ? (levels.resistance ?? null)
        : m.verdict === 'SHORT'
          ? (levels.support ?? null)
          : null);
    const invalidationRef = levels.invalidation ?? null;
    let rr: number | null = null;
    if (close != null && targetRef != null && invalidationRef != null) {
      if (m.verdict === 'LONG') {
        const reward = targetRef - close;
        const risk = close - invalidationRef;
        if (reward > 0 && risk > 0) rr = reward / risk;
      } else if (m.verdict === 'SHORT') {
        const reward = close - targetRef;
        const risk = invalidationRef - close;
        if (reward > 0 && risk > 0) rr = reward / risk;
      }
    }
    const rrPass = rr != null && rr >= 1.6;
    const strongSide =
      m.longPct >= 66 && (m.confidence ?? 0) >= 70
        ? 'LONG+'
        : m.shortPct >= 66 && (m.confidence ?? 0) >= 70
          ? 'SHORT+'
          : m.verdict === 'LONG'
            ? 'LONG'
            : m.verdict === 'SHORT'
              ? 'SHORT'
              : 'WAIT';
    const priority =
      strongSide === 'LONG+' || strongSide === 'SHORT+'
        ? rrPass
          ? '즉시 후보'
          : '대기'
        : m.verdict === 'WAIT'
          ? '차단'
          : m.gatesPassCount >= 4
            ? '준비'
            : '대기';
    const actionLine =
      priority === '즉시 후보'
        ? strongSide.includes('LONG')
          ? 'LONG 실행 후보'
          : 'SHORT 실행 후보'
        : priority === '차단'
          ? 'WAIT · 신규 진입 차단'
          : priority === '준비'
            ? '조건 충족 대기 후 실행'
            : '신호 축적 대기';
    return { rr, rrPass, strongSide, priority, actionLine };
  }, [levels, m]);
  const accent = m.verdict === 'LONG' ? vt.long : m.verdict === 'SHORT' ? vt.short : vt.wait;
  const verdictEn = m.verdict === 'LONG' ? 'LONG' : m.verdict === 'SHORT' ? 'SHORT' : 'WAIT';

  return (
    <div
      className={`${styles.chartHud} ${styles.chartHudAnimated} ${collapsed ? styles.chartHudCollapsed : ''}`}
      data-theme={themeId}
      style={{ borderColor: vt.panelBorder, background: vt.bg, color: vt.text, maxWidth: isNarrowUi ? 280 : 340 }}
    >
      <div className={styles.chartHudHead}>
        <div>
          <div className={styles.chartHudVerdict} style={{ color: accent }}>
            {verdictEn}
            <span style={{ fontSize: 12, marginLeft: 6, color: vt.text }}>{m.confidence != null ? `${m.confidence}%` : ''}</span>
          </div>
          <div style={{ fontSize: 9, color: vt.textMuted }}>
            {symbol} · {timeframe}
          </div>
        </div>
        <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 9, padding: '3px 8px' }} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.chartHudBody}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 8,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                borderRadius: 999,
                padding: '3px 8px',
                border: `1px solid ${hudDecision.strongSide.includes('LONG') ? vt.long : hudDecision.strongSide.includes('SHORT') ? vt.short : vt.wait}66`,
                color: hudDecision.strongSide.includes('LONG') ? vt.long : hudDecision.strongSide.includes('SHORT') ? vt.short : vt.wait,
                background: 'rgba(15,23,42,0.55)',
              }}
            >
              {hudDecision.strongSide}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                borderRadius: 999,
                padding: '3px 8px',
                border: `1px solid ${hudDecision.priority === '즉시 후보' ? vt.long : hudDecision.priority === '차단' ? vt.short : vt.wait}66`,
                color: hudDecision.priority === '즉시 후보' ? vt.long : hudDecision.priority === '차단' ? vt.short : vt.wait,
                background: 'rgba(15,23,42,0.55)',
              }}
            >
              {hudDecision.priority}
            </span>
            <span style={{ fontSize: 9, color: vt.textMuted, fontWeight: 700 }}>
              RR {hudDecision.rr != null ? hudDecision.rr.toFixed(2) : '–'} · {hudDecision.actionLine}
            </span>
          </div>
          <MonthDeskWhalePanel snapshot={whale} theme={themeId} compact />
          <DualVerdictGauge
            longPct={m.longPct}
            shortPct={m.shortPct}
            size={isNarrowUi ? 200 : 240}
            longColor={vt.long}
            shortColor={vt.short}
            trackColor={vt.track}
            animated
          />
          <TradePracticalDesk
            symbol={symbol}
            timeframe={timeframe}
            analysis={analysis}
            candles={candles}
            theme={themeId}
            uiMode="MONTH_START_DESK"
            compact
          />
          <MonthDeskPriceMap levels={levels} verdict={m.verdict} theme={vt} height={isNarrowUi ? 200 : 240} />
        </div>
      )}
    </div>
  );
}
