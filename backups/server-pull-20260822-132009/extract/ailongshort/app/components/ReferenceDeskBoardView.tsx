'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { UIMode, UserSettings } from '@/lib/settings';
import { loadSettings, saveSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import {
  auditRowToReferenceDeskLayer,
  buildReferenceDeskLwcOverlayPack,
  readReferenceDeskLayerFlags,
  referenceDeskAllLayersPatch,
  referenceDeskLayerPatch,
  type ReferenceDeskLwcLayer,
} from '@/lib/referenceDeskLwcLayers';
import UIModeSwitcher from './UIModeSwitcher';
import ReferenceDeskLwcHud from './ReferenceDeskLwcHud';
import styles from './ReferenceDeskBoard.module.css';
import { buildReferenceDeskLwcHudStats } from '@/lib/referenceDeskLwcProfile';
import { buildCandleTradeAtlas } from '@/lib/candleTradeAtlas';
import { buildCandleTradeAtlasOverlays } from '@/lib/candleTradeAtlasOverlays';
import {
  REFERENCE_DESK_AILONGSHORT_COMPARE,
  REFERENCE_DESK_CHART_LIBRARIES,
  REFERENCE_DESK_DISCLAIMER,
  REFERENCE_DESK_OSS_PROJECTS,
  ailongshortCompareLabel,
  assetFocusLabel,
  categoryLabel,
} from '@/lib/referenceDeskBenchmarkLibrary';
import {
  REFERENCE_DESK_PRESETS,
  REFERENCE_DESK_ROADMAP,
  buildReferenceDeskValidationReport,
  computeReferenceDeskAudits,
  computeReferenceDeskScorecard,
  getPresetById,
  liveStatusLabel,
  ossNamesForPreset,
  roadmapStatusLabel,
  type BacktestSnapshot,
  type PatternStatsSnapshot,
  type ReferenceDeskPanelTab,
  type ReferenceDeskPreset,
} from '@/lib/referenceDeskEngine';

type BoardTab = 'dashboard' | 'presets' | 'audit' | 'chart' | 'reference';

type Props = {
  uiMode: UIMode;
  onUiModeChange: (mode: UIMode) => void;
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  analysis: AnalyzeResponse | null;
  loading: boolean;
  patternStats: PatternStatsSnapshot;
  backtest: BacktestSnapshot;
  settings: Pick<UserSettings, 'telegramConfirmEnabled' | 'virtualTradeEnabled'>;
  onApplyPreset: (preset: ReferenceDeskPreset) => void;
  onOpenPanelTab: (tab: ReferenceDeskPanelTab) => void;
  onShowLayerOnChart?: (layer: ReferenceDeskLwcLayer) => void;
  onRequestLoad: () => void;
  focusChartNonce?: number;
  chartSlot?: () => ReactNode;
};

export default function ReferenceDeskBoardView({
  uiMode,
  onUiModeChange,
  symbol,
  timeframe,
  theme,
  analysis,
  loading,
  patternStats,
  backtest,
  settings,
  onApplyPreset,
  onOpenPanelTab,
  onShowLayerOnChart,
  onRequestLoad,
  focusChartNonce = 0,
  chartSlot,
}: Props) {
  const [tab, setTab] = useState<BoardTab>('chart');
  const [refSection, setRefSection] = useState<'oss' | 'charts' | 'table'>('oss');
  const [appliedId, setAppliedId] = useState<string | null>('lwc-pure');
  const [rsiOn, setRsiOn] = useState(() => loadSettings().showRsiPanel !== false);
  const [volumeMaOn, setVolumeMaOn] = useState(() => (loadSettings().chartVolumeMaPeriod ?? 0) >= 2);
  const [volumeIntelOn, setVolumeIntelOn] = useState(() => loadSettings().chartVolumeIntelligence !== false);
  const [layerFlags, setLayerFlags] = useState(() => readReferenceDeskLayerFlags(loadSettings()));
  const [assetsDrawingGuideOn, setAssetsDrawingGuideOn] = useState(
    () => loadSettings().chartReferenceDeskAssetsDrawingGuide !== false
  );

  useEffect(() => {
    if (focusChartNonce > 0) setTab('chart');
  }, [focusChartNonce]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const s = loadSettings();
      setRsiOn(s.showRsiPanel !== false);
      setVolumeMaOn((s.chartVolumeMaPeriod ?? 0) >= 2);
      setVolumeIntelOn(s.chartVolumeIntelligence !== false);
      setLayerFlags(readReferenceDeskLayerFlags(s));
      setAssetsDrawingGuideOn(s.chartReferenceDeskAssetsDrawingGuide !== false);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, sync);
  }, []);

  const audits = useMemo(
    () =>
      computeReferenceDeskAudits({
        analysis,
        symbol,
        patternStats,
        backtest,
        settings,
      }),
    [analysis, symbol, patternStats, backtest, settings]
  );

  const scorecard = useMemo(() => computeReferenceDeskScorecard(audits), [audits]);
  const validation = useMemo(
    () =>
      buildReferenceDeskValidationReport({
        analysis,
        symbol,
        timeframe,
        patternStats,
        backtest,
      }),
    [analysis, symbol, timeframe, patternStats, backtest]
  );

  const recommendedPresets = REFERENCE_DESK_PRESETS.filter((p) => p.recommended);

  const atlasOverlayCount = useMemo(() => {
    const c = analysis?.candles;
    if (!analysis || !Array.isArray(c) || c.length < 5) return 0;
    const atlas = buildCandleTradeAtlas(analysis, c, timeframe);
    const atlasN = buildCandleTradeAtlasOverlays(atlas, c).length;
    const pool = (analysis.overlays ?? []) as import('@/types').OverlayItem[];
    const layerN = buildReferenceDeskLwcOverlayPack({
      pool,
      analysis,
      candles: c,
      timeframe,
      flags: layerFlags,
      mtfSignals: [],
    }).length;
    return atlasN + layerN;
  }, [analysis, timeframe, layerFlags]);

  const lwcHudStats = useMemo(
    () =>
      buildReferenceDeskLwcHudStats({
        candleCount: analysis?.candles?.length ?? 0,
        overlayCount: atlasOverlayCount,
        structureOn: layerFlags.structure,
        zonesOn: layerFlags.zones,
        patternsOn: layerFlags.patterns,
        mtfOn: layerFlags.mtf,
        assetsDrawingGuideOn,
        volumeMaOn,
        volumeIntelOn,
        rsiOn,
        symbol,
        timeframe,
      }),
    [analysis?.candles?.length, atlasOverlayCount, layerFlags, assetsDrawingGuideOn, volumeMaOn, volumeIntelOn, rsiOn, symbol, timeframe]
  );

  const toggleLayer = (layer: ReferenceDeskLwcLayer) => {
    const key =
      layer === 'structure'
        ? 'structure'
        : layer === 'zones'
          ? 'zones'
          : layer === 'patterns'
            ? 'patterns'
            : 'mtf';
    const nextOn = !layerFlags[key];
    saveSettings(referenceDeskLayerPatch(layer, nextOn));
    setLayerFlags((prev) => ({ ...prev, [key]: nextOn }));
  };

  const showLayerOnChart = (layer: ReferenceDeskLwcLayer) => {
    saveSettings(referenceDeskLayerPatch(layer, true));
    setLayerFlags((prev) => ({ ...prev, [layer]: true }));
    setTab('chart');
    onShowLayerOnChart?.(layer);
  };

  const handleToggleRsi = () => {
    const next = !rsiOn;
    setRsiOn(next);
    saveSettings({ showRsiPanel: next });
  };

  const handleToggleVolumeMa = () => {
    const next = !volumeMaOn;
    setVolumeMaOn(next);
    saveSettings({ chartVolumeMaPeriod: next ? 20 : 0 });
  };

  const handleToggleVolumeIntel = () => {
    const next = !volumeIntelOn;
    setVolumeIntelOn(next);
    saveSettings({ chartVolumeIntelligence: next });
  };

  const handleToggleAssetsDrawingGuide = () => {
    const next = !assetsDrawingGuideOn;
    setAssetsDrawingGuideOn(next);
    saveSettings({ chartReferenceDeskAssetsDrawingGuide: next });
  };

  const handleApplyAllLayers = () => {
    saveSettings({
      ...referenceDeskAllLayersPatch(true),
      chartReferenceDeskAssetsDrawingGuide: true,
    });
    setLayerFlags({ structure: true, zones: true, patterns: true, mtf: true });
    setAssetsDrawingGuideOn(true);
    setTab('chart');
  };

  const handleApply = (preset: ReferenceDeskPreset) => {
    setAppliedId(preset.id);
    if (preset.focusChart) setTab('chart');
    onApplyPreset(preset);
  };

  const handleRoadmapAction = (item: (typeof REFERENCE_DESK_ROADMAP)[number]) => {
    if (item.presetId) {
      const p = getPresetById(item.presetId);
      if (p) handleApply(p);
      return;
    }
    if (item.panelTab) onOpenPanelTab(item.panelTab);
    if (item.targetMode && item.targetMode !== 'REFERENCE_DESK') onUiModeChange(item.targetMode);
  };

  return (
    <div className={styles.board} data-theme={theme}>
      <div className={styles.boardHeader}>
        <div>
          <div className={styles.boardTitle}>벤치마크 · 설계 데스크</div>
          <div className={styles.boardSub}>
            {symbol} · {timeframe} — LWC 순수 차트가 기본 · 프리셋·검증은 보조 탭
          </div>
        </div>
        <UIModeSwitcher uiMode={uiMode} setUiMode={onUiModeChange} />
      </div>

      <div className={styles.toolbar}>
        {(
          [
            ...(typeof chartSlot === 'function' ? [['chart', 'LWC 차트']] as const : []),
            ['dashboard', '대시보드'],
            ['presets', '프리셋'],
            ['audit', '실시간 검증'],
            ['reference', '레퍼런스'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tool-chip tool-chip-button ${tab === id ? 'tool-chip-active' : ''}`}
            onClick={() => setTab(id as BoardTab)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={onRequestLoad}
          disabled={loading}
          title="현재 심볼·TF 분석 다시 로드"
        >
          {loading ? '로딩…' : '재검증'}
        </button>
      </div>

      {tab === 'dashboard' && (
        <>
          <div className={styles.heroRow}>
            <div className={styles.scoreRing} data-level={scorecard.coveragePct >= 70 ? 'ok' : 'warn'}>
              <div className={styles.scorePct}>{scorecard.coveragePct}%</div>
              <div className={styles.scoreLabel}>커버리지</div>
            </div>
            <div className={styles.heroText}>
              <div className={styles.heroHeadline}>{scorecard.headline}</div>
              <div className={styles.heroSub}>{scorecard.lwcChoice}</div>
              <div className={styles.summaryStats}>
                <span className={styles.statChip}>실측 OK {scorecard.liveOk}</span>
                <span className={styles.statChip}>부분 {scorecard.livePartial}</span>
                <span className={styles.statChip}>강점 {scorecard.staticUnique}</span>
              </div>
            </div>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>LWC 차트 레이어 — 구조 → 존 → 패턴 → MTF</div>
            <div className={styles.toolbar}>
              {(
                [
                  ['structure', '구조'],
                  ['zones', '존'],
                  ['patterns', '패턴'],
                  ['mtf', 'MTF'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`tool-chip tool-chip-button ${layerFlags[id] ? 'tool-chip-active' : ''}`}
                  onClick={() => toggleLayer(id)}
                >
                  {label} {layerFlags[id] ? 'ON' : 'OFF'}
                </button>
              ))}
              <button type="button" className="tool-chip tool-chip-button tool-chip-active" onClick={handleApplyAllLayers}>
                전부 LWC에 표시
              </button>
              <button type="button" className="tool-chip tool-chip-button" onClick={() => setTab('chart')}>
                LWC 차트 →
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>검증 리포트 (Freqtrade·Backtrader 갭 → 앱 내 구현)</div>
            <div className={styles.reportGrid}>
              <div className={styles.reportLine}>{validation.mtfLine}</div>
              <div className={styles.reportLine}>{validation.scenarioLine}</div>
              <div className={styles.reportLine}>{validation.backtestLine}</div>
              <div className={styles.reportLine}>{validation.patternLine}</div>
            </div>
            {!validation.dataFresh && (
              <div className={styles.hint}>분석 캔들이 아직 적습니다. 「재검증」 또는 아래 프리셋 적용 후 확인하세요.</div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>추천 — 한 번 클릭으로 모드·패널까지</div>
            <div className={styles.presetGrid}>
              {recommendedPresets.map((p) => (
                <article key={p.id} className={styles.presetCard}>
                  <div className={styles.presetHead}>
                    <div className={styles.cardTitle}>{p.label}</div>
                    <span className={styles.badge}>{ossNamesForPreset(p)}</span>
                  </div>
                  <p className={styles.cardSummary}>{p.subtitle}</p>
                  <ul className={styles.list}>
                    {p.whatYouGet.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${appliedId === p.id ? 'tool-chip-active' : ''}`}
                    onClick={() => handleApply(p)}
                  >
                    적용 → {p.targetMode === 'REFERENCE_DESK' ? '벤치마크 유지' : p.label}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>갭 로드맵 (벤치마크에서 뽑은 보완 — 상태·바로가기)</div>
            <div className={styles.roadmapList}>
              {REFERENCE_DESK_ROADMAP.map((item) => (
                <div key={item.id} className={styles.roadmapRow}>
                  <div>
                    <div className={styles.roadmapTitle}>{item.title}</div>
                    <div className={styles.cardMeta}>{item.gap}</div>
                  </div>
                  <span className={`${styles.badge} ${styles[`roadmap_${item.status}`]}`}>
                    {roadmapStatusLabel(item.status)}
                  </span>
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    onClick={() => handleRoadmapAction(item)}
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === 'presets' && (
        <div className={styles.presetGrid}>
          {REFERENCE_DESK_PRESETS.map((p) => (
            <article key={p.id} className={styles.presetCard}>
              <div className={styles.presetHead}>
                <div>
                  <div className={styles.cardTitle}>{p.label}</div>
                  <div className={styles.cardMeta}>→ {p.targetMode}{p.panelTab ? ` · ${p.panelTab} 탭` : ''}</div>
                </div>
              </div>
              <p className={styles.cardSummary}>{p.subtitle}</p>
              <div className={styles.cardMeta}>참고 OSS: {ossNamesForPreset(p)}</div>
              <ul className={styles.list}>
                {p.whatYouGet.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <button
                type="button"
                className="tool-chip tool-chip-button tool-chip-active"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => handleApply(p)}
              >
                이 구성 적용
              </button>
            </article>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <>
          <div className={styles.disclaimer}>
            정적(벤치마크 표) 40% + 현재 {symbol} 실데이터 60% — 고정 승률·확정 수익 아님.
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>기능</th>
                  <th>벤치마크</th>
                  <th>실측</th>
                  <th>점수</th>
                  <th>상세</th>
                  <th>LWC</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => {
                  const layer = auditRowToReferenceDeskLayer(a.rowId);
                  return (
                  <tr key={a.rowId}>
                    <td>{a.area}</td>
                    <td>{ailongshortCompareLabel(a.staticLevel)}</td>
                    <td>
                      <span
                        className={
                          a.liveStatus === 'ok'
                            ? styles.statusYes
                            : a.liveStatus === 'partial'
                              ? styles.statusPartial
                              : a.liveStatus === 'missing'
                                ? styles.statusNo
                                : styles.statusNo
                        }
                      >
                        {liveStatusLabel(a.liveStatus)}
                      </span>
                    </td>
                    <td>{a.scorePct}%</td>
                    <td>{a.liveDetail}</td>
                    <td>
                      {layer ? (
                        <button
                          type="button"
                          className="tool-chip tool-chip-button"
                          onClick={() => showLayerOnChart(layer)}
                        >
                          표시
                        </button>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'chart' && typeof chartSlot === 'function' && (
        <div className={styles.chartSlot}>
          <ReferenceDeskLwcHud
            stats={lwcHudStats}
            onToggleStructure={() => toggleLayer('structure')}
            onToggleZones={() => toggleLayer('zones')}
            onTogglePatterns={() => toggleLayer('patterns')}
            onToggleMtf={() => toggleLayer('mtf')}
            onToggleAssetsDrawingGuide={handleToggleAssetsDrawingGuide}
            onToggleRsi={handleToggleRsi}
            onToggleVolumeMa={handleToggleVolumeMa}
            onToggleVolumeIntel={handleToggleVolumeIntel}
            theme={theme}
          />
          {chartSlot()}
        </div>
      )}

      {tab === 'reference' && (
        <>
          <div className={styles.disclaimer}>{REFERENCE_DESK_DISCLAIMER}</div>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${refSection === 'oss' ? 'tool-chip-active' : ''}`}
              onClick={() => setRefSection('oss')}
            >
              GitHub OSS
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${refSection === 'charts' ? 'tool-chip-active' : ''}`}
              onClick={() => setRefSection('charts')}
            >
              차트 라이브러리
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${refSection === 'table' ? 'tool-chip-active' : ''}`}
              onClick={() => setRefSection('table')}
            >
              정적 비교표
            </button>
          </div>

          {refSection === 'oss' && (
            <div className={styles.grid}>
              {REFERENCE_DESK_OSS_PROJECTS.map((p) => (
                <article key={p.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <div>
                      <div className={styles.cardTitle}>{p.name}</div>
                      <div className={styles.cardMeta}>{p.repo} · ★ {p.starsHint}</div>
                    </div>
                    <div className={styles.badgeRow}>
                      <span className={styles.badge}>{categoryLabel(p.category)}</span>
                      <span className={styles.badge}>{assetFocusLabel(p.assetFocus)}</span>
                    </div>
                  </div>
                  <p className={styles.cardSummary}>{p.summaryKo}</p>
                  <a className={styles.repoLink} href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.url}
                  </a>
                </article>
              ))}
            </div>
          )}

          {refSection === 'charts' && (
            <div className={styles.grid}>
              {REFERENCE_DESK_CHART_LIBRARIES.map((lib) => (
                <article key={lib.id} className={styles.card}>
                  <div className={styles.cardTitle}>{lib.name}</div>
                  <p className={styles.cardSummary}>{lib.notesKo}</p>
                  <a className={styles.repoLink} href={lib.url} target="_blank" rel="noopener noreferrer">
                    {lib.url}
                  </a>
                </article>
              ))}
            </div>
          )}

          {refSection === 'table' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>영역</th>
                    <th>업계</th>
                    <th>ailongshort</th>
                    <th>보완</th>
                  </tr>
                </thead>
                <tbody>
                  {REFERENCE_DESK_AILONGSHORT_COMPARE.map((row) => (
                    <tr key={row.id}>
                      <td>{row.area}</td>
                      <td>{row.industryCommon}</td>
                      <td>{ailongshortCompareLabel(row.ailongshort)}</td>
                      <td>{row.gapOrNext ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
