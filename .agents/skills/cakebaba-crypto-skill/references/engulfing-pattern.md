# Engulfing Pattern (吞沒型態) - Comprehensive Guide

This document explains the **Engulfing Pattern** for K-line (candlestick) trading, based on professional trading education from CAKEBABA channel.

## Table of Contents

1. [What is Engulfing?](#what-is-engulfing)
2. [Pattern Recognition](#pattern-recognition)
3. [Trading Rules](#trading-rules)
4. [Strength Assessment](#strength-assessment)
5. [Risk Management](#risk-management)
6. [Practical Examples](#practical-examples)

---

## What is Engulfing?

**Engulfing (吞沒)** is a candlestick pattern where a large candle completely "engulfs" or covers the body of the previous candle(s), indicating a strong momentum shift in market direction.

### Key Characteristics:

1. **Complete Coverage**: The current candle's body must completely cover the previous candle's body
2. **Strong Momentum**: Indicates buyers or sellers have taken control
3. **Directional Signal**:
   - **Bullish Engulfing** → Upward reversal/breakout
   - **Bearish Engulfing** → Downward reversal/breakdown

---

## Pattern Recognition

### Bullish Engulfing (看漲吞沒)

```
Engulfing Pattern at Support Zone:

         Resistance
              ^
              |
    $3200    |           ┌─────┐
              │           │     │
    $3100    │     ┌─────┤     │
              │     │     │     │
    $3000 ───┼─────┤     ├─────┤──── Support
              │     │     │     │
              └─────┴─────┴─────┘
                   ^  ^  ^
                   |  |  |
               Small  |  Large
               Bear  |  Bullish
               Candles   Engulfing

Key Points:
• Previous candle(s): Small, bearish (red)
• Engulfing candle: Large, bullish (green)
• Must occur at KEY SUPPORT zone
• Body fully covers previous candle body(s)
• Lower shadow should be small
```

### Bearish Engulfing (看跌吞沒)

```
Engulfing Pattern at Resistance Zone:

         Resistance ──────────────
              ^    ┌─────────────┐
              │    │             │
    $3300    │    │  ┌───────┐  │
              │    │  │       │  │
    $3200    └────┼──┤       │  ├────
              │    │  │       │  │
    $3100         │  └───────┘  │
                   └─────────────┘
                        ^
                        |
                   Large Bearish
                   Engulfing Candle

Key Points:
• Previous candle(s): Small, bullish (green)
• Engulfing candle: Large, bearish (red)
• Must occur at KEY RESISTANCE zone
• Body fully covers previous candle body(s)
• Upper shadow should be small
```

---

## Trading Rules

### ✅ Valid Engulfing Setup

1. **Location Matters**: Must occur at **key support or resistance zone**
   - ❌ Engulfing in the middle of nowhere = INVALID
   - ✅ Engulfing at support/resistance = VALID

2. **Complete Coverage**: The engulfing candle body must **fully cover** previous candle body(s)
   - Can engulf 1, 2, or even 3 previous candles
   - More candles engulfed = stronger signal

3. **Shadow Assessment**:
   - **Small shadows** (< 1/5 of candle length) = Strong signal ✅
   - **Large shadows** reduce reliability ❌

4. **Wait for Confirmation**: Enter trade **after candle closes**
   - Don't enter on unclosed/developing candles
   - Wait for the pattern to fully form

5. **Timeframe Recommendations**:
   - **Crypto**: Use 5-minute or higher (1M has too much noise)
   - **Stocks**: Use 1-hour or higher
   - **Forex**: Use 1-hour or higher

### ❌ Invalid Engulfing Scenarios

| Scenario | Why Invalid |
|----------|--------------|
| Not at support/resistance | Location wrong, no significance |
| Large upper shadow on bullish engulfing | Shows rejection, weak signal |
| Large lower shadow on bearish engulfing | Shows support, weak signal |
| In consolidation/ranging | No clear direction |
| Before major news events | High unpredictability |

---

## Strength Assessment

### Engulfing Signal Strength

| Factor | Strong Signal ✅ | Weak Signal ❌ |
|--------|------------------|----------------|
| **Location** | At key S/R zone | Random location |
| **Shadow size** | < 20% of candle | > 50% of candle |
| **Candles engulfed** | 2-3 candles | Only 1 candle |
| **Volume** | High volume spike | Low volume |
| **Timeframe** | 4H, Daily | 1M (too noisy) |
| **Market structure** | Multi-top/bottom | Single top/bottom |

### Expected Win Rate

- **Engulfing alone**: ~50-55% win rate
- **Engulfing + 2B Rule**: ~60-65% win rate
- **Engulfing + 123 Rule**: ~65-70% win rate
- **Engulfing at Multi-top/bottom + 2B**: ~70-75% win rate

---

## Risk Management

### Stop Loss Placement

```
For Bullish Engulfing (Long):
    Entry: Engulfing candle close
    Stop: Below engulfing candle's low (or below support zone)
    Buffer: 1-2 ticks for large exchanges (not needed for BTC/ETH)

For Bearish Engulfing (Short):
    Entry: Engulfing candle close
    Stop: Above engulfing candle's high (or above resistance zone)
    Buffer: 1-2 ticks for large exchanges
```

### Take Profit Targets

```
Conservative: Next support/resistance zone
Aggressive: 1:1 risk-reward or better
Partial Profits: 50% at first target, move stop to breakeven
```

### Position Sizing

```
Recommended: 1-3% of capital per trade
Maximum: 5% for high-confidence setups (multiple confirmations)
```

---

## Practical Examples

### Example 1: ETH Bullish Engulfing at Support

```
Setup:
• Asset: ETH/USDT
• Timeframe: 5-minute
• Support Zone: $3,000
• Previous candles: 2 small red candles
• Engulfing: Large green candle covering both

Trade:
• Entry: $3,010 (engulfing candle close)
• Stop: $2,990 (below support)
• Target: $3,100 (next resistance)
• Risk: $20
• Reward: $90
• R:R Ratio: 4.5:1 ✅
```

### Example 2: BNB Bearish Engulfing at Resistance

```
Setup:
• Asset: BNB/USDT
• Timeframe: 15-minute
• Resistance Zone: $600
• Previous candle: Small green candle
• Engulfing: Large red candle covering it

Trade:
• Entry: $595 (engulfing candle close)
• Stop: $610 (above resistance)
• Target: $570 (next support)
• Risk: $15
• Reward: $25
• R:R Ratio: 1.67:1
```

---

## Integration with Other Patterns

### Engulfing + 2B Rule (Recommended Combination)

1. **2B triggers**: False breakout followed by reversal
2. **Engulfing confirms**: Strong momentum in reversal direction
3. **High probability**: Combined win rate ~60-65%

### Engulfing + 123 Rule

1. **123 Rule**: Major trend reversal signal
2. **Engulfing**: Entry trigger at confirmation
3. **Trend trade**: Larger profit potential

---

## Trading Psychology

### Left-Side vs Right-Side with Engulfing

**Left-Side Trading (Before Confirmation):**
- Place orders at support/resistance BEFORE engulfing appears
- Better entry price and R:R ratio
- Higher risk - pattern may not form
- Requires less screen time

**Right-Side Trading (After Confirmation):**
- Wait for engulfing candle to CLOSE before entering
- Less optimal entry but more confirmation
- Lower risk - pattern is confirmed
- Combines with "smart money" flow

**Recommended Approach**:
- Prepare for left-side entries (set alerts)
- Execute on right-side confirmation (engulfing close)

---

## Common Mistakes

### ❌ What NOT to Do

1. **Trading engulfing outside support/resistance zones**
   - Result: Low win rate, false signals

2. **Entering before candle closes**
   - Result: Pattern may not complete, false signal

3. **Ignoring shadow size**
   - Result: Entering on weak signals

4. **Using 1-minute charts for BTC**
   - Result: Too much noise, unreliable signals

5. **Not using stop loss**
   - Result: Large losses when wrong

6. **Trading every engulfing signal**
   - Result: Overtrading, poor R:R on weak setups

---

## Checklist Before Entry

```
✅ Pattern at KEY support/resistance zone?
✅ Engulfing candle fully covers previous candle body(s)?
✅ Shadows are small (< 20% of candle length)?
✅ Candle has CLOSED (pattern complete)?
✅ Volume confirmation (optional but recommended)?
✅ Stop loss placed appropriately?
✅ Take profit target identified?
✅ Risk-reward ratio at least 1:1?
✅ Position size appropriate (1-3% of capital)?
```

---

## Summary

**Engulfing Pattern Key Points:**

1. ✅ Must occur at **support/resistance zones** to be valid
2. ✅ Wait for **candle close** before entering
3. ✅ Small shadows = stronger signal
4. ✅ Combine with 2B or 123 Rule for higher win rate
5. ✅ Use 5-minute timeframe for crypto minimum
6. ✅ Always use stop loss below/above the engulfing candle
7. ✅ Target 1:1 or better risk-reward ratio
8. ✅ Take partial profits and move stop to breakeven

**Expected Win Rate**: 50-55% alone, 60-75% with confirmations
