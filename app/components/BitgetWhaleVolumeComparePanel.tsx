'use client';



import type {

  BitgetWhaleVolumeComparePack,

  SingleCandleCompare,

  RangeSegmentCompare,

} from '@/lib/bitgetWhaleVolumeCompare';

import type { WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import { buildWhaleVolumeSignal } from '@/lib/whaleVolumeSignalIndicator';



type Props = {

  compare: BitgetWhaleVolumeComparePack;

  mtfPack: WhaleVolumeMtfPack | null;

  onClose: () => void;

};



function ForecastTable({ rows, primaryH }: { rows: SingleCandleCompare['forecasts']; primaryH: number }) {

  return (

    <div className="bitget-whale-compare-panel__forecast-table">

      {rows.map((f) => (

        <div

          key={f.bars}

          className={`bitget-whale-compare-panel__forecast-row${f.bars === primaryH ? ' is-primary' : ''}`}

        >

          <span>+{f.bars}봉</span>

          <span>n{f.sampleCount}</span>

          <span className="bitget-whale-compare-panel__long">L{f.longPct}%</span>

          <span className="bitget-whale-compare-panel__short">S{f.shortPct}%</span>

          <span>

            {f.medianPct != null ? `${f.medianPct >= 0 ? '+' : ''}${f.medianPct.toFixed(1)}%` : '—'}

          </span>

          <span>

            {f.p25Pct != null && f.p75Pct != null

              ? `${f.p25Pct.toFixed(1)}~${f.p75Pct.toFixed(1)}%`

              : '—'}

          </span>

        </div>

      ))}

    </div>

  );

}



export function BitgetWhaleVolumeComparePanel({ compare, mtfPack, onClose }: Props) {

  const cur = compare.current;

  const primaryH = cur.primaryHorizon;

  const sc = compare.singleCandle;

  const rg = compare.rangeSegment;
  const signal = buildWhaleVolumeSignal({
    match: cur,
    singleCandle: sc,
    rangeSegment: rg,
    mtfPack,
  });

  return (

    <div

      className="bitget-whale-compare-panel"

      role="dialog"

      aria-label="거래량·캔들 분석 비교"

      onClick={(e) => e.stopPropagation()}

    >

      <div className="bitget-whale-compare-panel__head">

        <span className="bitget-whale-compare-panel__title">📊 거래량·캔들 비교 분석</span>

        <button type="button" className="bitget-whale-compare-panel__close" onClick={onClose}>

          ×

        </button>

      </div>



      <div className="bitget-whale-compare-panel__hero">
        {signal && (
          <div
            className="bitget-whale-compare-panel__signal-badge"
            style={{ ['--whale-signal-color' as string]: signal.color }}
          >
            {signal.badge}
          </div>
        )}
        <div className="bitget-whale-compare-panel__pct">

          <span className="bitget-whale-compare-panel__long">롱 {compare.aggregateLongPct}%</span>

          <span className="bitget-whale-compare-panel__short">숏 {compare.aggregateShortPct}%</span>

        </div>

        <div className="bitget-whale-compare-panel__meta">

          {compare.listingFromKo}~ · {compare.totalBars.toLocaleString()}봉 · 현물 % 기준

        </div>

      </div>



      <div className="bitget-whale-compare-panel__section">🕯 단일 캔들 — 거래량 터짐 + 캔들 형태</div>

      <div className="bitget-whale-compare-panel__block">

        <div className="bitget-whale-compare-panel__block-line">

          {sc.burstKo} · {sc.candleKo}

        </div>

        <div className="bitget-whale-compare-panel__block-line">

          매수 {sc.buyBtc} / 매도 {sc.sellBtc} BTC · 몸통 {sc.bodyPct}%

        </div>

        <div className="bitget-whale-compare-panel__block-line bitget-whale-compare-panel__emph">

          {sc.forecastLineKo}

        </div>

        <ForecastTable rows={sc.forecasts} primaryH={primaryH} />

      </div>



      <div className="bitget-whale-compare-panel__section">

        📦 구간 캔들 ({rg.bars}봉) — 매집/분산 · 거래량 누적

      </div>

      <div className="bitget-whale-compare-panel__block">

        <div className="bitget-whale-compare-panel__block-line">

          {rg.scenarioKo} · {rg.volTrendKo} · 구간 {rg.netPct >= 0 ? '+' : ''}

          {rg.netPct.toFixed(2)}%

        </div>

        <div className="bitget-whale-compare-panel__block-line">

          총 {rg.totalVolBtc} BTC · 매도 {rg.sellPct}% · 양봉 {rg.bullPct}%

        </div>

        {rg.theoryKo && (

          <div className="bitget-whale-compare-panel__block-line bitget-whale-compare-panel__muted">

            {rg.theoryKo}

          </div>

        )}

        <div className="bitget-whale-compare-panel__block-line bitget-whale-compare-panel__emph">

          {rg.forecastLineKo}

        </div>

        <ForecastTable rows={rg.forecasts} primaryH={primaryH} />

      </div>



      <div className="bitget-whale-compare-panel__section">⚡ 거래량 터지면? (BTC 티어 → 후행 %)</div>

      <div className="bitget-whale-compare-panel__burst-table">

        {compare.burstForecasts.slice(0, 10).map((row) => (

          <div

            key={`${row.tierBtc}-${row.sideKo}`}

            className={`bitget-whale-compare-panel__burst-row${

              row.tierBtc === cur.tierBtc ? ' is-current' : ''

            }`}

          >

            <span>{row.tierBtc} BTC</span>

            <span>{row.sideKo}</span>

            <span>n{row.sampleCount}</span>

            <span>L{row.longPct}%</span>

            <span>

              {row.medianPct != null ? `${row.medianPct >= 0 ? '+' : ''}${row.medianPct.toFixed(1)}%` : '—'}

            </span>

            <span>

              {row.medianUpPct != null ? `↑${row.medianUpPct.toFixed(1)}%` : ''}

              {row.medianDnPct != null ? ` ↓${row.medianDnPct.toFixed(1)}%` : ''}

            </span>

          </div>

        ))}

      </div>



      {rg.similarRanges.length > 0 && (

        <>

          <div className="bitget-whale-compare-panel__section">유사 구간 과거 사례 (+{primaryH}봉 후)</div>

          <div className="bitget-whale-compare-panel__hist">

            {rg.similarRanges.map((row) => (

              <div key={row.time} className="bitget-whale-compare-panel__hist-row">

                <span className="bitget-whale-compare-panel__hist-date">{row.dateKo}</span>

                <span>{row.totalVolBtc}BTC</span>

                <span>구간{row.netPct >= 0 ? '+' : ''}{row.netPct.toFixed(1)}%</span>

                <span

                  className={

                    row.afterPct >= 0.12

                      ? 'bitget-whale-compare-panel__long'

                      : row.afterPct <= -0.12

                        ? 'bitget-whale-compare-panel__short'

                        : ''

                  }

                >

                  {row.afterPct >= 0 ? '+' : ''}

                  {row.afterPct.toFixed(1)}%

                </span>

              </div>

            ))}

          </div>

        </>

      )}



      {mtfPack && (

        <>

          <div className="bitget-whale-compare-panel__section">MTF (15m · 1h · 4h · 1d)</div>

          <div className="bitget-whale-compare-panel__mtf">

            {mtfPack.rows.map((r) => (

              <div key={r.tf} className={`bitget-whale-compare-panel__mtf-row${r.ok ? ' is-ok' : ''}`}>

                <span>{r.tfKo}</span>

                {r.match ? (

                  <>

                    <span>{r.match.tierBtc}BTC</span>

                    <span>L{r.match.longPct}%</span>

                    <span>S{r.match.shortPct}%</span>

                  </>

                ) : (

                  <span className="bitget-whale-compare-panel__muted">{r.error ?? '—'}</span>

                )}

              </div>

            ))}

          </div>

        </>

      )}



      <div className="bitget-whale-compare-panel__section">단일 캔들 유사 과거</div>

      <div className="bitget-whale-compare-panel__hist">

        {compare.similarHistory.length === 0 && (

          <div className="bitget-whale-compare-panel__muted">유사 단일캔들 없음</div>

        )}

        {compare.similarHistory.map((row) => {

          const o = row.outcomes.find((x) => x.bars === primaryH) ?? row.outcomes[0];

          return (

            <div key={row.time} className="bitget-whale-compare-panel__hist-row">

              <span className="bitget-whale-compare-panel__hist-date">{row.dateKo}</span>

              <span>{row.volBtc} BTC</span>

              <span>{row.fingerprintKo}</span>

              <span

                className={

                  o?.dir === 'long'

                    ? 'bitget-whale-compare-panel__long'

                    : o?.dir === 'short'

                      ? 'bitget-whale-compare-panel__short'

                      : ''

                }

              >

                {o ? `${o.pct >= 0 ? '+' : ''}${o.pct.toFixed(1)}%` : '—'}

              </span>

            </div>

          );

        })}

      </div>



      <div className="bitget-whale-compare-panel__foot">

        Bitget BTCUSDT.P · 단일캔들+구간캔들+거래량티어 — 현물 % 참고 · 확정 아님

      </div>

    </div>

  );

}


