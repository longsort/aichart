'use client';

import type { SignalSpotForwardReport } from '@/lib/signalSpotForwardStats';

type Props = {
  open: boolean;
  onClose: () => void;
  report: SignalSpotForwardReport | null;
  horizonBars: number;
  onHorizonChange: (n: number) => void;
  includeBand: boolean;
  includeRocket: boolean;
  onIncludeBand: (v: boolean) => void;
  onIncludeRocket: (v: boolean) => void;
  loading?: boolean;
};

export default function SignalForwardStatsPanel({
  open,
  onClose,
  report,
  horizonBars,
  onHorizonChange,
  includeBand,
  includeRocket,
  onIncludeBand,
  onIncludeRocket,
  loading,
}: Props) {
  if (!open) return null;

  const hist = report?.histogram;
  const maxCount = hist?.bins.length ? Math.max(1, ...hist.bins.map((b) => b.count)) : 1;
  const w = 360;
  const h = 120;
  const pad = 8;
  const barW = hist?.bins.length ? (w - pad * 2) / hist.bins.length : 1;

  return (
    <div
      className="signal-forward-stats-panel"
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        zIndex: 12,
        width: 'min(96vw, 440px)',
        maxHeight: 'min(78vh, 560px)',
        overflow: 'auto',
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(15,23,42,0.94)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        color: '#e2e8f0',
        fontSize: 12,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.02 }}>신호 전진 통계</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.45 }}>
            현물 기준 · 진입 = 신호 봉 <strong>종가</strong>. 아래는 <strong>봉 단위 선도달 시뮬</strong>(목표·손절 가격을 시간순으로 검사, 같은 봉에 둘 다 건리면 손절 우선)과 롱·숏·밴드등급 분리 요약입니다. 과거
            요약이며 미래를 보장하지 않습니다.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'rgba(51,65,85,0.6)',
            color: '#cbd5e1',
            borderRadius: 8,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          닫기
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
          전진 봉 수
          <select
            value={horizonBars}
            onChange={(e) => onHorizonChange(Number(e.target.value))}
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid rgba(148,163,184,0.35)',
              borderRadius: 6,
              padding: '4px 8px',
            }}
          >
            {[10, 20, 30, 50, 80].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11 }}>
          <input type="checkbox" checked={includeBand} onChange={(e) => onIncludeBand(e.target.checked)} />
          기관밴드 접촉
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11 }}>
          <input type="checkbox" checked={includeRocket} onChange={(e) => onIncludeRocket(e.target.checked)} />
          구조 로켓
        </label>
      </div>

      {loading && <div style={{ color: '#94a3b8', fontSize: 11 }}>계산 중…</div>}

      {!loading && report && report.summary.n === 0 && (
        <div style={{ color: '#fbbf24', fontSize: 11, padding: '8px 0' }}>
          조건에 맞는 신호가 없거나 전진 구간 캔들이 부족합니다. 기관밴드·로켓 포함 여부와 로드된 히스토리 길이를 확인하세요.
        </div>
      )}

      {!loading && report && report.summary.n > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
              fontSize: 11,
            }}
          >
            <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#94a3b8' }}>표본 수</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{report.summary.n}</div>
            </div>
            <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#94a3b8' }}>중앙값 종가변동 %</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: report.summary.medianReturn >= 0 ? '#86efac' : '#fca5a5' }}>
                {report.summary.medianReturn.toFixed(2)}%
              </div>
            </div>
            <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#94a3b8' }}>중앙값 유리(MFE) %</div>
              <div style={{ fontWeight: 700 }}>{report.summary.medianMfe.toFixed(2)}%</div>
            </div>
            <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#94a3b8' }}>중앙값 불리(MAE) %</div>
              <div style={{ fontWeight: 700 }}>{report.summary.medianMae.toFixed(2)}%</div>
            </div>
          </div>

          {(report.summaryLong.n > 0 || report.summaryShort.n > 0) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 12,
                fontSize: 10,
              }}
            >
              {report.summaryLong.n > 0 && (
                <div style={{ background: 'rgba(22,101,52,0.2)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <div style={{ color: '#86efac', fontWeight: 700 }}>롱만 n={report.summaryLong.n}</div>
                  <div style={{ color: '#94a3b8' }}>종가변동 중앙값</div>
                  <div style={{ fontWeight: 700, color: report.summaryLong.medianReturn >= 0 ? '#86efac' : '#fca5a5' }}>
                    {report.summaryLong.medianReturn.toFixed(2)}%
                  </div>
                  <div style={{ color: '#64748b', marginTop: 4 }}>
                    MFE {report.summaryLong.medianMfe.toFixed(2)}% · MAE {report.summaryLong.medianMae.toFixed(2)}%
                  </div>
                </div>
              )}
              {report.summaryShort.n > 0 && (
                <div style={{ background: 'rgba(127,29,29,0.2)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <div style={{ color: '#fca5a5', fontWeight: 700 }}>숏만 n={report.summaryShort.n}</div>
                  <div style={{ color: '#94a3b8' }}>종가변동 중앙값</div>
                  <div style={{ fontWeight: 700, color: report.summaryShort.medianReturn >= 0 ? '#86efac' : '#fca5a5' }}>
                    {report.summaryShort.medianReturn.toFixed(2)}%
                  </div>
                  <div style={{ color: '#64748b', marginTop: 4 }}>
                    MFE {report.summaryShort.medianMfe.toFixed(2)}% · MAE {report.summaryShort.medianMae.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          )}

          {report.bandTierRows.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>기관밴드 접촉 등급별 · 종가변동 중앙값</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.bandTierRows.map((row) => (
                  <div
                    key={row.tier}
                    style={{
                      background: 'rgba(30,41,59,0.85)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 11,
                      border: '1px solid rgba(148,163,184,0.25)',
                    }}
                  >
                    <span style={{ color: '#a5b4fc', fontWeight: 700 }}>등급 {row.tier}</span>
                    <span style={{ color: '#64748b', margin: '0 6px' }}>n={row.n}</span>
                    <span style={{ color: row.medianReturn >= 0 ? '#86efac' : '#fca5a5' }}>{row.medianReturn.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.pathRace.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                선도달 시뮬 — 먼저 목표가 vs 먼저 손절가 (같은 봉이면 손절 우선)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>조건</th>
                      <th style={{ padding: '4px 6px' }}>목표 먼저</th>
                      <th style={{ padding: '4px 6px' }}>손절 먼저</th>
                      <th style={{ padding: '4px 6px' }}>둘 다 아님</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pathRace.map((row) => (
                      <tr key={row.label} style={{ borderTop: '1px solid rgba(51,65,85,0.5)' }}>
                        <td style={{ padding: '6px' }}>{row.label}</td>
                        <td style={{ padding: '6px', color: row.tpFirstRate >= 0.4 ? '#86efac' : '#e2e8f0' }}>
                          {(row.tpFirstRate * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '6px', color: row.slFirstRate > 0.35 ? '#fca5a5' : '#e2e8f0' }}>
                          {(row.slFirstRate * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '6px', color: '#94a3b8' }}>{(row.neitherRate * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>전진 {horizonBars}봉 후 종가 수익률 분포 (%)</div>
          <svg width={w} height={h} style={{ display: 'block', marginBottom: 12 }}>
            <rect x={0} y={0} width={w} height={h} fill="rgba(15,23,42,0.5)" rx={6} />
            {hist?.bins.map((b, i) => {
              const bh = maxCount > 0 ? ((h - 20) * b.count) / maxCount : 0;
              const x = pad + i * barW;
              const y = h - 12 - bh;
              const mid = (b.from + b.to) / 2;
              return (
                <g key={i}>
                  <rect
                    x={x + 0.5}
                    y={y}
                    width={Math.max(1, barW - 1)}
                    height={bh}
                    fill={mid >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.45)'}
                  />
                </g>
              );
            })}
          </svg>

          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
            최대 역행(MAE) 기준 — 구간 안 한 번이라도 그 폭 이상 불리하게 움직인 비율 (단순 참고, 위 선도달과 다름)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>SL 후보</th>
                  <th style={{ padding: '4px 6px' }}>도달</th>
                  <th style={{ padding: '4px 6px' }}>비율</th>
                </tr>
              </thead>
              <tbody>
                {report.slGrid.map((row) => (
                  <tr key={row.slPct} style={{ borderTop: '1px solid rgba(51,65,85,0.5)' }}>
                    <td style={{ padding: '6px' }}>{row.slPct}%</td>
                    <td style={{ padding: '6px' }}>
                      {row.touchedCount} / {row.totalSignals}
                    </td>
                    <td style={{ padding: '6px', color: row.touchedRate > 0.5 ? '#fca5a5' : '#e2e8f0' }}>
                      {(row.touchedRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 9, color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>
            MAE 표는 &quot;최대로 얼마나 불리했나&quot;이고, 선도달 표는 &quot;정해진 목표·손절 가격이 시간 순서로 먼저 닿았나&quot;입니다. 틱·체결 순서는 알 수 없어 같은 봉은 보수적으로 손절 우선입니다.
          </div>
        </>
      )}
    </div>
  );
}
