import * as React from 'react';
import { cn } from '@/lib/wms/cn';
import type { MaterialType } from '@prisma/client';

const styles: Record<MaterialType, string> = {
  SCS304: 'bg-sky-100 text-sky-900 border-sky-200',
  SCS316: 'bg-violet-100 text-violet-900 border-violet-200',
  SEMI_RAW: 'bg-orange-100 text-orange-900 border-orange-200',
};

/** 재질별 색상 배지 */
export function MaterialBadge({ type, label }: { type: MaterialType; label?: string }) {
  const text =
    label ?? (type === 'SEMI_RAW' ? '毛皮 반제품' : type === 'SCS304' ? 'SCS304' : 'SCS316');
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight',
        styles[type],
      )}
    >
      {text}
    </span>
  );
}

export function StatusBadge({
  variant,
  children,
}: {
  variant: 'ok' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}) {
  const v =
    variant === 'ok'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
      : variant === 'warn'
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : variant === 'bad'
          ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium', v)}>
      {children}
    </span>
  );
}
