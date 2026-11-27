'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setStoredBriefingCredentials } from '@/lib/clientAiCredentials';

/** 재고(및 공통) 자가 회원가입 — 기본 역할 inventory */
export default function SignupPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
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
    if (password !== password2) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ user: u, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || '가입에 실패했습니다.');
        return;
      }
      setStoredBriefingCredentials(u, password);
      const to = typeof data.redirectTo === 'string' ? data.redirectTo : '/dashboard';
      router.replace(to);
    } catch {
      setError('연결 오류입니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="su-wrap">
      <div className="su-card">
        <p className="su-eyebrow">유일후랜지 · 재고관리</p>
        <h1 className="su-title">회원가입</h1>
        <p className="su-lead">
          아이디와 비밀번호를 직접 만드세요. 가입 후 기본으로 <strong>재고 화면</strong>을 씁니다.
          차트 분석 권한이 필요하면 마스터 관리자에게 요청하세요.
        </p>
        <form onSubmit={submit} className="su-form">
          <label className="su-label">
            <span>아이디</span>
            <input
              className="su-input"
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="예: stock01"
              disabled={loading}
            />
          </label>
          <label className="su-label">
            <span>비밀번호</span>
            <input
              className="su-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              disabled={loading}
            />
          </label>
          <label className="su-label">
            <span>비밀번호 확인</span>
            <input
              className="su-input"
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="한 번 더 입력"
              disabled={loading}
            />
          </label>
          {error ? (
            <div className="su-error" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="su-submit" disabled={loading}>
            {loading ? '가입 중…' : '가입하고 재고로 이동'}
          </button>
        </form>
        <p className="su-foot">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
        <p className="su-hint">
          비밀번호는 서버에 암호화(해시)되어 저장되며, 평문으로 보관하지 않습니다.
        </p>
      </div>
      <style jsx>{`
        .su-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(160deg, #0b1220 0%, #121a2b 45%, #0e1624 100%);
          color: #e8eef8;
        }
        .su-card {
          width: 100%;
          max-width: 420px;
          padding: 28px 26px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.92);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }
        .su-eyebrow {
          margin: 0 0 6px;
          font-size: 12px;
          letter-spacing: 0.04em;
          color: #94a3b8;
        }
        .su-title {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 800;
        }
        .su-lead {
          margin: 0 0 20px;
          font-size: 14px;
          line-height: 1.55;
          color: #cbd5e1;
        }
        .su-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .su-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          color: #94a3b8;
        }
        .su-input {
          width: 100%;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: #0b1220;
          color: #f1f5f9;
          font-size: 15px;
        }
        .su-error {
          font-size: 13px;
          color: #fca5a5;
        }
        .su-submit {
          margin-top: 4px;
          padding: 12px 16px;
          border: 0;
          border-radius: 10px;
          background: #14b8a6;
          color: #042f2e;
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
        }
        .su-submit:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .su-foot {
          margin: 18px 0 0;
          font-size: 13px;
          color: #94a3b8;
        }
        .su-foot :global(a) {
          color: #5eead4;
          font-weight: 600;
        }
        .su-hint {
          margin: 10px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
