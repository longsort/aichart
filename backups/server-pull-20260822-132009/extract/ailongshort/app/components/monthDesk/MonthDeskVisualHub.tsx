'use client';

import { useMemo } from 'react';
import MonthDeskVerdictOrb3d from './MonthDeskVerdictOrb3d';
import { useMonthDeskGateFx } from './useMonthDeskGateFx';
import { useCountUp, formatCountUp } from './useCountUp';
import type { MonthDeskPrecisionSnapshot } from '@/lib/monthDeskPrecisionAnalysis';
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import {
  monthDeskRrGaugeArcValue,
  type MonthDeskRrGaugeResult,
} from '@/lib/monthDeskRrGaugeExplain';
import type { MonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';
import { ArcGauge, DualVerdictGauge } from './MonthDeskSvgGauges';
import {
  FusionScoreRing,
  MetricSparkline,
  PremiumArcGauge,
  PremiumBattleGauge,
  PremiumGateRing,
} from './MonthDeskPremiumGauges';
import MonthDeskUltraParticles from './MonthDeskUltraParticles';
import MonthDeskGateRadar from './MonthDeskGateRadar';
import MonthDeskAiNeuralStream from './MonthDeskAiNeuralStream';
import MonthDeskPriceMap from './MonthDeskPriceMap';
import MonthDeskActionLevelTiles from './MonthDeskActionLevelTiles';
import styles from '../MonthDeskAnalysisBoard.module.css';

type QuickBoard = {
  moneyPotential: number;
  potentialLabel: string;
  rrGauge: MonthDeskRrGaugeResult;
  strongSide: string;
  flipRiskLabel: string;
  priority: string;
  actionLine: string;
};

export default function MonthDeskVisualHub({
  metrics: m,
  levels,
  whale,
  analysis,
  theme: vt,
  quickBoard,
  confirmDisplay,
  precision,
  soundEnabled = true,
}: {
  metrics: MonthDeskBoardMetrics;
  levels: MonthDeskCoreLevels;
  whale: MonthDeskWhaleSnapshot;
  analysis: AnalyzeResponse | null;
  theme: MonthDeskVisualTheme;
  quickBoard: QuickBoard;
  confirmDisplay: MonthDeskConfirmDisplay;
  precision: MonthDeskPrecisionSnapshot | null;
  soundEnabled?: boolean;
}) {
  const accent = m.verdict === 'LONG' ? vt.long : m.verdict === 'SHORT' ? vt.short : vt.wait;
  const confirmBadgeColor =
    confirmDisplay.badgeTone === 'long'
      ? vt.long
      : confirmDisplay.badgeTone === 'short'
        ? vt.short
        : confirmDisplay.badgeTone === 'warn'
          ? '#f87171'
          : vt.wait;
  const ta = useMemo(
    () => buildMonthDeskTradeAction(m, levels, whale, analysis),
    [m, levels, whale, analysis]
  );

  const whaleBoard = useMemo(() => {
    const netFlow = whale.buyPressure - whale.sellPressure;
    const flowBias =
      netFlow >= 12 ? '매수 유입' : netFlow <= -12 ? '매도 유입' : '중립';
    return { netFlow, flowBias };
  }, [whale]);

  const sparkTrend = useMemo(() => {
    const c = m.confidence ?? 50;
    const g = (m.gatesPassCount ?? 0) * 18;
    const mtf = m.mtfAlignment ?? 50;
    const dom = Math.abs(m.longPct - m.shortPct);
    return [
      Math.max(0, c - 12 + dom * 0.1),
      Math.max(0, c - 6),
      Math.max(0, c - 2),
      Math.min(100, c * 0.55 + g * 0.25 + mtf * 0.2),
      Math.min(100, quickBoard.moneyPotential),
    ].map((v) => Math.round(v));
  }, [m, quickBoard.moneyPotential]);

  const rrStatus = quickBoard.rrGauge.rrDistorted
    ? 'warn'
    : quickBoard.rrGauge.rrPass
      ? 'good'
      : 'neutral';

  const fusionValue = precision?.fusionScore ?? quickBoard.moneyPotential;
  const fusionLabel = precision?.fusionLabel ?? quickBoard.potentialLabel;
  const gatePartialMap = useMemo(() => {
    if (!precision?.gatePartials?.length) return undefined;
    const m: Record<string, number> = {};
    for (const g of precision.gatePartials) m[g.key] = g.score;
    return m;
  }, [precision]);

  const neuralLines = useMemo(() => {
    const structLine =
      m.structure?.summaryKo ??
      (m.structure?.tag
        ? `구조 ${m.structure.tag} · ${m.structure.phase ?? '—'}`
        : null);
    const base = [
      confirmDisplay.headlineKo,
      m.verdictReasonKo,
      structLine,
      m.entryGrade !== '—' ? `타점 등급 ${m.entryGrade}` : null,
      ...(precision?.breakdownKo ?? []),
      `${m.verdict} ${m.longPct}% / ${m.shortPct}%`,
      quickBoard.actionLine,
    ];
    return base.filter(Boolean).slice(0, 10);
  }, [confirmDisplay, precision, m, quickBoard]);

  const { flash, flashKey } = useMonthDeskGateFx(m, confirmDisplay, soundEnabled, {
    symbol: analysis?.symbol,
    timeframe: analysis?.timeframe,
  });
  const confAnim = useCountUp(m.confidence ?? 0);
  const fusionAnim = useCountUp(fusionValue);
  const longScoreAnim = useCountUp(m.longScore);
  const shortScoreAnim = useCountUp(m.shortScore);
  const mtfAnim = useCountUp(m.mtfAlignment ?? 0);

  return (
    <section
      className={`${styles.panel} ${styles.visualHub} ${styles.visualHubAi} ${styles.visualHubUltra} ${flash ? styles.visualHubGateFlash : ''}`}
      data-verdict={m.verdict}
      data-tier="ultra"
      data-grade={precision?.precisionGrade}
      data-flash-key={flashKey || undefined}
    >
      <div className={styles.visualHubUltraBg} aria-hidden>
        <MonthDeskUltraParticles accent={vt.accent} accent2="#22d3ee" />
      </div>
      <div className={styles.visualHubAiScan} aria-hidden />
      <header className={styles.visualHubAiHeader}>
        <span className={styles.visualHubAiTag}>AI CORE</span>
        <span className={styles.visualHubUltraTag}>ULTRA</span>
        <span className={styles.visualHubAiTitle}>마감·안착 핵심보드</span>
        <span className={styles.visualHubAiMeta}>
          {analysis?.symbol ?? '—'} · {analysis?.timeframe ?? '—'}
        </span>
      </header>
      <MonthDeskAiNeuralStream lines={neuralLines} accent={accent} />
      <div className={styles.panelInner}>
        <div className={styles.visualHubTop}>
          <div
            className={`${styles.visualHubVerdictBlock} ${confirmDisplay.isAnyConfirm ? styles.visualHubVerdictBlockConfirmed : ''}`}
            data-side={m.verdict}
            data-confirm-phase={confirmDisplay.phase}
          >
            <MonthDeskVerdictOrb3d
              verdict={m.verdict}
              accent={accent}
              confidence={m.confidence}
              confirmDisplay={confirmDisplay}
              precisionGrade={precision?.precisionGrade}
              ultra
            />
            <div
              className={styles.visualHubVerdictKo}
              style={{ color: confirmDisplay.isFullConfirm ? vt.long : accent }}
            >
              {confirmDisplay.headlineKo}
            </div>
            <div className={styles.visualHubConfirmBadges}>
              <span
                className={styles.visualHubConfirmBadge}
                style={{ color: confirmBadgeColor, borderColor: `${confirmBadgeColor}88` }}
              >
                {confirmDisplay.badgeKo}
              </span>
              <span
                className={styles.visualHubPriority}
                style={{
                  color:
                    quickBoard.priority === '즉시 후보'
                      ? vt.long
                      : quickBoard.priority === '차단'
                        ? vt.short
                        : vt.wait,
                  borderColor:
                    quickBoard.priority === '즉시 후보'
                      ? `${vt.long}77`
                      : quickBoard.priority === '차단'
                        ? `${vt.short}77`
                        : `${vt.wait}66`,
                }}
              >
                {quickBoard.priority}
              </span>
            </div>
            <div className={styles.visualHubConfirmLadder} aria-label="확정 단계">
              {confirmDisplay.steps.map((step) => (
                <span
                  key={step.key}
                  className={`${styles.visualHubConfirmStep} ${step.done ? styles.visualHubConfirmStepDone : ''} ${step.active ? styles.visualHubConfirmStepActive : ''}`}
                  title={step.label}
                >
                  {step.label}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.visualHubGaugeGrid}>
            <div className={styles.visualHubGaugeTile} data-metric="confidence">
              <PremiumArcGauge
                value={m.confidence ?? 0}
                max={100}
                size={124}
                color={accent}
                color2={vt.accent}
                trackColor={vt.track}
                textColor={vt.gaugeText}
                subtextColor={vt.textMuted}
                label="신뢰도"
                sublabel="%"
                displayValue={m.confidence != null ? formatCountUp(confAnim) : '–'}
                animated
                status={(m.confidence ?? 0) >= 65 ? 'good' : (m.confidence ?? 0) >= 45 ? 'neutral' : 'warn'}
              />
              <MetricSparkline points={sparkTrend} color={accent} color2={vt.accent} width={108} animated />
            </div>
            {m.gates.length > 0 && (
              <div className={styles.visualHubGaugeTile} data-metric="gates">
                <PremiumGateRing
                  gates={m.gates}
                  partialScores={gatePartialMap}
                  size={112}
                  passColor={vt.long}
                  failColor={vt.track}
                  textColor={vt.gaugeText}
                  subtextColor={vt.textMuted}
                  animated
                />
              </div>
            )}
            <div className={styles.visualHubGaugeTile} data-metric="rr">
              <PremiumArcGauge
                value={monthDeskRrGaugeArcValue(quickBoard.rrGauge.rr, quickBoard.rrGauge.rrDistorted)}
                max={100}
                size={124}
                color={
                  quickBoard.rrGauge.rrDistorted ? vt.wait : quickBoard.rrGauge.rrPass ? vt.long : vt.wait
                }
                color2={quickBoard.rrGauge.rrPass ? '#22d3ee' : vt.wait}
                trackColor={vt.track}
                textColor={vt.gaugeText}
                subtextColor={vt.textMuted}
                label="손익비"
                sublabel="R:R"
                displayValue={quickBoard.rrGauge.rrDisplay}
                animated
                status={rrStatus}
              />
            </div>
            <div className={styles.visualHubGaugeTile} data-metric="fusion">
              <FusionScoreRing
                value={fusionAnim}
                label="AI 정밀 융합"
                sublabel={fusionLabel}
                color={vt.accent}
                color2="#22d3ee"
                size={108}
                trackColor={vt.track}
                textColor={vt.gaugeText}
                animated
              />
            </div>
            <div className={`${styles.visualHubGaugeTile} ${styles.visualHubGaugeTileWide}`} data-metric="battle">
              <PremiumBattleGauge
                longPct={m.longPct}
                shortPct={m.shortPct}
                verdict={m.verdict}
                size={168}
                longColor={vt.long}
                shortColor={vt.short}
                trackColor={vt.track}
                animated
              />
            </div>
            {precision && precision.gatePartials.length >= 5 && (
              <div className={`${styles.visualHubGaugeTile} ${styles.visualHubGaugeTileRadar}`} data-metric="radar">
                <MonthDeskGateRadar
                  partials={precision.gatePartials}
                  size={168}
                  accent={vt.accent}
                  passColor={vt.long}
                  trackColor={vt.track}
                  animated
                />
              </div>
            )}
          </div>
        </div>

        {precision && (
          <div className={styles.visualHubPrecisionStrip}>
            <div className={styles.visualHubPrecisionHead}>
              <span className={styles.visualHubPrecisionTag}>정밀 분석</span>
              <strong style={{ color: vt.accent }}>
                {formatCountUp(precision.precisionScore)}점 · 등급 {precision.precisionGrade}
              </strong>
            </div>
            <div className={styles.visualHubPrecisionBars}>
              {precision.gatePartials.map((g) => (
                <div key={g.key} className={styles.visualHubPrecisionBarRow} title={g.detailKo}>
                  <span className={styles.visualHubPrecisionBarLabel}>{g.label}</span>
                  <div className={styles.visualHubPrecisionBarTrack}>
                    <div
                      className={styles.visualHubPrecisionBarFill}
                      style={{
                        width: `${g.score}%`,
                        background: g.pass
                          ? `linear-gradient(90deg, ${vt.long}, ${vt.accent})`
                          : `linear-gradient(90deg, ${vt.wait}, ${vt.track})`,
                      }}
                    />
                  </div>
                  <span className={styles.visualHubPrecisionBarPct}>{g.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.visualHubKpiStrip}>
          <div className={styles.visualHubKpiChip} style={{ borderColor: `${accent}55` }}>
            <span className={styles.visualHubKpiLabel}>MTF</span>
            <strong style={{ color: accent }}>
              {m.mtfAlignment != null ? `${formatCountUp(mtfAnim)}%` : '–'}
            </strong>
          </div>
          <div className={styles.visualHubKpiChip}>
            <span className={styles.visualHubKpiLabel}>롱점수</span>
            <strong style={{ color: vt.long }}>{formatCountUp(longScoreAnim, 1)}</strong>
          </div>
          <div className={styles.visualHubKpiChip}>
            <span className={styles.visualHubKpiLabel}>숏점수</span>
            <strong style={{ color: vt.short }}>{formatCountUp(shortScoreAnim, 1)}</strong>
          </div>
          <div className={styles.visualHubKpiChip}>
            <span className={styles.visualHubKpiLabel}>상태</span>
            <strong style={{ color: vt.gaugeText }}>{quickBoard.strongSide}</strong>
          </div>
          <div className={styles.visualHubKpiChip}>
            <span className={styles.visualHubKpiLabel}>리스크</span>
            <strong style={{ color: quickBoard.flipRiskLabel === '안정' ? vt.long : vt.wait }}>
              {quickBoard.flipRiskLabel}
            </strong>
          </div>
        </div>

        <details className={styles.visualHubExplainFold}>
          <summary className={styles.visualHubExplainFoldSummary} style={{ color: vt.gaugeText }}>
            AI 해석 · 확정 단계 상세
          </summary>
          <div
            className={styles.visualHubGaugeExplain}
            title={quickBoard.rrGauge.rrExplainKo}
            style={{ color: vt.textMuted, borderColor: `${vt.track}99` }}
          >
            {confirmDisplay.explainLines.map((line, i) => (
              <p key={`cf-${i}`} className={styles.visualHubGaugeExplainLine}>
                {line}
              </p>
            ))}
            {precision?.breakdownKo.map((line, i) => (
              <p key={`pr-${i}`} className={styles.visualHubGaugeExplainLine} style={{ opacity: 0.9 }}>
                {line}
              </p>
            ))}
            <p className={styles.visualHubGaugeExplainLine}>
              <strong style={{ color: accent }}>신뢰도 {m.confidence ?? '–'}%</strong> ·{' '}
              <strong style={{ color: m.gatesPassCount >= 4 ? vt.long : vt.wait }}>
                게이트 {m.gatesPassCount}/5
              </strong>{' '}
              ·{' '}
              <strong style={{ color: quickBoard.rrGauge.rrPass ? vt.long : vt.wait }}>
                R:R {quickBoard.rrGauge.rrDisplay}
              </strong>
            </p>
            <p className={styles.visualHubGaugeExplainLine} style={{ opacity: 0.92 }}>
              {quickBoard.actionLine} · 참고용(실매매 확정 아님)
            </p>
          </div>
        </details>

        <div className={styles.visualHubBattle}>
          <div className={styles.cockpitBattleBar}>
            <div
              className={`${styles.cockpitBattleLong} ${styles.visualHubBattleBarGlow}`}
              style={{ width: `${m.longPct}%`, background: `linear-gradient(90deg, #0f172a, ${vt.long}, #86efac)` }}
            />
            <div
              className={`${styles.cockpitBattleShort} ${styles.visualHubBattleBarGlow}`}
              style={{ width: `${m.shortPct}%`, background: `linear-gradient(90deg, #fca5a5, ${vt.short}, #7f1d1d)` }}
            />
          </div>
          <div className={styles.visualHubBattleLabels}>
            <span style={{ color: vt.long, fontWeight: 900 }}>
              LONG {m.longScore.toFixed(1)} · {m.longPct}%
            </span>
            <span style={{ color: vt.textMuted, fontSize: 10, fontWeight: 800 }}>
              {quickBoard.potentialLabel} · {quickBoard.priority}
            </span>
            <span style={{ color: vt.short, fontWeight: 900 }}>
              SHORT {m.shortScore.toFixed(1)} · {m.shortPct}%
            </span>
          </div>
        </div>

        <div className={styles.visualHubMap}>
          <MonthDeskPriceMap levels={levels} verdict={m.verdict} theme={vt} height={420} whale={whale} />
        </div>

        <MonthDeskActionLevelTiles ta={ta} levels={levels} verdict={m.verdict} theme={vt} />

        <div className={styles.visualHubWhaleStrip}>
          <div className={styles.visualHubWhaleMini}>
            <ArcGauge
              value={whale.activityScore}
              max={100}
              size={88}
              stroke={7}
              color={whale.activityScore >= 65 ? '#22d3ee' : vt.wait}
              trackColor={vt.track}
              textColor={vt.gaugeText}
              subtextColor={vt.textMuted}
              label="고래"
              displayValue={`${whale.activityScore}`}
              animated
            />
          </div>
          <div className={styles.visualHubWhaleMini}>
            <DualVerdictGauge
              longPct={whale.buyPressure}
              shortPct={whale.sellPressure}
              size={120}
              longColor="#22d3ee"
              shortColor="#fb7185"
              trackColor={vt.track}
              animated
            />
            <div className={styles.cockpitWhaleFlowBar}>
              <div className={styles.cockpitWhaleFlowBuy} style={{ width: `${whale.buyPressure}%` }} />
              <div className={styles.cockpitWhaleFlowSell} style={{ width: `${whale.sellPressure}%` }} />
            </div>
            <div className={styles.visualHubWhaleCaption} style={{ color: vt.textMuted }}>
              {whaleBoard.flowBias} · B{whale.whaleBuyRecent}/S{whale.whaleSellRecent}
            </div>
          </div>
          <div className={styles.visualHubWhaleMini}>
            <div className={styles.visualHubDefendGrid}>
              <span
                className={styles.cockpitWhaleStatePill}
                style={{
                  color: whale.inBuyZone ? vt.long : vt.textMuted,
                  borderColor: whale.inBuyZone ? `${vt.long}77` : `${vt.track}77`,
                }}
              >
                매수존 {whale.inBuyZone ? '지킴' : '—'}
              </span>
              <span
                className={styles.cockpitWhaleStatePill}
                style={{
                  color: whale.inSellZone ? vt.short : vt.textMuted,
                  borderColor: whale.inSellZone ? `${vt.short}77` : `${vt.track}77`,
                }}
              >
                매도존 {whale.inSellZone ? '작동' : '—'}
              </span>
            </div>
            <div className={styles.cockpitWhalePriceRow}>
              <span style={{ color: vt.long }}>
                🛡 {whale.defendPrice != null ? whale.defendPrice.toLocaleString() : '—'}
              </span>
              <span style={{ color: vt.short }}>
                ▽ {whale.attackPrice != null ? whale.attackPrice.toLocaleString() : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
