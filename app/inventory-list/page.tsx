import { redirect } from 'next/navigation';

/** 구 로컬 재고 UI → DB 재고현황(/dashboard) */
export default function LegacyInventoryListRedirect() {
  redirect('/dashboard');
}
