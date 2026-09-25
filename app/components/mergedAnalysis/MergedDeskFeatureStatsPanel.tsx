'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { CandleCardConfluencePack } from '@/lib/mergedDeskCandleCardConfluence';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import {
  FEATURE_STATS_CHIPS,
  buildMergedDeskFeatureStatsPack,
  formatFeatureStatsPct,
  type FeatureStatsChipId,
  type MergedDeskFeatureStatsPack,
} from '@/lib/mergedDeskFeatureStatsSim';
import {
  attachAvwapAiToFeatureStatsPack,
  buildAvwapStatsConfluenceHub,
} from '@/lib/vwap/avwapStatsConfluenceHub';
import type { AvwapFibConfluencePack } from '@/lib/vwap/avwapFibConfluence';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  candles: Candle[];
  timeframe: string;
  symbol: string;
  analysis?: AnalyzeResponse | null;
  overlays?: OverlayItem[] | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  candleCard?: CandleCardConfluencePack | null;
  settleBoard?: TfCloseSettleBoard | null;
  hubVerdictKo?: string | null;
  hubHeadlineKo?: string | null;
  /** AVWAP 피보·골든·헌팅 팩 — 있으면 통계×AI 합류 */
  avwapFibPack?: AvwapFibConfluencePack | null;
};

const SECTION_ORDER: FeatureStatsChipId[] = [
  'overview',
  'mode',
  'avwapAi',
  'sr',
  'volume',
  'settle',
  'bounce',
  'spot',
  'card',
  'extra',
];

function portalTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

function sectionDomId(id: FeatureStatsChipId): string {
  return `feat-stats-sec-${id}`;
}

function Tone({ tone }: { tone: 'good' | 'warn' | 'neutral' }) {
  const c =
    tone === 'good' ? '#4ade80' : tone === 'warn' ? '#fbbf24' : 'rgba(226,232,240,0.75)';
  return <span className={styles.featStatsTone} style={{ background: c }} aria-hidden />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.featStatsMetric}>
      <span className={styles.featStatsMetricLab}>{label}</span>
      <span className={styles.featStatsMetricVal}>{value}</span>
    </div>
  );
}

function SectionShell({
  id,
  title,
  hint,
  children,
}: {
  id: FeatureStatsChipId;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      id={sectionDomId(id)}
      className={styles.featStatsBlock}
      aria-labelledby={`${sectionDomId(id)}-h`}
    >
      <header className={styles.featStatsBlockHead}>
        <h3 id={`${sectionDomId(id)}-h`} className={styles.featStatsBlockTitle}>
          {title}
        </h3>
        <span className={styles.featStatsBlockHint}>{hint}</span>
      </header>
      {children}
    </section>
  );
}

function OverviewBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="overview" title="한눈 요약" hint="실측 백테스트 + 라이브 카드">
      <div className={styles.featStatsHeadlineGrid}>
        <Metric label="지지 강" value={pack.headline.bestSupportKo || '—'} />
        <Metric label="저항 강" value={pack.headline.bestResistKo || '—'} />
        <Metric label="거래량" value={pack.headline.volBiasKo || '—'} />
        <Metric label="안착" value={pack.headline.settleBiasKo || '—'} />
      </div>
      <ul className={styles.featStatsBulletList}>
        {pack.overviewKo.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className={styles.featStatsHint}>
        EMA50·스윙저점 등은 맞습니다 — 현재 TF 캔들로 터치·유지·거절을 다시 센 값입니다. 아래
        모드기능→지지저항→… 전부 한 화면에 이어집니다.
      </p>
    </SectionShell>
  );
}

function ModeBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="mode" title="통합모드 기능 맵" hint="켜진 기능 + 통계 연결">
      <div className={styles.featStatsTableWrap}>
        <table className={styles.featStatsTable}>
          <thead>
            <tr>
              <th>그룹</th>
              <th>기능</th>
              <th>라이브</th>
              <th>통계</th>
              <th>연동</th>
            </tr>
          </thead>
          <tbody>
            {pack.modeFeatures.map((m) => (
              <tr key={m.id} data-weak={m.linked ? '0' : '1'}>
                <td>{m.groupKo}</td>
                <td>{m.labelKo}</td>
                <td>{m.liveKo}</td>
                <td>{m.statKo || '—'}</td>
                <td>{m.linked ? 'ON' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function SrBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="sr" title="지지·저항" hint="기능별 터치·유지·거절">
      <div className={styles.featStatsTableWrap}>
        <table className={styles.featStatsTable}>
          <thead>
            <tr>
              <th>기능</th>
              <th>터치</th>
              <th>지지유지</th>
              <th>저항거절</th>
              <th>돌파</th>
              <th>RVOL</th>
            </tr>
          </thead>
          <tbody>
            {pack.levels.map((r) => (
              <tr key={r.id} data-weak={r.sampleOk ? '0' : '1'}>
                <td>{r.labelKo}</td>
                <td>{r.touches}</td>
                <td>{formatFeatureStatsPct(r.supportHoldPct)}</td>
                <td>{formatFeatureStatsPct(r.resistRejectPct)}</td>
                <td>{formatFeatureStatsPct(r.breakPct)}</td>
                <td>{r.avgVolVsSma != null ? `${r.avgVolVsSma.toFixed(2)}×` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!pack.levels.length ? <p className={styles.featStatsEmpty}>레벨 터치 표본 없음</p> : null}
    </SectionShell>
  );
}

function VolumeBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="volume" title="거래량" hint="양·음봉 · 고저거래">
      <div className={styles.featStatsCardGrid}>
        {pack.volume.map((v) => (
          <div key={v.id} className={styles.featStatsMiniCard}>
            <div className={styles.featStatsMiniTitle}>{v.labelKo}</div>
            <div className={styles.featStatsMiniMain}>
              RVOL {v.avgRvol.toFixed(2)}× · n={v.sample}
            </div>
            <div className={styles.featStatsMiniSub}>
              중앙봉 {v.medianClosePct != null ? `${v.medianClosePct.toFixed(2)}%` : '—'} · 양봉비중{' '}
              {formatFeatureStatsPct(v.upSharePct)}
            </div>
            <div className={styles.featStatsMiniNote}>{v.noteKo}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function SettleBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="settle" title="안착·마감" hint="종가안착 후 방향 적중">
      <div className={styles.featStatsCardGrid}>
        {pack.settle.map((s) => (
          <div key={s.id} className={styles.featStatsMiniCard} data-weak={s.sampleLowTrust ? '1' : '0'}>
            <div className={styles.featStatsMiniTitle}>{s.labelKo}</div>
            <div className={styles.featStatsMiniMain}>
              방향적중 {formatFeatureStatsPct(s.nextDirHitPct)}
            </div>
            <div className={styles.featStatsMiniSub}>
              중앙 {s.medianNextPct != null ? `${s.medianNextPct.toFixed(2)}%` : '—'} · n={s.sample}
              {s.sampleLowTrust ? ' · 표본부족' : ''}
            </div>
            <div className={styles.featStatsMiniNote}>{s.noteKo}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function BounceBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="bounce" title="반등·돌파" hint="지지 반등 · 저항 거절">
      <div className={styles.featStatsCardGrid}>
        {pack.bounce.map((b) => (
          <div key={b.id} className={styles.featStatsMiniCard}>
            <div className={styles.featStatsMiniTitle}>{b.labelKo}</div>
            <div className={styles.featStatsMiniMain}>성공 {formatFeatureStatsPct(b.successPct)}</div>
            <div className={styles.featStatsMiniSub}>
              MFE {b.medianMfePct != null ? `${b.medianMfePct.toFixed(2)}%` : '—'} · MAE{' '}
              {b.medianMaePct != null ? `${b.medianMaePct.toFixed(2)}%` : '—'} · n={b.sample}
            </div>
            <div className={styles.featStatsMiniNote}>{b.noteKo}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function SpotBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="spot" title="현물 시뮬" hint="이벤트 후 N봉 상승·하락 %">
      <div className={styles.featStatsTableWrap}>
        <table className={styles.featStatsTable}>
          <thead>
            <tr>
              <th>시뮬</th>
              <th>n</th>
              <th>상승</th>
              <th>하락</th>
              <th>중앙%</th>
              <th>TP선도달*</th>
            </tr>
          </thead>
          <tbody>
            {pack.spot.map((s) => (
              <tr key={s.id} data-weak={s.sampleLowTrust ? '1' : '0'}>
                <td>{s.labelKo}</td>
                <td>{s.sample}</td>
                <td>{formatFeatureStatsPct(s.upPct)}</td>
                <td>{formatFeatureStatsPct(s.downPct)}</td>
                <td>{s.medianPct != null ? `${s.medianPct.toFixed(2)}%` : '—'}</td>
                <td>{formatFeatureStatsPct(s.hitTpBeforeSlPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.featStatsHint}>* ATR 간이 TP/SL — 실주문 아님 · 현물 종가 기준</p>
    </SectionShell>
  );
}

function CardBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="card" title="카드 합류" hint="ActiveTrade · 캔들카드">
      <div className={styles.featStatsCardGrid}>
        {pack.card.map((c) => (
          <div key={c.id} className={styles.featStatsMiniCard}>
            <div className={styles.featStatsMiniTitle}>
              <Tone tone={c.tone} />
              {c.labelKo}
            </div>
            <div className={styles.featStatsMiniMain}>{c.valueKo}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ExtraBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <SectionShell id="extra" title="더보기" hint="연속 · ATR · RVOL">
      <div className={styles.featStatsCardGrid}>
        {pack.extra.map((e) => (
          <div key={e.id} className={styles.featStatsMiniCard}>
            <div className={styles.featStatsMiniTitle}>{e.labelKo}</div>
            <div className={styles.featStatsMiniMain}>{e.valueKo}</div>
            {e.noteKo ? <div className={styles.featStatsMiniNote}>{e.noteKo}</div> : null}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function AvwapAiBlock({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  const ai = pack.avwapAi;
  return (
    <SectionShell id="avwapAi" title="AVWAP·AI 합류" hint="통계×피보·골든·헌팅 → 롱/숏/WAIT">
      {!ai ? (
        <p className={styles.featStatsEmpty}>
          AVWAP·피보·GP·헌팅 ON 후 통계를 다시 열면 합류 점수가 붙습니다.
        </p>
      ) : (
        <>
          <div className={styles.featStatsHeadlineGrid}>
            <Metric label="판정" value={ai.titleKo} />
            <Metric label="롱점수" value={`L${ai.longScore}`} />
            <Metric label="숏점수" value={`S${ai.shortScore}`} />
            <Metric label="합류" value={`${ai.confidence}${ai.entryAllowed ? ' · 후보' : ''}`} />
          </div>
          <ul className={styles.featStatsBulletList}>
            <li>{ai.summaryKo}</li>
            {ai.targets.pullbackKo ? <li>되돌림: {ai.targets.pullbackKo}</li> : null}
            {ai.targets.reboundKo ? <li>반등: {ai.targets.reboundKo}</li> : null}
            {ai.targets.huntKo ? <li>헌팅: {ai.targets.huntKo}</li> : null}
            {ai.targets.settleKo ? <li>안착: {ai.targets.settleKo}</li> : null}
          </ul>
          <div className={styles.featStatsTableWrap}>
            <table className={styles.featStatsTable}>
              <thead>
                <tr>
                  <th>그룹</th>
                  <th>투표</th>
                  <th>방향</th>
                  <th>가중</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {ai.votes.map((v) => (
                  <tr key={v.id}>
                    <td>{v.groupKo}</td>
                    <td>{v.labelKo}</td>
                    <td>{v.side === 'long' ? '롱' : v.side === 'short' ? '숏' : '대기'}</td>
                    <td>{v.weight}</td>
                    <td>{v.noteKo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ai.votes.length ? <p className={styles.featStatsEmpty}>합류 투표 없음 — 표본·위치 재확인</p> : null}
          <p className={styles.featStatsHint}>{ai.disclaimerKo}</p>
        </>
      )}
    </SectionShell>
  );
}

function AllDashboard({ pack }: { pack: MergedDeskFeatureStatsPack }) {
  return (
    <div className={styles.featStatsDashboard}>
      <OverviewBlock pack={pack} />
      <ModeBlock pack={pack} />
      <AvwapAiBlock pack={pack} />
      <SrBlock pack={pack} />
      <VolumeBlock pack={pack} />
      <SettleBlock pack={pack} />
      <BounceBlock pack={pack} />
      <SpotBlock pack={pack} />
      <CardBlock pack={pack} />
      <ExtraBlock pack={pack} />
    </div>
  );
}

export function MergedDeskFeatureStatsPanel({
  open,
  onClose,
  candles,
  timeframe,
  symbol,
  analysis,
  overlays,
  activeTrade,
  candleCard,
  settleBoard,
  hubVerdictKo,
  hubHeadlineKo,
  avwapFibPack,
}: Props) {
  const [activeChip, setActiveChip] = useState<FeatureStatsChipId>('overview');
  const [mounted, setMounted] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const scrollLockRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveChip('overview');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pack = useMemo(() => {
    if (!open) return null;
    const base = buildMergedDeskFeatureStatsPack({
      candles,
      timeframe,
      symbol,
      analysis,
      overlays,
      activeTrade,
      candleCard,
      settleBoard,
      hubVerdictKo,
      hubHeadlineKo,
    });
    if (!base) return null;
    const hub = buildAvwapStatsConfluenceHub({
      candles,
      stats: base,
      fibPack: avwapFibPack ?? null,
    });
    return attachAvwapAiToFeatureStatsPack(base, hub);
  }, [
    open,
    candles,
    timeframe,
    symbol,
    analysis,
    overlays,
    activeTrade,
    candleCard,
    settleBoard,
    hubVerdictKo,
    hubHeadlineKo,
    avwapFibPack,
  ]);

  const jumpTo = useCallback((id: FeatureStatsChipId) => {
    setActiveChip(id);
    const root = bodyRef.current;
    const el = root?.querySelector(`#${sectionDomId(id)}`) as HTMLElement | null;
    if (!root || !el) return;
    scrollLockRef.current = true;
    const top = el.offsetTop - 8;
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    window.setTimeout(() => {
      scrollLockRef.current = false;
    }, 420);
  }, []);

  useEffect(() => {
    if (!open || !pack) return;
    const root = bodyRef.current;
    if (!root) return;

    const onScroll = () => {
      if (scrollLockRef.current) return;
      const y = root.scrollTop + 48;
      let current: FeatureStatsChipId = 'overview';
      for (const id of SECTION_ORDER) {
        const el = root.querySelector(`#${sectionDomId(id)}`) as HTMLElement | null;
        if (!el) continue;
        if (el.offsetTop <= y) current = id;
      }
      setActiveChip((prev) => (prev === current ? prev : current));
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [open, pack]);

  if (!open || !mounted) return null;
  const host = portalTarget();
  if (!host) return null;

  const body = (
    <div className={styles.featStatsBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.featStatsPanel}
        role="dialog"
        aria-modal="true"
        aria-label="통합 기능 통계 시뮬"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.featStatsHead}>
          <div className={styles.featStatsHeadText}>
            <h2 className={styles.featStatsTitle}>기능 통계 시뮬</h2>
            <p className={styles.featStatsSub}>
              {symbol || '—'} · {timeframe} · {pack ? `${pack.lookback}봉` : '—'} · 전체 한눈에 · 칩=점프
            </p>
          </div>
          <button type="button" className={styles.featStatsClose} onClick={onClose} title="닫기 (Esc)">
            닫기
          </button>
        </header>

        <nav className={styles.featStatsChipRow} aria-label="구간 바로가기">
          {FEATURE_STATS_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`tool-chip tool-chip-button ${activeChip === c.id ? 'tool-chip-active' : ''}`}
              title={`${c.hintKo} — 해당 구간으로 이동`}
              onClick={() => jumpTo(c.id)}
              data-on={activeChip === c.id ? '1' : '0'}
            >
              {c.labelKo}
            </button>
          ))}
        </nav>

        <div className={styles.featStatsBody} ref={bodyRef}>
          {!pack ? (
            <p className={styles.featStatsEmpty}>봉 수 부족 — 48봉 이상 필요</p>
          ) : (
            <AllDashboard pack={pack} />
          )}
        </div>

        <footer className={styles.featStatsFoot}>
          {pack?.disclaimerKo || '조건부 시뮬입니다. 확정 승률·수익 보장 아님.'}
        </footer>
      </div>
    </div>
  );

  return createPortal(body, host);
}
