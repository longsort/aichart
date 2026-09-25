'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CandleTradeAtlas } from '@/lib/candleTradeAtlas';

const LS_KEY = 'ailongshort-trade-atlas-hud-v1';
const LS_KEY_MERGED_RIGHT = 'ailongshort-trade-atlas-hud-merged-right-v1';

type Layout = { hidden: boolean; left: number | null; top: number | null; collapsed: boolean };

function loadLayout(storageKey: string): Layout {
  try {
    const j = JSON.parse(typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) || '{}' : '{}') as Record<
      string,
      unknown
    >;
    return {
      hidden: j.hidden === true,
      left: typeof j.left === 'number' ? j.left : null,
      top: typeof j.top === 'number' ? j.top : null,
      collapsed: j.collapsed === true,
    };
  } catch {
    return { hidden: false, left: null, top: null, collapsed: false };
  }
}

function saveLayout(storageKey: string, l: Layout) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(l));
  } catch {}
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function distPct(close: number, target: number): string {
  const d = ((target - close) / close) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;
}

function LevelRow({
  label,
  price,
  close,
  color,
  strong,
}: {
  label: string;
  price: number;
  close: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 6,
        alignItems: 'center',
        padding: '5px 8px',
        borderRadius: 8,
        background: strong ? `${color}14` : 'rgba(15,23,42,0.45)',
        border: strong ? `1px solid ${color}44` : '1px solid rgba(51,65,85,0.35)',
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color, fontWeight: 800 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: strong ? 800 : 600 }}>{fmtPx(price)}</span>
      <span style={{ color: '#64748b', fontSize: 9 }}>{distPct(close, price)}</span>
    </div>
  );
}

export default function CandleTradeAtlasHud({
  atlas,
  symbol,
  containerRef,
  narrowUi,
  defaultAnchor = 'left',
}: {
  atlas: CandleTradeAtlas;
  symbol: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  narrowUi?: boolean;
  /** 통합·분석 — 4h처럼 우측 기본 배치 */
  defaultAnchor?: 'left' | 'right';
}) {
  const storageKey = defaultAnchor === 'right' ? LS_KEY_MERGED_RIGHT : LS_KEY;
  const hudWidth = narrowUi ? 300 : 320;
  const [layout, setLayout] = useState<Layout>(() => loadLayout(storageKey));
  const drag = useRef<{ px: number; py: number; l: number; t: number } | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  const verdictColor =
    atlas.verdict === 'LONG' ? '#4ade80' : atlas.verdict === 'SHORT' ? '#f87171' : '#94a3b8';

  const placeDefault = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const h = 280;
    const pad = narrowUi ? 8 : 12;
    const left =
      defaultAnchor === 'right'
        ? Math.max(pad, r.width - hudWidth - pad)
        : pad;
    setLayout((s) => ({
      ...s,
      left,
      top: narrowUi ? Math.max(8, r.height - h - 12) : 56,
    }));
  }, [containerRef, narrowUi, defaultAnchor, hudWidth]);

  useLayoutEffect(() => {
    if (layout.hidden) return;
    if (layout.left != null && layout.top != null) return;
    placeDefault();
  }, [layout.hidden, layout.left, layout.top, placeDefault]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      setLayout((s) => ({
        ...s,
        left: drag.current!.l + (e.clientX - drag.current!.px),
        top: drag.current!.t + (e.clientY - drag.current!.py),
      }));
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  useEffect(() => {
    saveLayout(storageKey, layout);
  }, [layout, storageKey]);

  if (layout.hidden) {
    return (
      <button
        type="button"
        className="tool-chip tool-chip-button"
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: 55,
          pointerEvents: 'auto',
          fontSize: 10,
          fontWeight: 700,
        }}
        onClick={() => setLayout((s) => ({ ...s, hidden: false }))}
      >
        타점·손익 패널
      </button>
    );
  }

  const close = atlas.currentPrice;

  return (
    <div
      ref={hudRef}
      className="trade-atlas-hud"
      style={{
        position: 'absolute',
        left: layout.left ?? 12,
        top: layout.top ?? 56,
        zIndex: 55,
        width: narrowUi ? 'min(96vw, 300px)' : 320,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          borderRadius: 14,
          border: `1px solid ${verdictColor}55`,
          background: 'rgba(2,6,23,0.92)',
          backdropFilter: 'blur(10px)',
          boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 32px -8px ${verdictColor}44`,
          overflow: 'hidden',
        }}
      >
        <div
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            drag.current = {
              px: e.clientX,
              py: e.clientY,
              l: layout.left ?? 12,
              t: layout.top ?? 56,
            };
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            cursor: 'grab',
            borderBottom: '1px solid rgba(51,65,85,0.5)',
            background: `linear-gradient(135deg, ${verdictColor}18, rgba(15,23,42,0.6))`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              {symbol} · <strong style={{ color: '#e2e8f0' }}>{atlas.timeframe}</strong>
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: verdictColor, letterSpacing: '-0.03em' }}>
              {atlas.verdictLabel}
              <span style={{ fontSize: 10, color: '#64748b', marginLeft: 8, fontWeight: 600 }}>
                L{atlas.longPct} / S{atlas.shortPct}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ padding: '3px 7px', fontSize: 9 }}
              onClick={() => setLayout((s) => ({ ...s, collapsed: !s.collapsed }))}
            >
              {layout.collapsed ? '펼침' : '접기'}
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ padding: '3px 7px', fontSize: 9 }}
              onClick={() => setLayout((s) => ({ ...s, hidden: true }))}
            >
              숨김
            </button>
          </div>
        </div>

        {!layout.collapsed && (
          <div style={{ padding: '10px 12px 12px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: verdictColor,
                marginBottom: 6,
                padding: '6px 8px',
                borderRadius: 8,
                background: `${verdictColor}12`,
                border: `1px solid ${verdictColor}33`,
              }}
            >
              {atlas.statusKo} — {atlas.actionKo}
            </div>

            {atlas.gateLine && (
              <div style={{ fontSize: 9, color: '#67e8f9', marginBottom: 8 }}>{atlas.gateLine}</div>
            )}

            <div style={{ display: 'grid', gap: 5, marginBottom: 8 }}>
              <LevelRow label="★ 진입 E" price={atlas.entry} close={close} color="#fde047" strong />
              <LevelRow label="⛔ 손절 SL" price={atlas.stopLoss} close={close} color="#f87171" strong />
              {atlas.takeProfits.map((tp) => (
                <LevelRow key={tp.label} label={tp.label} price={tp.price} close={close} color="#4ade80" />
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              {atlas.longZone && (
                <div
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(74,222,128,0.35)',
                    background: 'rgba(34,197,94,0.08)',
                    fontSize: 9,
                  }}
                >
                  <div style={{ color: '#4ade80', fontWeight: 800, marginBottom: 2 }}>▲ 롱 구간</div>
                  <div style={{ color: '#cbd5e1' }}>
                    {fmtPx(atlas.longZone.low)} ~ {fmtPx(atlas.longZone.high)}
                  </div>
                  <div style={{ color: '#64748b', marginTop: 2 }}>{atlas.longZone.labelKo}</div>
                </div>
              )}
              {atlas.shortZone && (
                <div
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(248,113,113,0.35)',
                    background: 'rgba(239,68,68,0.08)',
                    fontSize: 9,
                  }}
                >
                  <div style={{ color: '#f87171', fontWeight: 800, marginBottom: 2 }}>▼ 숏 구간</div>
                  <div style={{ color: '#cbd5e1' }}>
                    {fmtPx(atlas.shortZone.low)} ~ {fmtPx(atlas.shortZone.high)}
                  </div>
                  <div style={{ color: '#64748b', marginTop: 2 }}>{atlas.shortZone.labelKo}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
              <span>
                TP1 R≈{' '}
                <strong style={{ color: atlas.rrTp1 >= 1 ? '#86efac' : '#fde047' }}>
                  {atlas.rrTp1 >= 0.01 ? atlas.rrTp1.toFixed(2) : '–'}
                </strong>
              </span>
              <span>현재 {fmtPx(close)}</span>
            </div>

            {atlas.notes.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 8, color: '#64748b', lineHeight: 1.45 }}>
                {atlas.notes.slice(0, 2).map((n, i) => (
                  <div key={i}>· {n}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
