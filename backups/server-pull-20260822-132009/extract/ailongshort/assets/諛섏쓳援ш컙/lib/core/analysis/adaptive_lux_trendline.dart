import 'dart:math' as math;

import '../models/fu_state.dart';

enum LuxTlState { temp, confirming, confirmed }

enum LuxTlDir { up, down, none }

class LuxTlLine {
  final int ts1;
  final int ts2;
  final double p1;
  final double p2;
  const LuxTlLine({required this.ts1, required this.ts2, required this.p1, required this.p2});

  Map<String, Object?> toJson() => {'ts1': ts1, 'ts2': ts2, 'p1': p1, 'p2': p2};
  static LuxTlLine? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    try {
      return LuxTlLine(
        ts1: (j['ts1'] as num).toInt(),
        ts2: (j['ts2'] as num).toInt(),
        p1: (j['p1'] as num).toDouble(),
        p2: (j['p2'] as num).toDouble(),
      );
    } catch (_) {
      return null;
    }
  }
}

class LuxTlResult {
  final LuxTlState state;
  final LuxTlDir dir;
  final LuxTlLine? line;
  final String label;
  const LuxTlResult({required this.state, required this.dir, required this.line, required this.label});

  Map<String, Object?> toJson() => {
        'state': state.name,
        'dir': dir.name,
        'line': line?.toJson(),
        'label': label,
      };

  static LuxTlResult fromJson(Map<String, dynamic> j) {
    final st = LuxTlState.values.firstWhere((e) => e.name == (j['state'] ?? 'temp'), orElse: () => LuxTlState.temp);
    final dr = LuxTlDir.values.firstWhere((e) => e.name == (j['dir'] ?? 'none'), orElse: () => LuxTlDir.none);
    return LuxTlResult(
      state: st,
      dir: dr,
      line: LuxTlLine.fromJson((j['line'] as Map?)?.cast<String, dynamic>()),
      label: (j['label'] as String?) ?? '',
    );
  }
}

class AdaptiveLuxTrendline {
  static int _left(String tfKey) {
    switch (tfKey) {
      case '1m':
        return 6;
      case '5m':
        return 6;
      case '15m':
        return 5;
      case '1h':
        return 4;
      case '4h':
        return 4;
      case '1D':
        return 3;
      case '1W':
        return 3;
      case '1M':
        return 2;
      default:
        return 5;
    }
  }

  static int _right(String tfKey) {
    switch (tfKey) {
      case '1m':
        return 6;
      case '5m':
        return 6;
      case '15m':
        return 5;
      case '1h':
        return 4;
      case '4h':
        return 4;
      case '1D':
        return 3;
      case '1W':
        return 3;
      case '1M':
        return 2;
      default:
        return 5;
    }
  }

  static int minCandles(String tfKey) => math.max(30, (_left(tfKey) + _right(tfKey)) * 6);

  static LuxTlResult compute({
    required List<FuCandle> candles,
    required String tfKey,
  }) {
    final n = candles.length;
    if (n < minCandles(tfKey)) {
      return const LuxTlResult(
        state: LuxTlState.temp,
        dir: LuxTlDir.none,
        line: null,
        label: 'AUTO TL: 데이터 부족',
      );
    }

    // 1) CONFIRMED pivots (left+right)
    final confirmedHigh = _pivotsHigh(candles, left: _left(tfKey), right: _right(tfKey));
    final confirmedLow = _pivotsLow(candles, left: _left(tfKey), right: _right(tfKey));

    // 2) TEMP pivots (left only, right=0) -> "캐시 없이도 일단 보이게"
    final tempHigh = _pivotsHigh(candles, left: _left(tfKey), right: 0);
    final tempLow = _pivotsLow(candles, left: _left(tfKey), right: 0);

    LuxTlLine? line;
    LuxTlDir dir = LuxTlDir.none;
    LuxTlState state = LuxTlState.temp;
    String label = 'AUTO TL: TEMP';

    // Prefer confirmed if possible
    final canConfirmedDown = confirmedHigh.length >= 2;
    final canConfirmedUp = confirmedLow.length >= 2;

    if (canConfirmedDown || canConfirmedUp) {
      // Choose which is more "recent" by last pivot time
      final lastHighTs = canConfirmedDown ? candles[confirmedHigh.last].ts : -1;
      final lastLowTs = canConfirmedUp ? candles[confirmedLow.last].ts : -1;
      if (lastHighTs >= lastLowTs) {
        // down trendline using last 2 pivot highs
        final i2 = confirmedHigh.last;
        final i1 = confirmedHigh[confirmedHigh.length - 2];
        line = LuxTlLine(ts1: candles[i1].ts, ts2: candles[i2].ts, p1: candles[i1].high, p2: candles[i2].high);
        dir = LuxTlDir.down;
      } else {
        final i2 = confirmedLow.last;
        final i1 = confirmedLow[confirmedLow.length - 2];
        line = LuxTlLine(ts1: candles[i1].ts, ts2: candles[i2].ts, p1: candles[i1].low, p2: candles[i2].low);
        dir = LuxTlDir.up;
      }
      state = LuxTlState.confirmed;
      label = 'AUTO TL: CONFIRMED';
      return LuxTlResult(state: state, dir: dir, line: line, label: label);
    }

    // If not confirmed, try confirming (need 2 pivots, but right side not enough)
    final canTempDown = tempHigh.length >= 2;
    final canTempUp = tempLow.length >= 2;

    if (canTempDown || canTempUp) {
      final lastHighTs = canTempDown ? candles[tempHigh.last].ts : -1;
      final lastLowTs = canTempUp ? candles[tempLow.last].ts : -1;
      if (lastHighTs >= lastLowTs) {
        final i2 = tempHigh.last;
        final i1 = tempHigh[tempHigh.length - 2];
        line = LuxTlLine(ts1: candles[i1].ts, ts2: candles[i2].ts, p1: candles[i1].high, p2: candles[i2].high);
        dir = LuxTlDir.down;
      } else {
        final i2 = tempLow.last;
        final i1 = tempLow[tempLow.length - 2];
        line = LuxTlLine(ts1: candles[i1].ts, ts2: candles[i2].ts, p1: candles[i1].low, p2: candles[i2].low);
        dir = LuxTlDir.up;
      }
      state = LuxTlState.confirming;
      label = 'AUTO TL: CONFIRMING';
      return LuxTlResult(state: state, dir: dir, line: line, label: label);
    }


// Fallback: still draw something in constrained-candle environments.
// Use two local extrema in the last window so the line is always present (Lux-like, but TEMP*).
final win = math.min(n, 60);
final start = math.max(0, n - win);

int top1 = -1, top2 = -1;
double top1v = -1e100, top2v = -1e100;
int low1 = -1, low2 = -1;
double low1v = 1e100, low2v = 1e100;

for (int i = start; i < n; i++) {
  final h = candles[i].high;
  if (h > top1v) {
    top2v = top1v; top2 = top1;
    top1v = h; top1 = i;
  } else if (h > top2v) {
    top2v = h; top2 = i;
  }

  final l = candles[i].low;
  if (l < low1v) {
    low2v = low1v; low2 = low1;
    low1v = l; low1 = i;
  } else if (l < low2v) {
    low2v = l; low2 = i;
  }
}

// pick direction by slope between recent close and midrange
final mid = (candles[n - 1].high + candles[n - 1].low) / 2;
if (top1 >= 0 && top2 >= 0 && candles[n - 1].close <= mid) {
  final iA = math.min(top1, top2);
  final iB = math.max(top1, top2);
  line = LuxTlLine(ts1: candles[iA].ts, ts2: candles[iB].ts, p1: candles[iA].high, p2: candles[iB].high);
  dir = LuxTlDir.down;
  state = LuxTlState.temp;
  label = 'AUTO TL: TEMP*';
  return LuxTlResult(state: state, dir: dir, line: line, label: label);
}
if (low1 >= 0 && low2 >= 0) {
  final iA = math.min(low1, low2);
  final iB = math.max(low1, low2);
  line = LuxTlLine(ts1: candles[iA].ts, ts2: candles[iB].ts, p1: candles[iA].low, p2: candles[iB].low);
  dir = LuxTlDir.up;
  state = LuxTlState.temp;
  label = 'AUTO TL: TEMP*';
  return LuxTlResult(state: state, dir: dir, line: line, label: label);
}

    return const LuxTlResult(
      state: LuxTlState.temp,
      dir: LuxTlDir.none,
      line: null,
      label: 'AUTO TL: pivot 부족',
    );
  }

  static List<int> _pivotsHigh(List<FuCandle> c, {required int left, required int right}) {
    final n = c.length;
    final out = <int>[];
    if (n < left + right + 1) return out;
    for (int i = left; i <= n - 1 - right; i++) {
      final hi = c[i].high;
      bool ok = true;
      for (int k = i - left; k <= i + right; k++) {
        if (k == i) continue;
        if (c[k].high > hi) {
          ok = false;
          break;
        }
      }
      if (ok) out.add(i);
    }
    return out;
  }

  static List<int> _pivotsLow(List<FuCandle> c, {required int left, required int right}) {
    final n = c.length;
    final out = <int>[];
    if (n < left + right + 1) return out;
    for (int i = left; i <= n - 1 - right; i++) {
      final lo = c[i].low;
      bool ok = true;
      for (int k = i - left; k <= i + right; k++) {
        if (k == i) continue;
        if (c[k].low < lo) {
          ok = false;
          break;
        }
      }
      if (ok) out.add(i);
    }
    return out;
  }
}