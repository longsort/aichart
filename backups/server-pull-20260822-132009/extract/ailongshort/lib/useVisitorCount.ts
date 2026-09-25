'use client';

import { useEffect, useState } from 'react';

/** 실시간 접속자 수 — join/ping/leave + 폴링 */
export function useVisitorCount(): { count: number | null; users: string[] } {
  const [count, setCount] = useState<number | null>(null);
  const [users, setUsers] = useState<string[]>([]);

  useEffect(() => {
    const id =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ailongshort-visitor-id') : null) ||
      `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ailongshort-visitor-id', id);

    const getUser = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('ailongshort-briefing-user') || '').trim() : '');
    const post = (action: string) =>
      fetch('/api/visitors', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: id, action, user: getUser() || '게스트' }),
      })
        .then((r) => r.json())
        .then((d) => {
          setCount(d.count ?? 0);
          setUsers(Array.isArray(d.users) ? d.users : []);
          return d;
        })
        .catch(() => {});

    post('join');

    const pingInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      post('ping');
    }, 45_000);
    const countInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetch('/api/visitors', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => {
          setCount(d.count ?? 0);
          setUsers(Array.isArray(d.users) ? d.users : []);
        })
        .catch(() => {});
    }, 20_000);

    const onLeave = () => {
      fetch('/api/visitors', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: id, action: 'leave', user: getUser() || '게스트' }),
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

  return { count, users };
}
