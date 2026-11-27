'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppSiteLogin from '@/app/components/AppSiteLogin';
import { homePathForRole } from '@/lib/appSiteAuthClient';

/** 전용 로그인 URL — 역할에 따라 차트(/) 또는 재고(/dashboard)로 이동 */
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
          router.replace(homePathForRole(data.role));
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
      onLoggedIn={(_user, role) => {
        window.location.href = homePathForRole(role);
      }}
    />
  );
}
