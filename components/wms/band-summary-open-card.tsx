'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * 긴급/주의/정상 요약 카드 — 클릭 시 해당 밴드 SKU 목록(품명/사이즈/보유) 새 창.
 */
export function BandSummaryOpenCard({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    <a
      href={href}
      className={className}
      title={title || '새 창에서 품명·사이즈·보유 SKU'}
      onClick={onClick}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
