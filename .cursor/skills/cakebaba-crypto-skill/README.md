# Cakebaba Crypto Trading Skill (v2.5)

A professional, **trading-desk-grade** cryptocurrency analysis skill that reflects the full trading philosophy of [CAKEBABA 蛋糕爸爸](https://www.youtube.com/c/cakebaba). It runs a **5-layer, Top-Down framework** (Macro → Smart Money → Cross-Market → Technical → Liquidation/Execution → Risk) and gates every recommendation behind a **17-item Pre-Trade Checklist** that defaults to _reject_.

> **CAKEBABA (蛋糕爸爸)** — 香港 / 中文圈專業加密貨幣分析師，18 年交易經驗。核心理念:**獨立分析、risk-first、理解原理而非背組合、Top-Down 時框、小刀鋸大樹。**

> ⚠️ **v2.0 起這已不是散戶級單一形態工具。** 它是一個多層次框架,預設 **1h / 4h** 為主時框(5m 視為噪音),並以保護資本為第一原則。

---

## What's New since v1.0

| 版本     | 重點                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| **v2.0** | 5-layer 框架、15 references、17 項 checklist、timeframe-adaptive volume(8 年 BTC backtest 驗證)、100x「小刀鋸大樹」嚴格紀律 |
| **v2.1** | 整合 CAKEBABA YouTube 教學(K 線原理、Liquidation Hunting、Smart Money)                                                      |
| **v2.2** | Live Trade Log(實戰紀錄)                                                                                                    |
| **v2.3** | 熊旗/牛旗、熊市 W 底誘多陷阱、熊市週期計數、Fibonacci 負延伸、MSTR/NVDA bellwether                                          |
| **v2.4** | 止跌下影線比例標準、時間慣性(週三 + 擊穿後 3.5 日)、大跌市 2B 反彈 playbook、ETF AUM 萎縮確認、SpaceX IPO 流動性抽走機制    |
| **v2.5** | 機構底部目標階梯(淺/基準/深 3 檔)+ ETF 成本錨(~$38.5k)、減半 500 天時間錨(「邊個價 × 邊個時」)、現貨分階段抄底 Playbook、熊市正費率 = 砸盤燃料、IPO 頂部五折規律 |

---

## The 5-Layer Framework

1. **Layer 1 — Macro 大格局(最高優先)**: Macro Scenario(Goldilocks / Reflation / Stagflation / Deflation)、Smart Money & ETF flow + **總 AUM 趨勢**、季節性(五窮六絕七翻身)+ Halving Cycle。
2. **Layer 2 — 跨市場 Context**: SPY / Gold / DXY / Oil / 10Y、ETH/BTC ratio、時段與假期效應、重大事件(FOMC / CPI / 大型 IPO)。
3. **Layer 3 — BTC Technical (Top-Down)**: 多時框(**月 → 週 → 4h → 1h**)、市場狀態(趨勢 vs 橫盤)、大型結構(M/W/Triangle/Wedge/Channel/**Flag 熊旗牛旗**)、Fibonacci(含 **負延伸**做下跌目標)、S/R Zone Score。
4. **Layer 4 — Liquidation & 入場執行**: Coinglass heatmap、Cascade Liquidation、**timeframe-adaptive 成交量**、**反向資金費率**解讀、K 線形態(吞沒 / 2B / 123)+ **大跌市 2B 反彈 playbook**。
5. **Layer 5 — 風險管理**: R/R ≥ 1:3、**爆倉價計算(`calculate_liquidation.py`,5 個槓桿級別)**、倉位 sizing、100x 嚴格 gate。

## Features

- 🌍 **Macro & Smart Money Layer**: Macro scenarios、ETF flow + AUM 趨勢、Fund Manager Survey、機構動向、bellwethers(MSTR / NVDA / SpaceX IPO)
- 🔭 **Top-Down Multi-Timeframe**: 永遠由大睇細(月→週→4h→1h);時框衝突 = 強制 WAIT
- 📈 **Structure Patterns**: M-top / W-bottom + neckline、Triangle / Wedge / Channel、**熊旗/牛旗 continuation**、熊市 W 底誘多陷阱(regime gate)
- 🎯 **Liquidation Hunting**: Coinglass cluster、liquidity sweep、cascade liquidation setup
- 🔄 **123 Rule / Engulfing / 2B**: 細時框 trigger,連同高勝率組合
- 🕯️ **Quantified K-line**: 止跌反彈下影線比例(≥1/2 / ~1/3 / <1/4)
- ⏱️ **Timing Inertia**: 一週高低點落週中(週三)+ 擊穿關鍵點後盤 3–3.5 日節奏
- 💰 **Reverse Funding Rate**: 極端負費率 → 反向看多;熊市負費率 = 唔追空、等反彈高點;**熊市正費率(~+0.01%)= 砸盤燃料足 → 反彈高點做空**
- 🏛️ **機構底部目標階梯 + ETF 成本錨**: 下跌目標分淺/基準/深 3 檔(BTC 例 $51-54k / $40-46k / $30-37k),ETF 全員水底割點 ~$38.5k
- 🗓️ **減半 500 天時間錨**: 用減半慣性週期推演潛在抄底日(本輪 ≈ 2026-12-07),機構價位區 × 時間節點 = 「邊個價 × 邊個時」
- 🛒 **現貨分階段抄底 Playbook**: 同合約搶反彈嚴格分倉;分批建倉、永遠留一大半籌碼、配置紀律先於方向判斷
- 🆕 **IPO 頂部五折規律**: 重磅 IPO 上市日即頂部、由頂部往下 -50% 後橫盤先當價值區(CRCL 對標 -83%)
- ⚖️ **Leverage-Specific + Liquidation Calc**: 10x / 25x / 50x / 75x / 100x 爆倉價 + SL 安全評估
- 🛡️ **Risk-First, Reject-by-Default**: 17 項 checklist,score 唔夠強制 WAIT

> 💡 **Promo Code**: Use code **"CAKEBABA"** for a 1-month TradingView trial

## Installation

A helper script, **`skills.sh`**, handles packaging and local install:

```bash
./skills.sh build       # → dist/cakebaba-crypto-skill.skill  (upload to Claude.ai)
./skills.sh install     # → ~/.claude/skills/  (local Claude Code)
./skills.sh reinstall   # refresh local copy after edits
./skills.sh uninstall   # remove local copy
./skills.sh status      # show build + install state
```

### Option A — Claude.ai (recommended)

1. `./skills.sh build` — or grab the prebuilt `.skill` from the [Releases](../../releases) page.
2. Upload `dist/cakebaba-crypto-skill.skill` via **Claude.ai → Settings → Capabilities → Skills**(移除舊版同名 → 上載新檔 → 啟用)。

### Option B — Claude Code (local)

```bash
./skills.sh install     # copies into ~/.claude/skills/cakebaba-crypto-skill
# INSTALL_MODE=symlink ./skills.sh install   # symlink instead (auto-tracks edits)
```

Restart Claude Code (or reload skills) to pick it up. Override the target with `CLAUDE_SKILLS_DIR=/path ./skills.sh install`.

### Prerequisites for scripts

```bash
pip install numpy   # optional, for indicator calculations
```

**No API keys required** — the data fetcher uses Binance's public API (CoinGecko fallback) with Python's standard library.

## Usage

### Recommended prompt

```
分析 BTC(或其他 crypto)用 cakebaba-crypto-skill 嘅完整 17 項 checklist:
- 入場考慮:long / short
- 資金:$X
- 風險承受:保守 / 積極 / 100x 賭注

請按 5 layer 框架輸出:Layer 1-5 scoring、17 項 checklist、三個槓桿級別建議、爆倉價、最終 Action(BUY/SELL/WAIT + 原因)。
```

### Common mistakes to avoid

- ❌ 唔好直接問「BTC 而家做多得唔得」→ 要求跑完 17 項 checklist
- ❌ 唔好跳過 Macro Layer → Layer 1 預設主導
- ❌ 唔好用 5m 做主時框 → 預設 1h / 4h
- ❌ 唔好喺時框唔齊(1/4 或 0/4)嘅情況下用 100x → 致命條件

## Output Format

```
📊 BTC Professional Trading Analysis (Cakebaba 5-Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【Layer 1: Macro】 Scenario + 季節性 + Smart Money / AUM score
【Layer 2: Cross-Market】 SPY / Gold / DXY / ETH-BTC / 事件
【Layer 3: Technical (Top-Down)】 月→週→4h→1h、結構形態、Fib、S/R zone
【Layer 4: Liquidation & Entry】 Coinglass cluster、volume、funding、K 線 trigger
【Layer 5: Risk】 R/R、爆倉價、倉位

✅ 17-項 Pre-Trade Checklist → Total Score: X / 17
💼 10x / ⚡ 25x-50x / 🔥 100x 建議(各自 entry / SL / TP / 爆倉價)
🎯 最終 Action: BUY / SELL / WAIT + 原因
```

**Score 判讀:** 15-17/17 + Macro favorable + 4/4 時框 → 可考慮 100x;12-14/17 → 10x~50x;9-11/17 → 10x~25x;< 9/17 → 強制 WAIT。

## File Structure

```
cakebaba-crypto-skill/
├── SKILL.md                            # Core 5-layer framework (~1,240 lines)
├── README.md                            # This file
├── skills.sh                            # build / install / uninstall helper
├── references/                          # Knowledge base (CAKEBABA content)
│   ├── k-line-trading-rules.md         # 5 大核心哲學
│   ├── multi-timeframe-analysis.md     # 由大睇細(月→週→4h→1h)
│   ├── smart-money-tracking.md         # 機構動向、ETF flow、Survey
│   ├── seasonal-macro.md               # 五窮六絕七翻身、Halving + 減半 500 天時間錨、4 Macro Scenarios
│   ├── liquidation-hunting.md          # Coinglass、liquidity sweep、cascade
│   ├── channel-fibonacci.md            # 通道 + Fibonacci 0.618 / 負延伸
│   ├── cross-asset-correlation.md      # SPY/Gold/DXY/ETH-BTC + 假期
│   ├── m-top-w-bottom.md               # 雙頂雙底 + neckline + measured move
│   ├── market-regime.md                # 趨勢 vs 橫盤
│   ├── funding-rate-interpretation.md  # Cakebaba 反向解讀
│   ├── dow-theory-123-rule.md          # 道氏理論 123 法則
│   ├── engulfing-pattern.md            # 吞沒型態
│   ├── 2b-rule.md                      # 假突破/假跌破
│   ├── trend-patterns.md               # HH/HL、LL/LH
│   ├── technical-indicators.md         # RSI/MACD/MA
│   └── risk-management.md              # 倉位、止損、槓桿
└── scripts/
    ├── fetch_crypto_data.py            # Real-time data (Binance + CoinGecko fallback)
    ├── calculate_indicators.py         # RSI / MACD / MA
    └── calculate_liquidation.py        # 爆倉價計算器(5 槓桿級別 + SL 安全評估)
```

## Scripts Usage

### Fetch real-time data

```bash
python scripts/fetch_crypto_data.py --symbol BTC --mode summary --output btc_data.json
python scripts/fetch_crypto_data.py --symbol ETH --mode ohlcv --timeframe 4h --limit 50
```

### Calculate indicators

```bash
python scripts/calculate_indicators.py --file btc_data.json --indicators rsi macd ma
```

### Calculate liquidation price (v2.0+)

```bash
# 一次過睇晒所有槓桿級別
python scripts/calculate_liquidation.py --entry 65500 --direction short --all-leverages

# 指定槓桿 + 評估止損安全度
python scripts/calculate_liquidation.py --entry 65800 --leverage 25 --direction short --stop-loss 66650
```

## Recommended Timeframes (CAKEBABA — v2.0+)

> 🔁 **Reversed from v1.0.** 早期版本以 5m 為主;經 8 年 backtest 與 CAKEBABA 教學後,**預設改為 1h / 4h**,因為 5m 噪音極多、是過度交易的根源。

| Use case                   | Primary timeframe | Notes                           |
| -------------------------- | ----------------- | ------------------------------- |
| **Default analysis**       | **1h / 4h**       | 過濾 noise,信號可信度高 2–3 倍  |
| **Trend / structure**      | 月 / 週 / 4h      | Top-Down 永遠由大睇細           |
| **Scalping / 100x ambush** | 5m                | 只在完美 setup + 4/4 時框時使用 |

**Volume threshold 是 timeframe-adaptive(backtest 驗證):** 5m = 2.5× / 4h = 1.5× / Daily = 1.0× / 1W = 1.2×。

> 教訓:1.5× volume threshold 喺日線太苛刻(8 年只 23 trades);1.0× 喺日線先係 sweet spot。**永遠睇大樣本先信數據。**

## Key Concepts (high level)

- **Top-Down**: 大時框 = signal,小時框 = noise;用 noise 推翻 signal = 散戶蝕本根源。
- **Macro & Smart Money trump Technical**: 單獨技術分析嘅 alpha 已被市場消化;edge 在 macro + smart money + technical 三維結合。
- **Reverse Funding**: 加密市場大部分時間正費率;極端負費率 = 異常 = 過度恐慌 = 反向看多。熊市負費率 → 唔追空,等反彈高點做空。
- **100x = ambush, not routine**: 細注(<2%)、接受 70–80% 失敗率、完美 setup 先入、賺時 20–50R 不對稱回報。
- **Reject by default**: 「先學點樣輸少 D」;score 唔夠或任何致命條件 fail → 強制 WAIT。

詳見 `SKILL.md` 及 `references/` 內各文件。

## Important Warnings

⚠️ **High Leverage = High Risk** — 100x 槓桿 1% 逆向波動即可全倉爆倉。只用你理解且輸得起嘅槓桿。
⚠️ **Not Financial Advice** — 教育用途,結合多重 confirmations 仍非保證;務必 DYOR,切勿用蝕唔起嘅錢交易。
⚠️ **Crypto Volatility** — 假突破(2B)非常常見,務必等收 K 確認,無例外地用止損。

## Best Practices

1. ✅ 永遠設止損,並用 `calculate_liquidation.py` 確認 SL 喺爆倉價之前觸發
2. ✅ 由大時框(月/週)定方向,再落 4h/1h 執行
3. ✅ 跑完整 17 項 checklist;預設 reject
4. ✅ 由低槓桿(10x)開始,熟練後先加
5. ✅ 每筆風險 1–3% 資金;100x 倉位 <2%
6. ✅ 分批止盈,核心倉達標平、留少量 trail 食 cascade
7. ✅ 不賺小錢、不亏大錢;保住利潤先可複利
8. ✅ 復盤每筆 trade(見 SKILL.md 的 Live Trade Log 慣例)

## License & Attribution

For educational purposes. Use at your own risk.

**Trading strategies and educational content are based on [CAKEBABA 頻道](https://www.youtube.com/c/cakebaba)** — 專業加密貨幣交易教育頻道。

- **Website**: [https://www.cakebaba.com](https://www.cakebaba.com)
- **YouTube**: [https://www.youtube.com/c/cakebaba](https://www.youtube.com/c/cakebaba)

> **特別感謝 CAKEBABA 蛋糕爸爸頻道** — 本技能的交易策略與教育內容源自 CAKEBABA 頻道的專業分享:道氏理論 123 法則、吞沒型態、假突破假跌破、Smart Money / Macro、Liquidation Hunting、Top-Down 多時框等。

---

**Remember**: Protecting capital is more important than making profits. The market will always be there — make sure you are too.

**學習建議**: 觀看 [CAKEBABA 頻道](https://www.youtube.com/c/cakebaba) 深入理解這些策略。使用代碼 **"CAKEBABA"** 獲得 TradingView 1 個月免費試用。
