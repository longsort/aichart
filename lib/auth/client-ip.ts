import type { NextRequest } from 'next/server';

/** 프록시/다이렉트 접속 IP 추출 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = 'headers' in req ? req.headers : new Headers();
  const xf = String(headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim();
  if (xf) return normalizeIp(xf);
  const real = String(headers.get('x-real-ip') || '').trim();
  if (real) return normalizeIp(real);
  const cf = String(headers.get('cf-connecting-ip') || '').trim();
  if (cf) return normalizeIp(cf);
  return '0.0.0.0';
}

export function normalizeIp(raw: string): string {
  let ip = String(raw || '').trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

/** LOGIN_TRUSTED_IPS=1.2.3.4,10.0.0.0/8 — CIDR 간단 지원(IPv4) + exact */
export function isTrustedLoginIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  const builtins = new Set(['127.0.0.1', '::1', '0.0.0.0', 'localhost']);
  if (builtins.has(normalized)) return true;

  const raw = (process.env.LOGIN_TRUSTED_IPS || '').trim();
  if (!raw) return false;
  const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (p.includes('/')) {
      if (ipv4InCidr(normalized, p)) return true;
      continue;
    }
    if (normalizeIp(p) === normalized) return true;
  }
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(normalizeIp(ip));
  const baseN = ipv4ToInt(normalizeIp(base));
  if (ipN == null || baseN == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}
