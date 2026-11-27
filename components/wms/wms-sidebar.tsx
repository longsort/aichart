'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cog,
  ClipboardCheck,
  History,
  Settings,
  Menu,
  X,
  AlertTriangle,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/items', label: '품목마스터', icon: Package },
  { href: '/inventory', label: 'LOT·Heat 재고', icon: Boxes },
  { href: '/stock/in', label: '입고관리', icon: ArrowDownToLine },
  { href: '/stock/out', label: '출고관리', icon: ArrowUpFromLine },
  { href: '/process', label: '毛皮 가공', icon: Cog },
  { href: '/quality', label: '검사·MTC', icon: ClipboardCheck },
  { href: '/safety', label: '안전재고 경고', icon: AlertTriangle },
  { href: '/moves', label: '재고이동 이력', icon: History },
  { href: '/settings', label: '설정·기초코드', icon: Settings },
] as const;

export function WmsSidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded border border-slate-600 bg-slate-900 text-slate-200 lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="메뉴"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[55] w-52 border-r border-slate-700 bg-slate-950 px-2 py-3 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="mb-4 px-2 pt-10 lg:pt-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">WMS</div>
          <div className="text-sm font-semibold text-slate-100">스테인리스·毛皮 재고</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== '/dashboard' && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-2 text-xs font-medium',
                  active ? 'bg-slate-800 text-teal-300' : 'text-slate-300 hover:bg-slate-900'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 border-t border-slate-800 px-2 pt-3 space-y-1">
          <Link href="/" className="block text-xs text-slate-400 hover:text-slate-200">
            ← 차트(독수리1호)로
          </Link>
          <Link href="/login" className="block text-xs text-slate-500 hover:text-slate-300">
            로그인 전환
          </Link>
        </div>
      </aside>
      {open ? <div className="fixed inset-0 z-[50] bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
    </>
  );
}
