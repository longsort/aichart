/**
 * 타점/자동매매 서버 ARM 클라이언트.
 * 수익패턴 서버 ARM도 함께 동기화 → 무접속 cron이 읽음.
 */
export type ServerArmHealthSnap = {
  ok: boolean;
  healthKo: string;
  serverEntryReady: boolean;
  arm?: {
    liveArmed?: boolean;
    symbols?: string[];
  };
  bitgetKeysConfigured?: boolean;
  profitPattern?: {
    liveArmed: boolean;
    symbols: string[];
    serverEntryReady: boolean;
  };
};

export type AutoTradeArmLike = {
  liveArmed?: boolean;
  enabled?: boolean;
  leverage?: number;
  marginUsdt?: number;
  symbols?: string[];
  enabledSymbols?: string[] | Record<string, boolean>;
  paperOnly?: boolean;
};

function symbolsFromCfg(cfg: AutoTradeArmLike): string[] {
  if (Array.isArray(cfg.symbols) && cfg.symbols.length) {
    return cfg.symbols.map((s) => String(s).toUpperCase());
  }
  if (Array.isArray(cfg.enabledSymbols)) {
    return cfg.enabledSymbols.map((s) => String(s).toUpperCase());
  }
  if (cfg.enabledSymbols && typeof cfg.enabledSymbols === 'object') {
    return Object.entries(cfg.enabledSymbols)
      .filter(([, on]) => Boolean(on))
      .map(([s]) => String(s).toUpperCase());
  }
  return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'];
}

/** 수익패턴 + (가능하면) 기존 ARM 동기화 */
export async function syncServerArm(cfg: AutoTradeArmLike): Promise<{ ok: boolean; msg: string }> {
  try {
    const body = {
      liveArmed: Boolean(cfg.liveArmed),
      symbols: symbolsFromCfg(cfg),
      leverage: Number(cfg.leverage) || 50,
      marginUsdt: Number(cfg.marginUsdt) || 10,
      paperOnly: Boolean(cfg.paperOnly),
    };
    const res = await fetch('/api/profit-pattern/arm', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      serverEntryReady?: boolean;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      return { ok: false, msg: j.error || `ARM동기화 HTTP ${res.status}` };
    }
    return {
      ok: true,
      msg: j.serverEntryReady
        ? '서버 ARM ON · 무접속 수익패턴 진입가능'
        : '서버 ARM 동기화 · 대기',
    };
  } catch (e) {
    return {
      ok: false,
      msg: e instanceof Error ? e.message : 'ARM 동기화 실패',
    };
  }
}

export async function fetchServerArmHealth(): Promise<ServerArmHealthSnap> {
  try {
    const res = await fetch('/api/profit-pattern/arm', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      arm?: {
        liveArmed?: boolean;
        symbols?: string[];
      };
      serverEntryReady?: boolean;
      bitgetKeysConfigured?: boolean;
      noteKo?: string;
    };
    if (!res.ok || !j.ok) {
      return {
        ok: false,
        healthKo: '서버 ARM 조회 실패',
        serverEntryReady: false,
      };
    }
    return {
      ok: true,
      healthKo: j.noteKo || (j.serverEntryReady ? '무접속진입가능' : 'ARM 대기'),
      serverEntryReady: Boolean(j.serverEntryReady),
      arm: {
        liveArmed: Boolean(j.arm?.liveArmed),
        symbols: j.arm?.symbols || [],
      },
      bitgetKeysConfigured: Boolean(j.bitgetKeysConfigured),
      profitPattern: {
        liveArmed: Boolean(j.arm?.liveArmed),
        symbols: j.arm?.symbols || [],
        serverEntryReady: Boolean(j.serverEntryReady),
      },
    };
  } catch {
    return {
      ok: false,
      healthKo: '서버 ARM 연결 실패',
      serverEntryReady: false,
    };
  }
}
