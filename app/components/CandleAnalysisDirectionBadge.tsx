'use client';

import { useCallback, useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AnalyzeResponse } from '@/types';
import { resolveCandleAnalysisDirection } from '@/lib/candleAnalysisGuide';

const LS_KEY = 'ailongshort-candle-dir-badge-v1';

type Layout = {
  hidden: boolean;
  left: number | null;
  top: number | null;
  scale: number;
};

function loadLayout(): Layout {
  try {
    const j = JSON.parse(typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) || '{}' : '{}') as Record<string, unknown>;
    return {
      hidden: j.hidden === true,
      left: typeof j.left === 'number' ? j.left : null,
      top: typeof j.top === 'number' ? j.top : null,
      scale: typeof j.scale === 'number' ? Math.min(1.2, Math.max(0.5, j.scale)) : 0.74,
    };
  } catch {
    return { hidden: false, left: null, top: null, scale: 0.74 };
  }
}

function saveLayout(l: Layout) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(l));
  } catch {}
}

const BADGE_Z = 52;

export default function CandleAnalysisDirectionBadge({
  analysis,
  theme = 'dark',
  containerRef,
  narrowUi = false,
}: {
  analysis: AnalyzeResponse;
  theme?: 'dark' | 'light';
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 폰 등 좁은 폭: 상단 메뉴와 겹치지 않게 기본 위치를 차트 하단 쪽으로 둡니다 */
  narrowUi?: boolean;
}) {
  const d = resolveCandleAnalysisDirection(analysis);
  const [layout, setLayout] = useState<Layout>(() => loadLayout());
  const drag = useRef<{ px: number; py: number; l: number; t: number } | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);

  const placeDefault = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const bw = 128;
    const bh = 110;
    if (narrowUi) {
      setLayout((s) => ({
        ...s,
        left: 8,
        top: Math.max(8, r.height - bh - 14),
      }));
      return;
    }
    setLayout((s) => ({
      ...s,
      left: Math.max(8, r.width - 12 - bw),
      top: Math.max(8, r.height * 0.34 - bh / 2),
    }));
  }, [containerRef, narrowUi]);

  useLayoutEffect(() => {
    if (layout.hidden) return;
    if (layout.left != null && layout.top != null) return;
    placeDefault();
  }, [layout.hidden, layout.left, layout.top, placeDefault, narrowUi]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      setLayout((s) => {
        if (s.hidden || s.left == null || s.top == null) return s;
        const r = c.getBoundingClientRect();
        const el = badgeRef.current;
        const bw = (el?.offsetWidth ?? 130) + 8;
        const bh = (el?.offsetHeight ?? 120) + 8;
        return {
          ...s,
          left: Math.min(Math.max(8, s.left), Math.max(8, r.width - bw)),
          top: Math.min(Math.max(8, s.top), Math.max(8, r.height - bh)),
        };
      });
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [containerRef]);

  const persist = useCallback((next: Layout) => {
    setLayout(next);
    saveLayout(next);
  }, []);

  const onPointerDownBar = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-badge-nodrag]')) return;
      e.preventDefault();
      e.stopPropagation();
      const c = containerRef.current;
      setLayout((s) => {
        let l = s.left;
        let t = s.top;
        if ((l == null || t == null) && c) {
          const r = c.getBoundingClientRect();
          const bw = 128;
          const bh = 110;
          if (narrowUi) {
            l = 8;
            t = Math.max(8, r.height - bh - 14);
          } else {
            l = Math.max(8, r.width - 12 - bw);
            t = Math.max(8, r.height * 0.34 - bh / 2);
          }
        }
        l = l ?? 8;
        t = t ?? 8;
        drag.current = { px: e.clientX, py: e.clientY, l, t };
        return { ...s, left: l, top: t };
      });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [containerRef, narrowUi]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d0 = drag.current;
      if (!d0) return;
      const c = containerRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const dx = e.clientX - d0.px;
      const dy = e.clientY - d0.py;
      let nl = d0.l + dx;
      let nt = d0.t + dy;
      const el = badgeRef.current;
      const bw = (el?.offsetWidth ?? 130) + 4;
      const bh = (el?.offsetHeight ?? 120) + 4;
      nl = Math.min(Math.max(8, nl), Math.max(8, r.width - bw));
      nt = Math.min(Math.max(8, nt), Math.max(8, r.height - bh));
      setLayout((s) => ({ ...s, left: nl, top: nt }));
    },
    [containerRef]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      drag.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setLayout((s) => {
        saveLayout(s);
        return s;
      });
    },
    []
  );

  const bg =
    theme === 'dark'
      ? `linear-gradient(160deg, ${d.color}26 0%, rgba(15,23,42,0.95) 55%, rgba(15,23,42,0.9) 100%)`
      : `linear-gradient(160deg, ${d.color}16 0%, rgba(255,255,255,0.97) 100%)`;

  if (layout.hidden) {
    return (
      <button
        type="button"
        data-badge-nodrag
        onClick={() => persist({ ...layout, hidden: false })}
        style={{
          position: 'absolute',
          right: 0,
          top: narrowUi ? 'auto' : '34%',
          bottom: narrowUi ? 12 : 'auto',
          transform: narrowUi ? undefined : 'translateY(-50%)',
          zIndex: BADGE_Z,
          padding: '10px 6px',
          borderRadius: '8px 0 0 8px',
          border: `1px solid ${d.color}66`,
          borderRight: 'none',
          background: theme === 'dark' ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)',
          color: d.color,
          fontSize: 10,
          fontWeight: 800,
          writingMode: 'vertical-rl',
          letterSpacing: 2,
          cursor: 'pointer',
          boxShadow: `-4px 0 14px rgba(0,0,0,0.25)`,
        }}
      >
        판정 표시
      </button>
    );
  }

  const left = layout.left ?? 8;
  const top = layout.top ?? 8;

  return (
    <div
      ref={badgeRef}
      className="candle-analysis-direction-badge"
      style={{
        position: 'absolute',
        left,
        top,
        zIndex: BADGE_Z,
        transform: `scale(${layout.scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '8px 12px 10px',
          borderRadius: 12,
          background: bg,
          border: `1px solid ${d.color}88`,
          boxShadow: `0 4px 18px rgba(0,0,0,0.35), 0 0 20px ${d.glow}`,
          textAlign: 'center',
          minWidth: 102,
          maxWidth: 148,
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          type="button"
          data-badge-nodrag
          title="닫기 (우측 탭에서 다시 열기)"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            persist({ ...layout, hidden: true });
          }}
          style={{
            position: 'absolute',
            right: 4,
            top: 4,
            width: 26,
            height: 26,
            borderRadius: 6,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: '#e2e8f0',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
            zIndex: 3,
            touchAction: 'manipulation',
          }}
        >
          ×
        </button>
        <div
          onPointerDown={onPointerDownBar}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            cursor: 'grab',
            marginBottom: 4,
            paddingBottom: 4,
            borderBottom: `1px solid ${d.color}33`,
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: 800,
              color: theme === 'dark' ? '#94a3b8' : '#64748b',
              letterSpacing: 1.5,
            }}
          >
            방향 · 드래그 이동
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: d.color, lineHeight: 1, textShadow: `0 0 14px ${d.glow}` }}>{d.headlineKo}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: d.color, marginTop: 2, letterSpacing: 0.5, opacity: 0.9 }}>{d.headlineEn}</div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: theme === 'dark' ? '#cbd5e1' : '#475569',
            marginTop: 6,
            lineHeight: 1.35,
          }}
        >
          {d.subLine}
        </div>
        <div
          data-badge-nodrag
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
        >
          <button
            type="button"
            title="작게"
            onClick={() => {
              setLayout((s) => {
                const next = { ...s, scale: Math.max(0.5, s.scale - 0.08) };
                saveLayout(next);
                return next;
              });
            }}
            style={scaleBtn}
          >
            −
          </button>
          <span style={{ fontSize: 9, color: subColor(theme), fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
            {Math.round(layout.scale * 100)}%
          </span>
          <button
            type="button"
            title="크게"
            onClick={() => {
              setLayout((s) => {
                const next = { ...s, scale: Math.min(1.2, s.scale + 0.08) };
                saveLayout(next);
                return next;
              });
            }}
            style={scaleBtn}
          >
            +
          </button>
          <button
            type="button"
            title="위치 초기화"
            onClick={() => {
              const c = containerRef.current;
              if (!c) return;
              const r = c.getBoundingClientRect();
              const bw = 130;
              const bh = 115;
              setLayout((s) => {
                const next = {
                  ...s,
                  left: narrowUi ? 8 : Math.max(8, r.width - 12 - bw),
                  top: narrowUi ? Math.max(8, r.height - bh - 14) : Math.max(8, r.height * 0.34 - bh / 2),
                };
                saveLayout(next);
                return next;
              });
            }}
            style={{ ...scaleBtn, fontSize: 8, padding: '2px 6px' }}
          >
            위치
          </button>
        </div>
      </div>
    </div>
  );
}

function subColor(theme: 'dark' | 'light') {
  return theme === 'dark' ? '#94a3b8' : '#64748b';
}

const scaleBtn: CSSProperties = {
  border: '1px solid rgba(148,163,184,0.4)',
  background: 'rgba(0,0,0,0.25)',
  color: '#e2e8f0',
  borderRadius: 6,
  width: 26,
  height: 26,
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};
