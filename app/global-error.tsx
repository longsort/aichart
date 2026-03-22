'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ padding: 24, fontFamily: 'sans-serif', background: '#091320', color: '#f3f8ff' }}>
        <h2>오류가 발생했습니다</h2>
        <p style={{ color: 'rgba(243,248,255,.68)', margin: '12px 0' }}>{error.message}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 16px',
            background: 'rgba(98,239,224,.18)',
            border: '1px solid rgba(98,239,224,.45)',
            borderRadius: 10,
            color: '#f3f8ff',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
