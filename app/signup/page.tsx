'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 회원가입 비활성 — 로그인으로 보냄 */
export default function SignupDisabledPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
      회원가입이 막혀 있습니다. 로그인으로 이동합니다…
    </div>
  );
}
