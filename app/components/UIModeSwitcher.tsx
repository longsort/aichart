'use client';

import type { UIMode } from '@/lib/settings';

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
  const modes: { value: UIMode; label: string; title: string }[] = [
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
  ];

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
