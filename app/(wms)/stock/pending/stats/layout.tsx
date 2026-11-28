import type { ReactNode } from 'react';

/** 압력 통계 팝업 창 — 여백만 좁게 (사이드바는 WmsSidebar에서 숨김) */
export default function PendingStatsPopupLayout({ children }: { children: ReactNode }) {
  return <div className="-mt-10 min-h-[100dvh] sm:mt-0 lg:mt-0">{children}</div>;
}
