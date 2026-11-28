'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * 긴급/주의/정상 요약 카드 — 클릭 시 해당 밴드의 압력등급별 SKU 구성 새 창.
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
      title={title || '새 창에서 압력등급별 구성'}
      onClick={onClick}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
