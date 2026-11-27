'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * 압력등급·카탈로그 칩 — 클릭 시 필터된 재고현황을 새 창/탭으로 연다.
 * (사이즈·부족만 등은 페이지 내 Link 유지)
 */
export function PressureOpenChip({
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
      title={title ? `${title} · 새 창` : '새 창에서 해당 압력 재고'}
      onClick={onClick}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
