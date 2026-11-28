import { NextRequest, NextResponse } from 'next/server';
import {
  verifyBriefingLoginBody,
  buildSiteAuthToken,
  APP_SITE_COOKIE,
  siteAuthCookieOptions,
  homePathForUser,
} from '@/lib/appSiteAuth';
import { getClientIp, isTrustedLoginIp } from '@/lib/auth/client-ip';
import {
  canSendOtp,
  createOtpChallenge,
  generateOtpCode,
  recordOtpSend,
  otpTtlMinutes,
} from '@/lib/auth/login-otp-store';
import { loginOtpRecipient, sendLoginOtpEmail } from '@/lib/auth/send-login-otp-email';

export const dynamic = 'force-dynamic';

/**
 * 앱 로그인 검증.
 * 신뢰 IP → 즉시 세션 쿠키.
 * 외부 IP → OTP 메일(관리자) 후 needsOtp (쿠키 미발급).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await verifyBriefingLoginBody(
      body as { briefingLogin?: { user?: string; password?: string } },
    );
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
    }

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') || undefined;
    const redirectTo = homePathForUser(result.user, result.role);

    if (isTrustedLoginIp(ip)) {
      const res = NextResponse.json({
        ok: true,
        user: result.user,
        role: result.role,
        redirectTo,
        otpRequired: false,
      });
      res.cookies.set(
        APP_SITE_COOKIE,
        buildSiteAuthToken(result.user, result.role),
        siteAuthCookieOptions(),
      );
      return res;
    }

    const rate = canSendOtp(ip);
    if (rate.ok === false) {
      return NextResponse.json({ ok: false, error: rate.error }, { status: 429 });
    }

    const code = generateOtpCode();
    const challenge = createOtpChallenge({
      user: result.user,
      role: result.role,
      ip,
      code,
    });
    recordOtpSend(ip);

    const mail = await sendLoginOtpEmail({
      user: result.user,
      ip,
      code,
      challengeId: challenge.id,
      userAgent: ua,
    });
    if (mail.ok === false) {
      return NextResponse.json({ ok: false, error: mail.error }, { status: 503 });
    }

    // 쿠키 미발급 — 클라이언트가 OTP 입력 UI로 전환해야 함
    return NextResponse.json({
      ok: true,
      otpRequired: true,
      needsOtp: true,
      challengeId: challenge.id,
      user: result.user,
      role: result.role,
      /** 참고용 — OTP 전에는 이동하지 말 것 */
      redirectTo,
      otpHint: {
        to: maskEmail(loginOtpRecipient()),
        expiresMinutes: otpTtlMinutes(),
        ip,
        channel: mail.channel,
      },
      message:
        '외부 IP입니다. 관리자 이메일로 인증 코드를 보냈습니다. 관리자에게 코드를 받아 입력하세요.',
    });
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식 오류' }, { status: 400 });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}
