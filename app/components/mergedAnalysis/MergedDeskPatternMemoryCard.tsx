'use client';



import { useCallback, useEffect, useState } from 'react';

import FoldCard from '@/app/components/ui/FoldCard';

import styles from './MergedAnalysisDesk.module.css';



type Hit = {

  openTime: number;

  iso: string;

  cosine: number;

  rerank: number;

  regime: string;

  window: number;

  after3Pct?: number | null;

  after5Pct?: number | null;

  after10Pct?: number | null;

  nextDir?: 'LONG' | 'SHORT' | 'FLAT' | null;

  nextDirKo?: string;

};



type Dual = {

  model: string;

  sampleCount: number;

  winRate: number | null;

  evNet: number | null;

  profitFactor: number | null;

  averageR: number | null;

  firstTouchRate: number | null;

};



type DirectionVote = {

  up: number;

  down: number;

  flat: number;

  sample: number;

  pLong: number | null;

  pLongWeighted: number | null;

  direction: 'LONG' | 'SHORT' | null;

  lean: 'LONG' | 'SHORT' | 'WAIT';

  labelKo: string;

};



type LongShortBoard = {

  candle: DirectionVote;

  volume: DirectionVote;

  combined: DirectionVote;

  firstTouch: {

    tp: number;

    sl: number;

    decided: number;

    lean: 'LONG' | 'SHORT' | 'WAIT';

    labelKo: string;

  } | null;

  mtf: { longN: number; shortN: number; waitN: number; lean: 'LONG' | 'SHORT' | 'WAIT'; labelKo: string };

  lean: 'LONG' | 'SHORT' | 'WAIT';

  leanScore: number;

  leanKo: string;

  leanExplainKo: string;

  agreesWithVerdict: boolean;

  evidence: string[];

};



type Result = {

  symbol: string;

  timeframe: string;

  role: string;

  lastClosedIso: string | null;

  incremental: boolean;

  logs: string[];

  inventory: {

    count: number;

    firstOpenTime: number | null;

    lastOpenTime: number | null;

    missingCount: number;

    duplicateCount: number;

    repair: { missingFilled: number; gapWindowsRepaired: number; duplicateDropped: number };

    qualitySeverity: string;

  };

  searchMs: number;

  candleHits: Hit[];

  volumeHits: Hit[];

  candleDir: 'LONG' | 'SHORT' | null;

  volumeDir: 'LONG' | 'SHORT' | null;

  candleVote?: { up: number; down: number; sample: number; pLong: number | null };

  volumeVote?: { up: number; down: number; sample: number; pLong: number | null };

  verdict: 'LONG' | 'SHORT' | 'WAIT';

  waitReasons: string[];

  longShortBoard?: LongShortBoard;

  firstTouch: { result: string; bars: number; mfe: number; mae: number } | null;

  mfeMae: { mean: number | null; median: number | null; p75: number | null; p90: number | null };

  outcomesSample?: { horizon: number; closeReturn: number; maxHighReturn: number; maxLowReturn: number }[];

  timeToTarget?: { meanBars: number | null; medianBars: number | null; missRate: number | null; sample: number };

  calibration?: { bin: string; n: number; predicted: number; actual: number | null }[];

  walkForward?: {

    folds?: { fold?: number }[];

    holdoutN?: number;

    holdoutNetEv?: number | null;

    sampleSize?: number;

    label?: string;

  } | null;

  paperRecent?: { signalTime: number; direction: string; outcome: string | null; timeframe: string }[];

  backtestCandle: Dual;

  backtestVolume: Dual;

  oosCandle: Dual;

  oosVolume: Dual;

  successFailureCandle: { successSimilarity: number | null; failureSimilarity: number | null; failureRisk: number | null };

  mtf: { tf: string; role: string; verdict: string }[];

  mtfConflict: boolean;

  spotFuture?: {

    side: 'LONG' | 'SHORT' | 'WAIT';

    horizonBars: number;

    sampleCount: number;

    upPct: number | null;

    downPct: number | null;

    closePct: number | null;

    chipKo: string;

    detailKo: string;

    labelKo: string;

  };

  note: string;

};



function fmtPct(v: number | null | undefined) {

  if (v == null || !Number.isFinite(v)) return '표본 부족';

  return `${(v * 100).toFixed(1)}%`;

}



function fmtN(v: number | null | undefined, d = 3) {

  if (v == null || !Number.isFinite(v)) return '—';

  return v.toFixed(d);

}



function fmtRet(v: number | null | undefined) {

  if (v == null || !Number.isFinite(v)) return '—';

  const pct = v * 100;

  const sign = pct > 0 ? '+' : '';

  return `${sign}${pct.toFixed(2)}%`;

}



function isoShort(ms: number | null) {

  if (!ms) return '—';

  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

}



function dirKo(d: 'LONG' | 'SHORT' | 'WAIT' | null | undefined): string {

  if (d === 'LONG') return '롱';

  if (d === 'SHORT') return '숏';

  return '관망';

}



function dirColor(d: 'LONG' | 'SHORT' | 'WAIT' | null | undefined): string {

  if (d === 'LONG') return '#34d399';

  if (d === 'SHORT') return '#f87171';

  return '#fbbf24';

}



function regimeKo(r: string): string {

  const m: Record<string, string> = {

    STRONG_UP: '강한상승',

    UP: '상승',

    RANGE: '횡보',

    DOWN: '하락',

    STRONG_DOWN: '강한하락',

  };

  return m[r] || r;

}



function sectionTitle(title: string, hint: string) {

  return (

    <div style={{ marginTop: 4 }}>

      <div style={{ fontWeight: 800, fontSize: 12, color: '#e2e8f0' }}>{title}</div>

      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{hint}</div>

    </div>

  );

}



function VoteBar({ up, down, label }: { up: number; down: number; label: string }) {

  const n = up + down;

  const upPct = n > 0 ? (up / n) * 100 : 50;

  return (

    <div style={{ display: 'grid', gap: 4 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>

        <span>{label}</span>

        <span>

          <span style={{ color: '#34d399' }}>롱 {up}</span>

          {' · '}

          <span style={{ color: '#f87171' }}>숏 {down}</span>

          {n > 0 ? ` · ${(upPct).toFixed(0)}%↑` : ''}

        </span>

      </div>

      <div

        style={{

          height: 10,

          borderRadius: 6,

          overflow: 'hidden',

          display: 'flex',

          background: 'rgba(51,65,85,0.6)',

        }}

      >

        <div style={{ width: `${n ? upPct : 50}%`, background: 'rgba(52,211,153,0.85)' }} />

        <div style={{ flex: 1, background: 'rgba(248,113,113,0.85)' }} />

      </div>

    </div>

  );

}



type Props = {

  symbol: string;

  timeframe: string;

  forceOpen?: boolean;

  onClose?: () => void;

};



export default function MergedDeskPatternMemoryCard({ symbol, timeframe, forceOpen, onClose }: Props) {

  const [data, setData] = useState<Result | null>(null);

  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [showDetail, setShowDetail] = useState(false);



  const load = useCallback(

    async (withBacktest = false) => {

      setLoading(true);

      setErr(null);

      try {

        const q = new URLSearchParams({

          action: 'analyze',

          symbol,

          tf: timeframe,

        });

        if (withBacktest) q.set('backtest', '1');

        const res = await fetch(`/api/pattern-memory?${q}`, { cache: 'no-store' });

        const j = (await res.json()) as { ok?: boolean; result?: Result; error?: string };

        if (!res.ok || !j.ok || !j.result) throw new Error(j.error || `HTTP ${res.status}`);

        setData(j.result);

      } catch (e) {

        setErr(e instanceof Error ? e.message : '패턴기억 분석 실패');

      } finally {

        setLoading(false);

      }

    },

    [symbol, timeframe]

  );



  useEffect(() => {

    void load(false);

  }, [load]);



  const board = data?.longShortBoard;

  const displayDir = data

    ? data.verdict !== 'WAIT'

      ? data.verdict

      : board?.lean && board.lean !== 'WAIT'

        ? board.lean

        : 'WAIT'

    : null;

  const badge = data

    ? data.verdict !== 'WAIT'

      ? dirKo(data.verdict)

      : board?.lean && board.lean !== 'WAIT'

        ? `${dirKo(board.lean)}기울기`

        : '관망'

    : loading

      ? '분석중'

      : '대기';



  return (

    <div data-pattern-memory-card="1">

      <FoldCard

        id="merged-pattern-memory"

        title="패턴기억 · 롱숏"

        subtitle="비슷한 과거 이후 상승/하락 투표 · 기울기 참고 · 확정 수익 아님"

        defaultOpen

        forceOpen={forceOpen}

        badge={badge}

        onClose={onClose}

        closeTitle="패턴기억 카드 닫기 — 도구 칩 「패턴기억」으로 다시 켤 수 있음"

      >

        <div className={styles.tbScanSummary} style={{ display: 'grid', gap: 10, fontSize: 12, lineHeight: 1.5 }}>

          <div

            style={{

              padding: '8px 10px',

              borderRadius: 8,

              border: '1px solid rgba(167,139,250,0.4)',

              background: 'rgba(76,29,149,0.2)',

            }}

          >

            <div style={{ fontWeight: 800, marginBottom: 4 }}>이게 뭐예요?</div>

            <div style={{ color: '#cbd5e1' }}>

              과거 봉을 모아 <b>지금과 비슷한 구간</b>을 찾고, 그 다음에 <b>올랐는지(롱) / 내렸는지(숏)</b>를

              투표·기울기로 보여줍니다. 확정 매수·매도 신호가 아닙니다.

            </div>

          </div>



          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

            <button type="button" className="tool-chip tool-chip-button" onClick={() => void load(false)} disabled={loading}>

              {loading ? '찾는 중…' : '다시 찾기'}

            </button>

            <button

              type="button"

              className="tool-chip tool-chip-button"

              onClick={() => void load(true)}

              disabled={loading}

              title="과거 구간을 나눠 검증(시간 더 걸림) · 확정 수익 아님"

            >

              검증 다시 돌리기

            </button>

            <span style={{ color: '#94a3b8' }}>

              {symbol} · {timeframe} 차트

              {data?.searchMs != null ? ` · ${data.searchMs}ms` : ''}

            </span>

          </div>



          {err ? <div style={{ color: '#f87171' }}>{err}</div> : null}



          {data ? (

            <>

              {/* 큰 롱/숏 판 */}

              <div

                style={{

                  padding: '12px 12px',

                  borderRadius: 10,

                  border: `1px solid ${dirColor(displayDir)}66`,

                  background:

                    displayDir === 'LONG'

                      ? 'rgba(6,78,59,0.35)'

                      : displayDir === 'SHORT'

                        ? 'rgba(127,29,29,0.35)'

                        : 'rgba(113,63,18,0.3)',

                }}

              >

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>

                  <div style={{ fontSize: 22, fontWeight: 900, color: dirColor(displayDir), letterSpacing: 0.5 }}>

                    {dirKo(displayDir)}

                  </div>

                  <div style={{ fontSize: 12, color: '#e2e8f0' }}>

                    {data.verdict === 'WAIT' && board?.lean && board.lean !== 'WAIT'

                      ? `확정은 관망 · ${board.leanKo}`

                      : data.verdict === 'WAIT'

                        ? '지금은 관망'

                        : `판정 ${dirKo(data.verdict)} (참고)`}

                  </div>

                  {board ? (

                    <div

                      style={{

                        marginLeft: 'auto',

                        fontSize: 12,

                        fontWeight: 700,

                        color: board.leanScore >= 0 ? '#34d399' : '#f87171',

                      }}

                    >

                      기울기 {board.leanScore >= 0 ? '+' : ''}

                      {board.leanScore}

                    </div>

                  ) : null}

                </div>

                <div style={{ marginTop: 6, color: '#fde68a', fontSize: 12 }}>

                  {board?.leanExplainKo ||

                    (data.verdict === 'WAIT'

                      ? `관망 이유: ${data.waitReasons.length ? data.waitReasons.join(' · ') : '모델 합의 부족'}`

                      : data.verdict === 'LONG'

                        ? '비슷한 과거가 이후 상승한 경우가 더 많았다는 참고입니다.'

                        : '비슷한 과거가 이후 하락한 경우가 더 많았다는 참고입니다.')}

                </div>

                {data.waitReasons.length && data.verdict === 'WAIT' ? (

                  <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>

                    게이트: {data.waitReasons.join(' · ')}

                  </div>

                ) : null}

              </div>



              {board ? (

                <>

                  {sectionTitle(

                    '① 롱 vs 숏 투표',

                    '비슷한 구간 이후 +3봉 종가 기준 · 닮은 정도(cosine)로 가중 · 확정 아님'

                  )}

                  <div style={{ display: 'grid', gap: 8 }}>

                    <VoteBar up={board.candle.up} down={board.candle.down} label={`가격 모양 · ${board.candle.labelKo}`} />

                    <VoteBar up={board.volume.up} down={board.volume.down} label={`가격+거래량 · ${board.volume.labelKo}`} />

                    <VoteBar

                      up={board.combined.up}

                      down={board.combined.down}

                      label={`합산(3·5·10봉) · ${board.combined.labelKo}`}

                    />

                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: '#94a3b8' }}>

                    <span className={styles.tbScanChip}>{board.mtf.labelKo}</span>

                    {board.firstTouch ? <span className={styles.tbScanChip}>{board.firstTouch.labelKo}</span> : null}

                  </div>

                  {board.evidence.length ? (

                    <div style={{ fontSize: 11, color: '#94a3b8' }}>

                      근거: {board.evidence.slice(0, 5).join(' · ')}

                    </div>

                  ) : null}

                </>

              ) : data.candleVote ? (

                <>

                  {sectionTitle('① 롱 vs 숏 투표', '유사 구간 이후 방향')}

                  <VoteBar up={data.candleVote.up} down={data.candleVote.down} label="가격 모양" />

                  {data.volumeVote ? (

                    <VoteBar up={data.volumeVote.up} down={data.volumeVote.down} label="가격+거래량" />

                  ) : null}

                </>

              ) : null}



              {sectionTitle('② 두 모델 방향', '둘 다 같으면 참고↑, 다르면 보통 관망')}

              <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>

                <div

                  style={{

                    padding: 8,

                    borderRadius: 8,

                    border: `1px solid ${dirColor(data.candleDir)}55`,

                    background: 'rgba(15,23,42,0.5)',

                  }}

                >

                  <div style={{ fontWeight: 700 }}>가격 모양</div>

                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2, color: dirColor(data.candleDir) }}>

                    {dirKo(data.candleDir)}

                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8' }}>

                    {data.candleVote

                      ? `↑${data.candleVote.up} ↓${data.candleVote.down}${

                          data.candleVote.pLong != null ? ` · ${(data.candleVote.pLong * 100).toFixed(0)}%↑` : ''

                        }`

                      : 'OHLC 유사'}

                  </div>

                </div>

                <div

                  style={{

                    padding: 8,

                    borderRadius: 8,

                    border: `1px solid ${dirColor(data.volumeDir)}55`,

                    background: 'rgba(15,23,42,0.5)',

                  }}

                >

                  <div style={{ fontWeight: 700 }}>가격+거래량</div>

                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2, color: dirColor(data.volumeDir) }}>

                    {dirKo(data.volumeDir)}

                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8' }}>

                    {data.volumeVote

                      ? `↑${data.volumeVote.up} ↓${data.volumeVote.down}${

                          data.volumeVote.pLong != null ? ` · ${(data.volumeVote.pLong * 100).toFixed(0)}%↑` : ''

                        }`

                      : '수급 유사'}

                  </div>

                </div>

              </div>

              <div style={{ fontSize: 11, color: '#94a3b8' }}>

                실패 닮은꼴 위험(참고) {fmtPct(data.successFailureCandle.failureRisk)}

                {data.mtfConflict ? ' · 타임프레임 의견 충돌' : ''}

              </div>



              {data.spotFuture ? (

                <div

                  style={{

                    padding: '8px 10px',

                    borderRadius: 8,

                    border: '1px solid rgba(56,189,248,0.45)',

                    background: 'rgba(14,165,233,0.1)',

                  }}

                  title={data.spotFuture.detailKo}

                >

                  <div style={{ fontWeight: 800 }}>③ 비슷한 뒤 현물(참고)</div>

                  <div style={{ marginTop: 4 }}>{data.spotFuture.labelKo}</div>

                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>

                    표본 {data.spotFuture.sampleCount}개 · 이후 {data.spotFuture.horizonBars}봉

                    {data.spotFuture.closePct != null

                      ? ` · 종가중앙 ${data.spotFuture.closePct >= 0 ? '+' : ''}${data.spotFuture.closePct.toFixed(2)}%`

                      : ''}{' '}

                    · 확정 아님

                  </div>

                </div>

              ) : null}



              {sectionTitle(

                '④ 가장 비슷한 과거 → 그 다음 롱/숏',

                '날짜 UTC. 닮음% · 이후 3/5/10봉 종가변화. 미래 누수 없는 구간만.'

              )}

              <div>

                <div style={{ fontWeight: 700, marginBottom: 4 }}>가격 모양 Top</div>

                {data.candleHits.slice(0, 8).map((h) => (

                  <div

                    key={`${h.openTime}-${h.window}`}

                    style={{

                      color: '#cbd5e1',

                      display: 'flex',

                      flexWrap: 'wrap',

                      gap: 6,

                      alignItems: 'center',

                      marginBottom: 2,

                    }}

                  >

                    <span>{h.iso.slice(0, 16).replace('T', ' ')}</span>

                    <span style={{ color: '#94a3b8' }}>닮음 {(h.cosine * 100).toFixed(0)}%</span>

                    <span

                      style={{

                        fontWeight: 800,

                        color:

                          h.nextDir === 'LONG' ? '#34d399' : h.nextDir === 'SHORT' ? '#f87171' : '#94a3b8',

                      }}

                    >

                      {h.nextDirKo || '결과없음'}

                    </span>

                    <span style={{ fontSize: 11, color: '#64748b' }}>

                      3봉 {fmtRet(h.after3Pct)} · 5봉 {fmtRet(h.after5Pct)} · 10봉 {fmtRet(h.after10Pct)} ·{' '}

                      {regimeKo(h.regime)}

                    </span>

                  </div>

                ))}

                {!data.candleHits.length ? (

                  <div style={{ color: '#94a3b8' }}>비슷한 구간을 못 찾음 (억지로 채우지 않음)</div>

                ) : null}

              </div>

              <div>

                <div style={{ fontWeight: 700, marginBottom: 4 }}>가격+거래량 Top</div>

                {data.volumeHits.slice(0, 8).map((h) => (

                  <div

                    key={`v-${h.openTime}-${h.window}`}

                    style={{

                      color: '#cbd5e1',

                      display: 'flex',

                      flexWrap: 'wrap',

                      gap: 6,

                      alignItems: 'center',

                      marginBottom: 2,

                    }}

                  >

                    <span>{h.iso.slice(0, 16).replace('T', ' ')}</span>

                    <span style={{ color: '#94a3b8' }}>닮음 {(h.cosine * 100).toFixed(0)}%</span>

                    <span

                      style={{

                        fontWeight: 800,

                        color:

                          h.nextDir === 'LONG' ? '#34d399' : h.nextDir === 'SHORT' ? '#f87171' : '#94a3b8',

                      }}

                    >

                      {h.nextDirKo || '결과없음'}

                    </span>

                    <span style={{ fontSize: 11, color: '#64748b' }}>

                      3봉 {fmtRet(h.after3Pct)} · 5봉 {fmtRet(h.after5Pct)} · 10봉 {fmtRet(h.after10Pct)}

                    </span>

                  </div>

                ))}

                {!data.volumeHits.length ? <div style={{ color: '#94a3b8' }}>거래량까지 닮은 구간 없음</div> : null}

              </div>



              {data.mtf?.length ? (

                <>

                  {sectionTitle('⑤ 다른 시간대', '15분·1시간·4시간 등')}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

                    {data.mtf.map((m) => (

                      <span

                        key={m.tf}

                        className={styles.tbScanChip}

                        title={m.role}

                        style={{ color: dirColor(m.verdict as 'LONG' | 'SHORT' | 'WAIT') }}

                      >

                        {m.tf} {dirKo(m.verdict as 'LONG' | 'SHORT' | 'WAIT')}

                      </span>

                    ))}

                  </div>

                </>

              ) : null}



              <button

                type="button"

                className="tool-chip tool-chip-button"

                onClick={() => setShowDetail((v) => !v)}

                style={{ justifySelf: 'start' }}

              >

                {showDetail ? '상세 통계 접기' : '상세 통계 펼치기'}

              </button>



              {showDetail ? (

                <div

                  style={{

                    display: 'grid',

                    gap: 6,

                    padding: 8,

                    borderRadius: 8,

                    border: '1px solid rgba(71,85,105,0.6)',

                    background: 'rgba(2,6,23,0.45)',

                    fontSize: 11,

                    color: '#94a3b8',

                  }}

                >

                  <div>

                    저장 봉 {data.inventory.count.toLocaleString()}개 · 처음 {isoShort(data.inventory.firstOpenTime)} · 끝{' '}

                    {isoShort(data.inventory.lastOpenTime)} · 빈칸 {data.inventory.missingCount} · 중복{' '}

                    {data.inventory.duplicateCount}

                  </div>

                  {data.firstTouch ? (

                    <div>

                      과거 첫 도달: {data.firstTouch.result} · {data.firstTouch.bars}봉 · 유리최대(MFE){' '}

                      {fmtN(data.firstTouch.mfe)} · 불리최대(MAE) {fmtN(data.firstTouch.mae)}

                    </div>

                  ) : (

                    <div>첫 도달 표본 부족</div>

                  )}

                  <div>

                    유리폭(MFE) 평균 {fmtN(data.mfeMae.mean)} · 중앙 {fmtN(data.mfeMae.median)} · 상위25%{' '}

                    {fmtN(data.mfeMae.p75)} · 상위10% {fmtN(data.mfeMae.p90)}

                  </div>

                  <div>

                    과거검증(가격) n={data.backtestCandle.sampleCount} · 승률참고 {fmtPct(data.backtestCandle.winRate)} ·

                    기대값참고 {fmtN(data.backtestCandle.evNet)}

                  </div>

                  <div>

                    과거검증(가격+거래량) n={data.backtestVolume.sampleCount} · 승률참고{' '}

                    {fmtPct(data.backtestVolume.winRate)} · 기대값참고 {fmtN(data.backtestVolume.evNet)}

                  </div>

                  <div>

                    표본밖(가격) 기대값 {fmtN(data.oosCandle.evNet)} n={data.oosCandle.sampleCount} · 표본밖(거래량){' '}

                    {fmtN(data.oosVolume.evNet)} n={data.oosVolume.sampleCount}

                  </div>

                  {data.walkForward ? (

                    <div>

                      구간검증 n={data.walkForward.sampleSize ?? 0} · 홀드아웃 기대값{' '}

                      {fmtN(data.walkForward.holdoutNetEv ?? null)} · 폴드 {data.walkForward.folds?.length ?? 0}

                    </div>

                  ) : null}

                  {data.outcomesSample?.length ? (

                    <div>

                      유사 후 종가변화{' '}

                      {data.outcomesSample

                        .map((o) => `+${o.horizon}봉 ${(o.closeReturn * 100).toFixed(2)}%`)

                        .join(' · ')}

                    </div>

                  ) : null}

                  {data.timeToTarget ? (

                    <div>

                      목표까지 평균 {fmtN(data.timeToTarget.meanBars, 1)}봉 · 중앙{' '}

                      {fmtN(data.timeToTarget.medianBars, 1)} · 미도달 {fmtPct(data.timeToTarget.missRate)} · n=

                      {data.timeToTarget.sample}

                    </div>

                  ) : null}

                  {data.calibration?.some((c) => c.n > 0) ? (

                    <div>

                      예측맞음{' '}

                      {data.calibration

                        .filter((c) => c.n > 0)

                        .map((c) => `${c.bin} 예측 ${fmtPct(c.predicted)} 실제 ${fmtPct(c.actual)} n=${c.n}`)

                        .join(' · ')}

                    </div>

                  ) : (

                    <div>예측맞음 표본 부족 (관망이면 비어 있을 수 있음)</div>

                  )}

                  {data.paperRecent?.length ? (

                    <div>

                      연습기록 {data.paperRecent.length}건 · 최근{' '}

                      {data.paperRecent[data.paperRecent.length - 1]?.direction}{' '}

                      {data.paperRecent[data.paperRecent.length - 1]?.outcome}

                    </div>

                  ) : (

                    <div>연습기록 없음</div>

                  )}

                  <div style={{ opacity: 0.85 }}>{data.note}</div>

                  {data.logs[0] ? <div style={{ opacity: 0.55 }}>{data.logs.slice(-3).join(' | ')}</div> : null}

                </div>

              ) : null}



              <div style={{ fontSize: 11, color: '#64748b' }}>

                참고용입니다. 승률·수익을 보장하지 않으며, 투자 판단은 본인 책임입니다.

              </div>

            </>

          ) : !loading ? (

            <div>아직 결과 없음 · 「다시 찾기」를 눌러 주세요</div>

          ) : null}

        </div>

      </FoldCard>

    </div>

  );

}


