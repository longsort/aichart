'use client';

import { useState, useRef, useEffect } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { ChartSnapshotRef } from './ChartView';
import { buildBriefingContext } from '@/lib/briefingContext';

const STORAGE_KEY = 'ailongshort-ai-chat-history';
const MAX_HISTORY = 20;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  usage?: {
    provider: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  dual?: { gpt: string; gemini: string; difference: string };
};

type Model = 'gpt' | 'gemini' | 'dual';

export default function AIChatPanel({
  analysis,
  symbol,
  timeframe,
  chartSnapshotRef,
  triggerSendMessage,
  onTriggerSendConsumed,
}: {
  analysis: AnalyzeResponse | null;
  symbol: string;
  timeframe: string;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  triggerSendMessage?: string;
  onTriggerSendConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<Model>('gpt');
  const [includeChartImage, setIncludeChartImage] = useState(true);
  const [useStreaming, setUseStreaming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ openai: boolean; gemini: boolean }>({ openai: false, gemini: false });
  type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';
  const [testOpenai, setTestOpenai] = useState<TestStatus>('idle');
  const [testGemini, setTestGemini] = useState<TestStatus>('idle');
  const [testErrorOpenai, setTestErrorOpenai] = useState<string | null>(null);
  const [testErrorGemini, setTestErrorGemini] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(msg?: string) => void>(() => {});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    fetch('/api/chat-keys').then(r => r.json()).then(setKeys).catch(() => {});
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {}
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (triggerSendMessage?.trim()) {
      sendRef.current(triggerSendMessage.trim());
      onTriggerSendConsumed?.();
    }
  }, [triggerSendMessage, onTriggerSendConsumed]);

  const hasKeyForModel =
    (model === 'gpt' && keys.openai) ||
    (model === 'gemini' && keys.gemini) ||
    (model === 'dual' && keys.openai && keys.gemini);

  const runTest = async (provider: 'openai' | 'gemini') => {
    if (provider === 'openai') {
      setTestOpenai('testing');
      setTestErrorOpenai(null);
    } else {
      setTestGemini('testing');
      setTestErrorGemini(null);
    }
    try {
      const res = await fetch(`/api/chat-test?provider=${provider}`);
      const data = await res.json();
      if (data.ok) {
        if (provider === 'openai') setTestOpenai('ok');
        else setTestGemini('ok');
      } else {
        if (provider === 'openai') {
          setTestOpenai('fail');
          setTestErrorOpenai(data.error || '연결 실패');
        } else {
          setTestGemini('fail');
          setTestErrorGemini(data.error || '연결 실패');
        }
      }
    } catch {
      if (provider === 'openai') {
        setTestOpenai('fail');
        setTestErrorOpenai('네트워크 오류');
      } else {
        setTestGemini('fail');
        setTestErrorGemini('네트워크 오류');
      }
    }
  };

  const send = async (overrideMessage?: string) => {
    const text = (overrideMessage ?? input.trim()).trim();
    if (!text || loading || !hasKeyForModel) return;
    if (!overrideMessage) setInput('');
    setError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const briefingContext = analysis
      ? ((analysis as any).briefingContext ?? buildBriefingContext(analysis as Parameters<typeof buildBriefingContext>[0]))
      : null;
    const chartImage = includeChartImage ? (chartSnapshotRef?.current?.getSnapshot?.() ?? null) : null;
    const recentMessages = messages
      .map(m => ({ role: m.role, content: m.content }))
      .slice(-10);

    try {
      const endpoint =
        model === 'gpt' ? '/api/chat' : model === 'gemini' ? '/api/chat-gemini' : '/api/chat-dual';
      const streamRequest = (model === 'gpt' || model === 'gemini') && useStreaming && model === 'gpt';
      const body = {
        message: text,
        symbol,
        timeframe,
        engine: briefingContext,
        analysisResult: analysis ?? undefined,
        includeChartContext: true,
        chartImage,
        recentMessages,
        ...(streamRequest ? { stream: true } : {}),
      };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const contentType = res.headers.get('content-type') || '';

      if (streamRequest && res.ok && res.body && contentType.includes('ndjson')) {
        const assistantId = `a-${Date.now()}`;
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', at: new Date().toISOString() }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let content = '';
        let usage: ChatMessage['usage'];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value, { stream: true }).split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line);
              if (j.text) {
                content += j.text;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content } : m));
              }
              if (j.usage) usage = j.usage;
            } catch {}
          }
        }
        if (usage) setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, usage } : m));
        setLoading(false);
        return;
      }

      const rawText = await res.text();
      if (!contentType.includes('application/json')) {
        throw new Error(`API returned non-JSON: ${rawText.slice(0, 200)}`);
      }
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error(`API returned non-JSON: ${rawText.slice(0, 200)}`);
      }
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error || '요청 실패';
        const err: Error & { missingKey?: string } = new Error(errMsg);
        if ((data as { missingKey?: string }).missingKey) err.missingKey = (data as { missingKey?: string }).missingKey;
        throw err;
      }

      const d = data as { gpt?: string; gemini?: string; consensus?: string; reply?: string; difference?: string; usage?: { gpt?: ChatMessage['usage']; gemini?: ChatMessage['usage'] } };
      if (model === 'dual' && d.gpt != null) {
        const gptFail = d.gpt === '(실패)' || !d.gpt;
        const geminiFail = d.gemini === '(실패)' || !d.gemini;
        let fallbackNote = '';
        if (gptFail && !geminiFail) fallbackNote = ' (Gemini만 응답)';
        else if (!gptFail && geminiFail) fallbackNote = ' (GPT만 응답)';
        else if (gptFail && geminiFail) fallbackNote = ' (둘 다 실패)';
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: (d.consensus || d.reply) + fallbackNote,
          at: new Date().toISOString(),
          dual: { gpt: d.gpt, gemini: d.gemini, difference: d.difference || '' },
          usage: d.usage?.gpt || d.usage?.gemini
            ? {
                provider: 'Dual',
                inputTokens: (d.usage?.gpt?.inputTokens || 0) + (d.usage?.gemini?.inputTokens || 0),
                outputTokens: (d.usage?.gpt?.outputTokens || 0) + (d.usage?.gemini?.outputTokens || 0),
                estimatedCost: (d.usage?.gpt?.estimatedCost || 0) + (d.usage?.gemini?.estimatedCost || 0),
              }
            : undefined,
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: (d.reply as string) || '',
          at: new Date().toISOString(),
          usage: d.usage as ChatMessage['usage'],
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e: any) {
      const msg = e?.message || '오류';
      const friendly = msg.includes('429') || msg.includes('한도 초과') ? '요청 한도 초과, 잠시 후 재시도' : msg;
      const keyHint = e?.missingKey ? ` (누락된 키: ${e.missingKey})` : '';
      setError(friendly + keyHint);
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `오류: ${friendly}${keyHint}`,
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { sendRef.current = send; }, [send]);

  return (
    <div className="card panel-pad">
      <div className="section-title">AI Chat</div>
      <div className="select-row" style={{ marginTop: 8 }}>
        {(['gpt', 'gemini', 'dual'] as const).map(m => (
          <button
            key={m}
            type="button"
            className={`tool-chip tool-chip-button ${model === m ? 'tool-chip-active' : ''}`}
            onClick={() => setModel(m)}
          >
            {m === 'gpt' ? (keys.openai ? 'GPT' : 'GPT (not set)') : m === 'gemini' ? (keys.gemini ? 'Gemini' : 'Gemini (not set)') : (keys.openai && keys.gemini ? 'Dual' : 'Dual (key missing)')}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={includeChartImage} onChange={e => setIncludeChartImage(e.target.checked)} />
        <span>차트 이미지 포함</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={useStreaming} onChange={e => setUseStreaming(e.target.checked)} />
        <span>스트리밍 (GPT)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span className="subtle" style={{ fontSize: 12 }}>연결 테스트:</span>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => runTest('openai')}
          disabled={testOpenai === 'testing'}
          title="OpenAI API 연결 확인"
        >
          GPT 테스트
        </button>
        {testOpenai === 'testing' && <span className="subtle" style={{ fontSize: 11 }}>테스트 중…</span>}
        {testOpenai === 'ok' && <span style={{ fontSize: 11, color: 'var(--accent)' }}>연결됨</span>}
        {testOpenai === 'fail' && testErrorOpenai && <span style={{ fontSize: 11, color: '#ff7b7b' }}>{testErrorOpenai}</span>}
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => runTest('gemini')}
          disabled={testGemini === 'testing'}
          title="Gemini API 연결 확인"
        >
          Gemini 테스트
        </button>
        {testGemini === 'testing' && <span className="subtle" style={{ fontSize: 11 }}>테스트 중…</span>}
        {testGemini === 'ok' && <span style={{ fontSize: 11, color: 'var(--accent)' }}>연결됨</span>}
        {testGemini === 'fail' && testErrorGemini && <span style={{ fontSize: 11, color: '#ff7b7b' }}>{testErrorGemini}</span>}
      </div>
      <div
        ref={listRef}
        className="chat-messages"
        style={{
          minHeight: 160,
          maxHeight: 280,
          overflowY: 'auto',
          marginTop: 10,
          padding: 8,
          background: 'var(--panel2)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        {messages.length === 0 && (
          <div className="subtle" style={{ fontSize: 12 }}>메시지를 입력해 보세요. 차트 문맥이 자동으로 포함됩니다.</div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              marginBottom: 10,
              textAlign: m.role === 'user' ? 'right' : 'left',
            }}
          >
            <div
              style={{
                display: 'inline-block',
                maxWidth: '90%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? 'rgba(98,239,224,0.15)' : 'var(--panel)',
                border: '1px solid var(--border)',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.content}
            </div>
            {m.usage && (
              <div className="subtle" style={{ fontSize: 10, marginTop: 4 }}>
                {m.usage.provider} · in {m.usage.inputTokens} · out {m.usage.outputTokens} · $
                {m.usage.estimatedCost.toFixed(4)}
                {m.usage.provider === 'Dual' && m.usage.estimatedCost > 0 && (
                  <span style={{ marginLeft: 6 }}> (총 비용 ${m.usage.estimatedCost.toFixed(4)})</span>
                )}
              </div>
            )}
            {m.dual && (
              <details style={{ marginTop: 6, fontSize: 11 }}>
                <summary className="subtle">GPT vs Gemini</summary>
                <div style={{ marginTop: 4 }}><strong>GPT:</strong> {m.dual.gpt.slice(0, 150)}…</div>
                <div style={{ marginTop: 2 }}><strong>Gemini:</strong> {m.dual.gemini.slice(0, 150)}…</div>
                <div className="subtle" style={{ marginTop: 2 }}>차이: {m.dual.difference?.slice(0, 100)}…</div>
              </details>
            )}
          </div>
        ))}
      </div>
      {error && <div className="subtle" style={{ color: '#ff7b7b', fontSize: 11, marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={!hasKeyForModel ? 'API 키를 설정한 뒤 사용하세요' : '질문 입력...'}
          className="select-pill"
          style={{ flex: 1 }}
          disabled={loading || !hasKeyForModel}
        />
        <button type="button" className="tool-chip tool-chip-button" onClick={() => send()} disabled={loading || !input.trim() || !hasKeyForModel}>
          {loading ? '전송 중' : '전송'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => send('현재 구조 브리핑해줘')}
          disabled={loading}
        >
          브리핑 요청
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          disabled={messages.length === 0}
        >
          내보내기
        </button>
      </div>
    </div>
  );
}
