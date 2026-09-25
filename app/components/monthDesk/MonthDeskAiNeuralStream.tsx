'use client';

import { useMemo } from 'react';

export default function MonthDeskAiNeuralStream({
  lines,
  accent = '#22d3ee',
}: {
  lines: string[];
  accent?: string;
}) {
  const text = useMemo(() => {
    const merged = lines.filter(Boolean);
    if (!merged.length) return 'AI · 시장 구조 스캔 중…';
    return merged.join('  ◆  ');
  }, [lines]);

  return (
    <div className="md-neural-stream" style={{ ['--md-stream-accent' as string]: accent }}>
      <span className="md-neural-stream__tag">NEURAL</span>
      <div className="md-neural-stream__viewport">
        <div className="md-neural-stream__track">
          <span>{text}</span>
          <span aria-hidden>{text}</span>
        </div>
      </div>
    </div>
  );
}
