'use client';

import { useId, useMemo, useState } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import type { AxisKey } from '@/lib/unifiedTrade';
import {
  applyGatePreset,
  buildUnifiedSnapshot,
  getActiveBlacklists,
  getDirectionalAccuracy,
  getPerformanceRanking,
  getRecentTrend,
  loadLearningState,
  updateGateConfig,
} from '@/lib/unifiedTrade';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES, type UnifiedPanelFeatures } from '@/lib/unifiedSignalPanelProfile';
import type { SignalGrade } from '@/lib/unifiedSignalTypes';
import { CHANNEL_COMPACT_KO, FUSION_DIRECTION_LABEL_KO, SIGNAL_GRADE_LABEL_KO } from '@/lib/unifiedSignalTypes';
import { defaultSettings, loadSettings } from '@/lib/settings';
import { useSettingsChangeTick } from '@/lib/useSettingsChangeTick';
import { fusionTheme, gateFailedLabelKo, verdictLabelKo } from '@/lib/fusionUiTheme';
import { buildSwingShortZonePlan } from '@/lib/swingShortZonePlan';

type Row = { key: AxisKey; label: string; score: number };
type ZoneVolRank = { key: string; label: string; score: number; detail: string };
type SrStat = { label: string; touches: number; avgBouncePct: number; maxBouncePct: number };
type CoreFeatureStat = { key: string; label: string; supportHits: number; supportRate: number; confidence: number; coreScore: number; note: string };

const FUSION_HINT_BADGES = [
  '종합점수: 높을수록 유리',
  '반대근거: 낮을수록 좋음',
  '잠금상태: 오판패턴 차단',
  '핵심기능 점수: 지금 봐야할 우선순위',
] as const;

function fmtUsdSigned(n: number): string {
  const s = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

export default function TradeUnifiedGraph({
  analysis,
  candles,
  onSelectRankingTimeframe,
  panelFeatures,
}: {
  analysis: AnalyzeResponse | null;
  /** 있으면 RSI·MACD·OBV·EMA 합성(`omni_chart_fusion`)이 통합 롱/숏에 포함됩니다 */
  candles?: Candle[] | null;
  onSelectRankingTimeframe?: (timeframe: string) => void;
  /** 우측 칩 — 실행카드/자율학습/가상매매 OFF 시 해당 채널 가중 0 */
  panelFeatures?: UnifiedPanelFeatures;
}) {
  if (!analysis) return null;
  const [version, setVersion] = useState(0);
  const radarGlowId = `radar-glow-${useId().replace(/:/g, '')}`;
  const [focusDirection, setFocusDirection] = useState<'LONG' | 'SHORT' | null>(null);
  const settingsTick = useSettingsChangeTick();
  const snapshot = buildUnifiedSnapshot(analysis);
  const fusionProfile = useMemo(() => {
    const pf = panelFeatures ?? DEFAULT_UNIFIED_PANEL_FEATURES;
    const s = typeof window !== 'undefined' ? loadSettings() : defaultSettings;
    return buildProfileFromPanelFeatures(pf, {
      showRsiIndicators: s.showRsi,
      showMacdPanel: s.showMacdPanel,
      showBbPanel: s.showBbPanel,
    });
  }, [panelFeatures, settingsTick]);

  const lsSignal = useMemo(
    () =>
      buildUnifiedLsSignal(
        analysis,
        fusionProfile,
        candles && candles.length >= 30 ? { candles } : undefined,
      ),
    [analysis, fusionProfile, candles],
  );
  const swingShortPlan = useMemo(
    () =>
      buildSwingShortZonePlan(
        analysis,
        { direction: lsSignal.direction, grade: lsSignal.grade },
        {
          verdict: snapshot.verdict,
          gatePassed: snapshot.gatePassed,
          longOverall: snapshot.longOverall,
          shortOverall: snapshot.shortOverall,
          edge: snapshot.edge,
          reason: snapshot.reason,
        },
      ),
    [
      analysis,
      lsSignal.direction,
      lsSignal.grade,
      snapshot.verdict,
      snapshot.gatePassed,
      snapshot.longOverall,
      snapshot.shortOverall,
      snapshot.edge,
      snapshot.reason,
    ],
  );
  const learning = loadLearningState();
  const acc = getDirectionalAccuracy(learning);
  const trend = getRecentTrend(learning);
  const activeBlacklists = getActiveBlacklists(learning);
  const ranking = getPerformanceRanking(learning);
  const effectiveDirection: 'LONG' | 'SHORT' =
    focusDirection ?? (snapshot.verdict === 'SHORT' ? 'SHORT' : 'LONG');
  const selectedRows = effectiveDirection === 'SHORT' ? snapshot.shortRows : snapshot.longRows;
  const oppositeRows = effectiveDirection === 'SHORT' ? snapshot.longRows : snapshot.shortRows;
  const explainTop = selectedRows
    .map((r) => {
      const opp = oppositeRows.find((x) => x.key === r.key)?.score ?? 0;
      return { ...r, gap: r.score - opp };
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
  const highlightKeys = new Set(explainTop.map((r) => r.key));
  const rows: Row[] = snapshot.rows;
  const srStats = (() => {
    const candles = Array.isArray((analysis as any)?.candles) ? ((analysis as any).candles as Array<{ high: number; low: number }>) : [];
    if (candles.length < 20) return null;
    const overlays = Array.isArray(analysis.overlays) ? analysis.overlays : [];
    const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const supportLevels: number[] = [];
    const resistanceLevels: number[] = [];
    const addUnique = (arr: number[], v: number) => {
      const exists = arr.some((x) => Math.abs(x - v) / Math.max(1, v) < 0.0015);
      if (!exists) arr.push(v);
    };
    const supportFromApi = toNum(analysis.supportLevel?.price);
    const resistanceFromApi = toNum(analysis.resistanceLevel?.price);
    if (supportFromApi) addUnique(supportLevels, supportFromApi);
    if (resistanceFromApi) addUnique(resistanceLevels, resistanceFromApi);
    for (const o of overlays as any[]) {
      const p1 = toNum(o?.price1);
      const p2 = toNum(o?.price2);
      const mid = p1 != null && p2 != null ? (p1 + p2) / 2 : (p1 ?? p2);
      if (mid == null || mid <= 0) continue;
      if (o.kind === 'supportLine' || o.kind === 'demandZone' || String(o.id || '').includes('support') || String(o.id || '').includes('buy')) addUnique(supportLevels, mid);
      if (o.kind === 'resistanceLine' || o.kind === 'supplyZone' || String(o.id || '').includes('resistance') || String(o.id || '').includes('sell')) addUnique(resistanceLevels, mid);
    }
    const lookahead = 12;
    const toleranceRate = 0.0018;
    const calc = (levels: number[], side: 'support' | 'resistance'): SrStat => {
      let touches = 0;
      let sumBounce = 0;
      let maxBounce = 0;
      for (const level of levels) {
        const tol = Math.max(level * toleranceRate, level * 0.0006);
        let lastTouchIdx = -9999;
        for (let i = 0; i < candles.length - 2; i += 1) {
          const c = candles[i];
          const touched = c.low <= level + tol && c.high >= level - tol;
          if (!touched) continue;
          if (i - lastTouchIdx < 3) continue;
          lastTouchIdx = i;
          const end = Math.min(candles.length - 1, i + lookahead);
          let bouncePct = 0;
          if (side === 'support') {
            let maxHigh = c.high;
            for (let j = i + 1; j <= end; j += 1) maxHigh = Math.max(maxHigh, candles[j].high);
            bouncePct = ((maxHigh - level) / Math.max(1e-9, level)) * 100;
          } else {
            let minLow = c.low;
            for (let j = i + 1; j <= end; j += 1) minLow = Math.min(minLow, candles[j].low);
            bouncePct = ((level - minLow) / Math.max(1e-9, level)) * 100;
          }
          if (!Number.isFinite(bouncePct) || bouncePct < 0) continue;
          touches += 1;
          sumBounce += bouncePct;
          maxBounce = Math.max(maxBounce, bouncePct);
        }
      }
      return {
        label: side === 'support' ? '지지' : '저항',
        touches,
        avgBouncePct: touches ? Number((sumBounce / touches).toFixed(2)) : 0,
        maxBouncePct: Number(maxBounce.toFixed(2)),
      };
    };
    const support = calc(supportLevels.slice(0, 24), 'support');
    const resistance = calc(resistanceLevels.slice(0, 24), 'resistance');
    return { support, resistance, candles: candles.length, levelCount: supportLevels.length + resistanceLevels.length };
  })();
  const zoneVolatilityRanking: ZoneVolRank[] = (() => {
    const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v)));
    const nz = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const buy = analysis.nearestBuyZone;
    const sell = analysis.nearestSellZone;
    const pressureGap = Math.abs(nz(analysis.buyPressure, 50) - nz(analysis.sellPressure, 50));
    const flowBoost = clamp(pressureGap * 1.1 + Math.abs(nz(analysis.volumeDelta, 0)) * 0.04);
    const buyScore = clamp(
      nz(buy?.holdProbability, nz(analysis.supportLevelProbability, 50)) * 0.45 +
      nz(buy?.breakProbability, nz(analysis.breakoutUpsideProbability, 50)) * 0.35 +
      (100 - nz(buy?.trapRisk, 50)) * 0.2 +
      flowBoost * 0.2
    );
    const sellScore = clamp(
      nz(sell?.resistanceProbability, nz(analysis.resistanceLevelProbability, 50)) * 0.45 +
      (100 - nz(sell?.breakProbability, 50)) * 0.35 +
      (100 - nz(sell?.trapRisk, 50)) * 0.2 +
      flowBoost * 0.2
    );
    const supportBreakScore = clamp(
      nz(analysis.supportLevelProbability, 50) * 0.6 +
      nz(analysis.breakoutLevelProbability, nz(analysis.breakoutUpsideProbability, 50)) * 0.4 +
      flowBoost * 0.2
    );
    const resistanceBreakScore = clamp(
      nz(analysis.resistanceLevelProbability, 50) * 0.65 +
      nz(analysis.invalidationLevelProbability, 50) * 0.35 +
      flowBoost * 0.2
    );
    const rows: ZoneVolRank[] = [
      { key: 'buy-zone', label: '지지존 반응 변동성', score: buyScore, detail: `보유확률 ${Math.round(nz(buy?.holdProbability, nz(analysis.supportLevelProbability, 0)))}%` },
      { key: 'sell-zone', label: '저항존 반응 변동성', score: sellScore, detail: `저항확률 ${Math.round(nz(sell?.resistanceProbability, nz(analysis.resistanceLevelProbability, 0)))}%` },
      { key: 'support-break', label: '지지 이후 추세 확장', score: supportBreakScore, detail: `돌파연계 ${Math.round(nz(analysis.breakoutLevelProbability, nz(analysis.breakoutUpsideProbability, 0)))}%` },
      { key: 'resistance-break', label: '저항 이후 변동 확대', score: resistanceBreakScore, detail: `이탈확률 ${Math.round(nz(analysis.invalidationLevelProbability, 0))}%` },
    ];
    return rows.sort((a, b) => b.score - a.score);
  })();
  const coreFeatureStats: CoreFeatureStat[] = (() => {
    const candles = Array.isArray((analysis as any)?.candles) ? ((analysis as any).candles as Array<{ high: number; low: number }>) : [];
    if (candles.length < 20) return [];
    const overlays = Array.isArray(analysis.overlays) ? analysis.overlays : [];
    const toNum = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const featureLevels: Array<{ key: string; label: string; level: number; confidence: number; supportProb: number; note: string }> = [];
    const pushLevel = (row: { key: string; label: string; level: number; confidence: number; supportProb: number; note: string }) => {
      if (!Number.isFinite(row.level) || row.level <= 0) return;
      featureLevels.push(row);
    };
    if (analysis.supportLevel?.price) {
      pushLevel({
        key: 'supportLevel',
        label: '핵심 지지레벨',
        level: Number(analysis.supportLevel.price),
        confidence: toNum(analysis.supportLevelProbability, 55),
        supportProb: toNum(analysis.supportLevelProbability, 55),
        note: '레벨엔진 지지',
      });
    }
    if (analysis.breakoutLevel?.price) {
      pushLevel({
        key: 'breakoutLevel',
        label: '돌파 지지전환',
        level: Number(analysis.breakoutLevel.price),
        confidence: toNum(analysis.breakoutLevelProbability, 50),
        supportProb: toNum(analysis.breakoutUpsideProbability, toNum(analysis.breakoutLevelProbability, 50)),
        note: '돌파 후 유지',
      });
    }
    if (analysis.nearestBuyZone) {
      pushLevel({
        key: 'nearestBuyZone',
        label: '강한 매수존',
        level: (Number(analysis.nearestBuyZone.low) + Number(analysis.nearestBuyZone.high)) / 2,
        confidence: toNum(analysis.nearestBuyZone.probability, 55),
        supportProb: toNum(analysis.nearestBuyZone.holdProbability, toNum(analysis.nearestBuyZone.probability, 55)),
        note: '강한매수 구간',
      });
    }
    for (const o of overlays as any[]) {
      const p1 = typeof o?.price1 === 'number' ? o.price1 : null;
      const p2 = typeof o?.price2 === 'number' ? o.price2 : null;
      const mid = p1 != null && p2 != null ? (p1 + p2) / 2 : (p1 ?? p2);
      if (mid == null) continue;
      if (o.kind === 'demandZone' || o.kind === 'supportLine' || String(o.id || '').includes('support')) {
        pushLevel({
          key: `ov-${String(o.kind)}`,
          label: o.kind === 'demandZone' ? '수요존' : '지지선',
          level: mid,
          confidence: toNum(o.confidence, 50),
          supportProb: toNum(o.confidence, 50),
          note: `오버레이 ${o.kind}`,
        });
      }
    }
    const lookahead = 12;
    const toleranceRate = 0.0018;
    const grouped = new Map<string, { label: string; touches: number; success: number; confidenceSum: number; supportProbSum: number; count: number; note: string }>();
    for (const f of featureLevels.slice(0, 80)) {
      const tol = Math.max(f.level * toleranceRate, f.level * 0.0006);
      let touches = 0;
      let success = 0;
      let lastTouchIdx = -9999;
      for (let i = 0; i < candles.length - 2; i += 1) {
        const c = candles[i];
        const touched = c.low <= f.level + tol && c.high >= f.level - tol;
        if (!touched) continue;
        if (i - lastTouchIdx < 3) continue;
        lastTouchIdx = i;
        touches += 1;
        const end = Math.min(candles.length - 1, i + lookahead);
        let maxHigh = c.high;
        for (let j = i + 1; j <= end; j += 1) maxHigh = Math.max(maxHigh, candles[j].high);
        const bouncePct = ((maxHigh - f.level) / Math.max(1e-9, f.level)) * 100;
        if (bouncePct >= 0.6) success += 1;
      }
      const g = grouped.get(f.key) || { label: f.label, touches: 0, success: 0, confidenceSum: 0, supportProbSum: 0, count: 0, note: f.note };
      g.touches += touches;
      g.success += success;
      g.confidenceSum += f.confidence;
      g.supportProbSum += f.supportProb;
      g.count += 1;
      grouped.set(f.key, g);
    }
    return Array.from(grouped.entries())
      .map(([key, g]) => {
        const supportRate = g.touches ? Math.round((g.success / g.touches) * 100) : 0;
        const confidence = g.count ? Math.round(g.confidenceSum / g.count) : 0;
        const supportProb = g.count ? Math.round(g.supportProbSum / g.count) : 0;
        const coreScore = Math.round(supportRate * 0.5 + supportProb * 0.3 + confidence * 0.2);
        return {
          key,
          label: g.label,
          supportHits: g.touches,
          supportRate,
          confidence,
          coreScore,
          note: g.note,
        };
      })
      .filter((x) => x.supportHits > 0)
      .sort((a, b) => b.coreScore - a.coreScore)
      .slice(0, 5);
  })();
  const overall = snapshot.overall;
  const lsGradeColor = (g: SignalGrade) =>
    g === 'CONFIRMED' ? '#22C55E' : g === 'LEAN' ? '#2dd4bf' : g === 'WATCH' ? '#F59E0B' : g === 'CONFLICT' ? '#f97316' : '#94a3b8';
  const ft = fusionTheme(lsSignal.grade);
  const lsMix = Math.max(1, lsSignal.longDisplay + lsSignal.shortDisplay);
  const longBarPct = Math.round((lsSignal.longDisplay / lsMix) * 100);
  const color = overall >= 70 ? '#22C55E' : overall >= 55 ? '#F59E0B' : '#EF4444';
  const cx = 130;
  const cy = 130;
  const radius = 92;
  const axisCount = rows.length;
  const angleAt = (i: number) => -Math.PI / 2 + (Math.PI * 2 * i) / axisCount;
  const pt = (score: number, i: number, scale = 1) => {
    const r = radius * scale * (score / 100);
    const a = angleAt(i);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };
  const polyPoints = rows
    .map((r, i) => {
      const p = pt(r.score, i);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div
      className="card panel-pad"
      style={{
        marginBottom: 12,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        background: 'linear-gradient(168deg, rgba(15,23,42,0.99) 0%, rgba(49,46,129,0.22) 42%, rgba(15,23,42,0.96) 100%)',
        boxShadow: '0 0 0 1px rgba(99,102,241,0.14), 0 20px 56px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
      data-version={version}
    >
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: -48,
          right: -40,
          width: 220,
          height: 220,
          background: `radial-gradient(circle at 30% 30%, ${ft.glow}, transparent 65%)`,
          opacity: 0.85,
        }}
      />
      <div className="space-between" style={{ marginBottom: 10, position: 'relative', zIndex: 1, alignItems: 'center' }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(100deg, #f8fafc 0%, #a5b4fc 42%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          통합 트레이드 그래프
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,41,59,0.85))',
            boxShadow: `0 0 24px -8px ${color}77, inset 0 1px 0 rgba(255,255,255,0.12)`,
            border: `1px solid ${color}66`,
          }}
        >
          {verdictLabelKo(snapshot.verdict)} · {overall}%
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, position: 'relative', zIndex: 1, lineHeight: 1.5 }}>
        {snapshot.reason} · 반대근거{' '}
        {snapshot.verdict === 'LONG'
          ? `숏 ${snapshot.shortOverall}`
          : snapshot.verdict === 'SHORT'
            ? `롱 ${snapshot.longOverall}`
            : `롱 ${snapshot.longOverall} / 숏 ${snapshot.shortOverall}`}{' '}
        · 학습 승/패 {learning.stats.wins}/{learning.stats.losses}
      </div>
      {analysis.volumeFlowSummary?.label ? (
        <div
          style={{
            fontSize: 10.5,
            color: '#a5b4fc',
            marginBottom: 10,
            position: 'relative',
            zIndex: 1,
            lineHeight: 1.45,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(165,180,252,0.22)',
          }}
        >
          <span style={{ fontWeight: 700, color: '#c7d2fe' }}>WAD·거래량 </span>
          {analysis.volumeFlowSummary.label}
        </div>
      ) : null}
      <div
        style={{
          marginBottom: 12,
          position: 'relative',
          zIndex: 1,
          padding: '14px 14px 12px',
          borderRadius: 12,
          border: `1px solid ${ft.ring}`,
          background: `linear-gradient(155deg, rgba(15,23,42,0.92) 0%, rgba(30,27,75,0.35) 100%)`,
          boxShadow: `0 0 32px -10px ${ft.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
            피처 퓨전 롱·숏
          </div>
          <span
            className="badge"
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(165,180,252,0.35)',
              color: '#e0e7ff',
            }}
          >
            원판정 {verdictLabelKo(lsSignal.sourceVerdict)}
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            overflow: 'hidden',
            display: 'flex',
            marginBottom: 12,
            background: 'rgba(0,0,0,0.35)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              width: `${longBarPct}%`,
              background: 'linear-gradient(90deg, #15803d, #4ade80, #86efac)',
              boxShadow: '0 0 12px rgba(74,222,128,0.5)',
              transition: 'width 0.35s ease',
            }}
          />
          <div
            style={{
              flex: 1,
              background: 'linear-gradient(90deg, #fca5a5, #ef4444, #b91c1c)',
              boxShadow: '0 0 12px rgba(248,113,113,0.35)',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: ft.main,
              textShadow: `0 0 28px ${ft.glow}`,
            }}
          >
            {SIGNAL_GRADE_LABEL_KO[lsSignal.grade]}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>{FUSION_DIRECTION_LABEL_KO[lsSignal.direction]}</span>
          <span style={{ fontSize: 12, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
            롱 <strong style={{ color: '#86efac' }}>{lsSignal.longDisplay}</strong>
            {' / '}
            숏 <strong style={{ color: '#fca5a5' }}>{lsSignal.shortDisplay}</strong>
            {' · '}
            격차 <strong style={{ color: '#67e8f9' }}>{lsSignal.edge > 0 ? '+' : ''}{lsSignal.edge}</strong>
          </span>
        </div>
        {lsSignal.gatesFailed.length > 0 && (
          <div
            style={{
              fontSize: 10,
              color: '#fef08a',
              marginBottom: 8,
              padding: '6px 8px',
              borderRadius: 8,
              background: 'rgba(234,179,8,0.12)',
              border: '1px solid rgba(250,204,21,0.35)',
            }}
          >
            게이트: {lsSignal.gatesFailed.join(', ')}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.55 }}>
          {lsSignal.explain.slice(0, 4).map((line, i) => (
            <div key={i} style={{ padding: '3px 0', borderLeft: '2px solid rgba(99,102,241,0.45)', paddingLeft: 8 }}>
              {line}
            </div>
          ))}
        </div>
        {lsSignal.channelContributions.length > 0 && (() => {
          const chRows = lsSignal.channelContributions;
          const totalW = chRows.reduce((s, c) => s + c.weightSum, 0) || 1;
          const topByWeight = [...chRows].sort((a, b) => b.weightSum - a.weightSum).slice(0, 3);
          const tilt = (c: (typeof chRows)[0]) => {
            const d = c.longDisplay - c.shortDisplay;
            if (d > 6) return '롱';
            if (d < -6) return '숏';
            return '균';
          };
          const summary = topByWeight
            .map((c) => `${CHANNEL_COMPACT_KO[c.channel]} ${tilt(c)} ${Math.round((c.weightSum / totalW) * 100)}%`)
            .join(' · ');
          return (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.18)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', marginBottom: 6, letterSpacing: '0.04em' }}>
                채널 기여 한눈에
              </div>
              <div
                style={{
                  height: 12,
                  borderRadius: 6,
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: 8,
                  background: 'rgba(0,0,0,0.35)',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.35)',
                }}
                title="채널별 가중 비중(넓을수록 영향 큼)"
              >
                {chRows.map((ch) => {
                  const pct = (ch.weightSum / totalW) * 100;
                  const longTilt = ch.longDisplay >= ch.shortDisplay;
                  return (
                    <div
                      key={ch.channel}
                      style={{
                        width: `${pct}%`,
                        minWidth: pct > 1.5 ? 3 : 0,
                        background: longTilt
                          ? 'linear-gradient(180deg, #4ade80, #166534)'
                          : 'linear-gradient(180deg, #f87171, #991b1b)',
                        opacity: 0.92,
                        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.2)',
                      }}
                      title={`${ch.label} · 가중 ${Math.round(pct)}% · 롱${ch.longDisplay} 숏${ch.shortDisplay}`}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, fontSize: 9, lineHeight: 1.35 }}>
                {chRows.map((ch) => {
                  const pct = Math.round((ch.weightSum / totalW) * 100);
                  const t = tilt(ch);
                  const col = t === '롱' ? '#86efac' : t === '숏' ? '#fca5a5' : '#94a3b8';
                  return (
                    <span
                      key={`leg-${ch.channel}`}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: 'rgba(15,23,42,0.65)',
                        border: '1px solid rgba(99,102,241,0.22)',
                        color: col,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      title={ch.label}
                    >
                      {CHANNEL_COMPACT_KO[ch.channel]} {pct}% {t}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 10, lineHeight: 1.45 }}>
                <span style={{ color: '#94a3b8' }}>상위 가중·우세: </span>
                {summary}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>채널별 상세</div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 168, overflowY: 'auto' }}>
                {chRows.slice(0, 10).map((ch) => {
                  const t = ch.longDisplay + ch.shortDisplay + 1;
                  const lp = Math.round((ch.longDisplay / t) * 100);
                  return (
                    <div
                      key={ch.channel}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: 'rgba(15,23,42,0.55)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        boxShadow: '0 4px 14px -8px rgba(0,0,0,0.45)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#e0e7ff', fontWeight: 700 }}>{ch.label}</span>
                        <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                          가중 {ch.weightSum.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 3, overflow: 'hidden', display: 'flex', marginBottom: 4 }}>
                        <div style={{ width: `${lp}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)' }} />
                        <div style={{ flex: 1, background: 'linear-gradient(90deg, #f87171, #dc2626)' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        롱{ch.longDisplay}/숏{ch.shortDisplay}
                        <span style={{ color: '#64748b', marginLeft: 6 }}>{ch.featureLabels.join(' · ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
      {swingShortPlan && (
        <div
          style={{
            marginBottom: 12,
            position: 'relative',
            zIndex: 1,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'linear-gradient(160deg, rgba(15,23,42,0.95) 0%, rgba(127,29,29,0.18) 100%)',
            boxShadow: '0 0 28px -12px rgba(248,113,113,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fecaca', letterSpacing: '-0.02em' }}>
              스윙 숏 · 빨강/파랑/노랑 ZONE 연동
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {swingShortPlan.unifiedGraphSwingOk ? (
                <span className="badge" style={{ fontSize: 9, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(74,222,128,0.45)', color: '#bbf7d0' }}>
                  통합 그래프 게이트·숏
                </span>
              ) : swingShortPlan.unifiedGraphFavorsShort ? (
                <span className="badge" style={{ fontSize: 9, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(125,211,252,0.4)', color: '#bae6fd' }}>
                  숏 우세(게이트 대기)
                </span>
              ) : (
                <span className="badge" style={{ fontSize: 9, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(250,204,21,0.4)', color: '#fde68a' }}>
                  통합 그래프 비숏·참고
                </span>
              )}
              {swingShortPlan.fusionShortAligned ? (
                <span className="badge" style={{ fontSize: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(165,180,252,0.4)', color: '#e0e7ff' }}>
                  퓨전 숏
                </span>
              ) : null}
              {swingShortPlan.snapshotVerdictShort && (
                <span className="badge" style={{ fontSize: 9, background: 'rgba(248,113,113,0.18)', color: '#fecaca' }}>
                  원판정 숏
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
            차트와 <strong style={{ color: '#e2e8f0' }}>같은 id·색</strong>으로 묶습니다:{' '}
            <strong style={{ color: '#f87171' }}>빨강</strong> = 고래·기관 매도(<code style={{ fontSize: 9 }}>strong-sell-*</code>),{' '}
            <strong style={{ color: '#60a5fa' }}>파랑</strong> = 반응구간 진입(<code style={{ fontSize: 9 }}>reaction-zone-entry</code>),{' '}
            <strong style={{ color: '#facc15' }}>노랑</strong> = 반응구간 저항(<code style={{ fontSize: 9 }}>reaction-zone-resistance</code>).
            진입·손절·익절은 <strong style={{ color: '#e2e8f0' }}>통합 트레이드 그래프(게이트·축 점수)</strong>와 함께 읽습니다.
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            {(
              [
                { key: 'red' as const, z: swingShortPlan.tiers.red },
                { key: 'blue' as const, z: swingShortPlan.tiers.blue },
                { key: 'yellow' as const, z: swingShortPlan.tiers.yellow },
              ] as const
            ).map(({ key, z }) => {
              const border =
                key === 'red' ? 'rgba(239,68,68,0.55)' : key === 'blue' ? 'rgba(59,130,246,0.55)' : 'rgba(234,179,8,0.55)';
              const bg =
                key === 'red' ? 'rgba(127,29,29,0.2)' : key === 'blue' ? 'rgba(30,58,138,0.22)' : 'rgba(113,63,18,0.22)';
              const title =
                key === 'red' ? '빨강 ZONE' : key === 'blue' ? '파랑 ZONE' : '노랑 ZONE';
              if (!z) {
                return (
                  <div
                    key={key}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: `1px dashed ${border}`,
                      background: 'rgba(15,23,42,0.4)',
                      fontSize: 10,
                      color: '#64748b',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{title}</span>
                    <span style={{ marginLeft: 8 }}>차트에 없음 — 오버레이·분석에 해당 박스가 없습니다.</span>
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${border}`,
                    background: bg,
                    fontSize: 10,
                    color: '#e2e8f0',
                  }}
                >
                  <span style={{ fontWeight: 800, color: '#fca5a5' }}>{title}</span>
                  <span style={{ color: '#94a3b8', marginLeft: 8 }}>{z.labelKo}</span>
                  <div style={{ marginTop: 4, color: '#cbd5e1' }}>
                    {z.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ {z.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    <span style={{ color: '#64748b', marginLeft: 6 }}>· {z.overlayId} · 신뢰 {z.confidence}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.08)' }}>
              <div className="metric-label">진입(참고)</div>
              <div className="mini-value" style={{ color: '#67e8f9', fontWeight: 800 }}>
                {swingShortPlan.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.08)' }}>
              <div className="metric-label">손절(스윙)</div>
              <div className="mini-value c-short" style={{ fontWeight: 800 }}>
                {swingShortPlan.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 6 }}>
            익절(순서대로) · 현재가 {swingShortPlan.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} · TP1 대비 R≈{' '}
            <strong style={{ color: swingShortPlan.rrTp1 >= 1 ? '#86efac' : '#fbbf24' }}>{swingShortPlan.rrTp1 >= 0.01 ? swingShortPlan.rrTp1.toFixed(2) : '–'}</strong>
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            {swingShortPlan.takeProfits.map((tp, i) => (
              <div
                key={`${tp.label}-${i}`}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(15,23,42,0.55)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  fontSize: 10,
                  color: '#bbf7d0',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <strong style={{ color: '#4ade80' }}>{tp.label}</strong>
                <span style={{ color: '#86efac', marginLeft: 8 }}>{tp.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
          {swingShortPlan.notes.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 9, color: '#94a3b8', lineHeight: 1.5 }}>
              {swingShortPlan.notes.map((t, i) => (
                <div key={i}>· {t}</div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, position: 'relative', zIndex: 1 }}>
        {FUSION_HINT_BADGES.map((t) => (
          <span
            key={t}
            className="badge"
            style={{
              fontSize: 10,
              padding: '6px 11px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(34,211,238,0.1))',
              border: '1px solid rgba(129,140,248,0.4)',
              boxShadow: '0 4px 16px -6px rgba(99,102,241,0.45)',
              color: '#e2e8f0',
            }}
          >
            {t}
          </span>
        ))}
      </div>
      {analysis.unifiedMarketMetrics ? (
        <div
          style={{
            marginBottom: 12,
            position: 'relative',
            zIndex: 1,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(45,212,191,0.35)',
            background: 'linear-gradient(165deg, rgba(15,23,42,0.96) 0%, rgba(6,78,59,0.14) 100%)',
            boxShadow: '0 0 26px -12px rgba(45,212,191,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: '#5eead4', marginBottom: 6, letterSpacing: '-0.02em' }}>
            시장·CVD·OI·청산·CMF (통합 유동성 축 반영)
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
            Binance 스팟·USDM + Bybit Linear + OKX 스왑 체결로 <strong style={{ color: '#e2e8f0' }}>집계 CVD</strong> 근사,
            바이낸스 <strong style={{ color: '#e2e8f0' }}>OI·강제청산</strong>, 캔들 기반 <strong style={{ color: '#e2e8f0' }}>CMF(20)</strong>을 합칩니다. Coinalyze급 전거래소 동시 스트림은 아니며, 공개 REST로 가능한 범위입니다.
          </div>
          {(() => {
            const m = analysis.unifiedMarketMetrics!;
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(34,197,94,0.06)' }}>
                    <div className="metric-label">스팟 매수 체결(USDT)</div>
                    <div className="mini-value c-long" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsdSigned(m.buyVolumeUsd)}</div>
                  </div>
                  <div className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(239,68,68,0.06)' }}>
                    <div className="metric-label">스팟 매도 체결(USDT)</div>
                    <div className="mini-value c-short" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsdSigned(m.sellVolumeUsd)}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  <div className="mini-card" style={{ padding: '6px 8px' }}>
                    <div className="metric-label">CVD 스팟</div>
                    <div style={{ fontWeight: 800, color: m.spotCumulativeCvdUsd >= 0 ? '#86efac' : '#fca5a5' }}>{fmtUsdSigned(m.spotCumulativeCvdUsd)}</div>
                  </div>
                  <div className="mini-card" style={{ padding: '6px 8px' }}>
                    <div className="metric-label">CVD 선물(BN)</div>
                    <div style={{ fontWeight: 800, color: m.futuresCumulativeCvdUsd >= 0 ? '#86efac' : '#fca5a5' }}>{fmtUsdSigned(m.futuresCumulativeCvdUsd)}</div>
                  </div>
                  <div className="mini-card" style={{ padding: '6px 8px' }}>
                    <div className="metric-label">CVD 집계</div>
                    <div style={{ fontWeight: 800, color: '#67e8f9' }}>{fmtUsdSigned(m.aggregatedCvdUsd)}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="mini-card" style={{ padding: '8px 10px' }}>
                    <div className="metric-label">OI (최근 막대)</div>
                    <div className="mini-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {m.oiLatest != null ? m.oiLatest.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '–'}
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>
                      Δ {m.oiDeltaAbs != null ? fmtUsdSigned(m.oiDeltaAbs) : '–'}
                      {m.oiDeltaPct != null ? ` (${m.oiDeltaPct >= 0 ? '+' : ''}${m.oiDeltaPct.toFixed(3)}%)` : ''}
                    </div>
                  </div>
                  <div className="mini-card" style={{ padding: '8px 10px' }}>
                    <div className="metric-label">강제청산(바이낸스 USDM 최근)</div>
                    <div style={{ fontSize: 10, color: '#86efac' }}>롱청산 {fmtUsdSigned(m.liquidationLongUsd)}</div>
                    <div style={{ fontSize: 10, color: '#fca5a5' }}>숏청산 {fmtUsdSigned(m.liquidationShortUsd)}</div>
                  </div>
                </div>
                <div className="mini-card" style={{ padding: '8px 10px', marginBottom: 8 }}>
                  <div className="metric-label">CMF(20) — Chaikin Money Flow</div>
                  <div className="mini-value" style={{ color: m.cmf20 != null && m.cmf20 > 0.05 ? '#4ade80' : m.cmf20 != null && m.cmf20 < -0.05 ? '#f87171' : '#e2e8f0' }}>
                    {m.cmf20 != null ? m.cmf20.toFixed(4) : '–'}
                  </div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>거래소별 다리 (최근 체결 윈도우)</div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {m.exchangeLegs.map((leg) => (
                    <div
                      key={leg.venue}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 9,
                        padding: '5px 8px',
                        borderRadius: 6,
                        background: 'rgba(15,23,42,0.5)',
                        border: '1px solid rgba(100,116,139,0.2)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span style={{ color: '#cbd5e1' }}>{leg.venue}</span>
                      <span style={{ color: leg.cumulativeCvdUsd >= 0 ? '#86efac' : '#fca5a5' }}>CVD {fmtUsdSigned(leg.cumulativeCvdUsd)}</span>
                      <span style={{ color: '#64748b' }}>n={leg.tradeCount}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div style={{ marginBottom: 10, fontSize: 10, color: '#64748b', padding: '8px 10px', borderRadius: 8, border: '1px dashed rgba(100,116,139,0.35)' }}>
          시장·CVD 패널: 분석 시 <strong style={{ color: '#94a3b8' }}>collect=1</strong>(거래소 수집)일 때만 채워집니다.
        </div>
      )}
      {srStats && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 8, background: 'rgba(15,23,42,0.5)' }}>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 6 }}>과거~현재 지지/저항 반응 통계</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="mini-card" style={{ padding: '8px 10px' }}>
              <div className="metric-label">지지 터치</div>
              <div className="mini-value c-long">{srStats.support.touches}회</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>평균 반등 {srStats.support.avgBouncePct}% · 최대 {srStats.support.maxBouncePct}%</div>
            </div>
            <div className="mini-card" style={{ padding: '8px 10px' }}>
              <div className="metric-label">저항 터치</div>
              <div className="mini-value c-short">{srStats.resistance.touches}회</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>평균 되돌림 {srStats.resistance.avgBouncePct}% · 최대 {srStats.resistance.maxBouncePct}%</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
            분석 캔들 {srStats.candles}개 · 레벨 {srStats.levelCount}개 기준
          </div>
        </div>
      )}
      {coreFeatureStats.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, background: 'rgba(34,197,94,0.06)' }}>
          <div style={{ fontSize: 10, color: '#86efac', marginBottom: 6 }}>보유중 핵심으로 볼 기능 우선순위</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {coreFeatureStats.map((f, i) => (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 44px', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: '#bbf7d0', fontWeight: 700 }}>#{i + 1}</div>
                <div>
                  <div style={{ fontSize: 11, color: '#dcfce7' }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: '#86efac' }}>
                    지지 {f.supportHits}회 · 지지성공 {f.supportRate}% · 지지확률 {f.confidence}%
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#dcfce7', textAlign: 'right', fontWeight: 700 }}>{f.coreScore}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!analysis.featureProbabilities?.length && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8, background: 'rgba(56,189,248,0.06)' }}>
          <div style={{ fontSize: 10, color: '#7dd3fc', marginBottom: 6 }}>캔들 기반 기능별 확률 통계</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {analysis.featureProbabilities.slice(0, 6).map((f) => (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#e2e8f0' }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>
                    상승 {f.riseProb}% · 하락 {f.fallProb}% · 지지 {f.supportProb}% · 저항 {f.resistanceProb}% · 샘플 {f.samples}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: f.directionBias === 'LONG' ? '#22C55E' : f.directionBias === 'SHORT' ? '#EF4444' : '#94a3b8' }}>
                  {f.directionBias === 'LONG' ? '롱우세' : f.directionBias === 'SHORT' ? '숏우세' : '중립'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div className="mini-card" style={{ padding: '8px 10px' }}>
          <div className="metric-label">롱 정확도</div>
          <div className="mini-value c-long">{acc.longCount ? `${acc.longWinRate}%` : '-'}</div>
        </div>
        <div className="mini-card" style={{ padding: '8px 10px' }}>
          <div className="metric-label">숏 정확도</div>
          <div className="mini-value c-short">{acc.shortCount ? `${acc.shortWinRate}%` : '-'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div className="mini-card" style={{ padding: '8px 10px' }}>
          <div className="metric-label">최근 12승률</div>
          <div className="mini-value" style={{ color: trend.recentWinRate >= 55 ? '#22C55E' : trend.recentWinRate >= 45 ? '#F59E0B' : '#EF4444' }}>
            {trend.recentWinRate}%
          </div>
        </div>
        <div className="mini-card" style={{ padding: '8px 10px' }}>
          <div className="metric-label">연속 성과</div>
          <div className="mini-value" style={{ color: trend.streakType === 'win' ? '#22C55E' : trend.streakType === 'loss' ? '#EF4444' : '#94a3b8' }}>
            {trend.streakType === 'none' ? '-' : `${trend.streakType === 'win' ? '승' : '패'} ${trend.streak}`}
          </div>
        </div>
        <div className="mini-card" style={{ padding: '8px 10px' }}>
          <div className="metric-label">잠금 상태</div>
          <div className="mini-value" style={{ color: activeBlacklists.length ? '#F59E0B' : '#22C55E' }}>
            {activeBlacklists.length ? `${activeBlacklists.length}개` : '정상'}
          </div>
        </div>
      </div>
      {learning.recentOutcomes.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>최근 정확도 (20)</div>
          <div style={{ display: 'flex', gap: 2, flexWrap: 'nowrap' }}>
            {learning.recentOutcomes.slice(0, 20).reverse().map((o, i) => (
              <span
                key={`${o.at}-${i}`}
                title={`${o.symbol} ${o.timeframe} ${o.direction} ${o.result}`}
                style={{
                  width: 10,
                  height: 6,
                  borderRadius: 2,
                  background: o.result === 'win' ? '#22C55E' : '#EF4444',
                  display: 'inline-block',
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>게이트 튜닝</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { applyGatePreset('aggressive'); setVersion(v => v + 1); }}
            style={{ fontSize: 11, padding: '4px 8px' }}
          >
            공격형
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { applyGatePreset('balanced'); setVersion(v => v + 1); }}
            style={{ fontSize: 11, padding: '4px 8px' }}
          >
            균형형
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { applyGatePreset('conservative'); setVersion(v => v + 1); }}
            style={{ fontSize: 11, padding: '4px 8px' }}
          >
            보수형
          </button>
        </div>
        <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          자동 적응 모드
          <input
            type="checkbox"
            checked={learning.gate.autoTune}
            onChange={(e) => { updateGateConfig({ autoTune: e.target.checked }); setVersion(v => v + 1); }}
          />
          <span style={{ color: learning.gate.autoTune ? '#22C55E' : '#94a3b8' }}>{learning.gate.autoTune ? '켜짐' : '꺼짐'}</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8 }}>
            최소 종합점수
            <input
              type="range"
              min={45}
              max={85}
              value={learning.gate.minOverall}
              onChange={(e) => { updateGateConfig({ minOverall: parseInt(e.target.value, 10) || 58 }); setVersion(v => v + 1); }}
              style={{ flex: 1, accentColor: '#62efe0' }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{learning.gate.minOverall}</span>
          </label>
          <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8 }}>
            최소 점수차
            <input
              type="range"
              min={4}
              max={25}
              value={learning.gate.minEdge}
              onChange={(e) => { updateGateConfig({ minEdge: parseInt(e.target.value, 10) || 8 }); setVersion(v => v + 1); }}
              style={{ flex: 1, accentColor: '#62efe0' }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{learning.gate.minEdge}</span>
          </label>
          <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8 }}>
            잠금해제 연승
            <input
              type="range"
              min={1}
              max={5}
              value={learning.gate.unlockWins}
              onChange={(e) => { updateGateConfig({ unlockWins: parseInt(e.target.value, 10) || 2 }); setVersion(v => v + 1); }}
              style={{ flex: 1, accentColor: '#62efe0' }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{learning.gate.unlockWins}</span>
          </label>
        </div>
      </div>
      {activeBlacklists.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, background: 'rgba(245,158,11,0.06)' }}>
          <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 6 }}>오판배제 잠금 목록</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {activeBlacklists.slice(0, 3).map((b) => {
              const remainMin = Math.max(1, Math.round(b.remainMs / 60000));
              const need = learning.gate.unlockWins;
              return (
                <div key={b.key} style={{ fontSize: 11, color: '#fde68a' }}>
                  {b.key.split('|').slice(0, 3).join(' / ')} · {remainMin}분 · 해제진행 {b.unlockProgress}/{need}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {explainTop.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(98,239,224,0.25)', borderRadius: 8, background: 'rgba(98,239,224,0.06)' }}>
          <div style={{ fontSize: 10, color: '#67e8f9', marginBottom: 6 }}>
            자동 근거 설명 상위 3 ({verdictLabelKo(effectiveDirection)})
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {explainTop.map((r) => (
              <div key={r.key} style={{ fontSize: 11, color: '#cffafe' }}>
                {r.label} 우위 +{Math.max(0, Math.round(r.gap))} (현재 {r.score})
              </div>
            ))}
          </div>
        </div>
      )}
      {ranking.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, background: 'rgba(34,197,94,0.06)' }}>
          <div style={{ fontSize: 10, color: '#86efac', marginBottom: 6 }}>성능 랭킹 상위 3</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {ranking.slice(0, 3).map((r, i) => {
              const [symbol, tf, direction] = r.key.split('|');
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setFocusDirection(direction === 'LONG' || direction === 'SHORT' ? direction : null);
                    onSelectRankingTimeframe?.(tf);
                  }}
                  style={{
                    fontSize: 11,
                    color: '#dcfce7',
                    textAlign: 'left',
                    background: 'transparent',
                    border: '1px solid rgba(220,252,231,0.2)',
                    borderRadius: 6,
                    padding: '4px 6px',
                    cursor: 'pointer',
                  }}
                  title="클릭하면 해당 TF로 이동"
                >
                  #{i + 1} {symbol} / {tf} / {verdictLabelKo(direction)} · 승률 {r.winRate}% (승{r.wins} 패{r.losses})
                </button>
              );
            })}
          </div>
        </div>
      )}
      {zoneVolatilityRanking.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 8, background: 'rgba(96,165,250,0.06)' }}>
          <div style={{ fontSize: 10, color: '#93c5fd', marginBottom: 6 }}>지지/저항 이후 변동성 기능 랭킹</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {zoneVolatilityRanking.map((r, i) => (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 42px', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#bfdbfe', fontWeight: 700 }}>#{i + 1}</div>
                <div>
                  <div style={{ fontSize: 11, color: '#dbeafe' }}>{r.label}</div>
                  <div style={{ fontSize: 10, color: '#93c5fd' }}>{r.detail}</div>
                </div>
                <div style={{ fontSize: 11, color: '#dbeafe', textAlign: 'right', fontWeight: 700 }}>{r.score}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <svg viewBox="0 0 260 260" width="100%" height="260" aria-label="통합 트레이드 레이더 차트" style={{ overflow: 'visible' }}>
          <defs>
            <filter id={radarGlowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id={`${radarGlowId}-fill`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.28" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <circle
              key={s}
              cx={cx}
              cy={cy}
              r={radius * s}
              fill="none"
              stroke="rgba(148,163,184,0.28)"
              strokeWidth="1"
            />
          ))}
          {rows.map((r, i) => {
            const a = angleAt(i);
            const x2 = cx + Math.cos(a) * radius;
            const y2 = cy + Math.sin(a) * radius;
            const lx = cx + Math.cos(a) * (radius + 16);
            const ly = cy + Math.sin(a) * (radius + 16);
            return (
              <g key={r.key}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={x2}
                  y2={y2}
                  stroke={highlightKeys.has(r.key) ? 'rgba(98,239,224,0.75)' : 'rgba(148,163,184,0.35)'}
                  strokeWidth={highlightKeys.has(r.key) ? '2' : '1'}
                />
                <text
                  x={lx}
                  y={ly}
                  fill={highlightKeys.has(r.key) ? '#67e8f9' : '#cbd5e1'}
                  fontSize={highlightKeys.has(r.key) ? '11' : '10'}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {r.label}
                </text>
              </g>
            );
          })}
          <polygon
            points={polyPoints}
            fill={`url(#${radarGlowId}-fill)`}
            stroke={color}
            strokeWidth="2.5"
            filter={`url(#${radarGlowId})`}
            style={{ opacity: 0.95 }}
          />
          {rows.map((r, i) => {
            const p = pt(r.score, i);
            return <circle key={`${r.key}-dot`} cx={p.x} cy={p.y} r="3" fill={color} />;
          })}
        </svg>
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 40px', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: highlightKeys.has(r.key) ? '#67e8f9' : 'var(--muted)', fontWeight: highlightKeys.has(r.key) ? 700 : 500 }}>{r.label}</div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.22)', overflow: 'hidden' }}>
                <div style={{ width: `${r.score}%`, height: '100%', background: r.score >= 70 ? '#22C55E' : r.score >= 55 ? '#F59E0B' : '#EF4444' }} />
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'right' }}>{r.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
