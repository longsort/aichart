'use client';

type Signal = {
  tf: string;
  tfLabel?: string;
  verdict: string;
  verdictKo?: string;
  confidence?: number;
};

type MultiTf = {
  htf?: string;
  ltf?: string;
  htfLabel?: string;
  ltfLabel?: string;
  trend1M?: string;
};

type Props = {
  signals: Signal[];
  chartTf: string;
  multiTF?: MultiTf | null;
  onSelectTf?: (tf: string) => void;
};

export default function ReferenceDeskMtfChartStrip({ signals, chartTf, multiTF, onSelectTf }: Props) {
  if (!signals.length && !multiTF?.htf && !multiTF?.ltf && !multiTF?.trend1M) return null;

  return (
    <div className="ref-desk-mtf-chart-strip" aria-label="MTF 마커">
      {multiTF?.trend1M ? (
        <span className="ref-desk-mtf-chart-strip__chip ref-desk-mtf-chart-strip__chip--neutral">
          1M {multiTF.trend1M}
        </span>
      ) : null}
      {multiTF?.htf ? (
        <span className="ref-desk-mtf-chart-strip__chip ref-desk-mtf-chart-strip__chip--neutral">
          {multiTF.htfLabel ?? 'HTF'} {multiTF.htf}
        </span>
      ) : null}
      {multiTF?.ltf ? (
        <span className="ref-desk-mtf-chart-strip__chip ref-desk-mtf-chart-strip__chip--neutral">
          {multiTF.ltfLabel ?? 'LTF'} {multiTF.ltf}
        </span>
      ) : null}
      {signals.map((m) => {
        const active = m.tf === chartTf || (m.tf === '1w' && chartTf === '1w');
        const long = m.verdict === 'LONG';
        const short = m.verdict === 'SHORT';
        return (
          <button
            key={`ref-mtf-${m.tf}`}
            type="button"
            className={`ref-desk-mtf-chart-strip__chip ref-desk-mtf-chart-strip__chip--btn${
              active ? ' ref-desk-mtf-chart-strip__chip--active' : ''
            }${long ? ' ref-desk-mtf-chart-strip__chip--long' : short ? ' ref-desk-mtf-chart-strip__chip--short' : ''}`}
            onClick={() => onSelectTf?.(m.tf)}
            title={`${m.tfLabel ?? m.tf} ${m.verdictKo ?? m.verdict}${m.confidence != null ? ` ${Math.round(m.confidence)}%` : ''}`}
          >
            {m.tfLabel ?? m.tf}{' '}
            {long ? '▲L' : short ? '▼S' : '·'}
            {m.confidence != null ? ` ${Math.round(m.confidence)}%` : ''}
          </button>
        );
      })}
    </div>
  );
}
