'use client';

import { useState } from 'react';
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

/** 사이트 최초 진입 시 ID/비밀번호 — 외부 IP면 OTP 추가 */
export default function AppSiteLogin({ onLoggedIn }: Props) {
  const visitor = useVisitorCount();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpPending, setOtpPending] = useState<OtpPending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finishLogin = (authedUser: string, role: string, redirectTo?: string) => {
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
      if (data.otpRequired && data.challengeId) {
        setOtpPending({
          challengeId: String(data.challengeId),
          user: String(data.user || u),
          role: String(data.role || 'charts'),
          password,
          message: String(data.message || '관리자에게 OTP를 받아 입력하세요.'),
          hintTo: data.otpHint?.to,
          expiresMinutes: data.otpHint?.expiresMinutes,
          ip: data.otpHint?.ip,
        });
        setOtpCode('');
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
      finishLogin(String(data.user || otpPending.user), String(data.role || otpPending.role), data.redirectTo);
    } catch {
      setError('연결 오류입니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="site-login-wrap" role="dialog" aria-labelledby="site-login-title">
      <div className="card site-login-card">
        <h1 id="site-login-title" className="site-login-title">
          {otpPending ? 'OTP 인증' : '로그인'}
        </h1>
        <p className="subtle" style={{ marginBottom: 20 }}>
          {otpPending
            ? otpPending.message
            : '허용된 계정으로만 접속할 수 있습니다.'}
          {!otpPending && visitor.count != null && (
            <span style={{ marginLeft: 10, color: 'var(--muted)' }}>· 현재 {visitor.count}명 접속</span>
          )}
        </p>

        {otpPending ? (
          <form onSubmit={submitOtp} className="site-login-form">
            <p className="site-login-otp-meta">
              계정 <strong>{otpPending.user}</strong>
              {otpPending.ip ? (
                <>
                  {' '}
                  · IP <code>{otpPending.ip}</code>
                </>
              ) : null}
              {otpPending.hintTo ? (
                <>
                  {' '}
                  · 코드 수신처 <code>{otpPending.hintTo}</code>
                </>
              ) : null}
              {otpPending.expiresMinutes ? (
                <> · 약 {otpPending.expiresMinutes}분 유효</>
              ) : null}
            </p>
            <label className="site-login-label">
              <span>인증 코드 (6자리)</span>
              <input
                className="select-pill site-login-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                disabled={loading}
                autoFocus
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
                setOtpPending(null);
                setOtpCode('');
                setError(null);
              }}
            >
              ← 아이디·비밀번호로 다시
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="site-login-form">
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
