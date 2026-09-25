import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  readExchangeKeysMeta,
  readExchangeKeysPlain,
  updateExchangeKeysTest,
  writeExchangeKeys,
  writeExchangeKeysWithIntegrity,
} from '@/lib/serverExchangeKeysStore';
import { bitgetTestCredentials } from '@/lib/bitgetPrivateTrade';
import { getLiveLockStatus, getRunMode } from '@/lib/bitgetLiveInstanceLock';
import { BITGET_API_AUDIT } from '@/lib/doksuri1/bitgetApiAudit';
import {
  classifyBitgetHttpCode,
  sanitizeBitgetCredsInput,
} from '@/lib/bitgetCredentialIntegrity';

export const dynamic = 'force-dynamic';

function authUser() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  return verifySiteAuthToken(token);
}

/**
 * Bitget 연결 프로브 — 주문 없음.
 * 새 입력이면: sanitize → 저장·복호화 무결성 → Private.
 * 저장분 재테스트: decrypt 세트만 사용 (HMAC 로직 미수정).
 */
export async function POST(req: NextRequest) {
  const auth = authUser();
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hasFresh =
    Boolean(String(body.apiKey || '').trim()) &&
    Boolean(String(body.apiSecret || '').trim()) &&
    Boolean(String(body.passphrase || '').trim());

  let integrityOk = true;
  let sanitize: ReturnType<typeof sanitizeBitgetCredsInput> | null = null;
  let roundtrip: ReturnType<typeof writeExchangeKeysWithIntegrity>['roundtrip'] | null = null;
  let creds = readExchangeKeysPlain(auth.user);
  let apiKeyMasked = readExchangeKeysMeta(auth.user)?.apiKeyMasked || null;
  let credentialId = readExchangeKeysMeta(auth.user)?.credentialId || null;

  if (hasFresh) {
    const pack = writeExchangeKeysWithIntegrity(auth.user, {
      apiKey: String(body.apiKey || ''),
      apiSecret: String(body.apiSecret || ''),
      passphrase: String(body.passphrase || ''),
    });
    sanitize = pack.sanitize;
    roundtrip = pack.roundtrip;
    integrityOk = pack.roundtrip.ok;
    creds = pack.decrypted;
    apiKeyMasked = pack.meta.apiKeyMasked;
    credentialId = pack.meta.credentialId;

    if (!integrityOk || !creds) {
      updateExchangeKeysTest(auth.user, {
        ok: false,
        msg: `Credential decrypt FAIL · ${pack.roundtrip.issuesKo.join(' · ')}`,
      });
      return NextResponse.json({
        ok: false,
        integrityOk: false,
        title: 'Bitget Credential Integrity',
        msg: 'Credential decrypt FAIL · Bitget 호출 스킵',
        failClass: 'AUTH_INVALID_API_KEY',
        sanitize: {
          fieldIssues: pack.sanitize.fieldIssues,
          apiKeyMasked: pack.sanitize.apiKeyMasked,
          apiKeyLength: pack.sanitize.apiKeyLength,
          secretKeyLength: pack.sanitize.secretKeyLength,
          passphraseLength: pack.sanitize.passphraseLength,
        },
        roundtrip: pack.roundtrip,
        credential: { apiKeyMasked, credentialId },
        steps: [],
        runMode: getRunMode(),
        liveLock: getLiveLockStatus(),
      });
    }
  } else if (!creds) {
    return NextResponse.json({ ok: false, error: 'API Key / Secret / Passphrase 필요' }, { status: 400 });
  }

  const test = await bitgetTestCredentials(creds!);
  updateExchangeKeysTest(auth.user, { ok: test.ok, msg: test.msg });

  if (test.ok && test.passphraseMode) {
    const plain = readExchangeKeysPlain(auth.user);
    if (plain) {
      writeExchangeKeys(
        auth.user,
        { ...plain, passphraseMode: test.passphraseMode },
        { ok: true, msg: test.msg }
      );
    }
  }

  const lock = getLiveLockStatus();
  const steps = test.steps || [];
  const line = (id: string) => steps.find((s) => s.id === id);
  const failStep = steps.find((s) => !s.ok && s.code);
  const classified = classifyBitgetHttpCode(failStep?.code || '', failStep?.detailKo || test.msg);

  return NextResponse.json({
    ok: test.ok,
    integrityOk: true,
    readyForPaper: test.readyForPaper === true,
    title: 'Bitget API Test',
    summary: {
      CredentialDecrypt: 'PASS',
      HMAC: line('HMAC_ACCOUNT')?.ok ? 'PASS' : 'FAIL',
      Passphrase: test.ok ? 'PASS' : 'FAIL',
      Timestamp: line('SERVER_TIME')?.ok ? 'PASS' : 'FAIL',
      IP: line('OUTBOUND_IP')?.ok ? 'PASS' : 'CHECK',
      Account: line('HMAC_ACCOUNT')?.ok ? 'PASS' : 'FAIL',
      Position: line('POSITION')?.ok ? 'PASS' : line('POSITION') ? 'FAIL' : 'SKIP',
      OpenOrders: line('OPEN_ORDERS')?.ok ? 'PASS' : line('OPEN_ORDERS') ? 'FAIL' : 'SKIP',
      OrderPermission: test.ok ? 'READ_OK' : 'UNKNOWN',
    },
    readyHintKo: test.ok
      ? test.readyForPaper
        ? 'READY FOR PAPER'
        : 'AUTH PASS · READ 일부 확인'
      : 'NOT READY',
    failClass: test.failClass,
    bitgetCodeClass: classified,
    msg: test.msg,
    availableUsdt: test.availableUsdt,
    equityUsdt: test.equityUsdt,
    passphraseMode: test.passphraseMode,
    steps,
    sanitize: sanitize
      ? {
          fieldIssues: sanitize.fieldIssues,
          apiKeyMasked: sanitize.apiKeyMasked,
          apiKeyLength: sanitize.apiKeyLength,
          secretKeyLength: sanitize.secretKeyLength,
          passphraseLength: sanitize.passphraseLength,
        }
      : null,
    roundtrip,
    credential: {
      apiKeyMasked,
      credentialId,
      apiKeyLength: creds!.apiKey.length,
      secretKeyLength: creds!.apiSecret.length,
      passphraseLength: creds!.passphrase.length,
    },
    diag: {
      ...test.diag,
      apiKeyMasked,
      credentialId,
      headerCheck: {
        ACCESS_KEY: 'decrypted apiKey',
        ACCESS_PASSPHRASE: 'decrypted passphrase (plain)',
        ACCESS_SIGN: 'HMAC(secret) only',
      },
    },
    runMode: getRunMode(),
    liveLock: lock,
    auditVersion: BITGET_API_AUDIT.apiVersion,
  });
}

export async function GET() {
  const auth = authUser();
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const lock = getLiveLockStatus();
  const meta = readExchangeKeysMeta(auth.user);
  return NextResponse.json({
    ok: true,
    runMode: getRunMode(),
    liveLock: lock,
    credential: meta
      ? { apiKeyMasked: meta.apiKeyMasked, credentialId: meta.credentialId }
      : null,
    audit: {
      apiVersion: BITGET_API_AUDIT.apiVersion,
      authMethod: BITGET_API_AUDIT.authMethod,
      endpoints: BITGET_API_AUDIT.endpoints,
    },
  });
}
