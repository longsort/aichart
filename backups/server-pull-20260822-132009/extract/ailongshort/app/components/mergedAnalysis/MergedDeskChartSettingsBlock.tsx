'use client';

/**
 * 통합·분석 차트설정 — 표시 항목·글자·위치·존색 한곳에 모아 조절.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { UserSettings } from '@/lib/settings';
import { defaultSettings } from '@/lib/settings';
import { resetMergedDeskChartDisplayAll } from '@/lib/mergedDeskChartDisplaySettings';

type LabelAlign = 'left' | 'center' | 'right';
type PricePos = 'left' | 'center' | 'right';

type Props = {
  settings: UserSettings;
  apply: (s: Partial<UserSettings>) => void;
  zoneLabelPosition: PricePos;
  setZoneLabelPosition: (p: PricePos) => void;
  zoneLabelHShift: number;
  setZoneLabelHShift: (n: number) => void;
  onFullResetDone?: () => void;
};

function Chip(props: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`tool-chip tool-chip-button ${props.active ? 'tool-chip-active' : ''}`}
      onClick={props.onClick}
      title={props.title}
      style={{ padding: '5px 10px', fontSize: 11, ...props.style }}
    >
      {props.children}
    </button>
  );
}

export function MergedDeskChartSettingsBlock({
  settings,
  apply,
  zoneLabelPosition,
  setZoneLabelPosition,
  zoneLabelHShift,
  setZoneLabelHShift,
  onFullResetDone,
}: Props) {
  const alignDefault: LabelAlign =
    settings.chartMergedDeskLabelAlignDefault === 'left' ||
    settings.chartMergedDeskLabelAlignDefault === 'center'
      ? settings.chartMergedDeskLabelAlignDefault
      : 'right';

  const fontSize = Math.max(8, Math.min(22, Number(settings.overlayLabelFontSize) || 11));

  const onFullReset = () => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        '통합모드 차트 설정을 전부 초기화할까요?\n글자·위치·좌우·존색·표시 항목이 기본값으로 돌아갑니다.'
      );
    if (!ok) return;
    resetMergedDeskChartDisplayAll();
    onFullResetDone?.();
  };

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 12px 10px',
        borderRadius: 10,
        border: '1px solid rgba(96,165,250,0.35)',
        background: 'linear-gradient(180deg, rgba(30,58,138,0.28), rgba(15,23,42,0.92))',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#bfdbfe' }}>통합모드 차트 조절</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
            넣을 항목 · 글자 크기 · 위치 · 좌우 · 존 색상을 여기서 전부 맞춥니다.
          </div>
        </div>
        <Chip
          onClick={onFullReset}
          title="글자·위치·존색·표시 항목 전부 기본값"
          style={{ fontWeight: 800, borderColor: 'rgba(248,113,113,0.55)', color: '#fecaca' }}
        >
          전부 초기화
        </Chip>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>1) 넣을 항목 (ON/OFF)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <Chip
          active={settings.chartMergedInstitutionalBandEnabled !== false}
          onClick={() =>
            apply({
              chartMergedInstitutionalBandEnabled: settings.chartMergedInstitutionalBandEnabled === false,
            })
          }
        >
          기관밴드
        </Chip>
        <Chip
          active={settings.chartMonthDeskFusionDeskBandEnabled !== false}
          onClick={() =>
            apply({
              chartMonthDeskFusionDeskBandEnabled: settings.chartMonthDeskFusionDeskBandEnabled === false,
            })
          }
        >
          연합밴드
        </Chip>
        <Chip
          active={settings.chartMergedDeskBlueRedChannelsEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskBlueRedChannelsEnabled: settings.chartMergedDeskBlueRedChannelsEnabled === false,
            })
          }
          title="파란·빨간 평행채널 띠"
        >
          파란빨간채널
        </Chip>
        <Chip
          active={settings.chartMergedDeskSwingDrawEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskSwingDrawEnabled: settings.chartMergedDeskSwingDrawEnabled === false,
            })
          }
        >
          스윙작도
        </Chip>
        <Chip
          active={settings.chartMergedDeskSuperAiEnabled !== false}
          onClick={() =>
            apply({ chartMergedDeskSuperAiEnabled: settings.chartMergedDeskSuperAiEnabled === false })
          }
          title="SMC 작도 레이어"
        >
          SMC작도
        </Chip>
        <Chip
          active={settings.chartMergedDeskUnifiedCloudEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskUnifiedCloudEnabled: settings.chartMergedDeskUnifiedCloudEnabled === false,
            })
          }
        >
          통합구름
        </Chip>
        <Chip
          active={settings.chartMergedDeskBtccionDrawEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskBtccionDrawEnabled: settings.chartMergedDeskBtccionDrawEnabled === false,
            })
          }
        >
          btccion
        </Chip>
        <Chip
          active={settings.chartMergedDeskZoneBattleHudEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskZoneBattleHudEnabled: settings.chartMergedDeskZoneBattleHudEnabled === false,
            })
          }
        >
          ZoneAI
        </Chip>
        <Chip
          active={settings.chartMonthDeskBitgetCandles !== false}
          onClick={() =>
            apply({ chartMonthDeskBitgetCandles: settings.chartMonthDeskBitgetCandles === false })
          }
        >
          Bitget Vol
        </Chip>
        <Chip
          active={!settings.chartBulkHideLabels}
          onClick={() => apply({ chartBulkHideLabels: !settings.chartBulkHideLabels })}
        >
          라벨표시
        </Chip>
        <Chip
          active={!settings.chartBulkHideZones}
          onClick={() => apply({ chartBulkHideZones: !settings.chartBulkHideZones })}
        >
          존표시
        </Chip>
        <Chip
          active={!settings.chartBulkHideHLines}
          onClick={() => apply({ chartBulkHideHLines: !settings.chartBulkHideHLines })}
        >
          가로선표시
        </Chip>
        <Chip
          active={settings.chartMirageZoneFaceLang === 'en'}
          onClick={() =>
            apply({
              chartMirageZoneFaceLang: settings.chartMirageZoneFaceLang === 'en' ? 'ko' : 'en',
            })
          }
        >
          EN라벨
        </Chip>
        <Chip
          active={settings.chartMirageZoneFaceCompact !== false}
          onClick={() =>
            apply({ chartMirageZoneFaceCompact: settings.chartMirageZoneFaceCompact === false })
          }
        >
          짧은라벨
        </Chip>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>2) 글자 크기</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input
          type="range"
          min={8}
          max={22}
          value={fontSize}
          onChange={(e) => apply({ overlayLabelFontSize: parseInt(e.target.value, 10) || 11 })}
          style={{ flex: 1, maxWidth: 220, accentColor: '#60a5fa' }}
        />
        <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
          {fontSize}px
        </span>
        <Chip onClick={() => apply({ overlayLabelFontSize: defaultSettings.overlayLabelFontSize })}>기본</Chip>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>
        3) 글자 위치 · 좌우 이동
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>기본 정렬</span>
        {(['left', 'center', 'right'] as LabelAlign[]).map((a) => (
          <Chip
            key={a}
            active={alignDefault === a}
            onClick={() => apply({ chartMergedDeskLabelAlignDefault: a })}
          >
            {a === 'left' ? '좌' : a === 'center' ? '중' : '우'}
          </Chip>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>존 라벨</span>
        {(['left', 'center', 'right'] as PricePos[]).map((p) => (
          <Chip key={p} active={zoneLabelPosition === p} onClick={() => setZoneLabelPosition(p)}>
            {p === 'left' ? '좌' : p === 'center' ? '중' : '우'}
          </Chip>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>좌우 미세</span>
        <input
          type="range"
          min={-200}
          max={200}
          value={zoneLabelHShift}
          onChange={(e) => setZoneLabelHShift(parseInt(e.target.value, 10) || 0)}
          style={{ flex: 1, maxWidth: 220, accentColor: '#fbbf24' }}
        />
        <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>
          {zoneLabelHShift > 0 ? `+${zoneLabelHShift}` : zoneLabelHShift}px
        </span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>4) Zone 색상</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {(
          [
            ['공급·숏', 'zoneFillSupplyHex', defaultSettings.zoneFillSupplyHex],
            ['수요·롱', 'zoneFillDemandHex', defaultSettings.zoneFillDemandHex],
            ['중립·진입', 'zoneFillNeutralHex', defaultSettings.zoneFillNeutralHex],
            ['경고·목표', 'zoneFillWarningHex', defaultSettings.zoneFillWarningHex],
          ] as const
        ).map(([label, key, def]) => (
          <label
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1' }}
          >
            <span style={{ minWidth: 58 }}>{label}</span>
            <input
              type="color"
              value={String(settings[key] || def)}
              onChange={(e) => apply({ [key]: e.target.value.toUpperCase() } as Partial<UserSettings>)}
              style={{
                width: 32,
                height: 26,
                padding: 0,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ padding: '2px 6px', fontSize: 10 }}
              onClick={() => apply({ [key]: def } as Partial<UserSettings>)}
            >
              기본
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
