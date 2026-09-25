'use client';

import type { VolumeAiZoneScreenGeom } from '@/lib/volumeAiZoneEngine';

type Props = {
  zones: VolumeAiZoneScreenGeom[];
  volPanelTop: number;
  volPanelBot: number;
  selectedZoneId?: string | null;
  onZoneClick?: (zoneId: string) => void;
};

/**
 * 거래량 패널 작도만 — 별도 칩/레일 없음.
 * 구간 = 밑줄 + 탭 히트영역 (글자는 LWC 볼륨 마커·캔들 테두리가 담당)
 */
export function VolumeAiZoneDrawLayer({
  zones,
  volPanelTop,
  volPanelBot,
  selectedZoneId,
  onZoneClick,
}: Props) {
  const clusters = zones.filter((z) => z.layer === 'cluster');
  if (!clusters.length) return null;

  const panelH = Math.max(16, volPanelBot - volPanelTop - 2);

  return (
    <div className="volume-ai-labels-root" aria-hidden={false}>
      <div
        className="volume-regime-panel volume-regime-panel--interactive volume-regime-panel--clean"
        style={{ top: volPanelTop, height: panelH, bottom: 'auto' }}
      >
        <svg className="volume-regime-panel__svg volume-regime-panel__svg--clean" width="100%" height="100%" aria-hidden>
          {clusters.map((z) => {
            const w = Math.max(6, z.x2 - z.x1);
            const selected = selectedZoneId === z.id;
            const accent = z.verdictColor ?? z.color;
            return (
              <g
                key={z.id}
                className={`volume-seg-box volume-seg-box--${z.kind}${selected ? ' volume-seg-box--selected' : ''}`}
              >
                <rect
                  className="volume-seg-box__hit"
                  x={z.x1 - 1}
                  y={0}
                  width={w + 2}
                  height={panelH}
                  fill={selected ? `${accent}22` : 'transparent'}
                  stroke="transparent"
                  onClick={() => onZoneClick?.(z.id)}
                />
                <line
                  x1={z.x1}
                  y1={panelH - 1.5}
                  x2={z.x2}
                  y2={panelH - 1.5}
                  stroke={accent}
                  strokeWidth={selected ? 3 : 2}
                  strokeLinecap="round"
                  opacity={selected ? 1 : 0.85}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
