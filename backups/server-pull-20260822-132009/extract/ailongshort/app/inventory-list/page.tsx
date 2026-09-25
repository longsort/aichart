import { redirect } from 'next/navigation';

/** 구 로컬 재고 UI는 DB 기반 `/inventory` 로 통합 */
export default function LegacyInventoryListRedirect() {
  redirect('/inventory');
}
