'use client';

/**
 * TradingView 스크린샷(@Eternyworld Macd+Adx Pro)과 동일한 MTF 표 레이아웃:
 * 열 = 타임프레임, 행 = Trend / ADX / RSI (헤더 행에 TF 라벨).
 */

export type EternyMtfRow = {
  tf: string;
  verdict: string;
  confidence: number;
  signalTime?: number | null;
  rsi?: number | null;
  adx?: number | null;
};

/** TV 캡처와 동일한 7개 TF 순서 */
export const ETERNY_MTF_COLUMN_TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d'] as const;

function normTf(k: string): string {
  const t = k.trim().toLowerCase();
  if (t === '1d' || t === 'd') return '1d';
  if (t === '1w') return '1w';
  if (t === '1m' && k === '1M') return '1M';
  return t;
}

function tfColumnHeader(tf: string): string {
  const k = normTf(tf);
  if (k === '1m') return '1m';
  if (k === '3m') return '3m';
  if (k === '5m') return '5m';
  if (k === '15m') return '15m';
  if (k === '1h') return '1H';
  if (k === '4h') return '4H';
  if (k === '1d') return 'D';
  return tf;
}

const ADX_STRONG_MIN = 22;

function trendGlyph(verdict: string): { ch: string; color: string } {
  const v = String(verdict || '').toUpperCase();
  if (v === 'LONG') return { ch: '▲', color: '#089981' };
  if (v === 'SHORT') return { ch: '▼', color: '#f23645' };
  return { ch: '—', color: '#787b86' };
}

function rsiArrow(rsi: number | null | undefined): string {
  if (rsi == null || !Number.isFinite(rsi)) return '';
  if (rsi >= 55) return '▲';
  if (rsi <= 45) return '▼';
  return '';
}

export function EternyMtfDashboard({ rows, theme }: { rows: EternyMtfRow[]; theme: 'dark' | 'light' }) {
  const byTf = new Map<string, EternyMtfRow>();
  for (const r of rows) {
    byTf.set(normTf(r.tf), r);
  }

  /** TV와 같이 7열 고정 — 데이터 없는 TF는 셀만 대시 */
  const columns = ETERNY_MTF_COLUMN_TFS.map((tf) => ({ tf, row: byTf.get(tf) ?? null }));

  if (!rows.length) return null;

  const isLight = theme === 'light';
  const bg = isLight ? 'rgba(245,246,248,0.96)' : 'rgba(19,23,34,0.96)';
  const border = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(42,46,57,0.95)';
  const thBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
  const labelMuted = isLight ? '#787b86' : '#787b86';
  const cell = isLight ? '#131722' : '#d1d4dc';
  const rsiHi = '#089981';
  const rsiLo = '#f23645';

  const cellPad = '4px 5px';

  return (
    <div
      className="eterny-mtf-dash"
      style={{
        position: 'absolute',
        right: 8,
        top: 44,
        zIndex: 11,
        fontSize: 11,
        borderRadius: 3,
        border: `1px solid ${border}`,
        background: bg,
        boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.55)',
        overflow: 'hidden',
        pointerEvents: 'none',
        fontFamily: 'Trebuchet MS, Roboto, Ubuntu, sans-serif',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          color: cell,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          <tr style={{ background: thBg, borderBottom: `1px solid ${border}` }}>
            <th
              style={{
                textAlign: 'left',
                padding: cellPad,
                fontWeight: 600,
                color: labelMuted,
                fontSize: 10,
                whiteSpace: 'nowrap',
              }}
            >
              TF
            </th>
            {columns.map(({ tf }) => (
              <th
                key={tf}
                style={{
                  textAlign: 'center',
                  padding: cellPad,
                  fontWeight: 600,
                  fontSize: 11,
                  color: cell,
                  minWidth: 30,
                }}
              >
                {tfColumnHeader(tf)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderTop: `1px solid ${border}` }}>
            <td
              style={{
                padding: cellPad,
                fontWeight: 400,
                color: labelMuted,
                fontSize: 10,
                whiteSpace: 'nowrap',
              }}
            >
              Trend
            </td>
            {columns.map(({ tf, row }) => {
              const g = row ? trendGlyph(row.verdict) : { ch: '—', color: '#787b86' };
              const isUp = g.ch === '▲';
              const isDn = g.ch === '▼';
              return (
                <td key={`t-${tf}`} style={{ textAlign: 'center', padding: cellPad }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 15,
                      height: 15,
                      borderRadius: 2,
                      fontSize: 9,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: g.color,
                      background: isUp
                        ? 'rgba(8,153,129,0.38)'
                        : isDn
                          ? 'rgba(242,54,69,0.40)'
                          : 'rgba(120,123,134,0.28)',
                      border: `1px solid ${g.color}`,
                      boxSizing: 'border-box',
                    }}
                    title={row?.verdict ?? ''}
                  >
                    {g.ch}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr style={{ borderTop: `1px solid ${border}` }}>
            <td style={{ padding: cellPad, fontWeight: 400, color: labelMuted, fontSize: 10 }}>ADX</td>
            {columns.map(({ tf, row }) => {
              const adx = row?.adx;
              const adxOk = adx != null && Number.isFinite(adx);
              const adxN = adxOk ? Math.round(adx) : null;
              const adxColor =
                adxN == null ? cell : adxN >= ADX_STRONG_MIN ? '#089981' : adxN < 18 ? '#f23645' : cell;
              return (
                <td key={`a-${tf}`} style={{ textAlign: 'center', padding: cellPad, color: adxColor, fontWeight: 600 }}>
                  {adxN != null ? adxN : '—'}
                </td>
              );
            })}
          </tr>
          <tr style={{ borderTop: `1px solid ${border}` }}>
            <td style={{ padding: cellPad, fontWeight: 400, color: labelMuted, fontSize: 10 }}>RSI</td>
            {columns.map(({ tf, row }) => {
              const r = row?.rsi;
              const rsiColor =
                r != null && Number.isFinite(r) ? (r >= 55 ? rsiHi : r <= 45 ? rsiLo : cell) : cell;
              return (
                <td
                  key={`r-${tf}`}
                  style={{
                    textAlign: 'center',
                    padding: cellPad,
                    color: rsiColor,
                    fontWeight: 500,
                  }}
                >
                  {r != null && Number.isFinite(r) ? (
                    <>
                      {Math.round(r)}
                      <span style={{ fontSize: 9, marginLeft: 1 }}>{rsiArrow(r)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
