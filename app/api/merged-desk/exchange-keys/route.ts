import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  deleteExchangeKeys,
  readExchangeKeysMeta,
  readExchangeKeysPlain,
  updateExchangeKeysTest,
  writeExchangeKeys,
  writeExchangeKeysWithIntegrity,
} from '@/lib/serverExchangeKeysStore';
import { bitgetTestCredentials } from '@/lib/bitgetPrivateTrade';
import { classifyBitgetHttpCode } from '@/lib/bitgetCredentialIntegrity';

export const dynamic = 'force-dynamic';

function authUser() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  return verifySiteAuthToken(token);
}

/** GET — 키 등록 여부·마스킹·테스트 결과 (시크릿 미노출) */
export async function GET() {
  const auth = authUser();
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const meta = readExchangeKeysMeta(auth.user);
  return NextResponse.json({
    ok: true,
    configured: Boolean(meta),
    user: auth.user,
    meta: meta
      ? {
          apiKeyMasked: meta.apiKeyMasked,
          credentialId: meta.credentialId,
          lastTestOk: meta.lastTestOk,
          lastTestAt: meta.lastTestAt,
          lastTestMsg: meta.lastTestMsg,
        }
      : null,
  });
}

/**
 * POST — 저장·테스트.
 * 순서: sanitize → encrypt→decrypt 무결성 → (PASS 시) Bitget Private.
 * HMAC 서명 로직은 수정하지 않음. 40012 시 credential 쪽만 점검.
 */
export async function POST(req: NextRequest) {
  const auth = authUser();
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const testOnly = body.testOnly === true;
  const hasFresh =
    Boolean(String(body.apiKey || '').trim()) &&
    Boolean(String(body.apiSecret || '').trim()) &&
    Boolean(String(body.passphrase || '').trim());

  if (testOnly && !hasFresh) {
    const stored = readExchangeKeysPlain(auth.user);
    if (!stored) {
      return NextResponse.json({ ok: false, error: 'API Key / Secret / Passphrase 필요' }, { status: 400 });
    }
    const test = await bitgetTestCredentials(stored);
    updateExchangeKeysTest(auth.user, { ok: test.ok, msg: test.msg });
    if (test.ok && test.passphraseMode) {
      writeExchangeKeys(
        auth.user,
        { ...stored, passphraseMode: test.passphraseMode },
        { ok: true, msg: test.msg }
      );
    }
    const failStep = test.steps?.find((s) => !s.ok && s.code);
    const classified = classifyBitgetHttpCode(failStep?.code || '', failStep?.detailKo || test.msg);
    const meta = readExchangeKeysMeta(auth.user);
    return NextResponse.json({
      ok: test.ok,
      readyForPaper: test.readyForPaper === true,
      availableUsdt: test.availableUsdt,
      equityUsdt: test.equityUsdt,
      msg: test.msg,
      failClass: test.failClass,
      bitgetCodeClass: classified,
      passphraseMode: test.passphraseMode,
      steps: test.steps,
      diag: {
        ...test.diag,
        apiKeyMasked: meta?.apiKeyMasked,
        credentialId: meta?.credentialId,
        headerCheck: {
          ACCESS_KEY: 'decrypted apiKey',
          ACCESS_PASSPHRASE: 'decrypted passphrase (plain)',
          ACCESS_SIGN: 'HMAC(secret) only — secret not in passphrase header',
        },
      },
      configured: true,
      credential: {
        apiKeyMasked: meta?.apiKeyMasked,
        credentialId: meta?.credentialId,
        apiKeyLength: stored.apiKey.length,
        secretKeyLength: stored.apiSecret.length,
        passphraseLength: stored.passphrase.length,
      },
    });
  }

  if (!hasFresh) {
    return NextResponse.json({ ok: false, error: '저장 시 세 값 모두 입력' }, { status: 400 });
  }

  /** A→B→C→D: sanitize → 저장 → 즉시 복호화 → hash/length 비교 */
  const pack = writeExchangeKeysWithIntegrity(auth.user, {
    apiKey: String(body.apiKey || ''),
    apiSecret: String(body.apiSecret || ''),
    passphrase: String(body.passphrase || ''),
  });

  const integrityOk = pack.roundtrip.ok;
  const credForBitget = pack.decrypted;

  if (!integrityOk || !credForBitget) {
    updateExchangeKeysTest(auth.user, {
      ok: false,
      msg: `Credential decrypt FAIL · ${pack.roundtrip.issuesKo.join(' · ') || '무결성 실패'}`,
    });
    return NextResponse.json({
      ok: false,
      saved: true,
      integrityOk: false,
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
      credential: {
        apiKeyMasked: pack.meta.apiKeyMasked,
        credentialId: pack.meta.credentialId,
      },
      meta: {
        apiKeyMasked: pack.meta.apiKeyMasked,
        credentialId: pack.meta.credentialId,
        lastTestOk: false,
        lastTestAt: Date.now(),
        lastTestMsg: 'decrypt integrity fail',
      },
    });
  }

  /** E→F: Bitget Private (복호화된 동일 credentialId 세트만) */
  const test = await bitgetTestCredentials(credForBitget);
  writeExchangeKeys(
    auth.user,
    {
      ...credForBitget,
      passphraseMode: test.passphraseMode || 'plain',
    },
    { ok: test.ok, msg: test.msg }
  );

  const failStep = test.steps?.find((s) => !s.ok && s.code);
  const classified = classifyBitgetHttpCode(failStep?.code || '', failStep?.detailKo || test.msg);

  return NextResponse.json({
    ok: test.ok,
    saved: true,
    integrityOk: true,
    readyForPaper: test.readyForPaper === true,
    availableUsdt: test.availableUsdt,
    equityUsdt: test.equityUsdt,
    msg: test.ok
      ? `저장·인증 OK · ${pack.meta.apiKeyMasked}`
      : `Credential decrypt PASS · Bitget: ${test.msg}`,
    failClass: test.failClass,
    bitgetCodeClass: classified,
    passphraseMode: test.passphraseMode,
    steps: test.steps,
    sanitize: {
      fieldIssues: pack.sanitize.fieldIssues,
      apiKeyMasked: pack.sanitize.apiKeyMasked,
      apiKeyLength: pack.sanitize.apiKeyLength,
      secretKeyLength: pack.sanitize.secretKeyLength,
      passphraseLength: pack.sanitize.passphraseLength,
    },
    roundtrip: pack.roundtrip,
    credential: {
      apiKeyMasked: pack.meta.apiKeyMasked,
      credentialId: pack.meta.credentialId,
      apiKeyLength: pack.roundtrip.apiKeyLength,
      secretKeyLength: pack.roundtrip.secretKeyLength,
      passphraseLength: pack.roundtrip.passphraseLength,
    },
    diag: {
      ...test.diag,
      apiKeyMasked: pack.meta.apiKeyMasked,
      credentialId: pack.meta.credentialId,
      headerCheck: {
        ACCESS_KEY: 'decrypted apiKey',
        ACCESS_PASSPHRASE: 'decrypted passphrase (plain)',
        ACCESS_SIGN: 'HMAC(secret) only — secret not in passphrase header',
      },
    },
    meta: {
      apiKeyMasked: pack.meta.apiKeyMasked,
      credentialId: pack.meta.credentialId,
      lastTestOk: test.ok,
      lastTestAt: Date.now(),
      lastTestMsg: test.msg,
    },
  });
}

/** DELETE — 키 삭제 */
export async function DELETE() {
  const auth = authUser();
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  deleteExchangeKeys(auth.user);
  return NextResponse.json({ ok: true, deleted: true });
}
