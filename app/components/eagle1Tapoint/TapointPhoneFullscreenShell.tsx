/**
 * 타점엔진 — 폰 전체화면 A/B 전용 UI.
 * 전뷰·데스크톱은 건드리지 않음. 스케치: 게이지(2×6) · 차트 · 팩터접기.
 * 라벨 색: 대기=노랑 · 롱=초록 · 숏=빨강. 더블클릭/더블탭=설명.
 */
'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { SignalLiveRow } from '@/lib/eagle1Tapoint/signalLiveBriefing';
import type { TapointPhoneFsMode } from '@/lib/eagle1Tapoint/phoneFullscreenPrefs';

export type FsGaugeKind = 'wait' | 'long' | 'short';

export function tapointFsGaugeKind(row: Pick<SignalLiveRow, 'dirBadge' | 'tone'>): FsGaugeKind {
  if (row.dirBadge === '롱' || row.tone === 'long') return 'long';
  if (row.dirBadge === '숏' || row.tone === 'short') return 'short';
  return 'wait';
}

export const FS_GAUGE_COLOR: Record<FsGaugeKind, string> = {
  wait: '#eab308',
  long: '#22c55e',
  short: '#ef4444',
};

export const FS_GAUGE_LABEL_COLOR: Record<FsGaugeKind, string> = {
  wait: '#fbbf24',
  long: '#4ade80',
  short: '#f87171',
};

export function tapointFsShortLabel(name: string): string {
  const n = String(name || '').replace(/\s+/g, '');
  if (!n) return '—';
  if (n.length <= 4) return n;
  if (n.includes('타점')) return '타점';
  if (n.includes('스윕') && (n.includes('HTF') || n.includes('상위'))) return 'HTF';
  if (n.includes('스윕')) return '스윕';
  if (n.includes('RSI') || n.includes('캔들')) return 'RSI';
  if (n.includes('볼륨') || n.includes('폭발')) return '폭발';
  if (n.includes('선진')) return '선진';
  if (n.includes('일봉')) return '일봉';
  if (n.includes('게이트')) return '게이트';
  if (n.includes('이벤트')) return '이벤트';
  if (n.includes('흐름') || n.includes('셋업')) return '흐름';
  if (n.includes('표본')) return '표본';
  if (n.includes('자동')) return '자동';
  return n.slice(0, 4);
}

const PAD_ROW: SignalLiveRow = {
  id: 'pad',
  emoji: '·',
  name: '—',
  statusKo: '',
  briefKo: '',
  dirBadge: '대기',
  value: 0,
  tone: 'wait',
  pulse: false,
};

export function padTapointFsGauges(rows: SignalLiveRow[] | null | undefined, n = 12): SignalLiveRow[] {
  const src = Array.isArray(rows) ? rows : [];
  const out = src.slice(0, n);
  while (out.length < n) {
    out.push({ ...PAD_ROW, id: `pad-${out.length}` });
  }
  return out;
}

type HelpState = {
  name: string;
  dirBadge: string;
  statusKo: string;
  briefKo: string;
  kind: FsGaugeKind;
  value: number;
};

type Props = {
  mode: Exclude<TapointPhoneFsMode, 'off'>;
  factorOpen: boolean;
  gauges: SignalLiveRow[];
  /** 확정롱/숏 전환 플래시 (타점 게이지) */
  confirmFlash?: boolean;
  confirmFlashSide?: 'LONG' | 'SHORT' | null;
  /** 컴퓨터(전뷰)와 동일 팩터 UI */
  factorsNode: ReactNode;
  chart: ReactNode;
  /** 전체화면 A · 신호감지(게이지) 위 분봉 칩 */
  tfBar?: ReactNode;
  onMode: (m: TapointPhoneFsMode) => void;
  onToggleFactor: () => void;
};

export default function TapointPhoneFullscreenShell({
  mode,
  factorOpen,
  gauges,
  confirmFlash = false,
  confirmFlashSide = null,
  factorsNode,
  chart,
  tfBar,
  onMode,
  onToggleFactor,
}: Props) {
  const slots = padTapointFsGauges(gauges, 12);
  const row1 = slots.slice(0, 6);
  const row2 = slots.slice(6, 12);
  const [help, setHelp] = useState<HelpState | null>(null);
  const lastTapRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });

  const openHelp = useCallback((g: SignalLiveRow) => {
    if (!g?.id || String(g.id).startsWith('pad')) return;
    setHelp({
      name: String(g.name || '—'),
      dirBadge: String(g.dirBadge || '대기'),
      statusKo: String(g.statusKo || '—'),
      briefKo: String(g.briefKo || '설명 없음'),
      kind: tapointFsGaugeKind(g),
      value: Number(g.value) || 0,
    });
  }, []);

  const onGaugeActivate = useCallback(
    (g: SignalLiveRow, via: 'dblclick' | 'tap') => {
      if (via === 'dblclick') {
        openHelp(g);
        return;
      }
      const now = Date.now();
      const prev = lastTapRef.current;
      if (prev.id === g.id && now - prev.t < 380) {
        openHelp(g);
        lastTapRef.current = { id: '', t: 0 };
      } else {
        lastTapRef.current = { id: g.id, t: now };
      }
    },
    [openHelp]
  );

  return (
    <div
      className={`vmax-fs-shell is-mode-${mode}${factorOpen ? ' is-factor-open' : ' is-factor-fold'}`}
      role="dialog"
      aria-label={`전체화면 ${mode}`}
    >
      <div className="vmax-fs-bar" role="toolbar" aria-label="전체화면 모드">
        <button
          type="button"
          className={`vmax-fs-chip${mode === 'A' ? ' on' : ''}`}
          onClick={() => onMode('A')}
        >
          A
        </button>
        <button
          type="button"
          className={`vmax-fs-chip${mode === 'B' ? ' on' : ''}`}
          onClick={() => onMode('B')}
        >
          B
        </button>
        <button type="button" className="vmax-fs-chip" onClick={() => onMode('off')} title="전뷰">
          X
        </button>
        <span className="vmax-fs-hint">라벨 더블클릭=설명</span>
      </div>

      {tfBar ? (
        <div className="vmax-fs-tfs" aria-label="차트 분봉">
          {tfBar}
        </div>
      ) : null}

      <div className="vmax-fs-gauges" aria-label="신호감지">
        {[row1, row2].map((row, ri) => (
          <div key={ri} className="vmax-fs-gauge-row">
            <div className="vmax-fs-gauge-rings">
              {row.map((g) => {
                const kind = tapointFsGaugeKind(g);
                const color = FS_GAUGE_COLOR[kind];
                const labelColor = FS_GAUGE_LABEL_COLOR[kind];
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`vmax-fs-gauge tone-${kind}${g.pulse ? ' is-pulse' : ''}${
                      confirmFlash && g.id === 'decision'
                        ? ` is-confirm-flash${confirmFlashSide === 'SHORT' ? ' is-short' : ' is-long'}`
                        : ''
                    }`}
                    title={`${g.name} · ${g.dirBadge} · ${g.value} · 더블클릭 설명`}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      onGaugeActivate(g, 'dblclick');
                    }}
                    onClick={() => onGaugeActivate(g, 'tap')}
                  >
                    <div
                      className="vmax-fs-gauge-ring"
                      style={{
                        background: `conic-gradient(${color} ${Math.max(0, Math.min(100, g.value))}%, #1e293b 0)`,
                      }}
                    >
                      <span>{g.value || '—'}</span>
                    </div>
                    <em style={{ color: labelColor }}>{tapointFsShortLabel(g.name)}</em>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="vmax-fs-chart">{chart}</div>

      <div className="vmax-fs-factor">
        <button type="button" className="vmax-fs-factor-tog" onClick={onToggleFactor}>
          팩터체크리스트 {factorOpen ? '▴ 접기' : '▾ 펴기'}
        </button>
        {/**
         * 조건부 마운트 금지 — 펼침 시 첫 마운트+차트 리사이즈가 겹치면
         * LWC/하위 렌더에서 undefined.slice 로 페이지가 죽을 수 있음.
         * CSS로만 접기/펴기.
         */}
        <div
          className="vmax-fs-factor-body"
          hidden={!factorOpen}
          aria-hidden={!factorOpen}
          style={
            factorOpen
              ? undefined
              : { display: 'none', maxHeight: 0, padding: 0, overflow: 'hidden' }
          }
        >
          {factorsNode}
        </div>
      </div>

      {help ? (
        <div
          className="vmax-fs-help"
          role="dialog"
          aria-label={`${help.name} 설명`}
          onClick={() => setHelp(null)}
        >
          <div
            className={`vmax-fs-help-card tone-${help.kind}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <strong>{help.name}</strong>
              <span>
                {help.dirBadge} · {help.value}
              </span>
              <button type="button" onClick={() => setHelp(null)} aria-label="닫기">
                ×
              </button>
            </header>
            <p className="vmax-fs-help-status">{help.statusKo}</p>
            <p className="vmax-fs-help-brief">{help.briefKo}</p>
            <p className="vmax-fs-help-note">
              확정 승률·확정 수익 아님 · 합류·게이트 참고용
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
