'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppSiteLogin from '@/app/components/AppSiteLogin';
import { homePathForUser } from '@/lib/appSiteAuthClient';

/** 전용 로그인 URL — 허용 계정만 · 익명 홈 차단 */
export default function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.authenticated) {
          router.replace(homePathForUser(data.user, data.role));
          return;
        }
      } catch {
        /* anon */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        접속 확인 중…
      </div>
    );
  }

  return (
    <AppSiteLogin
      onLoggedIn={(user, role) => {
        window.location.href = homePathForUser(user, role);
      }}
    />
  );
}
