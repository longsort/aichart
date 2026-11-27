'use client';

/** WMS 구역 오류 표시 */
export default function WmsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-red-200">
      <h1 className="text-lg font-semibold">재고(WMS) 오류</h1>
      <p className="mt-2 text-sm text-slate-300">{error.message}</p>
      <button
        type="button"
        className="mt-4 rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
        onClick={() => reset()}
      >
        다시 시도
      </button>
    </div>
  );
}
