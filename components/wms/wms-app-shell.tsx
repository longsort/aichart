'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/wms/cn';
import { Menu, X } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/items', label: '품목마스터' },
  { href: '/inventory', label: 'LOT·Heat 재고' },
  { href: '/stock/in', label: '입고관리' },
  { href: '/stock/out', label: '출고관리' },
  { href: '/process', label: '毛皮 반제품 가공' },
  { href: '/quality', label: '검사·MTC' },
  { href: '/safety', label: '안전재고 경고' },
  { href: '/moves', label: '재고이동 이력' },
  { href: '/settings', label: '설정·기초코드' },
] as const;

/** 좌측 사이드바 + 모바일 햄버거 */
export function WmsAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div id="wms-root" className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-56 border-r border-slate-200 bg-white shadow-lg transition-transform lg:static lg:translate-x-0 lg:shadow-none',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-slate-100 px-3 lg:h-14">
            <Link href="/dashboard" className="text-sm font-bold tracking-tight text-slate-900" onClick={() => setOpen(false)}>
              플랜지 재고 WMS
            </Link>
            <button
              type="button"
              className="rounded p-1 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="메뉴 닫기"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5 p-2">
            {NAV.map((n) => {
              const active = pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs font-medium sm:text-sm',
                    active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
            <Link
              href="/trading"
              className="mt-4 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 sm:text-sm"
              onClick={() => setOpen(false)}
            >
              ← 기존 차트 분석
            </Link>
          </nav>
        </aside>
        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="배경 닫기"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
          <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur lg:h-14 lg:px-4">
            <button
              type="button"
              className="rounded p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="메뉴"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-sm font-semibold text-slate-800 sm:text-base">스테인리스 플랜지·밸브 재고관리</h1>
          </header>
          <main className="flex-1 space-y-3 p-3 sm:space-y-4 sm:p-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
