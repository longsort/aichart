# Liquidation Hunting & Liquidity Sweeps — Cakebaba 核心戰術

## 🎯 點解呢個概念係 game-changer

加密貨幣同股票最大嘅分別:**永續合約嘅高槓桿產生密集嘅 liquidation clusters**。

呢啲 cluster 就好似**磁鐵咁**吸引價格:
- 大量多頭嘅 stop-loss / 爆倉位 喺價格之下 → 價格大概率會跌落去 sweep
- 大量空頭嘅 stop-loss / 爆倉位 喺價格之上 → 價格大概率會升上去 sweep

**呢個係市場結構性嘅 inefficiency** — 唔係陰謀論,係**鯨魚同做市商嘅理性行為**:佢哋知有大量 liquidity 喺嗰個位置,當然會推價格過去 grab 嗰啲 liquidity。

---

## 🛠 主要工具:Coinglass Liquidation Heatmap

**網址:** https://www.coinglass.com/LiquidationData

**點睇個 heatmap:**

1. **顏色深淺 = 該價位嘅 liquidation 集中程度**
   - 深黃/橙/紅 = 大量 liquidation orders 集中(magnet)
   - 暗色 = 少量 liquidation
2. **位置 = 對應價位**
   - 現價之**上**嘅 cluster = **空頭爆倉位**(價格升上去爆空頭)
   - 現價之**下**嘅 cluster = **多頭爆倉位**(價格跌下去爆多頭)
3. **強度 = USD 數值**(通常標明 e.g. $50M liquidation @ $77,168)

**例:** Cakebaba 喺片中提到 BTC $77,168 係近期關鍵 liquidation area — 意思係:
- 嗰個價位有大量 long 倉位嘅 SL / 爆倉位
- 大概率價格會被推落去 sweep 嗰啲 longs
- 然後先反彈

---

## 📋 將 Liquidation Hunting 融入交易決策

### A. 入場時嘅 liquidation check

**任何 long/short 之前,睇下 Coinglass heatmap:**

| 情境 | 解讀 | 建議 |
|------|------|------|
| 你想做多,but 你嘅 SL 喺 long cluster 入面 | 你嘅 SL 會被「群體」一齊掃 | 將 SL 推下去 cluster 之下,或者縮細倉位 |
| 現價之下有大 long cluster 未掃 | 大概率會跌去 sweep | **等 sweep 之後先做多**(更好入場) |
| 現價之上有大 short cluster 未掃 | 大概率會升去 sweep | **唔好嗰個位置之下做空** |
| 多空 cluster 平均分布 | 冇明顯磁鐵效應 | 跟其他分析做 |

### B. 止損位嘅 placement 原則

**永遠唔好將 SL 放喺明顯嘅 round number 或者 swing low/high。** 大資金知你哋會擺嗰度,會 hunt。

**做多嘅 SL:**
- ❌ 錯:擺喺 swing low $75,000(round number + swing low)
- ✅ 啱:擺喺 $74,500(round number 之下 + swing low 之下 + 避開 cluster)

**做空嘅 SL:**
- ❌ 錯:擺喺 swing high $80,000(round number + swing high)
- ✅ 啱:擺喺 $80,500-$81,000 之上(避開 swing + round number)

### C. 「等 sweep 入場」嘅 setup(高勝率 pattern)

**經典 setup 流程:**

1. 識別現價之下嘅 long liquidation cluster(e.g. $74,800)
2. 確認大時框係 bullish(月+週 OK)
3. 等價格跌落去 sweep cluster(可能係下影、短暫破位)
4. 觀察 sweep 之後嘅反應:
   - **快速 V 形反彈 + 爆量** → 確認 sweep 完成,可入多
   - **緩慢 grinding 跌穿** → 唔係 sweep,係真破位,**唔好做多**
5. 入場 trigger:1h / 4h 出現 bullish engulfing 或 2B 假跌破

**呢個 setup 嘅勝率好高,因為:**
- 已經 sweep 完 = 下方 liquidity 已經被消化
- 大資金可以開始建多倉(冇人會 dump 佢哋)
- 對應 4h 嘅 2B 假跌破形態(已 backtest 驗證有效)

---

## 🚨 Weekend / Holiday 嘅 Liquidation 效應(Cakebaba 重點)

**呢個係非常實用嘅 trader 知識:**

| 時段 | 市場特徵 | Liquidation 風險 | 操作建議 |
|------|---------|----------------|---------|
| 美股交易日(Mon-Fri) | BTC 跟美股聯動高 | 正常 | 跟一般框架 |
| **週末(Sat-Sun)** | 流動性低,容易插針 | **高** — 鯨魚/做市商容易 sweep clusters | 縮細倉位、止損放鬆少少 |
| **美股公眾假期** | 同週末類似,但機構休市 | **更高** — 容易出現 3 日 consolidation 之後嘅突發 move | 唔好喺假期前重倉 |
| **重大數據/議息日** | 波動極大 | 極高 | 假期前停止新開倉 |

**Cakebaba 例子(片中):**
- 美股下星期一公眾假期 → BTC 預期 3 日 consolidation/sideways
- 呢個 consolidation 期間最有可能出現 liquidity sweep(因為流動性低,易推動價格)
- 操作建議:**等 sweep 完成先入場**,唔好喺 consolidation 中段重倉

---

## 🎯 Cakebaba 風格嘅 Liquidation Hunting 完整流程

```
Step 1: 開 Coinglass 睇 BTC heatmap
        ↓
Step 2: 識別現價附近嘅主要 clusters
        ├─ 上方:$XX,XXX($Y M liquidation,主要 shorts)
        └─ 下方:$XX,XXX($Z M liquidation,主要 longs)
        ↓
Step 3: 大時框方向?
        ├─ Bullish → 預期下方 cluster 被掃完先有 healthy 反彈
        └─ Bearish → 預期上方 cluster 被掃完先繼續跌
        ↓
Step 4: 識別「sweep 等待區」
        ├─ Bullish 場景:等價格跌去 long cluster 附近,觀察反應
        └─ Bearish 場景:等價格升去 short cluster 附近,觀察反應
        ↓
Step 5: Sweep confirmation
        ├─ ✅ 快速反向 + 爆量 + 1h/4h 形態確認 → 入場
        └─ ❌ 緩慢趨勢延續 → 唔係 sweep,呢個 cluster 唔係磁鐵
        ↓
Step 6: 入場
        ├─ Entry:Sweep 反應第一條完整 K 線
        ├─ SL:Sweep 嘅 wick low/high 之外
        └─ TP:第一目標係 swing 另一邊嘅 cluster
```

---

## ⚠️ Liquidation Hunting 嘅警告

1. **唔係每次 cluster 都會被掃** — 強趨勢入面,cluster 可能未掃就 break。**唔好硬等。**
2. **大時框先決定方向** — Liquidation hunt 係**戰術**,唔係**戰略**。如果月線 bearish,你期望 BTC 落去 sweep $75k cluster 之後反彈 — 反彈可能得 5% 然後繼續跌。
3. **小心 fake sweep**(double sweep)— 大資金有時會 sweep 一次假裝反轉,然後再 sweep 第二次先真係轉。經典 setup 係**等第一個 sweep 失敗,等第二個 sweep 出現先入場**。
4. **流動性低嘅幣唔啱玩** — 山寨幣嘅 liquidation map 可以被一個 whale 操縱。BTC、ETH 嘅 sweep 邏輯先可靠。

---

## 📊 點樣將 Liquidation Hunt 加入 Pre-Trade Checklist

更新 Checklist 第 4 項:

```
[ ] 4. S/R 區域評估:
       ✓ 大時框 S/R zone 有冇強 score?
       ✓ Liquidation cluster 喺現價邊個方向?
       ✓ 我嘅 SL 有冇喺 long/short cluster 入面?
       ✓ 入場前需要等 sweep 完成嗎?
```

**100x 嘅額外要求:**
- ✓ 下方/上方 cluster 已經 sweep 完
- ✓ Sweep 之後出現確認形態(engulfing / 2B)
- ✓ 入場唔係喺 cluster 附近(避免反向 sweep)

---

## 🌊 Cascade Liquidation(連環爆倉)— Cakebaba 大幅度跌嘅機制

呢個概念解釋點解有時 BTC 一陣間跌 5-10%。

### Cascade 嘅機制

```
價格跌至 Cluster A($75,000)
  ↓
A 嘅多頭被爆倉,佢哋嘅倉位被市場 sell
  ↓
Sell pressure 推價格再跌
  ↓
價格到 Cluster B($73,000)
  ↓
B 嘅多頭(更激進嘅槓桿)被爆倉,更多 sell
  ↓
連鎖反應 → 價格 free fall 到 Cluster C
```

**Cakebaba 例(片中)**:
- BTC $74,868 → 如果跌穿,可能加速跌到 $71,040
- 兩個 cluster 之間 = liquidation cascade zone
- 「Loses these supports decisively, a rapid acceleration in the decline may occur」

### Cascade 嘅 setup 識別

**Bearish Cascade 嘅 setup:**
1. 上方有大型 long ETF inflow / 槓桿累積
2. 連續兩三個 cluster 排成下行 stair
3. 第一個 cluster 跌穿 + 爆量
4. **大概率連環跌到下一個 cluster**

**操作機會:**
- ✅ **跌穿第一個 cluster 確認後做空** → 目標下一個 cluster
- ✅ **第二個 cluster 強支撐 + V 形反彈 → 做多**(可能係短期底部)
- ❌ **唔好喺 cascade 中段「估底」做多** — 你會被輾過

### Cascade 嘅 contrarian setup

**極端 cascade 結束嘅信號:**
- Funding rate 極端負值
- 大量 long 被清洗
- Open Interest 急跌
- Spot premium 出現
- 1h / 4h 出現大型 hammer / 鎚子 + 爆量

**呢個就係 Cakebaba 嘅「sweep + 反轉」入場機會** — 喺 cascade 結束嗰刻入場,風險低、回報高(因為大部分嘅 sell pressure 已經消化)。

---

**核心思想:**

> **市場唔係隨機嘅 — 佢被結構性 liquidity 拉動。**
>
> **學識睇 liquidation map = 學識睇大資金嘅意圖。**

Cakebaba 嘅實戰分析永遠包含 Coinglass heatmap reference,呢個係佢同普通 technical analyst 嘅 key differentiator。
