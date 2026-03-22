'use client';

import { useEffect, useState } from 'react';

/** 실시간 접속자 수 — join/ping/leave + 폴링 */
export function useVisitorCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const id =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ailongshort-visitor-id') : null) ||
      `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ailongshort-visitor-id', id);

    const post = (action: string) =>
      fetch('/api/visitors', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: id, action }),
      })
        .then((r) => r.json())
        .then((d) => {
          setCount(d.count ?? 0);
          return d;
        })
        .catch(() => {});

    post('join');

    const pingInterval = setInterval(() => post('ping'), 15_000);
    const countInterval = setInterval(() => {
      fetch('/api/visitors', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => setCount(d.count ?? 0))
        .catch(() => {});
    }, 6_000);

    const onLeave = () => {
      fetch('/api/visitors', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: id, action: 'leave' }),
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };

    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(pingInterval);
      clearInterval(countInterval);
      onLeave();
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return count;
}
