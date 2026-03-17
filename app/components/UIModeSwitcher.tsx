'use client';

type UIMode = 'FULL' | 'FOCUS' | 'EXECUTION';

export type { UIMode };

export default function UIModeSwitcher({
  uiMode,
  setUiMode,
  className = '',
  style,
}: {
  uiMode: UIMode;
  setUiMode: (mode: UIMode) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const modes: { value: UIMode; label: string; title: string }[] = [
    { value: 'FULL', label: '전체', title: '분석용 · OB, FVG, BOS, CHOCH, Zone 등 모두 표시' },
    { value: 'FOCUS', label: '포커스', title: 'BUY/SELL ZONE 중심 · 매매 판단용' },
    { value: 'EXECUTION', label: '실행', title: '진입·손절·목표만 표시' },
  ];

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>모드</span>
      {modes.map(({ value, label, title }) => (
        <button
          key={value}
          type="button"
          title={title}
          className={`tool-chip tool-chip-button ${uiMode === value ? 'tool-chip-active' : ''}`}
          onClick={() => setUiMode(value)}
          style={{ padding: '6px 10px', fontSize: 12 }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
