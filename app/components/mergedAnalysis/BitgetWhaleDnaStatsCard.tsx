'use client';

import type { ForwardPctBand } from '@/lib/bitgetWhaleVolumeCompare';
import type { BitgetWhaleDnaPanel } from '@/lib/bitgetWhaleDnaPanel';
import { buildBitgetWhaleDnaNarrative } from '@/lib/bitgetWhaleDnaPanel';
import type { WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { RangeSegmentCompare, SingleCandleCompare } from '@/lib/bitgetWhaleVolumeCompare';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  dna: BitgetWhaleDnaPanel;
  single: SingleCandleCompare | null;
  range: RangeSegmentCompare | null;
  mtf: WhaleVolumeMtfPack | null;
  loading?: boolean;
  onReload?: () => void;
};

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function DualGauge({ longPct, shortPct, verdictKo }: { longPct: number; shortPct: number; verdictKo: string }) {
  const long = Math.max(0, Math.min(100, longPct));
  const short = Math.max(0, Math.min(100, shortPct));
  const r = 36;
  const c = 2 * Math.PI * r;
  const longArc = (long / 100) * c * 0.5;
  const shortArc = (short / 100) * c * 0.5;
  const tone =
    verdictKo === '상승' ? styles.bitgetDnaGaugeLong : verdictKo === '하락' ? styles.bitgetDnaGaugeShort : '';

  return (
    <div className={`${styles.bitgetDnaGaugeWrap} ${tone}`}>
      <svg viewBox="0 0 100 58" className={styles.bitgetDnaGaugeSvg} aria-hidden>
        <path
          d="M 14 50 A 36 36 0 0 1 86 50"
          fill="none"
          stroke="rgba(15,23,42,0.9)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 14 50 A 36 36 0 0 1 50 14"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${longArc} ${c}`}
        />
        <path
          d="M 50 14 A 36 36 0 0 1 86 50"
          fill="none"
          stroke="#f97316"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${shortArc} ${c}`}
        />
      </svg>
      <div className={styles.bitgetDnaGaugeCenter}>
        <span className={styles.bitgetDnaGaugeVerdict}>{verdictKo}</span>
        <span className={styles.bitgetDnaGaugeSplit}>
          L {long.toFixed(0)}% · S {short.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function ForecastBars({ rows, primaryH }: { rows: ForwardPctBand[]; primaryH: number }) {
  if (!rows.length) return null;
  const maxAbs = Math.max(0.5, ...rows.map((r) => Math.abs(r.medianPct ?? 0)));
  return (
    <div className={styles.bitgetDnaForecastGrid}>
      {rows.map((f) => {
        const med = f.medianPct ?? 0;
        const w = Math.min(100, (Math.abs(med) / maxAbs) * 100);
        const up = med >= 0;
        return (
          <div
            key={f.bars}
            className={`${styles.bitgetDnaForecastRow}${f.bars === primaryH ? ` ${styles.bitgetDnaForecastRowPrimary}` : ''}`}
          >
            <span className={styles.bitgetDnaForecastLabel}>+{f.bars}봉</span>
            <div className={styles.bitgetDnaForecastTrack}>
              <div
                className={up ? styles.bitgetDnaForecastFillUp : styles.bitgetDnaForecastFillDn}
                style={{ width: `${w}%` }}
              />
            </div>
            <span className={styles.bitgetDnaForecastVal}>{fmtPct(med)}</span>
            <span className={styles.bitgetDnaForecastLs}>
              L{f.longPct} S{f.shortPct}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MtfBars({ mtf }: { mtf: WhaleVolumeMtfPack | null }) {
  if (!mtf?.rows?.length) return <div className={styles.bitgetDnaMuted}>MTF 데이터 없음</div>;
  return (
    <div className={styles.bitgetDnaMtfGrid}>
      {mtf.rows.map((r) => {
        const lp = r.match?.longPct ?? 0;
        const sp = r.match?.shortPct ?? 0;
        const dom = r.match?.dominant;
        return (
          <div key={r.tf} className={`${styles.bitgetDnaMtfRow}${r.ok ? '' : ` ${styles.bitgetDnaMtfRowOff}`}`}>
            <span className={styles.bitgetDnaMtfTf}>{r.tfKo ?? r.tf}</span>
            <div className={styles.bitgetDnaMtfTrack}>
              <div className={styles.bitgetDnaMtfLong} style={{ width: `${lp}%` }} />
              <div className={styles.bitgetDnaMtfShort} style={{ width: `${sp}%` }} />
            </div>
            <span
              className={
                dom === 'LONG'
                  ? styles.bitgetDnaMtfDomLong
                  : dom === 'SHORT'
                    ? styles.bitgetDnaMtfDomShort
                    : styles.bitgetDnaMuted
              }
            >
              {r.match ? `${r.match.tierBtc}BTC` : r.error ?? '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SimilarSpark({ range }: { range: RangeSegmentCompare | null }) {
  const rows = range?.similarRanges?.slice(0, 6) ?? [];
  if (!rows.length) return <div className={styles.bitgetDnaMuted}>유사 구간 없음</div>;
  const maxAbs = Math.max(0.3, ...rows.map((r) => Math.abs(r.afterPct)));
  return (
    <div className={styles.bitgetDnaHistGrid}>
      {rows.map((r) => {
        const h = Math.min(100, (Math.abs(r.afterPct) / maxAbs) * 100);
        return (
          <div key={r.time} className={styles.bitgetDnaHistCol} title={`${r.dateKo} ${fmtPct(r.afterPct)}`}>
            <div
              className={r.afterPct >= 0 ? styles.bitgetDnaHistBarUp : styles.bitgetDnaHistBarDn}
              style={{ height: `${Math.max(8, h)}%` }}
            />
            <span className={styles.bitgetDnaHistLbl}>{r.dateKo.slice(-5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BitgetWhaleDnaStatsCard({ dna, single, range, mtf, loading, onReload }: Props) {
  const isLong = dna.verdictKo === '상승' || dna.beamKo === '롱빔';
  const isShort = dna.verdictKo === '하락' || dna.beamKo === '숏빔';
  const beamCls = isLong
    ? styles.bitgetDnaBeamLong
    : isShort
      ? styles.bitgetDnaBeamShort
      : styles.bitgetDnaBeamNeutral;
  const forecasts = range?.forecasts?.length ? range.forecasts : single?.forecasts ?? [];
  const narrative = buildBitgetWhaleDnaNarrative(dna);

  return (
    <div className={styles.bitgetDnaStatsHub} data-loading={loading ? '1' : '0'}>
      <div className={styles.bitgetDnaAiNarrative}>{narrative}</div>
      <div className={styles.bitgetDnaHero}>
        <div className={styles.bitgetDnaHeroTop}>
          <span className={styles.bitgetDnaBrand}>BITGET DNA · 통계 AI</span>
          {onReload && (
            <button type="button" className={styles.bitgetDnaReloadBtn} onClick={onReload} title="갱신">
              ↻
            </button>
          )}
        </div>
        <div className={`${styles.bitgetDnaBeamBadge} ${beamCls}`}>
          {isLong ? '▲ 롱빔' : isShort ? '▼ 숏빔' : `◆ ${dna.beamKo}`}
        </div>
        <div className={styles.bitgetDnaScenario}>{dna.scenarioKo}</div>
        <DualGauge longPct={dna.longPct} shortPct={dna.shortPct} verdictKo={dna.verdictKo} />
      </div>

      <div className={styles.bitgetDnaCard}>
        <div className={styles.bitgetDnaCardHead}>+N봉 시나리오 (참고용 %)</div>
        <div className={styles.bitgetDnaPrimaryForecast}>
          <span>+{dna.forecastBars}봉</span>
          <strong>{fmtPct(dna.forecastPct)}</strong>
          {dna.p25Pct != null && dna.p75Pct != null && (
            <span className={styles.bitgetDnaMuted}>
              ({fmtPct(dna.p25Pct)}~{fmtPct(dna.p75Pct)})
            </span>
          )}
        </div>
        <ForecastBars rows={forecasts} primaryH={dna.forecastBars} />
        <div className={styles.bitgetDnaMetaRow}>
          {dna.similarCount > 0
            ? `유사 ${dna.similarCount}건`
            : dna.sampleCount > 0
              ? `카탈로그 ${dna.sampleCount}건`
              : '표본 수집 중'}
          {' · '}
          {dna.tierBtc}BTC · n{dna.sampleCount}
        </div>
      </div>

      <div className={styles.bitgetDnaCard}>
        <div className={styles.bitgetDnaCardHead}>진입 · 목표</div>
        <div className={styles.bitgetDnaPriceGrid}>
          <div className={styles.bitgetDnaPriceChip}>
            <span className={styles.bitgetDnaPriceLbl}>진입</span>
            <span className={styles.bitgetDnaPriceVal}>{dna.entryKo}</span>
          </div>
          <div className={`${styles.bitgetDnaPriceChip} ${styles.bitgetDnaPriceChipTarget}`}>
            <span className={styles.bitgetDnaPriceLbl}>목표</span>
            <span className={styles.bitgetDnaPriceVal}>{dna.targetKo}</span>
          </div>
        </div>
      </div>

      <div className={styles.bitgetDnaCard}>
        <div className={styles.bitgetDnaCardHead}>MTF 고래 DNA</div>
        <MtfBars mtf={mtf} />
      </div>

      <div className={styles.bitgetDnaCard}>
        <div className={styles.bitgetDnaCardHead}>유사 구간 과거 (+{dna.forecastBars}봉 후)</div>
        <SimilarSpark range={range} />
        {dna.pastLine !== '—' && <div className={styles.bitgetDnaPastLine}>최근: {dna.pastLine}</div>}
      </div>

      {single && (
        <div className={styles.bitgetDnaCard}>
          <div className={styles.bitgetDnaCardHead}>단일 캔들</div>
          <div className={styles.bitgetDnaLine}>{single.burstKo} · {single.candleKo}</div>
          <div className={styles.bitgetDnaLine}>
            매수 {single.buyBtc} / 매도 {single.sellBtc} BTC · 몸통 {single.bodyPct}%
          </div>
        </div>
      )}

      {range && (
        <div className={styles.bitgetDnaCard}>
          <div className={styles.bitgetDnaCardHead}>구간 {range.bars}봉</div>
          <div className={styles.bitgetDnaLine}>
            {range.scenarioKo} · {range.volTrendKo} · {range.netPct >= 0 ? '+' : ''}{range.netPct.toFixed(2)}%
          </div>
          <div className={styles.bitgetDnaLine}>총 {range.totalVolBtc} BTC · 매도 {range.sellPct}%</div>
        </div>
      )}

      <p className={styles.bitgetDnaDisclaimer}>
        {dna.dataSpanKo} · Bitget BTCUSDT.P · 현물 % 기준 참고 · 확정·승률 아님
      </p>
    </div>
  );
}
