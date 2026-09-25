'use client';

import type { UIMode } from '@/lib/settings';
import { FUSION_MODE_UI_HIDDEN } from '@/lib/uiModeFusionToggle';

export type { UIMode };

export default function UIModeSwitcher({
  uiMode,
  setUiMode,
  className = '',
  style,
  compact = false,
}: {
  uiMode: UIMode;
  setUiMode: (mode: UIMode) => void;
  className?: string;
  style?: React.CSSProperties;
  /** 좁은 화면: 글자·패딩 축소 */
  compact?: boolean;
}) {
  const modes = ([
    {
      value: 'AI_ZONE',
      label: 'AI분석',
      title:
        'AI 분석 모드: 합성(최강)과 동일한 엔진·수집 범위에 고래 툴킷(핫존·핵심 S/R·DRS·LQB)을 맞추고, AI 브리핑·롱/숏 존·무효·시나리오를 앞에 둡니다. DRS/LQB는 고래와 동일 whaleClean 프리셋.',
    },
    {
      value: 'WHALE',
      label: '고래',
      title:
        '고래(깔끔): 구조·존·CP·호가 HotZone·핵심 S/R·DRS·LQB·정밀만 기본 — DRS=로즈/틴, LQB=보라/시안으로 겹침 감소. Hyper·비전·PO3 등은 끔. 필요 시 ⚙에서 켜기',
    },
    {
      value: 'UNIFIED_DESK',
      label: '합성',
      title:
        '기존 실행/스마트/최강/SMC/캔들/핫존/타점 계열을 합성 흐름으로 묶은 모드. 차트·패널은 통합 신호 중심으로 운영.',
    },
    {
      value: 'MERGED_ANALYSIS_DESK',
      label: '통합·분석',
      title:
        'ARES/TV식 통합: 차트 캔들분석(존·아이콘·구조·밴드·로켓) + 카드분석(롱/숏·고래·VRVP·타임라인) 한 화면. 참고용.',
    },
    {
      value: 'MONTH_START_DESK',
      label: '마감·안착',
      title:
        '확정 롱·숏(진한 테두리) / 후보(점선) / 편향·대기(노랑). 5요소 게이트+마감 안착 정합 시 확정. E·SL·TP 선. 참고용.',
    },
    {
      value: 'ZONE_LINE_PRO',
      label: '존·라인',
      title:
        '개선 차트: LinReg 추세선 + CP 밴드 채널 + HotZone + Strike E/SL/TP + 안착캔들(1·돌파 2·안착 3·확인). 카드 없이 zone·line 중심. 참고용.',
    },
    {
      value: 'REFERENCE_DESK',
      label: '벤치마크',
      title:
        '업계 OSS 기준 프리셋·실시간 검증·갭 로드맵·LWC 차트. 「적용」만 누르면 모드·패널 자동 연결.',
    },
    {
      value: 'FUSION_MODE',
      label: '융합모드',
      title:
        '캔들 흐름(드리프트·변동)과 실행 브리핑(verdict·confidence)을 한 카드로 합성해 즉시 판단하는 모드.',
    },
  ] as { value: UIMode; label: string; title: string }[]).filter(
    (m) => !FUSION_MODE_UI_HIDDEN || m.value !== 'FUSION_MODE'
  );

  const fs = compact ? 10 : 12;
  const pad = compact ? '4px 6px' : '6px 10px';
  const labelFs = compact ? 9 : 11;
  return (
    <div
      className={['ui-mode-rail', className].filter(Boolean).join(' ')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 3 : 4,
        flexWrap: compact ? 'nowrap' : 'wrap',
        ...style,
      }}
    >
      <span style={{ fontSize: labelFs, color: '#94a3b8', marginRight: compact ? 4 : 6, flexShrink: 0 }}>모드</span>
      {modes.map(({ value, label, title }) => (
        <button
          key={value}
          type="button"
          title={title}
          className={`tool-chip tool-chip-button ${uiMode === value ? 'tool-chip-active' : ''}`}
          onClick={() => setUiMode(value)}
          style={{ padding: pad, fontSize: fs, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
