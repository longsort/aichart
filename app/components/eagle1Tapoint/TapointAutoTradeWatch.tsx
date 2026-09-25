'use client';

import type { ServerArmHealthSnap } from '@/lib/mergedDeskServerArmClient';
import type { AutoTradeCoinWatch } from '@/lib/serverMergedDeskAutoTradeStore';

const FALLBACK: AutoTradeCoinWatch[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'].map((coin) => ({
  symbol: `${coin}USDT`,
  coin,
  tone: 'wait',
  lineKo: '아직 기록 없음',
}));

function verdictOf(health: ServerArmHealthSnap | null): { text: string; tone: string } {
  if (!health) return { text: '자동매매 상태 확인 중', tone: 'wait' };
  if (!health.ok) return { text: '서버 확인 실패', tone: 'bad' };
  if (!health.arm?.liveArmed) return { text: '자동매매 꺼짐', tone: 'off' };
  const age = health.tickAgeSec;
  if (age == null) return { text: '서버가 아직 한 번도 안 돌았음', tone: 'bad' };
  if (age >= 200) {
    const min = Math.max(1, Math.round(age / 60));
    return { text: `서버가 ${min}분째 안 돔`, tone: 'bad' };
  }
  return {
    text: health.arm.watchBoard?.verdictKo || '자동매매 동작 중',
    tone: 'on',
  };
}

/** 타점 화면 — 자동매매가 도는지, 코인마다 왜 진입이 없는지 */
export function TapointAutoTradeWatch({ health }: { health: ServerArmHealthSnap | null }) {
  const verdict = verdictOf(health);
  const coins =
    health?.arm?.watchBoard?.coins && health.arm.watchBoard.coins.length > 0
      ? health.arm.watchBoard.coins
      : FALLBACK;
  const age = health?.tickAgeSec;
  const ageKo =
    age == null ? '' : age < 90 ? `${age}초 전 확인` : `${Math.max(1, Math.round(age / 60))}분 전 확인`;

  return (
    <section className={`vmax-auto-watch is-${verdict.tone}`} aria-label="자동매매 동작 상태">
      <div className="vmax-auto-watch-head">
        <b>{verdict.text}</b>
        {ageKo ? <span>{ageKo}</span> : null}
      </div>
      <div className="vmax-auto-watch-row">
        {coins.map((c) => (
          <div key={c.symbol} className={`vmax-auto-watch-coin is-${c.tone}`}>
            <b>{c.coin}</b>
            <span>{c.lineKo}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .vmax-auto-watch {
          margin: 0 0 8px;
          padding: 8px 10px;
          border: 1px solid #1e3a5f;
          border-radius: 8px;
          background: #071018;
        }
        .vmax-auto-watch.is-on {
          border-color: #14532d;
        }
        .vmax-auto-watch.is-bad,
        .vmax-auto-watch.is-off {
          border-color: #7f1d1d;
        }
        .vmax-auto-watch-head {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          align-items: baseline;
          margin-bottom: 6px;
        }
        .vmax-auto-watch-head b {
          color: #e2e8f0;
          font-size: 13px;
        }
        .vmax-auto-watch.is-on .vmax-auto-watch-head b {
          color: #bbf7d0;
        }
        .vmax-auto-watch.is-bad .vmax-auto-watch-head b,
        .vmax-auto-watch.is-off .vmax-auto-watch-head b {
          color: #fecaca;
        }
        .vmax-auto-watch-head span {
          color: #94a3b8;
          font-size: 11px;
        }
        .vmax-auto-watch-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .vmax-auto-watch-coin {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 148px;
          flex: 1 1 148px;
          padding: 6px 8px;
          border-radius: 6px;
          background: #0c1726;
          border: 1px solid #1e293b;
        }
        .vmax-auto-watch-coin b {
          font-size: 12px;
          color: #e2e8f0;
        }
        .vmax-auto-watch-coin span {
          font-size: 11px;
          line-height: 1.35;
          color: #94a3b8;
        }
        .vmax-auto-watch-coin.is-ready {
          border-color: #166534;
        }
        .vmax-auto-watch-coin.is-ready b {
          color: #86efac;
        }
        .vmax-auto-watch-coin.is-hold b {
          color: #fcd34d;
        }
        .vmax-auto-watch-coin.is-in b {
          color: #7dd3fc;
        }
        .vmax-auto-watch-coin.is-bad b {
          color: #fca5a5;
        }
      `}</style>
    </section>
  );
}
