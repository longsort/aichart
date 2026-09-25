'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SurgeCoinRow, SurgeCoinScanPack } from '@/lib/surgeCoinScan';
import styles from './SurgeCoinDeskPanel.module.css';

type Props = {
  activeSymbol: string;
  onPickSymbol: (symbol: string) => void;
  onClose?: () => void;
};

type Tab = 'pre' | 'surge';

function fmtPct(n: number): string {
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function fmtVol(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function fmtPx(n: number): string {
  if (!(n > 0)) return '—';
  if (n >= 1000) return n.toFixed(1);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

export function SurgeCoinDeskPanel({ activeSymbol, onPickSymbol, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('pre');
  const [pack, setPack] = useState<SurgeCoinScanPack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (mode: Tab) => {
    setLoading(true);
    setErr(null);
    try {
      const q = mode === 'pre' ? '/api/surge-scan?mode=pre&limit=16' : '/api/surge-scan?limit=20';
      const res = await fetch(q, { cache: 'no-store', credentials: 'same-origin' });
      const j = (await res.json()) as SurgeCoinScanPack & { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) {
        setErr(j.error || '스캔 실패');
        setPack(null);
        return;
      }
      setPack(j);
    } catch {
      setErr('스캔 실패');
      setPack(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
    const id = window.setInterval(() => void load(tab), 50_000);
    return () => window.clearInterval(id);
  }, [load, tab]);

  return (
    <section className={styles.wrap} aria-label="급등·급등전 분석 창구">
      <header className={styles.head}>
        <div>
          <strong className={styles.title}>{tab === 'pre' ? '급등전 창구' : '급등 창구'}</strong>
          <p className={styles.sub}>
            {tab === 'pre'
              ? '아직 안 뛴 종목 · 24h압축 + 15m거래량점화 + 1h정배열. 클릭→통합분석. 확정 아님.'
              : '이미 24h 강한 종목 · 추격 주의. 클릭→통합분석. 승률 아님.'}
          </p>
        </div>
        <div className={styles.headBtns}>
          <button
            type="button"
            className={`${styles.btn}${tab === 'pre' ? ` ${styles.btnOn}` : ''}`}
            onClick={() => setTab('pre')}
          >
            급등전
          </button>
          <button
            type="button"
            className={`${styles.btn}${tab === 'surge' ? ` ${styles.btnOn}` : ''}`}
            onClick={() => setTab('surge')}
          >
            이미급등
          </button>
          <button type="button" className={styles.btn} onClick={() => void load(tab)} disabled={loading}>
            {loading ? '스캔…' : '새로고침'}
          </button>
          {onClose ? (
            <button type="button" className={styles.btn} onClick={onClose}>
              닫기
            </button>
          ) : null}
        </div>
      </header>
      {pack?.summaryKo ? <div className={styles.summary}>{pack.summaryKo}</div> : null}
      {err ? <div className={styles.err}>{err}</div> : null}
      <div className={styles.list}>
        {(pack?.rows ?? []).map((r: SurgeCoinRow, i) => {
          const on = r.symbol === activeSymbol;
          const g = r.grade;
          return (
            <button
              key={r.symbol}
              type="button"
              className={`${styles.row}${on ? ` ${styles.rowOn}` : ''}${
                g === 'A' ? ` ${styles.rowA}` : g === 'B' ? ` ${styles.rowB}` : ''
              }`}
              title={[r.noteKo, r.invalidationKo, r.tfHintKo].filter(Boolean).join(' · ')}
              onClick={() => onPickSymbol(r.symbol)}
            >
              <span className={styles.rank}>{i + 1}</span>
              {g ? <span className={`${styles.grade} ${styles[`grade${g}`]}`}>{g}</span> : <span className={styles.grade} />}
              <span className={styles.sym}>{r.base}</span>
              <span className={styles.pct}>{fmtPct(r.changePct24h)}</span>
              <span className={styles.vs}>BTC{fmtPct(r.vsBtcPct)}</span>
              <span className={styles.vol}>{fmtVol(r.quoteVolUsdt)}</span>
              <span className={styles.px}>{fmtPx(r.last)}</span>
              <span className={styles.note}>
                {(r.tags && r.tags.length ? r.tags.slice(0, 4).join('·') : r.noteKo)
                  + (r.invalidationKo ? ` · ${r.invalidationKo}` : '')}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
