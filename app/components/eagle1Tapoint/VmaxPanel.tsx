'use client';

import type { ReactNode } from 'react';
import type { VmaxPanelMode } from '@/lib/eagle1Tapoint/vmaxPanelPrefs';

export default function VmaxPanel({
  title,
  mode,
  onCycle,
  children,
  className = '',
}: {
  title: string;
  mode: VmaxPanelMode;
  onCycle: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (mode === 'off') return null;
  const folded = mode === 'fold';
  return (
    <section className={`vmax-panel ${folded ? 'is-fold' : ''} ${className}`.trim()}>
      <header className="vmax-panel-h">
        <h3>{title}</h3>
        <button type="button" className="vmax-panel-tog" onClick={onCycle} title="열기→접기→OFF">
          {folded ? '펴기' : '접기'}
        </button>
      </header>
      {!folded ? <div className="vmax-panel-b">{children}</div> : null}
    </section>
  );
}
