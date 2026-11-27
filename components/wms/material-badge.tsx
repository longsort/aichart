import { cn } from '@/lib/utils/cn';
import type { MaterialType } from '@prisma/client';

const styles: Record<MaterialType, string> = {
  SCS304: 'bg-sky-900/80 text-sky-100 border border-sky-600/60',
  SCS316: 'bg-violet-900/80 text-violet-100 border border-violet-500/50',
  SEMI_RAW: 'bg-amber-900/70 text-amber-100 border border-amber-500/50',
};

const labels: Record<MaterialType, string> = {
  SCS304: '304',
  SCS316: '316',
  SEMI_RAW: '毛皮',
};

/** 재질 배지 — 304 파랑 / 316 보라 / 毛皮 주황 */
export function MaterialBadge({ type, className }: { type: MaterialType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold', styles[type], className)}>
      {labels[type]}
    </span>
  );
}
