'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { PullbackHotZonePack } from '@/lib/pullbackHotZoneEngine';

const HUD_BODY_OPEN_KEY = 'ailongshort-pullback-hud-body-open';

function readHudBodyOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(HUD_BODY_OPEN_KEY);
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

const cardStyle: CSSProperties = {
  padding: '10px 10px',
  borderRadius: 10,
  background: 'rgba(15,23,42,0.75)',
  border: '1px solid rgba(71,85,105,0.45)',
};

export default function PullbackHotZoneHud({
  pack,
  compact,
}: {
  pack: PullbackHotZonePack;
  compact?: boolean;
}) {
  const [bodyOpen, setBodyOpen] = useState(true);
  useEffect(() => {
    setBodyOpen(readHudBodyOpen());
  }, []);

  const setOpenPersist = useCallback((open: boolean) => {
    setBodyOpen(open);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(HUD_BODY_OPEN_KEY, open ? '1' : '0');
      }
    } catch {}
  }, []);

  const fs = compact ? 10 : 11;
  const pad = compact ? '8px' : '10px 12px';
  const swingRow = pack.strategyRows.find((r) => r.label === '스윙 박스');
  const teaser = swingRow?.value ?? `${pack.chartTf}`;

  const legendStrip = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 10px',
        marginBottom: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(30,41,59,0.65)',
        border: '1px solid rgba(100,116,139,0.35)',
        fontSize: fs - 1,
        color: '#cbd5e1',
      }}
    >
      <span>
        <span style={{ color: '#22c55e' }}>■</span> 눌림·지지
      </span>
      <span>
        <span style={{ color: '#f87171' }}>■</span> 공급·저항
      </span>
      <span>
        <span style={{ color: '#c084fc' }}>■</span> 목표(TP)
      </span>
      <span>
        <span style={{ color: '#94a3b8' }}>┅</span> 피보
      </span>
      <span>
        <span style={{ color: '#fb7185' }}>┅</span> SL·무효화
      </span>
    </div>
  );

  return (
    <div
      className="pullback-hot-zone-hud"
      style={{
        position: 'absolute',
        right: 8,
        top: compact ? 40 : 48,
        zIndex: 5,
        maxWidth: compact ? 'min(96vw, 340px)' : 'min(96vw, 380px)',
        pointerEvents: 'none',
        fontSize: fs,
        lineHeight: 1.45,
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          padding: pad,
          borderRadius: 12,
          background: 'rgba(2,6,23,0.88)',
          border: '1px solid rgba(148,163,184,0.38)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: bodyOpen ? 6 : 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: fs + 2, color: '#a5f3fc', letterSpacing: '-0.02em' }}>
              눌림 진입 ZONE · 다음 경로
            </div>
            <div style={{ fontSize: fs - 1, color: '#94a3b8', marginTop: 2 }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{pack.displaySymbol}</span>
              {' · '}
              <span style={{ color: '#7dd3fc' }}>{pack.chartTf}</span>
              {' · '}
              <span style={{ color: '#64748b' }}>참고 작도(자동)</span>
            </div>
          </div>
          <button
            type="button"
            className="tool-chip tool-chip-button"
            onClick={() => setOpenPersist(!bodyOpen)}
            title={bodyOpen ? '요약 본문 숨기기' : '요약 펼치기'}
            style={{
              flexShrink: 0,
              padding: compact ? '4px 8px' : '5px 10px',
              fontSize: compact ? 10 : 11,
              fontWeight: 600,
            }}
          >
            {bodyOpen ? '접기' : '펼치기'}
          </button>
        </div>

        {!bodyOpen && (
          <div style={{ fontSize: fs - 1, color: '#94a3b8', wordBreak: 'break-word', marginTop: 6 }}>
            <span style={{ color: '#cbd5e1' }}>{pack.chartTf}</span>
            {' · '}
            <span style={{ color: '#64748b' }}>{teaser}</span>
          </div>
        )}

        {bodyOpen && (
          <>
            {legendStrip}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? '1fr' : '1fr 1fr 1fr',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, color: '#fde68a', marginBottom: 6, fontSize: fs }}>진입·손절</div>
                {pack.entryCardLines.map((line, i) => (
                  <div key={i} style={{ fontSize: fs - 1, color: '#cbd5e1', marginBottom: i < pack.entryCardLines.length - 1 ? 6 : 0 }}>
                    {line}
                  </div>
                ))}
              </div>
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, color: '#e9d5ff', marginBottom: 6, fontSize: fs }}>목표(TP)</div>
                {pack.tpCardLines.map((line, i) => (
                  <div key={i} style={{ fontSize: fs - 1, color: '#cbd5e1', marginBottom: i < pack.tpCardLines.length - 1 ? 4 : 0 }}>
                    {line}
                  </div>
                ))}
              </div>
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, color: '#fecaca', marginBottom: 6, fontSize: fs }}>리스크</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: fs - 1, color: '#cbd5e1' }}>
                  {pack.riskBullets.map((b, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {pack.mtfRows.length > 0 && (
              <div style={{ ...cardStyle, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>TF별 엔진 요약(MTF)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs - 1 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '2px 6px 4px 0', color: '#64748b', fontWeight: 600 }}>TF</th>
                      <th style={{ textAlign: 'left', padding: '2px 6px 4px 0', color: '#64748b', fontWeight: 600 }}>판정</th>
                      <th style={{ textAlign: 'right', padding: '2px 0 4px 0', color: '#64748b', fontWeight: 600 }}>점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.mtfRows.map((r) => (
                      <tr key={r.tf}>
                        <td style={{ padding: '2px 6px 2px 0', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.tf}</td>
                        <td style={{ padding: '2px 6px 2px 0' }}>{r.verdict}</td>
                        <td style={{ padding: '2px 0', textAlign: 'right' }}>{Math.round(r.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, color: '#7dd3fc', marginBottom: 6 }}>눌림 구간 캔들 시그널(참고)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {pack.candleLegend.map((c) => (
                    <div key={c.title} style={{ fontSize: fs - 1 }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                        {c.icon} {c.title}
                      </div>
                      <div style={{ color: '#94a3b8', lineHeight: 1.35 }}>{c.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, color: '#7dd3fc', marginBottom: 6 }}>예상 파동(근사)</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: fs - 1, color: '#cbd5e1' }}>
                  {pack.waveSteps.map((w, i) => (
                    <li key={i} style={{ marginBottom: 5 }}>
                      {w}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <tbody>
                {pack.strategyRows.map((row) => (
                  <tr key={row.label}>
                    <td style={{ padding: '3px 8px 3px 0', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: fs - 1 }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '3px 0', wordBreak: 'break-word', fontSize: fs - 1 }}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: fs - 1, color: '#94a3b8', borderTop: '1px solid rgba(71,85,105,0.45)', paddingTop: 8 }}>
              <div>{pack.rsiNote}</div>
              <div style={{ marginTop: 4 }}>{pack.volumeNote}</div>
              <div style={{ marginTop: 4 }}>{pack.biasNote}</div>
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(71,85,105,0.45)', fontSize: fs - 2, color: '#64748b' }}>
              {pack.legendLines.map((line, i) => (
                <div key={i} style={{ marginBottom: 3 }}>
                  {line}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
