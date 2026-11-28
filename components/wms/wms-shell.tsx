import type { ReactNode } from 'react';

export function WmsPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4 border-b border-slate-700 pb-3">
      <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
    </header>
  );
}

export function WmsCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-700 bg-slate-900/60 p-4 shadow-sm shadow-black/20 ${className ?? ''}`}>
      {title ? (
        <h2 className="mb-3 border-b border-slate-700/80 pb-2 text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
