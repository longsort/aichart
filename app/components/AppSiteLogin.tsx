'use client';

import { useEffect, useState } from 'react';
import AppDisclaimerBanner from './AppDisclaimerBanner';
import { setStoredBriefingCredentials } from '@/lib/clientAiCredentials';
import { useVisitorCount } from '@/lib/useVisitorCount';
import { homePathForUser } from '@/lib/appSiteAuthClient';

type Props = {
  /** role 을 넘기면 호출측에서 리다이렉트. 없으면 역할 기본 경로로 이동 */
  onLoggedIn?: (user: string, role: string) => void;
};

type OtpPending = {
  challengeId: string;
  user: string;
  role: string;
  password: string;
  message: string;
  hintTo?: string;
  expiresMinutes?: number;
  ip?: string;
};

const OTP_SS_KEY = 'ailongshort-login-otp-pending';

function readStoredOtp(): OtpPending | null {
  try {
    const raw = sessionStorage.getItem(OTP_SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OtpPending;
    if (!parsed?.challengeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeOtp(pending: OtpPending | null) {
  try {
    if (!pending) sessionStorage.removeItem(OTP_SS_KEY);
    else sessionStorage.setItem(OTP_SS_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

/** 사이트 최초 진입 시 ID/비밀번호 — 외부 IP면 OTP 입력 단계 */
export default function AppSiteLogin({ onLoggedIn }: Props) {
  const visitor = useVisitorCount();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpPending, setOtpPending] = useState<OtpPending | null>(null);
  const [otpReady, setOtpReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 새로고침·리마운트에도 OTP 단계 유지
  useEffect(() => {
    const stored = readStoredOtp();
    if (stored) {
      setOtpPending(stored);
      setUser(stored.user || '');
    }
    setOtpReady(true);
  }, []);

  const setPending = (pending: OtpPending | null) => {
    setOtpPending(pending);
    storeOtp(pending);
  };

  const finishLogin = (authedUser: string, role: string, redirectTo?: string) => {
    storeOtp(null);
    setOtpPending(null);
    setStoredBriefingCredentials(authedUser, otpPending?.password || password);
    if (onLoggedIn) {
      onLoggedIn(authedUser, role);
      return;
    }
    const to =
      typeof redirectTo === 'string' && redirectTo
        ? redirectTo
        : homePathForUser(authedUser, role);
    window.location.href = to;
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = user.trim();
    if (!u || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ briefingLogin: { user: u, password } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }

      // 외부 IP: 쿠키 없이 challengeId만 — 반드시 OTP 화면 (리다이렉트 금지)
      const needsOtp =
        Boolean(data.otpRequired) ||
        Boolean(data.needsOtp) ||
        (typeof data.challengeId === 'string' && data.challengeId.length > 0);
      if (needsOtp && data.challengeId) {
        const pending: OtpPending = {
          challengeId: String(data.challengeId),
          user: String(data.user || u),
          role: String(data.role || 'charts'),
          password,
          message: String(
            data.message ||
              '외부 IP입니다. 관리자에게 인증 코드를 받아 아래에 입력하세요.',
          ),
          hintTo: data.otpHint?.to,
          expiresMinutes: data.otpHint?.expiresMinutes,
          ip: data.otpHint?.ip,
        };
        setPending(pending);
        setOtpCode('');
        setError(null);
        return;
      }

      finishLogin(String(data.user || u), String(data.role || 'charts'), data.redirectTo);
    } catch {
      setError('연결 오류입니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPending) return;
    setError(null);
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('6자리 숫자 인증 코드를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ challengeId: otpPending.challengeId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'OTP 확인에 실패했습니다.');
        return;
      }
      finishLogin(
        String(data.user || otpPending.user),
        String(data.role || otpPending.role),
        data.redirectTo,
      );
    } catch {
      setError('연결 오류입니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  if (!otpReady) {
    return (
      <div className="site-login-wrap">
        <div className="card site-login-card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          로그인 준비 중…
        </div>
      </div>
    );
  }

  const showOtp = Boolean(otpPending?.challengeId);

  return (
    <div className="site-login-wrap" role="dialog" aria-labelledby="site-login-title">
      <div className="card site-login-card">
        <h1 id="site-login-title" className="site-login-title">
          {showOtp ? 'OTP 인증' : '로그인'}
        </h1>
        <p className="subtle" style={{ marginBottom: 20 }}>
          {showOtp
            ? otpPending!.message
            : '허용된 계정으로만 접속할 수 있습니다.'}
          {!showOtp && visitor.count != null && (
            <span style={{ marginLeft: 10, color: 'var(--muted)' }}>· 현재 {visitor.count}명 접속</span>
          )}
        </p>

        {showOtp ? (
          <form onSubmit={submitOtp} className="site-login-form" key="otp-form">
            <div className="site-login-otp-banner" role="status">
              인증 코드가 관리자 이메일로 발송되었습니다. 아래에 6자리를 입력하세요.
            </div>
            <p className="site-login-otp-meta">
              계정 <strong>{otpPending!.user}</strong>
              {otpPending!.ip ? (
                <>
                  {' '}
                  · IP <code>{otpPending!.ip}</code>
                </>
              ) : null}
              {otpPending!.hintTo ? (
                <>
                  {' '}
                  · 코드 수신처 <code>{otpPending!.hintTo}</code>
                </>
              ) : null}
              {otpPending!.expiresMinutes ? (
                <> · 약 {otpPending!.expiresMinutes}분 유효</>
              ) : null}
            </p>
            <label className="site-login-label">
              <span>인증 코드 (6자리)</span>
              <input
                className="select-pill site-login-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="otp"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                disabled={loading}
                autoFocus
                aria-label="OTP 인증 코드 6자리"
              />
            </label>
            {error && (
              <div className="site-login-error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="tool-chip tool-chip-button site-login-submit" disabled={loading}>
              {loading ? '확인 중...' : 'OTP 확인'}
            </button>
            <button
              type="button"
              className="site-login-back"
              disabled={loading}
              onClick={() => {
                setPending(null);
                setOtpCode('');
                setError(null);
              }}
            >
              ← 아이디·비밀번호로 다시
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="site-login-form" key="pw-form">
            <label className="site-login-label">
              <span>아이디</span>
              <input
                className="select-pill site-login-input"
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="아이디 입력"
                disabled={loading}
              />
            </label>
            <label className="site-login-label">
              <span>비밀번호</span>
              <input
                className="select-pill site-login-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </label>
            {error && (
              <div className="site-login-error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="tool-chip tool-chip-button site-login-submit" disabled={loading}>
              {loading ? '확인 중...' : '접속'}
            </button>
          </form>
        )}
        <AppDisclaimerBanner variant="login" />
      </div>
      <style jsx>{`
        .site-login-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .site-login-card {
          width: 100%;
          max-width: 420px;
          padding: 28px;
        }
        .site-login-title {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 8px;
        }
        .site-login-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .site-login-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          color: var(--muted);
        }
        .site-login-input {
          width: 100%;
        }
        .site-login-error {
          font-size: 13px;
          color: #ff9b9b;
        }
        .site-login-submit {
          margin-top: 8px;
          padding: 12px 16px;
          font-weight: 700;
        }
        .site-login-otp-banner {
          font-size: 13px;
          line-height: 1.45;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #0f766e;
          background: rgba(13, 148, 136, 0.15);
          color: #99f6e4;
        }
        .site-login-otp-meta {
          font-size: 13px;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }
        .site-login-back {
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 13px;
          cursor: pointer;
          text-align: left;
          padding: 0;
        }
        .site-login-back:hover {
          color: var(--fg, #e2e8f0);
        }
      `}</style>
    </div>
  );
}
