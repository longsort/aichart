import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 압력등급·카탈로그 칩 — 같은 페이지에서 쿼리 필터만 적용 (새 창/탭 없음).
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
  return (
    <Link href={href} className={className} title={title || '해당 압력으로 필터'}>
      {children}
    </Link>
  );
}
