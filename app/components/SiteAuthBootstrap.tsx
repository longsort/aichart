'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import AppSiteLogin from '@/app/components/AppSiteLogin';
import { homePathForRole } from '@/lib/appSiteAuthClient';
import { setBriefingLoggedIn } from '@/lib/clientAiCredentials';

type AuthState = 'loading' | 'anon' | 'authed';

const SESSION_TIMEOUT_MS = 6_000;

/**
 * 무거운 HomePageContent 청크보다 먼저 세션을 확인한다.
 * 응답 지연 시 로그인 화면으로 넘어가 「접속 확인 중…응답 없음」에 갇히지 않게 한다.
 * inventory 역할은 차트 화면 대신 /dashboard 로 보낸다.
 */
export default function SiteAuthBootstrap({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [slow, setSlow] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const goAnon = useCallback(() => {
    setAuth((s) => (s === 'authed' ? s : 'anon'));
    setSlow(false);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    setSlow(false);
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, 3_500);
    const failTimer = window.setTimeout(() => {
      ac.abort();
      if (!cancelled) goAnon();
    }, SESSION_TIMEOUT_MS);

    fetch('/api/auth/session', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: ac.signal,
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          authenticated?: boolean;
          user?: string;
          role?: string;
        };
        if (cancelled) return;
        if (d.authenticated) {
          if (d.role === 'inventory') {
            window.location.replace('/dashboard');
            return;
          }
          setBriefingLoggedIn(true);
          setAuth('authed');
          setSlow(false);
          return;
        }
        goAnon();
      })
      .catch((e: { name?: string }) => {
        if (cancelled) return;
        /** 타임아웃 abort 포함 — loading에 고정 금지 */
        if (e?.name === 'AbortError') {
          goAnon();
          return;
        }
        goAnon();
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        window.clearTimeout(failTimer);
      });

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(slowTimer);
      window.clearTimeout(failTimer);
    };
  }, [retryTick, goAnon]);

  if (auth === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: '#091320',
          color: '#94a3b8',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        <strong style={{ color: '#e2e8f0', fontSize: 18 }}>독수리1호</strong>
        <span>접속 확인 중…</span>
        {slow && (
          <button
            type="button"
            onClick={() => {
              setSlow(false);
              setRetryTick((n) => n + 1);
            }}
            style={{
              marginTop: 6,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 13,
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 8,
            }}
          >
            응답 지연 — 다시 시도
          </button>
        )}
        {slow && (
          <button
            type="button"
            onClick={() => goAnon()}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              textDecoration: 'underline',
            }}
          >
            로그인 화면으로
          </button>
        )}
      </div>
    );
  }

  // 익명: 차트/홈 콘텐츠 노출 금지 — 로그인만
  if (auth === 'anon') {
    return (
      <AppSiteLogin
        onLoggedIn={(_u, role) => {
          setBriefingLoggedIn(true);
          window.location.href = homePathForRole(role);
        }}
      />
    );
  }

  return <>{children}</>;
}
