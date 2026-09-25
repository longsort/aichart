#!/usr/bin/env python3
"""
Technical Indicators Calculator
Calculates RSI, MACD, Moving Averages, Support/Resistance, ATR

Usage:
    python calculate_indicators.py --file data.json
    python calculate_indicators.py --file data.json --indicators rsi macd ma
"""

import argparse
import json
import sys
from typing import Dict, List, Optional, Tuple

try:
    import numpy as np
except ImportError:
    print("Error: numpy not installed.", file=sys.stderr)
    print("Install with: pip install numpy", file=sys.stderr)
    sys.exit(1)


class TechnicalIndicators:
    """Calculate technical indicators from price data"""

    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> Optional[float]:
        """
        Calculate Relative Strength Index (RSI)

        Args:
            prices: List of closing prices
            period: RSI period (default: 14)

        Returns:
            RSI value (0-100) or None if insufficient data
        """
        if len(prices) < period + 1:
            return None

        # Calculate price changes
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        # Calculate average gains and losses
        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        return round(rsi, 2)

    @staticmethod
    def calculate_macd(prices: List[float],
                      fast_period: int = 12,
                      slow_period: int = 26,
                      signal_period: int = 9) -> Optional[Dict]:
        """
        Calculate MACD (Moving Average Convergence Divergence)

        Args:
            prices: List of closing prices
            fast_period: Fast EMA period (default: 12)
            slow_period: Slow EMA period (default: 26)
            signal_period: Signal line period (default: 9)

        Returns:
            Dict with MACD line, signal line, histogram, or None if insufficient data
        """
        if len(prices) < slow_period + signal_period:
            return None

        # Calculate EMAs
        fast_ema = TechnicalIndicators._calculate_ema(prices, fast_period)
        slow_ema = TechnicalIndicators._calculate_ema(prices, slow_period)

        # MACD line = Fast EMA - Slow EMA
        macd_line = fast_ema[-1] - slow_ema[-1]

        # Calculate signal line (EMA of MACD line)
        macd_values = [f - s for f, s in zip(fast_ema, slow_ema)]
        signal_line = TechnicalIndicators._calculate_ema(macd_values, signal_period)[-1]

        # Histogram = MACD line - Signal line
        histogram = macd_line - signal_line

        return {
            'macd_line': round(macd_line, 2),
            'signal_line': round(signal_line, 2),
            'histogram': round(histogram, 2),
            'signal': 'bullish' if histogram > 0 else 'bearish',
            'crossover': 'bullish_cross' if macd_line > signal_line else 'bearish_cross'
        }

    @staticmethod
    def calculate_moving_averages(prices: List[float],
                                  periods: List[int] = [20, 50, 200]) -> Dict:
        """
        Calculate Simple and Exponential Moving Averages

        Args:
            prices: List of closing prices
            periods: List of MA periods to calculate (default: [20, 50, 200])

        Returns:
            Dict with SMA and EMA values for each period
        """
        result = {}

        for period in periods:
            if len(prices) >= period:
                sma = np.mean(prices[-period:])
                ema = TechnicalIndicators._calculate_ema(prices, period)[-1]

                result[f'MA{period}'] = {
                    'sma': round(sma, 2),
                    'ema': round(ema, 2),
                }

        return result

    @staticmethod
    def calculate_support_resistance(highs: List[float],
                                     lows: List[float],
                                     current_price: float,
                                     num_levels: int = 3) -> Dict:
        """
        Calculate support and resistance levels based on recent highs/lows

        Args:
            highs: List of high prices
            lows: List of low prices
            current_price: Current price
            num_levels: Number of S/R levels to identify

        Returns:
            Dict with support and resistance levels
        """
        # Find recent swing highs and lows
        resistance_candidates = sorted(set(highs), reverse=True)
        support_candidates = sorted(set(lows))

        # Filter levels above and below current price
        resistances = [r for r in resistance_candidates if r > current_price][:num_levels]
        supports = [s for s in support_candidates if s < current_price][-num_levels:]

        return {
            'resistance_levels': [round(r, 2) for r in resistances],
            'support_levels': [round(s, 2) for s in supports[::-1]],  # Reverse to show closest first
            'current_price': round(current_price, 2),
        }

    @staticmethod
    def calculate_atr(highs: List[float],
                     lows: List[float],
                     closes: List[float],
                     period: int = 14) -> Optional[float]:
        """
        Calculate Average True Range (ATR)

        Args:
            highs: List of high prices
            lows: List of low prices
            closes: List of closing prices
            period: ATR period (default: 14)

        Returns:
            ATR value or None if insufficient data
        """
        if len(highs) < period + 1:
            return None

        true_ranges = []
        for i in range(1, len(highs)):
            high_low = highs[i] - lows[i]
            high_close = abs(highs[i] - closes[i - 1])
            low_close = abs(lows[i] - closes[i - 1])
            true_range = max(high_low, high_close, low_close)
            true_ranges.append(true_range)

        atr = np.mean(true_ranges[-period:])
        return round(atr, 2)

    @staticmethod
    def detect_trend(prices: List[float], period: int = 20) -> Dict:
        """
        Detect trend based on recent price action (HH/HL, LL/LH, or consolidation)

        Args:
            prices: List of closing prices
            period: Number of candles to analyze

        Returns:
            Dict with trend analysis
        """
        if len(prices) < period:
            period = len(prices)

        recent_prices = prices[-period:]

        # Find peaks and troughs
        highs = []
        lows = []

        for i in range(1, len(recent_prices) - 1):
            if recent_prices[i] > recent_prices[i - 1] and recent_prices[i] > recent_prices[i + 1]:
                highs.append(recent_prices[i])
            elif recent_prices[i] < recent_prices[i - 1] and recent_prices[i] < recent_prices[i + 1]:
                lows.append(recent_prices[i])

        trend = 'consolidation'
        structure = 'sideways'

        if len(highs) >= 2 and len(lows) >= 2:
            # Check for Higher Highs and Higher Lows (uptrend)
            higher_highs = all(highs[i] > highs[i - 1] for i in range(1, len(highs)))
            higher_lows = all(lows[i] > lows[i - 1] for i in range(1, len(lows)))

            # Check for Lower Lows and Lower Highs (downtrend)
            lower_lows = all(lows[i] < lows[i - 1] for i in range(1, len(lows)))
            lower_highs = all(highs[i] < highs[i - 1] for i in range(1, len(highs)))

            if higher_highs and higher_lows:
                trend = 'uptrend'
                structure = 'HH/HL'
            elif lower_lows and lower_highs:
                trend = 'downtrend'
                structure = 'LL/LH'

        return {
            'trend': trend,
            'structure': structure,
            'recent_highs': [round(h, 2) for h in highs[-3:]],
            'recent_lows': [round(l, 2) for l in lows[-3:]],
        }

    @staticmethod
    def _calculate_ema(prices: List[float], period: int) -> List[float]:
        """
        Calculate Exponential Moving Average

        Args:
            prices: List of prices
            period: EMA period

        Returns:
            List of EMA values
        """
        multiplier = 2 / (period + 1)
        ema_values = []

        # Start with SMA for first value
        ema_values.append(np.mean(prices[:period]))

        # Calculate EMA for remaining values
        for price in prices[period:]:
            ema = (price - ema_values[-1]) * multiplier + ema_values[-1]
            ema_values.append(ema)

        return ema_values


def parse_input_data(data: Dict) -> Tuple[List[float], List[float], List[float], List[float]]:
    """
    Parse input JSON data and extract price arrays

    Args:
        data: Input data dictionary

    Returns:
        Tuple of (closes, highs, lows, volumes)
    """
    closes = []
    highs = []
    lows = []
    volumes = []

    # Handle different input formats
    if 'candles' in data:
        for candle in data['candles']:
            closes.append(float(candle['close']))
            highs.append(float(candle['high']))
            lows.append(float(candle['low']))
            volumes.append(float(candle.get('volume', 0)))

    elif 'hourly_data' in data and data['hourly_data']:
        for candle in data['hourly_data']:
            closes.append(float(candle['close']))
            highs.append(float(candle['high']))
            lows.append(float(candle['low']))
            volumes.append(float(candle.get('volume', 0)))

    elif isinstance(data, list):
        # Assume it's a list of OHLCV values
        for item in data:
            if isinstance(item, dict):
                closes.append(float(item['close']))
                highs.append(float(item.get('high', item['close'])))
                lows.append(float(item.get('low', item['close'])))
                volumes.append(float(item.get('volume', 0)))

    return closes, highs, lows, volumes


def main():
    """Command-line interface"""
    parser = argparse.ArgumentParser(description='Calculate technical indicators from price data')
    parser.add_argument('--file', '-f', required=True, help='Input JSON file with price data')
    parser.add_argument('--indicators', '-i', nargs='+',
                       choices=['rsi', 'macd', 'ma', 'sr', 'atr', 'trend', 'all'],
                       default=['all'],
                       help='Indicators to calculate (default: all)')
    parser.add_argument('--output', '-o', help='Output file (JSON). If not specified, prints to stdout')

    args = parser.parse_args()

    try:
        # Load input data
        with open(args.file, 'r') as f:
            input_data = json.load(f)

        # Parse price data
        closes, highs, lows, volumes = parse_input_data(input_data)

        if not closes:
            print(json.dumps({'error': 'No price data found in input file'}), file=sys.stderr)
            sys.exit(1)

        current_price = closes[-1]

        # Calculate indicators
        result = {
            'current_price': round(current_price, 2),
            'data_points': len(closes),
        }

        indicators = args.indicators
        if 'all' in indicators:
            indicators = ['rsi', 'macd', 'ma', 'sr', 'atr', 'trend']

        calculator = TechnicalIndicators()

        if 'rsi' in indicators:
            rsi = calculator.calculate_rsi(closes)
            if rsi is not None:
                result['RSI'] = {
                    'value': rsi,
                    'interpretation': 'overbought' if rsi > 70 else 'oversold' if rsi < 30 else 'neutral'
                }

        if 'macd' in indicators:
            macd = calculator.calculate_macd(closes)
            if macd:
                result['MACD'] = macd

        if 'ma' in indicators:
            mas = calculator.calculate_moving_averages(closes)
            if mas:
                result['MovingAverages'] = mas

                # Add price position relative to MAs
                result['PriceVsMA'] = {}
                for ma_name, ma_values in mas.items():
                    sma = ma_values['sma']
                    result['PriceVsMA'][ma_name] = {
                        'above': current_price > sma,
                        'distance_pct': round(((current_price - sma) / sma) * 100, 2)
                    }

        if 'sr' in indicators and highs and lows:
            sr = calculator.calculate_support_resistance(highs, lows, current_price)
            result['SupportResistance'] = sr

        if 'atr' in indicators and highs and lows:
            atr = calculator.calculate_atr(highs, lows, closes)
            if atr:
                result['ATR'] = {
                    'value': atr,
                    'pct_of_price': round((atr / current_price) * 100, 2)
                }

        if 'trend' in indicators:
            trend = calculator.detect_trend(closes)
            result['Trend'] = trend

        # Output
        json_output = json.dumps(result, indent=2)

        if args.output:
            with open(args.output, 'w') as f:
                f.write(json_output)
            print(f"Indicators saved to {args.output}", file=sys.stderr)
        else:
            print(json_output)

    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {args.file}'}), file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(json.dumps({'error': f'Invalid JSON in file: {args.file}'}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
