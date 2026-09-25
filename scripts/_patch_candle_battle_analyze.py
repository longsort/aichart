# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\apps\ailongshort\app\api\analyze\route.ts")
t = p.read_text(encoding="utf-8")

imp = "import { buildBreakoutFollowChain } from '@/lib/breakoutFollowChain';"
add = imp + "\nimport { buildCandleBattlePack } from '@/lib/candleBattle';"
if "buildCandleBattlePack" not in t:
    if imp not in t:
        raise SystemExit("import anchor missing")
    t = t.replace(imp, add, 1)
    print("import ok")

# insert build before completeSuccess return object ends - before schemaVersion line
# Better: compute pack just before return completeSuccess
anchor = "    return completeSuccess({\n      ...tapSource,"
if "candleBattle:" in t and "buildCandleBattlePack({" in t:
    print("already wired")
else:
    build_block = """    let candleBattlePack = null as ReturnType<typeof buildCandleBattlePack> | null;
    try {
      candleBattlePack = buildCandleBattlePack({
        symbol,
        timeframe,
        candles: visibleForClose?.length ? visibleForClose : candles,
        htfCandles: Array.isArray(htfCandles) ? htfCandles : null,
        volumeDelta: marketData?.volumeDelta ?? tapSource.volumeDelta ?? null,
        buyPressure: marketData?.buyPressure ?? tapSource.buyPressure ?? null,
        sellPressure: marketData?.sellPressure ?? tapSource.sellPressure ?? null,
        orderbookImbalance: marketData?.orderbookImbalance ?? tapSource.orderbookImbalance ?? null,
        oiState: marketData?.oiState ?? tapSource.oiState ?? null,
        fundingState: marketData?.fundingState ?? tapSource.fundingState ?? null,
        hasTrades: Boolean(marketData?.eagle1Availability?.has_trades),
        hasOrderbook: Boolean(marketData?.eagle1Availability?.has_orderbook ?? marketData?.orderbook),
        hasCvd: Boolean(marketData?.eagle1Availability?.has_cvd),
        hasOrderbookHistory: false,
      });
    } catch {
      candleBattlePack = null;
    }

"""
    if anchor not in t:
        raise SystemExit("completeSuccess anchor missing")
    t = t.replace(anchor, build_block + anchor, 1)
    # add field
    field_anchor = "      ...(smartOverlay ? { smartOverlay } : {}),\n    });"
    field_new = "      ...(smartOverlay ? { smartOverlay } : {}),\n      candleBattle: candleBattlePack,\n    });"
    if field_anchor not in t:
        raise SystemExit("field anchor missing")
    t = t.replace(field_anchor, field_new, 1)
    print("wired analyze")

p.write_text(t, encoding="utf-8", newline="\n")
