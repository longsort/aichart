'use client';

/**
 * AI기록부 패널 — WAIT/FIRE 동결 + 결과. 기존 카드 삭제 없음.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AI_TRADE_JOURNAL_EVT,
  AI_TRADE_JOURNAL_NAME,
  AI_TRADE_JOURNAL_NAME_EN,
  exportAiTradeJournalBlob,
  listAiTradeJournal,
  summarizeAiTradeJournal,
  type AiJournalRow,
} from '@/lib/eagle1Tapoint/aiTradeJournal';

function pathKo(p: string): string {
  if (p === 'TP') return 'TP먼저';
  if (p === 'SL') return 'SL먼저';
  if (p === 'AMBIGUOUS') return '동일봉모호';
  if (p === 'TIMEOUT') return '시간초과';
  return '미청산';
}

export default function AiTradeJournalPanel() {
  const [rows, setRows] = useState<AiJournalRow[]>([]);
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState('');

  const refresh = () => setRows(listAiTradeJournal(60));

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener(AI_TRADE_JOURNAL_EVT, on);
    return () => window.removeEventListener(AI_TRADE_JOURNAL_EVT, on);
  }, []);

  const sum = useMemo(() => summarizeAiTradeJournal(listAiTradeJournal(2000)), [rows]);

  const download = () => {
    try {
      const blob = new Blob([exportAiTradeJournalBlob()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `AI기록부-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg('AI기록부 JSON 저장됨 · 채팅에 첨부해 보완');
    } catch {
      setMsg('내보내기 실패');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportAiTradeJournalBlob());
      setMsg('AI기록부 복사됨');
    } catch {
      setMsg('복사 실패');
    }
  };

  return (
    <section className="ai-jr" aria-label={AI_TRADE_JOURNAL_NAME}>
      <header className="ai-jr-head">
        <button type="button" className="ai-jr-toggle" onClick={() => setOpen((v) => !v)}>
          <b>{AI_TRADE_JOURNAL_NAME}</b>
          <span>{AI_TRADE_JOURNAL_NAME_EN}</span>
          <em>{open ? '접기' : '펴기'}</em>
        </button>
        <button type="button" onClick={copy}>
          복사
        </button>
        <button type="button" onClick={download}>
          JSON다운
        </button>
      </header>
      {open ? (
        <>
          <p className="ai-jr-note">
            타점엔진 맨 위 · <b>JSON저장</b>이 다운로드입니다 · {sum.noteKo}
          </p>
          <ul className="ai-jr-stats">
            <li>WAIT {sum.waitN}</li>
            <li>FIRE {sum.fireN}</li>
            <li>OPEN {sum.openN}</li>
            <li>TP {sum.tpN}</li>
            <li>SL {sum.slN}</li>
            <li>모호 {sum.ambN}</li>
            <li>{sum.sampleLabel}</li>
          </ul>
          {sum.waitTop.length ? (
            <p className="ai-jr-wait">
              대기원인 {sum.waitTop.map((w) => `${w.reason} ${w.n}`).join(' · ')}
            </p>
          ) : (
            <p className="ai-jr-wait">아직 기록 없음 · 차트 갱신되면 WAIT/FIRE가 쌓입니다</p>
          )}
          <div className="ai-jr-list">
            {rows.slice(0, 24).map((r) => (
              <div key={r.id} className={`ai-jr-row is-${r.frozen.kind.toLowerCase()}`}>
                <b>
                  {r.frozen.lane} {r.frozen.kind}
                </b>
                <span>
                  {r.symbol} {r.timeframe} {r.frozen.direction || '—'} {r.frozen.grade}
                </span>
                <em>
                  {r.frozen.kind === 'FIRE'
                    ? `${pathKo(r.outcome.path)} · ${r.mode}`
                    : r.frozen.waitReason}
                </em>
                <small>{r.frozen.whyKo || r.frozen.reasonKo}</small>
              </div>
            ))}
          </div>
          {msg ? <p className="ai-jr-msg">{msg}</p> : null}
        </>
      ) : null}
      <style jsx>{`
        .ai-jr {
          margin: 6px 0 8px;
          padding: 7px 8px;
          border-radius: 8px;
          border: 1px solid rgba(125, 211, 252, 0.28);
          background: rgba(8, 47, 73, 0.28);
          color: #e2e8f0;
          font-size: 11px;
        }
        .ai-jr-head {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .ai-jr-toggle {
          flex: 1;
          display: flex;
          gap: 8px;
          align-items: baseline;
          background: transparent;
          border: 0;
          color: inherit;
          cursor: pointer;
          text-align: left;
          padding: 0;
        }
        .ai-jr-toggle b {
          color: #e0f2fe;
          letter-spacing: 0.04em;
        }
        .ai-jr-toggle span {
          color: #7dd3fc;
          font-size: 10px;
        }
        .ai-jr-toggle em {
          margin-left: auto;
          font-style: normal;
          color: #94a3b8;
        }
        .ai-jr-head button:not(.ai-jr-toggle) {
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.7);
          color: #cbd5e1;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 10px;
          cursor: pointer;
        }
        .ai-jr-note,
        .ai-jr-wait,
        .ai-jr-msg {
          margin: 6px 0 0;
          color: #94a3b8;
          line-height: 1.45;
        }
        .ai-jr-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
          color: #cbd5e1;
        }
        .ai-jr-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 6px;
          max-height: 220px;
          overflow: auto;
        }
        .ai-jr-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 8px;
          padding: 4px 6px;
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.55);
        }
        .ai-jr-row.is-fire {
          border-left: 2px solid #38bdf8;
        }
        .ai-jr-row.is-wait {
          border-left: 2px solid #64748b;
        }
        .ai-jr-row b {
          color: #f8fafc;
        }
        .ai-jr-row small {
          flex: 1 1 100%;
          color: #94a3b8;
        }
      `}</style>
    </section>
  );
}
