'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { defaultSettings, loadSettings, saveSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';

const helpStyle = { fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 } as const;
const fieldStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '8px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--input-bg, rgba(255,255,255,0.04))',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

export default function TelegramMultiTfCard() {
  const [enabled, setEnabled] = useState(() => loadSettings().telegramMultiTfEnabled);
  const [intervalSec, setIntervalSec] = useState(() => loadSettings().telegramMultiTfIntervalSec ?? 120);
  const [symInput, setSymInput] = useState(() =>
    (loadSettings().telegramMultiTfSymbols?.length
      ? loadSettings().telegramMultiTfSymbols
      : defaultSettings.telegramMultiTfSymbols
    ).join(', ')
  );
  const [tfInput, setTfInput] = useState(() =>
    (loadSettings().telegramMultiTfTimeframes?.length
      ? loadSettings().telegramMultiTfTimeframes
      : defaultSettings.telegramMultiTfTimeframes
    ).join(', ')
  );

  const refreshFromStore = useCallback(() => {
    const s = loadSettings();
    setEnabled(s.telegramMultiTfEnabled);
    setIntervalSec(Math.max(30, Math.min(600, s.telegramMultiTfIntervalSec ?? 120)));
    setSymInput(
      (s.telegramMultiTfSymbols?.length
        ? s.telegramMultiTfSymbols
        : defaultSettings.telegramMultiTfSymbols
      ).join(', ')
    );
    setTfInput(
      (s.telegramMultiTfTimeframes?.length
        ? s.telegramMultiTfTimeframes
        : defaultSettings.telegramMultiTfTimeframes
      ).join(', ')
    );
  }, []);

  useEffect(() => {
    refreshFromStore();
    if (typeof window === 'undefined') return;
    const h = () => refreshFromStore();
    window.addEventListener(SETTINGS_CHANGED_EVENT, h);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, h);
  }, [refreshFromStore]);

  const parseList = (raw: string) =>
    raw
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <div
      className="card panel-pad"
      style={{
        marginBottom: 12,
        border: '1px solid rgba(255,214,102,0.15)',
        background: 'rgba(255,214,102,0.04)',
      }}
    >
      <div className="section-title" style={{ marginTop: 0, fontSize: '0.95rem' }}>
        멀티 TF · 텔레 (백그라운드)
      </div>
      <p style={helpStyle}>
        차트에 켜 둔 TF가 아니라, 아래 심볼·타임프레임 <strong>조합</strong>마다 HTF 자동알림과 동일한 본문(로켓·선행·존팩
        등)으로 텔레을 보냅니다(캡처 없음). BTC/ETH, 1h~1M만 대상.
      </p>
      <p style={{ ...helpStyle, marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)' }}>
        <strong>접속 끊김·24h</strong>에는 브라우저 루프로는 불가합니다. 서버에{' '}
        <code style={{ fontSize: 10 }}>TELEGRAM_MULTITF_CRON_SECRET</code> 설정 후, crontab에서 예:{' '}
        <code style={{ fontSize: 10, wordBreak: 'break-all' }}>
          curl -sS -H &quot;Authorization: Bearer $TELEGRAM_MULTITF_CRON_SECRET&quot; http://127.0.0.1:3000/api/cron/telegram-multi-tf
        </code>
        <br />
        (로그인한 적이 있어 <code style={{ fontSize: 10 }}>data/user-settings.json</code>에 심볼/TF가 동기화돼 있어야 합니다.)
      </p>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const v = e.target.checked;
            setEnabled(v);
            saveSettings({ telegramMultiTfEnabled: v });
          }}
        />
        백그라운드 HTF 멀티 텔레 켜기
      </label>
      <div style={{ marginTop: 10 }}>
        <span className="subtle" style={{ fontSize: 12 }}>
          루프 간격(초) — 심볼×TF 전부 한 번 돈 뒤 이 시간만큼 대기
        </span>
        <input
          type="number"
          min={30}
          max={600}
          step={10}
          value={intervalSec}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            setIntervalSec(n);
          }}
          onBlur={() => {
            const n = Math.max(30, Math.min(600, Math.floor(intervalSec) || 120));
            setIntervalSec(n);
            saveSettings({ telegramMultiTfIntervalSec: n });
          }}
          style={{ ...fieldStyle, maxWidth: 120, marginTop: 4 }}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="subtle" style={{ fontSize: 12 }}>심볼(쉼표 구분)</span>
        <input
          type="text"
          value={symInput}
          onChange={(e) => setSymInput(e.target.value)}
          onBlur={() => {
            const arr = parseList(symInput)
              .map((s) => s.toUpperCase())
              .filter((s) => s.startsWith('BTC') || s.startsWith('ETH'));
            if (arr.length) {
              setSymInput(arr.join(', '));
              saveSettings({ telegramMultiTfSymbols: arr });
            } else {
              setSymInput(defaultSettings.telegramMultiTfSymbols.join(', '));
              saveSettings({ telegramMultiTfSymbols: defaultSettings.telegramMultiTfSymbols });
            }
          }}
          style={fieldStyle}
          autoComplete="off"
          placeholder="BTCUSDT, ETHUSDT"
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="subtle" style={{ fontSize: 12 }}>타임프레임(쉼표 구분)</span>
        <input
          type="text"
          value={tfInput}
          onChange={(e) => setTfInput(e.target.value)}
          onBlur={() => {
            const arr = parseList(tfInput);
            if (arr.length) {
              setTfInput(arr.join(', '));
              saveSettings({ telegramMultiTfTimeframes: arr });
            } else {
              setTfInput(defaultSettings.telegramMultiTfTimeframes.join(', '));
              saveSettings({ telegramMultiTfTimeframes: defaultSettings.telegramMultiTfTimeframes });
            }
          }}
          style={fieldStyle}
          autoComplete="off"
          placeholder="1h, 4h, 1d, 1w, 1M"
        />
      </div>
    </div>
  );
}
