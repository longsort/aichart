/**
 * 매매 파이프라인 점검 — ARM·칩·통계프로파일·진입모듈·스캔 연결.
 * 확정 수익·승률 아님.
 */
import {
  isAutoTradeSymbolEnabled,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import {
  getCoinExitProfile,
  listProfileLiveTfs,
  type AutoTradeCoinKey,
} from '@/lib/mergedDeskCoinExitProfile';
import { readYearReplayPack } from '@/lib/mergedDeskYearReplayCache';
import {
  lateEntryGate,
  resolveReinforcedEntrySlTp,
} from '@/lib/mergedDeskEntryRedesign';
import {
  resolveUnifiedTradeMode,
  executeUnifiedAnalysisEntry,
} from '@/lib/mergedDeskUnifiedAnalysisEntry';
import { readVirtualTradeSession } from '@/lib/mergedDeskVirtualTradeSession';
import { aiZoneEntryGate } from '@/lib/mergedDeskAiZoneEntryGate';
import { readAiZoneEntrySnapshot } from '@/lib/mergedDeskAiZoneSnapshot';
import {
  buildRegimeKey,
  consecutiveEntryGate,
} from '@/lib/mergedDeskConsecutiveEntryGuard';

export type HealthTone = 'up' | 'down' | 'flat';

export type HealthRow = {
  id: string;
  ok: boolean;
  tone: HealthTone;
  titleKo: string;
  detailKo: string;
  /** true면 진입 자체 불가 */
  blockEntry?: boolean;
};

export type TradeHealthReport = {
  okEntry: boolean;
  tone: HealthTone;
  titleKo: string;
  summaryKo: string;
  rows: HealthRow[];
  checkedAt: number;
};

/** 공지점 — 점검에서 걸린 문제만 모음 */
export type HealthNotice = {
  id: string;
  level: 'block' | 'warn';
  titleKo: string;
  detailKo: string;
};

export function listHealthNotices(report: TradeHealthReport | null | undefined): HealthNotice[] {
  if (!report?.rows?.length) return [];
  return report.rows
    .filter((r) => !r.ok)
    .map((r) => ({
      id: r.id,
      level: r.blockEntry ? ('block' as const) : ('warn' as const),
      titleKo: r.titleKo,
      detailKo: r.detailKo,
    }));
}

export function healthNoticeSummaryKo(notices: HealthNotice[]): string {
  if (!notices.length) return '공지점 · 문제 없음';
  const blocks = notices.filter((n) => n.level === 'block').length;
  const warns = notices.filter((n) => n.level === 'warn').length;
  const head = notices
    .slice(0, 3)
    .map((n) => n.titleKo)
    .join(' · ');
  if (blocks > 0) return `공지점 · 차단${blocks} · 주의${warns} · ${head}`;
  return `공지점 · 주의${warns}건 · ${head}`;
}

const NOTICE_KEY = 'ailongshort.mergedDesk.healthNotice.v1';

export function persistHealthReport(report: TradeHealthReport): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      NOTICE_KEY,
      JSON.stringify({
        checkedAt: report.checkedAt,
        okEntry: report.okEntry,
        tone: report.tone,
        titleKo: report.titleKo,
        summaryKo: report.summaryKo,
        notices: listHealthNotices(report),
      })
    );
  } catch {
    /* ignore */
  }
}

export function readPersistedHealthNotices(): HealthNotice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTICE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as { notices?: HealthNotice[] };
    return Array.isArray(j.notices) ? j.notices : [];
  } catch {
    return [];
  }
}

function row(
  id: string,
  ok: boolean,
  titleKo: string,
  detailKo: string,
  blockEntry = false
): HealthRow {
  return {
    id,
    ok,
    tone: ok ? 'up' : blockEntry ? 'down' : 'flat',
    titleKo,
    detailKo,
    blockEntry: blockEntry && !ok,
  };
}

function profileLine(coin: AutoTradeCoinKey): HealthRow {
  const p = getCoinExitProfile(coin);
  const pack = readYearReplayPack(coin);
  if (!p && !pack) {
    return row(
      `prof-${coin}`,
      false,
      `${coin} 통계프로파일`,
      '없음 · 통계탭 1회 실행 후 서버에 영구저장(재다운 불필요)',
      false
    );
  }
  const skip = (p?.skipTfs || []).join(',') || '—';
  const prefer = (p?.preferTfs || []).join(',') || '—';
  const failN = p?.failBands?.length ?? 0;
  const live = listProfileLiveTfs(`${coin}USDT`, coin === 'BTC' ? ['3m', '5m'] : ['3m', '5m']);
  const at = Number(p?.updatedAt || pack?.savedAt) || 0;
  const ageH = at > 0 ? Math.max(0, Math.round((Date.now() - at) / 3_600_000)) : null;
  const ageKo = ageH == null ? '' : ageH < 24 ? `${ageH}시간전` : `${Math.round(ageH / 24)}일전`;
  return row(
    `prof-${coin}`,
    true,
    `${coin} 통계프로파일`,
    `저장유지${ageKo ? ` · ${ageKo}` : ''} · 선호 ${prefer} · 배제TF ${skip} · 실패구간 ${failN} · 스캔 ${live.join(',')}`
  );
}

/** 동기 점검 (로컬 설정·모듈) */
export function buildTradeHealthSync(params: {
  cfg: MergedDeskAutoTradeConfig;
  keysConfigured?: boolean;
  keysAuthOk?: boolean;
  virtActive?: boolean;
}): TradeHealthReport {
  const cfg = params.cfg;
  const virt = params.virtActive ?? readVirtualTradeSession().active;
  const mode = resolveUnifiedTradeMode(cfg, virt);
  const rows: HealthRow[] = [];

  rows.push(
    row(
      'module-entry',
      typeof executeUnifiedAnalysisEntry === 'function' &&
        typeof lateEntryGate === 'function' &&
        typeof resolveReinforcedEntrySlTp === 'function',
      '진입모듈',
      'executeUnified · lateGate · reinforceSLTP 연결됨',
      true
    )
  );

  rows.push(
    row(
      'mode',
      mode != null,
      '매매모드',
      mode === 'live'
        ? virt
          ? '실전+가상 병행 · 같은 신호→둘 다'
          : '실전 ARM ON · 신호→실주문'
        : mode === 'virtual'
          ? '가상세션 ON · 신호→가상진입'
          : 'OFF · 가상시작 또는 실전ARM 필요',
      true
    )
  );

  rows.push(
    row(
      'engine',
      cfg.enabled || cfg.liveArmed || virt,
      '엔진/세션',
      cfg.liveArmed ? '실전ARM' : virt ? '가상ON' : cfg.enabled ? '엔진ON·모드대기' : 'OFF',
      true
    )
  );

  if (cfg.liveArmed) {
    rows.push(
      row(
        'keys',
        Boolean(params.keysConfigured && params.keysAuthOk !== false),
        'API키·인증',
        params.keysConfigured
          ? params.keysAuthOk === false
            ? '인증실패'
            : '등록·인증 OK'
          : '미등록 · 실주문 불가',
        true
      )
    );
  } else {
    rows.push(row('keys', true, 'API키·인증', '가상모드 · 실주문키 불필요', false));
  }

  const coins: Array<{ id: string; sym: string; route: string }> = [
    { id: 'BTC', sym: 'BTCUSDT', route: '3·5m로켓' },
    { id: 'ETH', sym: 'ETHUSDT', route: '폭락존' },
    { id: 'BNB', sym: 'BNBUSDT', route: 'SFP' },
    { id: 'XRP', sym: 'XRPUSDT', route: '4패턴' },
    { id: 'SOL', sym: 'SOLUSDT', route: '꼬리·BPR' },
  ];
  for (const c of coins) {
    const on = isAutoTradeSymbolEnabled(cfg, c.sym);
    rows.push(
      row(
        `chip-${c.id}`,
        on,
        `${c.id}칩`,
        on ? `ON · ${c.route}` : `OFF · ${c.route} 스캔/진입 안 함`,
        false
      )
    );
  }

  rows.push(
    row(
      'strat-scalp',
      cfg.strategyScalp !== false,
      '단타전략',
      cfg.strategyScalp !== false ? 'ON' : 'OFF · 폭락/로켓 등 스킵 가능',
      false
    )
  );

  for (const coin of ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'] as AutoTradeCoinKey[]) {
    rows.push(profileLine(coin));
  }

  /** smoke: late gate at same price always allows */
  try {
    const late = lateEntryGate({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      signalPrice: 100,
      markPrice: 100,
    });
    rows.push(
      row('late-smoke', late.allow, '늦은진입게이트', late.allow ? '정상' : late.reasonKo, false)
    );
  } catch (e) {
    rows.push(
      row(
        'late-smoke',
        false,
        '늦은진입게이트',
        e instanceof Error ? e.message : '오류',
        true
      )
    );
  }

  try {
    const rein = resolveReinforcedEntrySlTp({
      symbol: 'BTCUSDT',
      entry: 100,
      direction: 'LONG',
      leverage: 10,
      signalSl: 99,
      tp1RoePct: 5,
      slRoePct: 20,
      timeframe: '3m',
      preserveStructureSl: true,
    });
    rows.push(
      row(
        'rein-smoke',
        rein.ok,
        'SL/TP보강',
        rein.ok ? `SL ${rein.sl} · TP ${rein.tp}` : rein.reasonKo,
        true
      )
    );
  } catch (e) {
    rows.push(
      row('rein-smoke', false, 'SL/TP보강', e instanceof Error ? e.message : '오류', true)
    );
  }

  try {
    const az = aiZoneEntryGate({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      price: 100,
      leverage: 30,
    });
    rows.push(
      row(
        'aizone-mod',
        typeof aiZoneEntryGate === 'function',
        'AIZONE게이트',
        az.reasonKo || '모듈연결',
        false
      )
    );
  } catch (e) {
    rows.push(
      row('aizone-mod', false, 'AIZONE게이트', e instanceof Error ? e.message : '오류', false)
    );
  }

  const snapCoins: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];
  for (const coin of snapCoins) {
    const snap = readAiZoneEntrySnapshot(`${coin}USDT`);
    const age =
      snap?.updatedAt != null ? Math.round((Date.now() - snap.updatedAt) / 1000) : null;
    const fresh = age != null && age < 180;
    let evidenceKo = '';
    if (snap && snap.price > 0) {
      const preferLong =
        (snap.longPct ?? 0) >= (snap.shortPct ?? 0);
      const dir = preferLong ? 'LONG' : 'SHORT';
      const gate = aiZoneEntryGate({
        symbol: `${coin}USDT`,
        direction: dir,
        price: snap.price,
        leverage: 30,
        snap,
      });
      evidenceKo = ` · ${gate.evidenceKo || '근거—'} · 정렬${gate.evidenceAlignedN ?? 0}`;
    }
    rows.push(
      row(
        `aizone-snap-${coin}`,
        Boolean(snap && fresh),
        `${coin} AIZONE스냅`,
        snap
          ? `점수 롱${snap.longPct ?? '—'}%/숏${snap.shortPct ?? '—'}%${evidenceKo} · ${snap.htfFace?.labelKo || '면—'} · ${age ?? '?'}초전`
          : '없음 · 통합분석 차트 열면 게시',
        false
      )
    );
  }

  try {
    const rk = buildRegimeKey({ direction: 'LONG', timeframe: '3m' });
    const cg = consecutiveEntryGate({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      regimeKey: rk,
    });
    rows.push(
      row(
        'consec-mod',
        typeof consecutiveEntryGate === 'function',
        '연속진입가드',
        cg.reasonKo,
        false
      )
    );
  } catch (e) {
    rows.push(
      row('consec-mod', false, '연속진입가드', e instanceof Error ? e.message : '오류', false)
    );
  }

  const blockers = rows.filter((r) => r.blockEntry);
  const okEntry = blockers.length === 0 && mode != null;
  const warnN = rows.filter((r) => !r.ok && !r.blockEntry).length;
  let tone: HealthTone = 'up';
  let titleKo = '점검 · 매매연결 정상';
  let summaryKo = '신호 오면 진입 경로까지 연결됨 · 확정 수익 아님';
  if (!okEntry) {
    tone = 'down';
    titleKo = '점검 · 진입 불가';
    summaryKo = blockers.map((b) => b.titleKo).join(' · ') || '모드/모듈 확인';
  } else if (warnN > 0) {
    tone = 'flat';
    titleKo = '점검 · 매매가능(주의)';
    summaryKo = `진입가능 · 주의 ${warnN}건(칩OFF·통계미실행 등)`;
  }

  return {
    okEntry,
    tone,
    titleKo,
    summaryKo,
    rows,
    checkedAt: Date.now(),
  };
}

/** 스캔 API 연결 (로그인 쿠키 필요) */
export async function pingTradeScanApis(leverage = 30): Promise<HealthRow[]> {
  const specs: Array<{ id: string; title: string; url: string }> = [
    {
      id: 'scan-btc',
      title: 'BTC로켓눌림스캔',
      url: `/api/merged-desk/btc-3m-rocket-scan?leverage=${leverage}&tp1RoePct=8`,
    },
    {
      id: 'scan-eth',
      title: 'ETH 폭락스캔',
      url: `/api/merged-desk/bg-dump-scan?symbol=ETHUSDT&leverage=${leverage}&minRr=1.2`,
    },
    {
      id: 'scan-bnb',
      title: 'BNB SFP스캔',
      url: `/api/merged-desk/bnb-sfp-scan?leverage=${leverage}`,
    },
    {
      id: 'scan-xrp',
      title: 'XRP 4패턴스캔',
      url: `/api/merged-desk/xrp-4strat-scan?leverage=${leverage}&tp1RoePct=5`,
    },
    {
      id: 'scan-wick15',
      title: '15m꼬리추정스캔',
      url: `/api/merged-desk/wick-15m-scan?symbol=ALL&leverage=${leverage}&pctMin=70`,
    },
  ];
  const out: HealthRow[] = [];
  await Promise.all(
    specs.map(async (s) => {
      try {
        const res = await fetch(s.url, { credentials: 'same-origin', cache: 'no-store' });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          signals?: unknown[];
          hintKo?: string;
        };
        if (!res.ok || j.ok === false) {
          out.push(
            row(
              s.id,
              false,
              s.title,
              j.error || `HTTP ${res.status}`,
              res.status === 401
            )
          );
          return;
        }
        const n = Array.isArray(j.signals) ? j.signals.length : 0;
        out.push(
          row(
            s.id,
            true,
            s.title,
            n > 0 ? `응답OK · 신호 ${n}건` : `응답OK · 신호0 · ${j.hintKo || '대기'}`,
            false
          )
        );
      } catch (e) {
        out.push(
          row(s.id, false, s.title, e instanceof Error ? e.message : '네트워크오류', false)
        );
      }
    })
  );
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function runFullTradeHealthCheck(params: {
  cfg: MergedDeskAutoTradeConfig;
  keysConfigured?: boolean;
  keysAuthOk?: boolean;
  virtActive?: boolean;
}): Promise<TradeHealthReport> {
  const base = buildTradeHealthSync(params);
  const scans = await pingTradeScanApis(params.cfg.leverage || 30);
  const rows = [...base.rows, ...scans];
  const blockers = rows.filter((r) => r.blockEntry);
  const okEntry = blockers.length === 0 && base.okEntry;
  const warnN = rows.filter((r) => !r.ok && !r.blockEntry).length;
  let tone: HealthTone = 'up';
  let titleKo = '점검 · 매매연결 정상';
  let summaryKo = '로컬게이트·스캔API 연결됨 · 신호 대기 가능';
  if (!okEntry) {
    tone = 'down';
    titleKo = '점검 · 진입 불가';
    summaryKo = blockers.map((b) => `${b.titleKo}`).join(' · ');
  } else if (warnN > 0) {
    tone = 'flat';
    titleKo = '점검 · 매매가능(주의)';
    summaryKo = `스캔포함 주의 ${warnN}건 · 진입경로는 열림`;
  }
  return { okEntry, tone, titleKo, summaryKo, rows, checkedAt: Date.now() };
}
