/**
 * 전체화면 전용 — 차트 우측 테두리 AI Market Zone 카드.
 * 일반 통합모드 레이아웃은 수정하지 않음. 확정 승률 문구 금지.
 * 라벨·수치는 엔진 실데이터(한글) — 껍데기 영어 금지.
 */
'use client';

import type { AmzEnginePack, AmzMarketZone } from '@/lib/aiMarketZoneEngine';
import styles from './MergedDeskAiMarketZoneSideCard.module.css';

type Props = {
  pack: AmzEnginePack | null;
  symbol: string;
  timeframe: string;
  currentPrice: number | null;
  onClose: () => void;
};

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'WAIT';
  return `${Math.round(v * 100)}%`;
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function nearestZone(zones: AmzMarketZone[], price: number | null): AmzMarketZone | null {
  if (!zones.length) return null;
  if (price == null || !(price > 0)) return zones[0] ?? null;
  let best: AmzMarketZone | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const mid = (z.outerLower + z.outerUpper) / 2;
    const d = Math.abs(mid - price);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function barWidth(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(v * 100)))}%`;
}

function strengthKo(z: AmzMarketZone): string {
  if (z.currentStrength >= 75) return '강한';
  if (z.currentStrength >= 55) return '';
  return '약한';
}

function zoneTitle(z: AmzMarketZone): string {
  const role = z.roleKo.replace(/^강한\s+/, '').replace(/^약한\s+/, '');
  const s = strengthKo(z);
  return s ? `AI ${s} ${role}` : `AI ${role}`;
}

function battleVerdict(z: AmzMarketZone): string {
  if (z.defenseScore >= z.attackScore + 12) return '방어 우세';
  if (z.attackScore >= z.defenseScore + 12) return '공격 우세';
  return '공방 균형';
}

export function MergedDeskAiMarketZoneSideCard({
  pack,
  symbol,
  timeframe,
  currentPrice,
  onClose,
}: Props) {
  const zones = pack?.zones ?? [];
  const near = nearestZone(zones, currentPrice);
  const of = pack?.orderflow;
  const probs = near?.probabilities;
  const explain =
    near?.explainKo?.find((s) => s.length > 40) ||
    near?.explainKo?.[near.explainKo.length - 1] ||
    pack?.disclaimerKo ||
    '데이터 수집 중';

  return (
    <aside className={styles.card} role="dialog" aria-label="AI Market Zone 카드" data-amz-fs-card="1">
      <header className={styles.head}>
        <div>
          <div className={styles.kicker}>AI MARKET ZONE</div>
          <div className={styles.titleRow}>
            <span className={styles.onPill}>{pack ? 'ON' : '…'}</span>
            <span className={styles.sym}>
              {symbol} · {timeframe}
            </span>
          </div>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>

      <div className={styles.priceRow}>
        <span className={styles.price}>{fmt(currentPrice)}</span>
        <span className={styles.status}>{pack?.statusKo ?? '대기'}</span>
      </div>

      <section className={styles.block}>
        <div className={styles.blockTitle}>ZONE 상태 요약</div>
        <div className={styles.kv}>
          <span>데이터 품질</span>
          <strong>{pack?.dataQuality ?? '—'}</strong>
        </div>
        <div className={styles.kv}>
          <span>활성 Zone</span>
          <strong>{zones.length}</strong>
        </div>
        <div className={styles.kv}>
          <span>실시간 검증</span>
          <strong>{pack?.liveValidation?.ok ? '통과' : pack?.liveValidation?.summaryKo ?? '—'}</strong>
        </div>
      </section>

      {zones.length > 0 && (
        <section className={styles.block}>
          <div className={styles.blockTitle}>AI ZONE 목록</div>
          <ul className={styles.zoneList}>
            {zones.slice(0, 8).map((z) => {
              const resist =
                z.role === 'DEFENSE_RESISTANCE' || z.role === 'LIQUIDITY_TRAP';
              return (
                <li
                  key={z.id}
                  className={`${styles.zoneLi} ${near?.id === z.id ? styles.zoneLiActive : ''} ${
                    resist ? styles.zoneLiResist : styles.zoneLiSupport
                  }`}
                >
                  <span className={styles.zoneDot} aria-hidden />
                  <div className={styles.zoneLiBody}>
                    <strong>{zoneTitle(z)}</strong>
                    <em>
                      {fmt(z.outerLower)} ~ {fmt(z.outerUpper)}
                    </em>
                    <small>
                      {z.stateKo} · 방어 {z.defenseScore} | 공격 {z.attackScore}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.blockTitle}>차트 축라벨 주입 · 알약 대체</div>
        {(pack?.priceLines ?? []).length > 0 ? (
          <ul className={styles.zoneList}>
            {(pack?.priceLines ?? []).slice(0, 10).map((pl, i) => (
              <li key={`${pl.price}-${i}`} className={styles.zoneLi}>
                <span className={styles.zoneDot} aria-hidden />
                <div className={styles.zoneLiBody}>
                  <strong>{pl.title}</strong>
                  <em>{fmt(pl.price)}</em>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.wait}>엔진 ON 후 가격축에 한글 라벨이 주입됩니다</div>
        )}
      </section>

      {near && (
        <section className={styles.block}>
          <div className={styles.blockTitle}>현재 접근 ZONE</div>
          <div className={styles.zoneName}>{zoneTitle(near)}</div>
          <div className={styles.zoneRange}>
            {fmt(near.outerLower)} ~ {fmt(near.outerUpper)}
          </div>
          <div className={styles.kv}>
            <span>상태</span>
            <strong>{near.stateKo}</strong>
          </div>
          <div className={styles.kv}>
            <span>핵심 구간</span>
            <strong>
              {fmt(near.coreLower)} ~ {fmt(near.coreUpper)}
            </strong>
          </div>
          {near.coreDefensePrice != null && (
            <div className={styles.kv}>
              <span>핵심 방어가</span>
              <strong>{fmt(near.coreDefensePrice)}</strong>
            </div>
          )}
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.blockTitle}>보정 확률 · 참고</div>
        {probs?.calibrated ? (
          <>
            {(
              [
                ['유지', probs.hold],
                ['돌파', probs.breakTrue],
                ['가짜돌파', probs.fakeBreak],
                ['스윕', probs.sweep],
                ['횡보', probs.range],
                ['전환', probs.flip],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className={styles.probRow}>
                <span>{label}</span>
                <div className={styles.probTrack}>
                  <i style={{ width: barWidth(v) }} />
                </div>
                <em>{pct(v)}</em>
              </div>
            ))}
            <div className={styles.sample}>표본 n={probs.sampleSize} · 확정 아님 · 참고용</div>
          </>
        ) : (
          <div className={styles.wait}>{probs?.abstainReasonKo || '표본·합의 부족 · 확률 WAIT'}</div>
        )}
      </section>

      {near && (
        <section className={styles.block}>
          <div className={styles.blockTitle}>
            AI ZONE 전투 · {battleVerdict(near)} ({near.defenseScore}:{near.attackScore})
          </div>
          <div className={styles.battleRow}>
            <span>방어</span>
            <div className={styles.probTrack}>
              <i className={styles.def} style={{ width: `${near.defenseScore}%` }} />
            </div>
            <em>{near.defenseScore}</em>
          </div>
          <div className={styles.battleRow}>
            <span>공격</span>
            <div className={styles.probTrack}>
              <i className={styles.atk} style={{ width: `${near.attackScore}%` }} />
            </div>
            <em>{near.attackScore}</em>
          </div>
          <div className={styles.kv}>
            <span>전투 강도</span>
            <strong>{near.battleIntensity}</strong>
          </div>
          <div className={styles.kv}>
            <span>생명 / 피로 / 안정</span>
            <strong>
              {near.lifeScore} / {near.fatigueScore} / {near.stabilityScore}
            </strong>
          </div>
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.blockTitle}>주문 흐름 요약</div>
        <div className={styles.kv}>
          <span>가용</span>
          <strong>{of?.available ? '부분 수집' : '데이터 없음'}</strong>
        </div>
        <div className={styles.kv}>
          <span>매수 압력</span>
          <strong>{of?.buyPressure != null ? pct(of.buyPressure) : '없음'}</strong>
        </div>
        <div className={styles.kv}>
          <span>재보충</span>
          <strong>{of?.replenishmentScore ?? '없음'}</strong>
        </div>
        <div className={styles.note}>{of?.noteKo || '—'}</div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockTitle}>AI 설명 · Feature</div>
        <p className={styles.explain}>{explain}</p>
      </section>

      <footer className={styles.foot}>{pack?.disclaimerKo || '참고용 · 확정 수익/승률 아님'}</footer>
    </aside>
  );
}
