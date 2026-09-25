# Technical Indicators Reference

This document provides calculation methods and interpretation guidelines for key technical indicators used in crypto trading analysis.

## Table of Contents

1. [RSI (Relative Strength Index)](#rsi-relative-strength-index)
2. [MACD (Moving Average Convergence Divergence)](#macd-moving-average-convergence-divergence)
3. [Moving Averages (MA)](#moving-averages-ma)
4. [Support and Resistance Levels](#support-and-resistance-levels)
5. [Volume Analysis](#volume-analysis)
6. [ATR (Average True Range)](#atr-average-true-range)

---

## RSI (Relative Strength Index)

### What It Measures:
Momentum indicator that measures the speed and magnitude of price changes to identify overbought or oversold conditions.

### Calculation:

```
RSI = 100 - (100 / (1 + RS))

Where:
RS = Average Gain / Average Loss over specified period (typically 14 periods)

Average Gain = Sum of gains over n periods / n
Average Loss = Sum of losses over n periods / n
```

### Interpretation:

| RSI Value | Condition | Trading Signal |
|-----------|-----------|----------------|
| **70-100** | Overbought | Potential sell signal (especially with 123 Point 2) |
| **50-70** | Bullish | Uptrend momentum, can continue higher |
| **30-50** | Bearish | Downtrend momentum, can continue lower |
| **0-30** | Oversold | Potential buy signal (especially with 123 Point 2) |

### Special Patterns:

**RSI Divergence** (very powerful):

- **Bullish Divergence**:
  - Price: Lower Lows (LL)
  - RSI: Higher Lows (HL)
  - Signal: Downtrend weakening, potential reversal up

- **Bearish Divergence**:
  - Price: Higher Highs (HH)
  - RSI: Lower Highs (LH)
  - Signal: Uptrend weakening, potential reversal down

### Usage Tips:

- In strong trends, RSI can stay overbought (>70) or oversold (<30) for extended periods
- **Divergence is more reliable** than absolute levels
- Combine with 123 Rule: If Point 2 forms with RSI divergence, **high probability setup**
- For crypto: Consider 80/20 levels instead of 70/30 due to higher volatility

---

## MACD (Moving Average Convergence Divergence)

### What It Measures:
Trend-following momentum indicator showing the relationship between two moving averages.

### Components:

```
MACD Line = 12-period EMA - 26-period EMA
Signal Line = 9-period EMA of MACD Line
Histogram = MACD Line - Signal Line
```

### Interpretation:

| Signal | Description | Trading Implication |
|--------|-------------|---------------------|
| **Bullish Crossover** | MACD crosses above Signal | Potential buy signal |
| **Bearish Crossover** | MACD crosses below Signal | Potential sell signal |
| **Zero Line Cross** | MACD crosses above/below 0 | Trend confirmation (bullish/bearish) |
| **Histogram Expansion** | Bars getting larger | Trend gaining strength |
| **Histogram Contraction** | Bars getting smaller | Trend losing momentum |

### Special Patterns:

**MACD Divergence**:

- **Bullish**: Price makes LL, but MACD makes HL → Buy signal
- **Bearish**: Price makes HH, but MACD makes LH → Sell signal

**Zero Line Bounce**:
- In strong uptrend: MACD pulls back to zero line, then bounces up → Continuation buy signal
- In strong downtrend: MACD bounces to zero line, then drops → Continuation sell signal

### Usage Tips:

- **Lagging indicator**: MACD confirms trends but may be slow to signal
- Best in trending markets, less useful in sideways consolidation
- Combine with 123 Rule: Look for MACD crossover aligning with Point 3
- Histogram can provide **early warning** before MACD/Signal crossover

---

## Moving Averages (MA)

### Types:

**Simple Moving Average (SMA)**:
```
SMA = Sum of closing prices over n periods / n
```

**Exponential Moving Average (EMA)**:
```
EMA = (Close - EMA_prev) × multiplier + EMA_prev
Where multiplier = 2 / (period + 1)
```

EMA gives more weight to recent prices (more responsive).

### Common Periods:

| Period | Timeframe | Purpose |
|--------|-----------|---------|
| **MA(20)** | Short-term | Day trading, quick trend shifts |
| **MA(50)** | Medium-term | Swing trading, primary trend |
| **MA(200)** | Long-term | Position trading, major trend |

### Interpretation:

**Price vs MA Position**:
- **Above MA**: Bullish (support level)
- **Below MA**: Bearish (resistance level)

**MA Crossovers**:
- **Golden Cross**: MA(50) crosses above MA(200) → Long-term bullish
- **Death Cross**: MA(50) crosses below MA(200) → Long-term bearish

**Dynamic Support/Resistance**:
- In uptrend: Price often bounces off MA(20) or MA(50)
- In downtrend: Price often rejected at MA(20) or MA(50)

### Usage Tips:

- **Multi-MA System**: Watch price relative to MA(20), MA(50), MA(200)
  - All MAs rising + price above all = Strong uptrend
  - All MAs falling + price below all = Strong downtrend

- **MA as stop-loss level**: Trail stop below MA(20) in uptrend

- Combine with 123 Rule:
  - Point 1 often occurs when price crosses key MA
  - Point 2 may form near MA resistance/support

---

## Support and Resistance Levels

### Identification Methods:

**1. Historical Price Levels**:
- Previous swing highs → Resistance
- Previous swing lows → Support
- Look for areas where price reversed multiple times

**2. Psychological Levels**:
- Round numbers: $50,000, $100,000, etc.
- Crypto loves round numbers due to human psychology

**3. Fibonacci Retracement**:
Common levels: 23.6%, 38.2%, 50%, 61.8%, 78.6%

```
Calculate from swing high to swing low:
Level = Low + (High - Low) × Fibonacci %
```

**4. Volume Profile**:
- High-volume nodes (HVN) = Support/Resistance
- Low-volume nodes (LVN) = Price moves quickly through

### Strength Indicators:

Strong Support/Resistance when:
- ✅ Tested multiple times without breaking
- ✅ High volume at the level
- ✅ Aligns with psychological round number
- ✅ Confluence with MA or Fibonacci level

### Role Reversal:

- **Broken resistance becomes support** (in uptrend)
- **Broken support becomes resistance** (in downtrend)

### Usage in 123 Rule:

- **Point 2** often forms at previous support/resistance
- **Entry at Point 3** is stronger if near major support/resistance zone
- **Take profit targets** often placed at next key S/R level

---

## Volume Analysis

### What It Measures:
Number of contracts/coins traded in a given period. Confirms price movements.

### Interpretation:

| Price | Volume | Interpretation |
|-------|--------|----------------|
| Rising | Increasing | **Strong uptrend** - buyers in control |
| Rising | Decreasing | **Weak uptrend** - may reverse soon |
| Falling | Increasing | **Strong downtrend** - sellers in control |
| Falling | Decreasing | **Weak downtrend** - may reverse soon |

### Key Patterns:

**Volume Spike**:
- At Point 3 of 123 Rule = **Strong confirmation**
- At trendline break (Point 1) = Validates the break

**Volume Dry-Up**:
- Near Point 2 = Momentum exhaustion confirmed
- Before breakout = Compression before explosive move

**Climax Volume**:
- Extremely high volume spike at trend extreme
- Often marks **capitulation** (bottom in downtrend) or **euphoria** (top in uptrend)

### Usage Tips:

- **Always confirm breakouts with volume**
- Low volume breakout = Likely false breakout (2B pattern)
- Compare volume to 20-period average volume
- In 123 Rule: Point 3 with high volume = Better signal

---

## ATR (Average True Range)

### What It Measures:
Market volatility - the average range of price movement over specified period.

### Calculation:

```
True Range (TR) = Max of:
1. High - Low
2. |High - Previous Close|
3. |Low - Previous Close|

ATR = Average of TR over n periods (typically 14)
```

### Interpretation:

| ATR Level | Market Condition | Trading Implication |
|-----------|------------------|---------------------|
| **High ATR** | High volatility | Wider stop-loss needed, bigger profit potential |
| **Low ATR** | Low volatility | Tighter stop-loss OK, consolidation likely |
| **Rising ATR** | Volatility increasing | Expect larger price swings, trend may be starting |
| **Falling ATR** | Volatility decreasing | Price compression, breakout may be coming |

### Usage in Trade Management:

**Stop-Loss Sizing**:
```
Conservative SL = Entry ± (ATR × 2)
Aggressive SL = Entry ± (ATR × 1.5)
```

**Position Sizing**:
```
Risk Amount = Account × Risk %
Position Size = Risk Amount / (ATR × ATR_multiplier)
```

Higher ATR → Smaller position size to maintain same dollar risk

### Usage Tips:

- ATR is **non-directional** (doesn't predict up or down, only volatility)
- Use ATR to adjust stop-loss in different market conditions
- High ATR in crypto (especially altcoins) requires **extra caution**
- Combine with 123 Rule: If ATR expanding at Point 3, trend change may be strong

---

## Combining Indicators: Multi-Indicator Analysis

### High-Probability Setup Checklist:

For **Bullish Reversal** (downtrend to uptrend):

- ✅ 123 Rule: All 3 points complete (downtrend reversal)
- ✅ RSI: Bullish divergence + moving out of oversold (<30)
- ✅ MACD: Bullish crossover or histogram turning positive
- ✅ Price: Breaking above MA(20) or MA(50)
- ✅ Volume: Spike on Point 3 breakout
- ✅ Support: Point 3 at or near major support level

**Risk Score**: 2-3/10 (low risk, high probability)

---

For **Bearish Reversal** (uptrend to downtrend):

- ✅ 123 Rule: All 3 points complete (uptrend reversal)
- ✅ RSI: Bearish divergence + moving out of overbought (>70)
- ✅ MACD: Bearish crossover or histogram turning negative
- ✅ Price: Breaking below MA(20) or MA(50)
- ✅ Volume: Spike on Point 3 breakdown
- ✅ Resistance: Point 3 at or near major resistance level

**Risk Score**: 2-3/10 (low risk, high probability)

---

### Conflicting Signals:

**Example**: 123 Rule complete, but RSI not diverging and MACD still bullish

**Approach**:
1. **Wait for alignment** - patience is key
2. Use **smaller position size** if entering despite conflicts
3. **Tighter stop-loss** to limit risk
4. **Acknowledge uncertainty** in analysis output

**Risk Score**: 6-8/10 (medium-high risk)

---

## Quick Reference: Indicator Timeframes

| Trading Style | Recommended Timeframe | Key Indicators |
|---------------|----------------------|----------------|
| **Scalping** | 1min - 5min | RSI, MACD, Volume, ATR |
| **Day Trading** | 15min - 1h | All indicators, focus on MA(20) |
| **Swing Trading** | 4h - 1d | All indicators, focus on MA(50), MA(200) |
| **Position Trading** | 1d - 1w | MA(200), Weekly MACD, Monthly support/resistance |

---

## Key Takeaways:

1. 📊 **No single indicator is enough** - always use multiple confirmations
2. 🎯 **Divergence patterns** (RSI, MACD) are often the most reliable signals
3. 📈 **Volume confirms price action** - never ignore volume
4. 🛡️ **ATR helps size stops** - adjust for market volatility
5. ⚖️ **MAs define trend context** - know if you're trading with or against the trend
6. 🔗 **Combine with 123 Rule** - indicators work best when aligned with trend structure
7. 🧠 **Context matters** - same indicator reading means different things in different market conditions

Use these indicators to **confirm** 123 Rule signals, not replace them. The 123 Rule identifies the "when" (trend reversal timing), while technical indicators provide the "why" (momentum, volume, strength confirmation).
