'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse } from '@/types';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES } from '@/lib/unifiedSignalPanelProfile';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  analysis: AnalyzeResponse;
  theme?: 'dark' | 'light';
};

export default function MergedAnalysisBriefingStrip({ analysis, theme = 'dark' }: Props) {
  const ls = useMemo(() => {
    const profile = buildProfileFromPanelFeatures(DEFAULT_UNIFIED_PANEL_FEATURES, {
      showRsiIndicators: true,
      showMacdPanel: true,
      showBbPanel: false,
    });
    return buildUnifiedLsSignal(analysis, profile);
  }, [analysis]);

  const mix = Math.max(1, ls.longDisplay + ls.shortDisplay);
  const longPct = Math.round((ls.longDisplay / mix) * 100);
  const shortPct = 100 - longPct;

  return (
    <div className={styles.briefingStrip} data-theme={theme}>
      <div className={styles.briefingHead}>AI 합성 · {ls.grade ? `등급 ${ls.grade}` : '분석'}</div>
      <div className={styles.gaugeBar}>
        <div className={styles.gaugeLong} style={{ width: `${longPct}%` }} />
        <div className={styles.gaugeShort} style={{ width: `${shortPct}%` }} />
      </div>
      <div className={styles.gaugePct}>
        <span style={{ color: '#22c55e' }}>L {longPct}%</span>
        <span style={{ color: '#ef4444' }}>S {shortPct}%</span>
      </div>
      <div className={styles.briefingVerdict}>{analysis.verdict ?? 'WAIT'} · conf {analysis.confidence ?? 0}%</div>
    </div>
  );
}
