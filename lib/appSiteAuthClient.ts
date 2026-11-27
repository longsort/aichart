/**
 * 브라우저용 역할·경로 헬퍼 (서버 비밀·해시 로직 없음).
 * lib/appSiteAuth.ts 와 같은 규칙.
 */

export type ClientAppRole = 'master_admin' | 'charts' | 'inventory' | 'both' | 'user';

export function normalizeAppRoleClient(role: string | undefined | null): Exclude<ClientAppRole, 'user'> {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'master_admin') return 'master_admin';
  if (r === 'inventory') return 'inventory';
  if (r === 'both') return 'both';
  if (r === 'charts' || r === 'user') return 'charts';
  return 'charts';
}

export function homePathForRole(role: string | undefined | null): string {
  const r = normalizeAppRoleClient(role);
  if (r === 'inventory') return '/dashboard';
  return '/';
}

export function canAccessChartsClient(role: string | undefined | null): boolean {
  const r = normalizeAppRoleClient(role);
  return r === 'charts' || r === 'both' || r === 'master_admin';
}

export function canAccessInventoryClient(role: string | undefined | null): boolean {
  const r = normalizeAppRoleClient(role);
  return r === 'inventory' || r === 'both' || r === 'master_admin';
}
