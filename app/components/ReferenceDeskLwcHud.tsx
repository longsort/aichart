'use client';

import styles from './ReferenceDeskBoard.module.css';
import { REFERENCE_DESK_LWC_PROFILE } from '@/lib/referenceDeskLwcProfile';
import type { ReferenceDeskLwcHudStats } from '@/lib/referenceDeskLwcProfile';

type Props = {
  stats: ReferenceDeskLwcHudStats;
  onToggleRsi: () => void;
  onToggleVolumeMa: () => void;
  onToggleVolumeIntel: () => void;
  onToggleStructure: () => void;
  onToggleZones: () => void;
  onTogglePatterns: () => void;
  onToggleMtf: () => void;
  onToggleAssetsDrawingGuide: () => void;
  theme: 'dark' | 'light';
};

export default function ReferenceDeskLwcHud({
  stats,
  onToggleRsi,
  onToggleVolumeMa,
  onToggleVolumeIntel,
  onToggleStructure,
  onToggleZones,
  onTogglePatterns,
  onToggleMtf,
  onToggleAssetsDrawingGuide,
  theme,
}: Props) {
  return (
    <div className={styles.lwcHud} data-theme={theme}>
      <div className={styles.lwcHudHead}>
        <div>
          <div className={styles.lwcHudTitle}>{REFERENCE_DESK_LWC_PROFILE.title}</div>
          <div className={styles.lwcHudSub}>
            {stats.symbol} · {stats.timeframe} — {REFERENCE_DESK_LWC_PROFILE.subtitle}
          </div>
        </div>
        <div className={styles.lwcHudToggles}>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.structureOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleStructure}
            title="BOS/CHoCH·키레벨·S/R"
          >
            구조 {stats.structureOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.zonesOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleZones}
            title="FVG·OB·반응·major S/R 존"
          >
            존 {stats.zonesOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.patternsOn ? 'tool-chip-active' : ''}`}
            onClick={onTogglePatterns}
            title="하모닉·patternVision"
          >
            패턴 {stats.patternsOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.mtfOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleMtf}
            title="MTF 보드·multiTF 캔들 마커"
          >
            MTF {stats.mtfOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.assetsDrawingGuideOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleAssetsDrawingGuide}
            title="assets/CHART_OVERLAY_KEYS — EQL 점선·BPR·OB 완화·PRZ 색"
          >
            작도 {stats.assetsDrawingGuideOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.volumeIntelOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleVolumeIntel}
            title="볼륨 RVOL·색상 강조"
          >
            RVOL {stats.volumeIntelOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.volumeMaOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleVolumeMa}
            title="볼륨 이동평균선 (LWC LineSeries)"
          >
            Vol MA {stats.volumeMaOn ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${stats.rsiOn ? 'tool-chip-active' : ''}`}
            onClick={onToggleRsi}
          >
            RSI {stats.rsiOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div className={styles.lwcHudStats}>
        <span className={styles.lwcStat}>캔들 {stats.candleCount}</span>
        <span className={styles.lwcStat}>Atlas {stats.overlayCount}개</span>
        <span className={styles.lwcStat}>
          레이어 {[
            stats.structureOn && '구조',
            stats.zonesOn && '존',
            stats.patternsOn && '패턴',
            stats.mtfOn && 'MTF',
          ]
            .filter(Boolean)
            .join('·') || '–'}
        </span>
        <span className={styles.lwcStat}>볼륨 {stats.volumeOn ? 'ON' : '–'}</span>
      </div>
      <div className={styles.lwcHudFoot}>
        <span>{REFERENCE_DESK_LWC_PROFILE.layersOn.join(' · ')}</span>
        <a
          href={REFERENCE_DESK_LWC_PROFILE.attributionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.repoLink}
        >
          {REFERENCE_DESK_LWC_PROFILE.attribution}
        </a>
      </div>
    </div>
  );
}
