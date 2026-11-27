import type { ReactNode } from 'react';
import './wms-tailwind.css';
import { WmsSidebar } from '@/components/wms/wms-sidebar';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

/** WMS는 DB·세션 기준 동적 렌더 (빌드 시 Prisma 정적 프리렌더 생략) */
export const dynamic = 'force-dynamic';

/** 재고관리(WMS) 구역 — Tailwind는 이 레이아웃·components/wms 만 스코프 */
export default function WmsLayout({ children }: { children: ReactNode }) {
  requireInventoryAuth();
  return (
    <div className="wms-root min-h-screen bg-slate-950 text-slate-100 antialiased">
      <div className="flex min-h-screen">
        <WmsSidebar />
        <main className="min-w-0 flex-1 overflow-x-auto p-3 pt-14 sm:p-4 lg:pt-4">{children}</main>
      </div>
    </div>
  );
}
