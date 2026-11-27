import { cn } from '@/lib/utils/cn';
import type { InventoryLotStatus } from '@prisma/client';
import { lotStatusLabel } from '@/lib/wms/labels';

const styles: Record<InventoryLotStatus, string> = {
  NORMAL: 'bg-emerald-950/60 text-emerald-200 border-emerald-800/50',
  WAIT_INSPECTION: 'bg-amber-950/60 text-amber-200 border-amber-700/50',
  PROCESSING: 'bg-sky-950/50 text-sky-200 border-sky-700/50',
  DEFECT: 'bg-red-950/60 text-red-200 border-red-800/50',
  SHIPPED: 'bg-slate-800 text-slate-300 border-slate-600',
  HOLD: 'bg-orange-950/50 text-orange-200 border-orange-800/50',
};

export function LotStatusBadge({ status, className }: { status: InventoryLotStatus; className?: string }) {
  return (
    <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium', styles[status], className)}>
      {lotStatusLabel(status)}
    </span>
  );
}
