/**
 * 외부 IP 로그인 OTP 메일.
 * 우선순위: Resend API → SMTP(nodemailer) → 관리자 파일 폴백.
 */
import nodemailer from 'nodemailer';
import { otpTtlMinutes, writeAdminOtpFallback } from '@/lib/auth/login-otp-store';

export function loginOtpRecipient(): string {
  return (process.env.LOGIN_OTP_TO_EMAIL || 'rjatkek1234567@gmail.com').trim();
}

function mailFrom(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'WMS Login <onboarding@resend.dev>'
  );
}

export async function sendLoginOtpEmail(input: {
  user: string;
  ip: string;
  code: string;
  challengeId: string;
  userAgent?: string;
}): Promise<{ ok: true; channel: 'resend' | 'smtp' | 'admin_file' } | { ok: false; error: string }> {
  const to = loginOtpRecipient();
  const when = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const subject = `[WMS] 외부 IP 로그인 OTP · ${input.user} · ${input.ip}`;
  const text = [
    'WMS(ailongshort) 외부 IP 로그인 인증 코드입니다.',
    '',
    `계정: ${input.user}`,
    `IP: ${input.ip}`,
    `시각(Asia/Seoul): ${when}`,
    input.userAgent ? `UA: ${input.userAgent.slice(0, 180)}` : '',
    '',
    `인증 코드: ${input.code}`,
    `유효 시간: 약 ${otpTtlMinutes()}분`,
    '',
    '방문자가 로그인 화면에 이 코드를 입력하면 접속됩니다.',
    '본인이 요청하지 않았다면 무시하세요.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<p>WMS(ailongshort) <strong>외부 IP 로그인</strong> 인증 코드입니다.</p>
<ul>
<li>계정: <code>${escapeHtml(input.user)}</code></li>
<li>IP: <code>${escapeHtml(input.ip)}</code></li>
<li>시각(Asia/Seoul): ${escapeHtml(when)}</li>
</ul>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(input.code)}</p>
<p>유효 시간 약 ${otpTtlMinutes()}분 · 관리자가 방문자에게 코드를 알려 주세요.</p>`;

  // Always keep admin file copy (SSH fallback / mail delay)
  writeAdminOtpFallback(input);

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: mailFrom(),
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[login-otp] resend failed', res.status, body.slice(0, 300));
      } else {
        return { ok: true, channel: 'resend' };
      }
    } catch (e) {
      console.error('[login-otp] resend error', e);
    }
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (host && user && pass) {
    try {
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.createTransport({
        host,
        port: Number.isFinite(port) ? port : 587,
        secure: port === 465,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from: mailFrom(),
        to,
        subject,
        text,
        html,
      });
      return { ok: true, channel: 'smtp' };
    } catch (e) {
      console.error('[login-otp] smtp error', e);
    }
  }

  // Dev / pre-SMTP: admin reads data/login-otp-admin.txt or pm2 logs
  console.warn(
    `[login-otp] mail not configured — code for ${input.user}@${input.ip} written to data/login-otp-admin.txt`,
  );
  if (process.env.LOGIN_OTP_REQUIRE_MAIL === '1') {
    return {
      ok: false,
      error: 'OTP 메일 전송 설정이 없습니다. SMTP 또는 RESEND_API_KEY를 설정하세요.',
    };
  }
  return { ok: true, channel: 'admin_file' };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
