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
          <div style={{ fontSize: 13, fontWeight: 800, color: '#bfdbfe' }}>차트조절 · 폭락구간</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
            폭락구간 zone 가격·좌중우 · 글자 · 존색 — 차트와 같은 설정
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
          active={settings.chartMergedDeskMtfDumpZoneEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskMtfDumpZoneEnabled: settings.chartMergedDeskMtfDumpZoneEnabled === false,
            })
          }
          title="폭락구간 MTF zone — 차트 폭락MTF 칩과 연동"
          style={{
            fontWeight: 800,
            borderColor:
              settings.chartMergedDeskMtfDumpZoneEnabled !== false
                ? 'rgba(248,113,113,0.65)'
                : undefined,
            color:
              settings.chartMergedDeskMtfDumpZoneEnabled !== false ? '#fecaca' : undefined,
          }}
        >
          폭락구간
        </Chip>
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
          title="파랑빨강띠 · 파란·빨간 평행채널"
        >
          파랑빨강띠
        </Chip>
        <Chip
          active={settings.chartMergedDeskParallelChannelEngineEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskParallelChannelEngineEnabled:
                settings.chartMergedDeskParallelChannelEngineEnabled === false,
            })
          }
          title="평행채널 · 마감 피벗에 고정 · 형성봉에는 안 움직임 · 새 스윙이나 점수 차이가 커질 때만 교체 · 진입 아님"
        >
          평행채널
        </Chip>
        <Chip
          active={settings.chartMergedDeskWavePathEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskWavePathEnabled: settings.chartMergedDeskWavePathEnabled === false,
            })
          }
          title="파동경로 · 충격/조정 템플릿 매칭 · 다음 이동 점선"
        >
          파동경로
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
          active={settings.chartMergedDeskAnchoredVwapEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskAnchoredVwapEnabled: settings.chartMergedDeskAnchoredVwapEnabled === false,
            })
          }
          title="주/일 절대고·저 앵커 · 둘 다 고가+시가 · 분·시봉 공용"
        >
          AVWAP
        </Chip>
        <Chip
          active={settings.chartMergedDeskAnchoredVwapHtf === '1w'}
          onClick={() =>
            apply({
              chartMergedDeskAnchoredVwapHtf:
                settings.chartMergedDeskAnchoredVwapHtf === '1w' ? '1d' : '1w',
            })
          }
          title="앵커 상위 TF: 일봉 ↔ 주봉"
        >
          {settings.chartMergedDeskAnchoredVwapHtf === '1w' ? 'AVWAP주' : 'AVWAP일'}
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
        <Chip
          active={settings.chartMergedDeskZonePriceOnlyLabels === true}
          onClick={() =>
            apply({
              chartMergedDeskZonePriceOnlyLabels:
                settings.chartMergedDeskZonePriceOnlyLabels !== true,
            })
          }
          title="폭락구간 면 이름 숨김 · 상·하 테두리 가격 숫자만"
        >
          폭락숫자만
        </Chip>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#fde68a', marginBottom: 6 }}>
        폭락구간 가격라벨 — 존 맨 우측 위·아래 모서리 (기본 우)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {(
          [
            { p: 0, t: '좌' },
            { p: 50, t: '중' },
            { p: 100, t: '우' },
          ] as const
        ).map((x) => (
          <Chip
            key={x.p}
            active={Math.round(Number(settings.chartMergedDeskDumpLabelPosPct) || 0) === x.p}
            onClick={() => apply({ chartMergedDeskDumpLabelPosPct: x.p })}
          >
            {x.t}
          </Chip>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>위치</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.max(0, Math.min(100, Number(settings.chartMergedDeskDumpLabelPosPct) || 0))}
          onChange={(e) =>
            apply({ chartMergedDeskDumpLabelPosPct: parseInt(e.target.value, 10) || 0 })
          }
          style={{ flex: 1, maxWidth: 220, accentColor: '#60a5fa' }}
          title="0=좌 · 50=중 · 100=우 — 존 너비 % (농도처럼 조절)"
        />
        <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
          {Math.max(0, Math.min(100, Number(settings.chartMergedDeskDumpLabelPosPct) || 0))}
        </span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#fde68a', marginBottom: 6 }}>
        폭락존 색·라벨 — TF(분·시·일·주·달) 문구 유지 · 면색·테두리·크기 조절
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <Chip
          active={settings.chartMergedDeskDumpZoneColorMode !== 'auto'}
          onClick={() =>
            apply({
              chartMergedDeskDumpZoneColorMode:
                settings.chartMergedDeskDumpZoneColorMode === 'auto' ? 'custom' : 'auto',
            })
          }
          title="OFF=엔진 자동색 · ON=사용자 면·테두리"
        >
          {settings.chartMergedDeskDumpZoneColorMode === 'auto' ? '색자동' : '색고정'}
        </Chip>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
          면
          <input
            type="color"
            disabled={settings.chartMergedDeskDumpZoneColorMode === 'auto'}
            value={
              /^#[0-9a-fA-F]{6}$/.test(String(settings.chartMergedDeskDumpZoneFillColor || ''))
                ? String(settings.chartMergedDeskDumpZoneFillColor)
                : '#38bdf8'
            }
            onChange={(e) =>
              apply({
                chartMergedDeskDumpZoneFillColor: e.target.value,
                chartMergedDeskDumpZoneColorMode: 'custom',
              })
            }
            style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'transparent' }}
          />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
          테두리
          <input
            type="color"
            disabled={settings.chartMergedDeskDumpZoneColorMode === 'auto'}
            value={
              /^#[0-9a-fA-F]{6}$/.test(String(settings.chartMergedDeskDumpZoneBorderColor || ''))
                ? String(settings.chartMergedDeskDumpZoneBorderColor)
                : '#38bdf8'
            }
            onChange={(e) =>
              apply({
                chartMergedDeskDumpZoneBorderColor: e.target.value,
                chartMergedDeskDumpZoneColorMode: 'custom',
              })
            }
            style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'transparent' }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>면라벨</span>
        <input
          type="range"
          min={7}
          max={18}
          value={Math.max(
            7,
            Math.min(18, Number(settings.chartMergedDeskDumpFaceLabelFontSize) || 9)
          )}
          onChange={(e) =>
            apply({
              chartMergedDeskDumpFaceLabelFontSize: parseInt(e.target.value, 10) || 9,
            })
          }
          style={{ flex: 1, maxWidth: 160, accentColor: '#38bdf8' }}
          title="TF 면 라벨 글자 크기"
        />
        <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
          {Math.max(7, Math.min(18, Number(settings.chartMergedDeskDumpFaceLabelFontSize) || 9))}px
        </span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#fde68a', marginBottom: 6 }}>
        폭락 상·하 가격숫자 — 크기·색
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>크기</span>
        <input
          type="range"
          min={7}
          max={18}
          value={Math.max(
            7,
            Math.min(18, Number(settings.chartMergedDeskDumpEdgePriceFontSize) || 8)
          )}
          onChange={(e) =>
            apply({
              chartMergedDeskDumpEdgePriceFontSize: parseInt(e.target.value, 10) || 8,
            })
          }
          style={{ flex: 1, maxWidth: 180, accentColor: '#facc15' }}
          title="상·하 테두리 가격 글자 크기"
        />
        <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
          {Math.max(7, Math.min(18, Number(settings.chartMergedDeskDumpEdgePriceFontSize) || 8))}px
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
          색
          <input
            type="color"
            value={
              /^#[0-9a-fA-F]{6}$/.test(String(settings.chartMergedDeskDumpEdgePriceColor || ''))
                ? String(settings.chartMergedDeskDumpEdgePriceColor)
                : '#fef08a'
            }
            onChange={(e) => apply({ chartMergedDeskDumpEdgePriceColor: e.target.value })}
            title="상·하 테두리 가격 색"
            style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'transparent' }}
          />
        </label>
        <Chip
          onClick={() =>
            apply({
              chartMergedDeskDumpEdgePriceFontSize: defaultSettings.chartMergedDeskDumpEdgePriceFontSize,
              chartMergedDeskDumpEdgePriceColor: defaultSettings.chartMergedDeskDumpEdgePriceColor,
              chartMergedDeskDumpFaceLabelFontSize: defaultSettings.chartMergedDeskDumpFaceLabelFontSize,
              chartMergedDeskDumpZoneFillColor: defaultSettings.chartMergedDeskDumpZoneFillColor,
              chartMergedDeskDumpZoneBorderColor: defaultSettings.chartMergedDeskDumpZoneBorderColor,
              chartMergedDeskDumpZoneColorMode: defaultSettings.chartMergedDeskDumpZoneColorMode,
            })
          }
        >
          기본
        </Chip>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>
        2) 글자 크기 (존·폭락·전체 라벨)
      </div>
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
        3) 글자 위치 · 좌우 이동 (존 라벨)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#86efac', whiteSpace: 'nowrap' }}>모든라벨 좌우</span>
        <input
          type="range"
          min={-160}
          max={160}
          step={4}
          value={Math.max(-160, Math.min(160, Number(settings.chartMergedDeskGlobalLabelShiftX) || 0))}
          onChange={(e) => apply({ chartMergedDeskGlobalLabelShiftX: parseInt(e.target.value, 10) || 0 })}
          style={{ flex: 1, maxWidth: 220, accentColor: '#4ade80' }}
          title="차트 전체 라벨 일괄 좌우"
        />
        <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>
          {(Number(settings.chartMergedDeskGlobalLabelShiftX) || 0) > 0 ? '+' : ''}
          {Number(settings.chartMergedDeskGlobalLabelShiftX) || 0}px
        </span>
        <Chip onClick={() => apply({ chartMergedDeskGlobalLabelShiftX: 0 })}>리셋</Chip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <Chip
          active={settings.chartMergedDeskOverlayLabelsEnabled !== false && !settings.chartBulkHideLabels}
          onClick={() =>
            apply({ chartMergedDeskOverlayLabelsEnabled: true, chartBulkHideLabels: false })
          }
        >
          모든라벨 ON
        </Chip>
        <Chip
          active={settings.chartBulkHideLabels === true}
          onClick={() =>
            apply({ chartMergedDeskOverlayLabelsEnabled: false, chartBulkHideLabels: true })
          }
        >
          모든라벨 OFF
        </Chip>
        <Chip
          active={settings.chartMergedDeskThisMuchEnabled !== false}
          onClick={() =>
            apply({
              chartMergedDeskThisMuchEnabled: settings.chartMergedDeskThisMuchEnabled === false,
            })
          }
          title="시안A 네온마젠타 · 터치+요만큼+이만큼 세트 · TF별"
        >
          요이만
        </Chip>
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
