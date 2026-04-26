'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PageLayoutSettings } from '@/lib/settings';

type Props = {
  layout: PageLayoutSettings;
  onChange: (patch: Partial<PageLayoutSettings>) => void;
};

function row(
  label: string,
  checked: boolean,
  onToggle: () => void,
  disabled?: boolean
) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: 13,
        padding: '6px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export default function PageLayoutFab({ layout, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const t = e.target as HTMLElement;
        if (t.closest?.('.page-layout-fab-trigger')) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const resetPositions = useCallback(() => {
    onChange({
      mainToolbarPos: null,
      mtfStripPos: null,
      mainToolbarFloat: false,
      mtfStripFloat: false,
    });
  }, [onChange]);

  const fab = (
    <>
      <button
        type="button"
        className="page-layout-fab-trigger"
        aria-expanded={open}
        aria-label="화면 레이아웃 — 패널 표시·이동"
        title="레이아웃"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed',
          right: 'max(12px, env(safe-area-inset-right, 0px))',
          bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          zIndex: 9600,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          color: 'var(--text)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          cursor: 'pointer',
          fontSize: 18,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          touchAction: 'manipulation',
        }}
      >
        ⛶
      </button>
      {open && (
        <div
          ref={panelRef}
          className="page-layout-panel"
          role="dialog"
          aria-label="레이아웃 설정"
          style={{
            position: 'fixed',
            right: 'max(12px, env(safe-area-inset-right, 0px))',
            bottom: 'max(72px, calc(12px + env(safe-area-inset-bottom, 0px) + 56px))',
            zIndex: 9601,
            width: 'min(92vw, 320px)',
            maxHeight: 'min(70vh, 480px)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '14px 16px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>화면 레이아웃</div>
          <div className="subtle" style={{ fontSize: 11, marginBottom: 12, lineHeight: 1.45 }}>
            버튼·줄을 끄거나, 플로팅으로 켠 뒤 손가락·마우스로 끌어 위치를 옮길 수 있습니다.
          </div>
          {row('페이지 제목 (AI 트레이더)', layout.showPageTitle, () =>
            onChange({ showPageTitle: !layout.showPageTitle })
          )}
          {row('상단 툴바 전체', layout.showMainToolbar, () =>
            onChange({ showMainToolbar: !layout.showMainToolbar })
          )}
          {row(
            '툴바 화면 고정·드래그 이동',
            layout.mainToolbarFloat,
            () => onChange({ mainToolbarFloat: !layout.mainToolbarFloat }),
            !layout.showMainToolbar
          )}
          {row('— 계정·로그아웃', layout.showGroupAccount, () =>
            onChange({ showGroupAccount: !layout.showGroupAccount }),
            !layout.showMainToolbar
          )}
          {row('— 테마·알람·소리', layout.showGroupThemeAlerts, () =>
            onChange({ showGroupThemeAlerts: !layout.showGroupThemeAlerts }),
            !layout.showMainToolbar
          )}
          {row('— 심볼·검색·즐겨찾기', layout.showGroupSymbol, () =>
            onChange({ showGroupSymbol: !layout.showGroupSymbol }),
            !layout.showMainToolbar
          )}
          {row('— L/S·로딩·접속·재시도', layout.showGroupStatus, () =>
            onChange({ showGroupStatus: !layout.showGroupStatus }),
            !layout.showMainToolbar
          )}
          {row('MTF 신호 줄', layout.showMtfStrip, () => onChange({ showMtfStrip: !layout.showMtfStrip }))}
          {row(
            'MTF 줄 화면 고정·드래그',
            layout.mtfStripFloat,
            () => onChange({ mtfStripFloat: !layout.mtfStripFloat }),
            !layout.showMtfStrip
          )}
          {row('차트 카드 상단 제목·뱃지', layout.showChartCardHeader, () =>
            onChange({ showChartCardHeader: !layout.showChartCardHeader })
          )}
          {row('우측 패널 (AI·탭)', layout.showRightPanel, () =>
            onChange({ showRightPanel: !layout.showRightPanel })
          )}
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
            onClick={resetPositions}
          >
            플로팅 끄기 · 위치 초기화
          </button>
        </div>
      )}
    </>
  );

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(fab, document.body);
}
