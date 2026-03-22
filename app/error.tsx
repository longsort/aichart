'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text)' }}>
      <h2>오류가 발생했습니다</h2>
      <p style={{ color: 'var(--muted)', margin: '12px 0' }}>{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="tool-chip tool-chip-button"
        style={{ marginTop: 8 }}
      >
        다시 시도
      </button>
    </div>
  );
}
