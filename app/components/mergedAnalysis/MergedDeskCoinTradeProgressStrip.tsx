'use client';



/**

 * 코인매매진행 — Dual코어4 + 신호B(로켓·장바·하락·번개) 분리게이지.

 * 백그라운드 레이스 진입(차트TF 무관) · 확정 수익·승률 아님.

 */

import { useEffect, useMemo, useRef, useState } from 'react';

import deskCss from './MergedAnalysisDesk.module.css';

import {

  COIN_PROGRESS_EVENT,

  gaugeSlots,

  gaugeSignalSlots,

  readCoinTradeProgressBoard,

  scanAllCoinTradeProgress,

  type CoinTradeProgressRow,

} from '@/lib/mergedDeskCoinTradeProgress';

import {

  isAutoTradeSymbolEnabled,

  readAutoTradeConfig,

} from '@/lib/mergedDeskAutoTradeConfig';

import { tickDualBgRaceEntries } from '@/lib/mergedDeskDualBgRaceEntry';



const styles: Record<string, string> = (() => {

  const m = deskCss as Record<string, string> & { default?: Record<string, string> };

  if (!m || typeof m !== 'object') return {};

  if (m.default && typeof m.default === 'object') return m.default;

  return m as Record<string, string>;

})();



function statusTone(s: CoinTradeProgressRow['status']): 'wait' | 'ready' | 'block' {

  if (s === '진입가능') return 'ready';

  if (s === '차단') return 'block';

  return 'wait';

}



function dirKo(d: CoinTradeProgressRow['direction']): string {

  if (d === 'LONG') return '롱';

  if (d === 'SHORT') return '숏';

  return '—';

}



export default function MergedDeskCoinTradeProgressStrip() {

  const [tick, setTick] = useState(0);

  const [scanKo, setScanKo] = useState('전체스캔대기');

  const [pulseKey, setPulseKey] = useState(0);

  const prevPass = useRef<Record<string, number>>({});



  useEffect(() => {

    const bump = () => setTick((n) => n + 1);

    window.addEventListener(COIN_PROGRESS_EVENT, bump);

    const id = window.setInterval(bump, 4_000);

    return () => {

      window.removeEventListener(COIN_PROGRESS_EVENT, bump);

      window.clearInterval(id);

    };

  }, []);



  /** Dual 4코인 백그라운드 프로브 — 주문 없음 · 엔진OFF여도 게이지 확인용 스캔 */

  useEffect(() => {

    let cancelled = false;

    const run = async () => {

      const cfg = readAutoTradeConfig();

      const enabled = (cfg.enabledSymbols || []).filter((s) =>

        isAutoTradeSymbolEnabled(cfg, s)

      );

      if (!cancelled) setScanKo('전체스캔중…');

      try {

        const r = await scanAllCoinTradeProgress({

          leverage: cfg.leverage || 40,

          minRr: cfg.minRr || 1.2,

          scalpMode: cfg.autoTradeScalpMode || 'FAST',

          enabledSymbols: enabled.length ? enabled : null,

          timeframe: undefined,

        });

        if (!cancelled) {

          const board = readCoinTradeProgressBoard();

          let filled = false;

          for (const row of board.rows) {

            const prev = prevPass.current[row.coin] ?? -1;

            const score = row.passN * 10 + row.signalPassN;

            if (score > prev && score > 0) filled = true;

            prevPass.current[row.coin] = score;

          }

          if (filled) setPulseKey((k) => k + 1);

          setScanKo(

            r.scanned > 0

              ? `전체스캔 ${r.scanned}코인 · 진입가능 ${r.ready}${

                  cfg.enabled || cfg.liveArmed ? '' : ' · 엔진OFF(게이지만)'

                }`

              : '전체스캔 · 캔들대기'

          );

          setTick((n) => n + 1);

        }

      } catch (e) {

        if (!cancelled) {

          setScanKo(

            `스캔실패 · ${e instanceof Error ? e.message.slice(0, 40) : 'network'}`

          );

        }

      }

    };

    void run();

    const clear = window.setInterval(() => void run(), 10_000);

    return () => {

      cancelled = true;

      window.clearInterval(clear);

    };

  }, []);



  /** 엔진ON · 차트TF(4h등) 무관 · Dual 레이스 실진입 */

  useEffect(() => {

    let cancelled = false;

    const run = async () => {

      const cfg = readAutoTradeConfig();

      if (!(cfg.enabled || cfg.liveArmed)) return;

      try {

        const r = await tickDualBgRaceEntries({ cfg });

        if (!cancelled && (r.tried > 0 || /선도착|진입|주문/.test(r.statusKo))) {

          setScanKo((prev) => `${prev} · ${r.statusKo}`);

          setTick((n) => n + 1);

        }

      } catch {

        /* ignore */

      }

    };

    void run();

    const clear = window.setInterval(() => void run(), 12_000);

    return () => {

      cancelled = true;

      window.clearInterval(clear);

    };

  }, []);



  const board = useMemo(() => {

    void tick;

    return readCoinTradeProgressBoard();

  }, [tick]);



  return (

    <div className={styles.coinProgressPanel} data-pulse={pulseKey}>

      <div className={styles.coinProgressHead}>

        <strong>코인매매진행</strong>

        <span>

          {board.summaryKo} · {scanKo}

        </span>

      </div>

      <div className={styles.coinProgressList}>

        {board.rows.map((r) => {

          const tone = statusTone(r.status);

          const slots = gaugeSlots(r.gauge);

          const sigSlots = gaugeSignalSlots(r.gauge);

          return (

            <div

              key={r.coin}

              className={styles.coinProgressRow}

              data-tone={tone}

              data-live={r.updatedAt > 0 ? '1' : '0'}

            >

              <div className={styles.coinProgressTop}>

                <span

                  className={styles.coinProgressDot}

                  data-tone={tone}

                  data-spin={r.waitingKo.includes('대기') || r.waitingKo.includes('스캔') ? '1' : '0'}

                />

                <b>

                  {r.coin} · {r.laneKo} · {dirKo(r.direction)}

                </b>

                <em data-tone={tone}>{r.status}</em>

                <span className={styles.coinProgressFrac} title="Dual코어">

                  Dual {r.passN}/{r.totalN}

                </span>

                <span className={styles.coinProgressFracSig} title="신호B 별도">

                  신호 {r.signalPassN}/{r.signalTotalN}

                </span>

              </div>

              <div className={styles.coinProgressGauge} aria-label="Dual코어게이지">

                {slots.map((s) => (

                  <div

                    key={s.id}

                    className={styles.coinProgressSeg}

                    data-ok={s.ok ? '1' : '0'}

                    title={s.ko}

                  >

                    <i data-ok={s.ok ? '1' : '0'} />

                    <span>{s.ko}</span>

                  </div>

                ))}

              </div>

              <div

                className={styles.coinProgressGaugeSignal}

                aria-label="신호B게이지"

              >

                {sigSlots.map((s) => (

                  <div

                    key={s.id}

                    className={styles.coinProgressSeg}

                    data-ok={s.ok ? '1' : '0'}

                    title={s.ko}

                  >

                    <i data-ok={s.ok ? '1' : '0'} />

                    <span>{s.ko}</span>

                  </div>

                ))}

              </div>

              <div

                className={styles.coinProgressReason}

                data-pulse={

                  r.waitingKo && r.waitingKo !== '스캔대기' ? '1' : '0'

                }

              >

                {r.blockKo

                  ? `차단사유 · ${r.blockKo}`

                  : `기다리는신호 · ${r.waitingKo}`}

                {(() => {

                  const core =

                    (r.gauge.place ? 1 : 0) +

                    (r.gauge.sfp ? 1 : 0) +

                    (r.gauge.evidence ? 1 : 0) +

                    (r.gauge.fee ? 1 : 0);

                  return core >= 3 && r.status !== '진입가능'

                    ? ' · 합류모였으나진입불가'

                    : '';

                })()}

              </div>

              <div className={styles.coinProgressMeta}>

                오늘진입 {r.todayEntry} · 스킵 {r.todaySkip}

                {r.reinforceSkip > 0 ? ` · 보강후보 ${r.reinforceSkip}` : ''}

                {r.timeframe ? ` · ${r.timeframe}` : ''}

                {r.updatedAt > 0

                  ? ` · ${new Date(r.updatedAt).toLocaleTimeString('ko-KR', {

                      hour: '2-digit',

                      minute: '2-digit',

                      second: '2-digit',

                    })}`

                  : ''}

              </div>

            </div>

          );

        })}

      </div>

      <div className={styles.coinProgressFoot}>
        위=Dual코어 · 아래=신호B · 신호C S급(15m)은 별도감지 · 믹스금지 · 선도착레이스 · 확정아님
      </div>
    </div>
  );
}
