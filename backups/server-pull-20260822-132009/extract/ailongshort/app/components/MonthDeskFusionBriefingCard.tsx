'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import type { MtfSignalBoardDigest } from '@/lib/mtfSignalBoardDigest';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';
import { composeMonthDeskGptUserPrompt, type MonthDeskFusionMtfRow } from '@/lib/monthDeskFusionBriefing';

type Props = {
  symbol: string;
  chartTimeframe: string;
  analysis: AnalyzeResponse | null;
  chartVerdictValidation: MonthDeskVerdictValidationSummary | null;
  mtfSignals: MonthDeskFusionMtfRow[];
  mtfBoardStickyByTf: Record<string, MtfSignalBoardDigest>;
  /** AI 대화 패널 `triggerSendMessage`에 연결 */
  onRequestGptBriefing: (userMessage: string) => void;
};

export default function MonthDeskFusionBriefingCard({
  symbol,
  chartTimeframe,
  analysis,
  chartVerdictValidation,
  mtfSignals,
  mtfBoardStickyByTf,
  onRequestGptBriefing,
}: Props) {
  const { board: closeBoard, loading: closeLoading, error: closeError, reload: reloadClose } = useTfCloseSettleBoard(
    symbol,
    true,
  );
  const [copied, setCopied] = useState(false);

  const gptPayload = useMemo(
    () =>
      composeMonthDeskGptUserPrompt({
        analysis,
        chartTf: chartTimeframe,
        verdict: chartVerdictValidation,
        mtfSignals,
        mtfBoardStickyByTf,
        closeSettleBoard: closeBoard,
      }),
    [analysis, chartTimeframe, chartVerdictValidation, mtfSignals, mtfBoardStickyByTf, closeBoard],
  );

  const previewLines = useMemo(() => gptPayload.split('\n').slice(0, 18), [gptPayload]);

  const sendGpt = () => {
    onRequestGptBriefing(gptPayload);
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(gptPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,27,75,0.55))',
        border: '1px solid rgba(129,140,248,0.35)',
        boxShadow: '0 0 28px -12px rgba(99,102,241,0.45)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#e0e7ff' }}>마감·안착 통합 브리핑</div>
          <div style={{ fontSize: 10, color: '#a5b4fc', marginTop: 4, lineHeight: 1.45, maxWidth: 520 }}>
            엔진 공통 컨텍스트 + MTF(15m~1M) + 마감존 표 + 안착 검증·선행·AI융합·ZONE 등을 한 메시지로 묶습니다. 우측{' '}
            <strong>AI 대화</strong>에서 GPT가 읽을 수 있게 전송합니다.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button type="button" className="tool-chip tool-chip-button tool-chip-active" style={{ fontSize: 11, fontWeight: 800 }} onClick={sendGpt} title="우측 AI 대화로 전체 컨텍스트 전송">
            GPT로 브리핑 요청
          </button>
          <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => void copyPayload()}>
            {copied ? '복사됨' : '프롬프트 복사'}
          </button>
          <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => void reloadClose(true)} disabled={closeLoading}>
            {closeLoading ? '마감표…' : '마감표 새로고침'}
          </button>
        </div>
      </div>

      {analysis && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(15,23,42,0.65)',
            border: '1px solid rgba(148,163,184,0.22)',
            fontSize: 11,
            color: '#e2e8f0',
          }}
        >
          <span style={{ fontWeight: 800, color: '#fde68a' }}>{analysis.verdict}</span>
          <span style={{ color: '#94a3b8' }}>신뢰도 {analysis.confidence ?? '-'}%</span>
          {analysis.entry != null && <span>진입 {String(analysis.entry)}</span>}
          {analysis.stopLoss != null && <span>SL {String(analysis.stopLoss)}</span>}
          {Array.isArray(analysis.targets) && analysis.targets.length > 0 && (
            <span style={{ color: '#cbd5e1' }}>TP {analysis.targets.slice(0, 3).map(String).join(' / ')}</span>
          )}
        </div>
      )}

      {closeError && (
        <div style={{ fontSize: 10, color: '#fca5a5', marginBottom: 8 }}>{closeError}</div>
      )}

      <div
        style={{
          maxHeight: 200,
          overflow: 'auto',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(2,6,23,0.75)',
          border: '1px solid rgba(51,65,85,0.5)',
          fontSize: 9,
          lineHeight: 1.5,
          color: '#94a3b8',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {previewLines.join('\n')}
        {gptPayload.split('\n').length > 18 ? '\n… (전체는 GPT 전송 시 포함)' : ''}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 9, color: '#64748b', lineHeight: 1.45 }}>
        OpenAI 키·브리핑 로그인은 우측 AI 대화 카드에서 설정하세요. 전송 시 차트 스냅샷 포함 여부는 AI 카드의 옵션을 따릅니다.
      </p>
    </div>
  );
}
