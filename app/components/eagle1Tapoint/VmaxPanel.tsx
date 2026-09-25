'use client';

import type { ReactNode } from 'react';
import type { VmaxPanelMode } from '@/lib/eagle1Tapoint/vmaxPanelPrefs';

export default function VmaxPanel({
  title,
  mode,
  onCycle,
  children,
  className = '',
  /** true면 접어도 children 유지(차트 블랙/리셋 방지) */
  keepMounted = false,
}: {
  title: string;
  mode: VmaxPanelMode;
  onCycle: () => void;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
}) {
  if (mode === 'off') return null;
  const folded = mode === 'fold';
  return (
    <section className={`vmax-panel ${folded ? 'is-fold' : ''} ${className}`.trim()}>
      <header className="vmax-panel-h">
        <h3>{title}</h3>
        <button
          type="button"
          className="vmax-panel-tog"
          onClick={onCycle}
          title={folded ? '펴기' : '접기 · OFF는 패널설정'}
        >
          {folded ? '펴기' : '접기'}
        </button>
      </header>
      {keepMounted ? (
        <div
          className="vmax-panel-b"
          style={folded ? { display: 'none' } : undefined}
          aria-hidden={folded}
        >
          {children}
        </div>
      ) : !folded ? (
        <div className="vmax-panel-b">{children}</div>
      ) : null}
    </section>
  );
}
