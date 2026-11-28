import assert from 'node:assert/strict';
import { normalizeIp, isTrustedLoginIp } from '@/lib/auth/client-ip';

assert.equal(normalizeIp('::ffff:203.0.113.10'), '203.0.113.10');
assert.equal(normalizeIp('::1'), '127.0.0.1');

process.env.LOGIN_TRUSTED_IPS = '203.0.113.10,10.0.0.0/8';
assert.equal(isTrustedLoginIp('127.0.0.1'), true);
assert.equal(isTrustedLoginIp('203.0.113.10'), true);
assert.equal(isTrustedLoginIp('10.1.2.3'), true);
assert.equal(isTrustedLoginIp('198.51.100.1'), false);

console.log('client-ip.test.ts ok');
