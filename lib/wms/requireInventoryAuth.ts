import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  APP_SITE_COOKIE,
  verifySiteAuthToken,
  canAccessInventory,
  canAccessCharts,
} from '@/lib/appSiteAuth';

/** WMS 페이지 서버 가드 — 재고 역할 없으면 로그인/차트로 */
export function requireInventoryAuth() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    redirect('/login');
  }
  if (!canAccessInventory(auth.role)) {
    if (canAccessCharts(auth.role)) redirect('/');
    redirect('/login');
  }
  return auth;
}
