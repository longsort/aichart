'use client';

import { useState } from 'react';
import { setStoredBriefingCredentials } from '@/lib/clientAiCredentials';
import { useVisitorCount } from '@/lib/useVisitorCount';

type Props = {
  onLoggedIn: (user: string) => void;
};

/** 사이트 최초 진입 시 ID/비밀번호 (기본: aichart / longshort, 서버 env로 변경 가능) */
export default function AppSiteLogin({ onLoggedIn }: Props) {
  const visitorCount = useVisitorCount();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
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
      setStoredBriefingCredentials(u, password);
      window.location.reload();
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
          AI 트레이더 분석 엔진
        </h1>
        <p className="subtle" style={{ marginBottom: 20 }}>
          사이트에 접속하려면 아이디와 비밀번호를 입력하세요.
          {visitorCount != null && (
            <span style={{ marginLeft: 10, color: 'var(--muted)' }}>· 현재 {visitorCount}명 접속</span>
          )}
        </p>
        <form onSubmit={submit} className="site-login-form">
          <label className="site-login-label">
            <span>아이디</span>
            <input
              className="select-pill site-login-input"
              type="text"
              autoComplete="username"
              value={user}
              onChange={e => setUser(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </label>
          {error && <div className="site-login-error" role="alert">{error}</div>}
          <button type="submit" className="tool-chip tool-chip-button site-login-submit" disabled={loading}>
            {loading ? '확인 중...' : '접속'}
          </button>
        </form>
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
      `}</style>
    </div>
  );
}
