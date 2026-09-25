'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import {
  computeIntegratedTradePnL,
  readIntegratedTradePnLInputs,
  resolveIntegratedTradeDirection,
  writeIntegratedTradePnLInputs,
  type IntegratedTradePnLResult,
} from '@/lib/integratedTradePnLCalc';
import styles from './MergedAnalysisDesk.module.css';

export type IntegratedTradePnLCalculatorProps = {
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  currentPrice?: number | null;
  initialSeedUsdt?: number;
  tradePlan?: UnifiedDeskTradePlan | null;
};

function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

export default function IntegratedTradePnLCalculator({
  masterDirection,
  entry: suggestedEntry,
  stopLoss: suggestedSl,
  tp1: suggestedTp1,
  tp2: suggestedTp2,
  tp3: suggestedTp3,
  currentPrice,
  initialSeedUsdt,
  tradePlan,
}: IntegratedTradePnLCalculatorProps) {
  const plan = tradePlan;
  const entryBase = plan?.entry && plan.entry > 0 ? plan.entry : suggestedEntry;
  const slBase = plan?.stopLoss && plan.stopLoss > 0 ? plan.stopLoss : suggestedSl;
  const tp1Base = plan?.tp1 && plan.tp1 > 0 ? plan.tp1 : suggestedTp1;
  const tp2Base = plan?.tp2 && plan.tp2 > 0 ? plan.tp2 : suggestedTp2;
  const tp3Base = plan?.tp3 && plan.tp3 > 0 ? plan.tp3 : suggestedTp3;
  const dirBase = plan?.direction && plan.direction !== 'NEUTRAL' ? plan.direction : masterDirection;

  const planKey = `${entryBase}:${slBase}:${tp1Base}:${dirBase}`;
  const lastPlanKeyRef = useRef(planKey);

  const [seedUsdt, setSeedUsdt] = useState(1000);
  const [leverage, setLeverage] = useState(10);
  const [adjustPct, setAdjustPct] = useState(100);
  const [entryInput, setEntryInput] = useState('');
  const [entryTouched, setEntryTouched] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readIntegratedTradePnLInputs();
    setSeedUsdt(initialSeedUsdt && initialSeedUsdt > 0 ? initialSeedUsdt : stored.seedUsdt);
    setLeverage(stored.leverage);
    setAdjustPct(stored.adjustPct);
    setHydrated(true);
  }, [initialSeedUsdt]);

  useEffect(() => {
    if (lastPlanKeyRef.current !== planKey) {
      lastPlanKeyRef.current = planKey;
      if (!entryTouched && entryBase > 0) {
        setEntryInput(String(entryBase));
      }
    }
  }, [planKey, entryBase, entryTouched]);

  const persist = useCallback(
    (patch: Partial<{ seedUsdt: number; leverage: number; adjustPct: number; entryOverride: number | null }>) => {
      writeIntegratedTradePnLInputs({
        seedUsdt: patch.seedUsdt ?? seedUsdt,
        leverage: patch.leverage ?? leverage,
        adjustPct: patch.adjustPct ?? adjustPct,
        entryOverride:
          patch.entryOverride !== undefined
            ? patch.entryOverride
            : entryTouched && entryInput.trim()
              ? Number(entryInput)
              : null,
      });
    },
    [seedUsdt, leverage, adjustPct, entryInput, entryTouched]
  );

  const entry =
    entryTouched && entryInput.trim() && Number(entryInput) > 0
      ? Number(entryInput)
      : entryBase > 0
        ? entryBase
        : currentPrice && currentPrice > 0
          ? currentPrice
          : 0;

  const direction = resolveIntegratedTradeDirection(dirBase, entry, slBase, tp1Base);

  const result: IntegratedTradePnLResult | null = useMemo(() => {
    if (!hydrated || slBase <= 0) return null;
    return computeIntegratedTradePnL({
      seedUsdt,
      leverage,
      adjustPct,
      entry,
      stopLoss: slBase,
      tp1: tp1Base,
      tp2: tp2Base,
      tp3: tp3Base,
      direction,
    });
  }, [
    hydrated,
    seedUsdt,
    leverage,
    adjustPct,
    entry,
    slBase,
    tp1Base,
    tp2Base,
    tp3Base,
    direction,
  ]);

  const syncFromPlan = () => {
    setEntryTouched(false);
    if (entryBase > 0) {
      setEntryInput(String(entryBase));
      persist({ entryOverride: null });
    }
  };

  if (!hydrated) return null;

  return (
    <div className={styles.pnlCalcPanel} aria-label="시드·레버리지 손익 계산">
      <div className={styles.pnlCalcHead}>
        <div>
          <span className={styles.pnlCalcTag}>손익 계산</span>
          <h4 className={styles.pnlCalcTitle}>시드 · 레버리지 · 통합 타점</h4>
          <p className={styles.pnlCalcSub}>
            {plan?.sourceKo ?? 'Strike/분석'} · {direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '관망'} ·
            SL/TP는 카드·차트와 동일
          </p>
        </div>
        <button type="button" className={styles.pnlCalcSyncBtn} onClick={syncFromPlan}>
          타점 동기
        </button>
      </div>

      {plan?.warningsKo?.length ? (
        <div className={styles.pnlCalcWarn} role="status">
          {plan.warningsKo.join(' · ')}
        </div>
      ) : null}

      <div className={styles.pnlCalcPlanStrip}>
        <span>E {fmtPrice(entryBase)}</span>
        <span>SL {fmtPrice(slBase)}</span>
        <span>TP1 {fmtPrice(tp1Base)}</span>
        <span>TP2 {fmtPrice(tp2Base)}</span>
        <span>TP3 {fmtPrice(tp3Base)}</span>
      </div>

      <div className={styles.pnlCalcInputs}>
        <label className={styles.pnlCalcField}>
          <span>시드 USDT</span>
          <input
            type="number"
            min={0}
            step={100}
            value={seedUsdt}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setSeedUsdt(v);
              persist({ seedUsdt: v });
            }}
          />
        </label>
        <label className={styles.pnlCalcField}>
          <span>레버리지 x</span>
          <input
            type="number"
            min={1}
            max={125}
            step={1}
            value={leverage}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setLeverage(v);
              persist({ leverage: v });
            }}
          />
        </label>
        <label className={styles.pnlCalcField}>
          <span>진입가 USDT</span>
          <input
            type="number"
            min={0}
            step={0.1}
            placeholder={entryBase > 0 ? String(entryBase) : '진입가'}
            value={entryInput}
            onChange={(e) => {
              setEntryTouched(true);
              setEntryInput(e.target.value);
              const n = Number(e.target.value);
              persist({ entryOverride: n > 0 ? n : null });
            }}
          />
        </label>
      </div>

      <div className={styles.pnlCalcAdjustRow}>
        <span className={styles.pnlCalcAdjustLabel}>조정 {adjustPct}%</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={adjustPct}
          className={styles.pnlCalcRange}
          aria-label="증거금 조정 비율"
          onChange={(e) => {
            const v = Number(e.target.value);
            setAdjustPct(v);
            persist({ adjustPct: v });
          }}
        />
        <span className={styles.pnlCalcAdjustHint}>증거금 {((seedUsdt * adjustPct) / 100).toFixed(0)}U</span>
      </div>

      {result ? (
        <>
          <div className={styles.pnlCalcSummary}>
            <span>규모 {result.notionalUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT</span>
            <span>수량 {result.qty.toFixed(4)}</span>
            <span>{result.headlineKo}</span>
          </div>

          <div className={styles.pnlCalcTable} aria-label="레벨별 손익">
            <div className={styles.pnlCalcTableHead}>
              <span>레벨</span>
              <span>가격</span>
              <span>변동</span>
              <span>손익 USDT</span>
              <span>ROE</span>
            </div>
            {result.levels.map((lv) => (
              <div
                key={lv.key}
                className={`${styles.pnlCalcTableRow}${lv.kind === 'sl' ? ` ${styles.pnlCalcRowSl}` : lv.kind === 'tp' ? ` ${styles.pnlCalcRowTp}` : ''}${lv.kind === 'entry' ? ` ${styles.pnlCalcRowEntry}` : ''}`}
              >
                <span>{lv.labelKo}</span>
                <span>{fmtPrice(lv.price)}</span>
                <span>
                  {lv.kind === 'entry' ? '—' : `${lv.movePct >= 0 ? '+' : ''}${lv.movePct.toFixed(2)}%`}
                </span>
                <span style={{ color: lv.pnlUsdt >= 0 ? '#4ade80' : '#f87171' }}>
                  {lv.kind === 'entry' ? '0' : `${fmtPnl(lv.pnlUsdt)} U`}
                </span>
                <span style={{ color: lv.roePct >= 0 ? '#4ade80' : '#f87171' }}>
                  {lv.kind === 'entry' ? '—' : `${lv.roePct >= 0 ? '+' : ''}${lv.roePct.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.pnlCalcEmpty}>시드·통합 SL/TP가 준비되면 손익이 계산됩니다.</p>
      )}

      <p className={styles.pnlCalcFoot}>
        증거금=시드×조정% · 규모=증거금×레버리지 · SL은 Strike+분석 구조 정렬. 조건부 참고.
      </p>
    </div>
  );
}
