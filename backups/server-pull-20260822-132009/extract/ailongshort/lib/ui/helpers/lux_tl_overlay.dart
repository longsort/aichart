import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../core/analysis/adaptive_lux_trendline.dart';
import '../../core/models/fu_state.dart';
import '../widgets/mini_chart_v4.dart';

class LuxTlOverlay {
  final List<MiniChartLine> lines;
  final String label;
  const LuxTlOverlay({required this.lines, required this.label});
}

LuxTlOverlay luxTlToOverlay({
  required LuxTlResult r,
  required List<FuCandle> candles,
}) {
  if (r.line == null) return LuxTlOverlay(lines: const [], label: r.label);

  int nearestIndex(int ts) {
    // candles are sorted; find closest by linear scan from end (fast enough for <=200)
    int best = 0;
    int bestDiff = 1 << 62;
    for (int i = 0; i < candles.length; i++) {
      final d = (candles[i].ts - ts).abs();
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    return best;
  }

  final i1 = nearestIndex(r.line!.ts1);
  final i2 = nearestIndex(r.line!.ts2);

  // Style: state-based thickness
  final double w = switch (r.state) {
    LuxTlState.confirmed => 2.4,
    LuxTlState.confirming => 1.8,
    LuxTlState.temp => 1.2,
  };

  final Color col = switch (r.dir) {
    LuxTlDir.up => const Color(0xFF7CFFB2),
    LuxTlDir.down => const Color(0xFFFF7C7C),
    LuxTlDir.none => Colors.white70,
  };

  final line = MiniChartLine(
  i1: math.min(i1, i2),
  i2: math.max(i1, i2),
  p1: (i1 <= i2) ? r.line!.p1 : r.line!.p2,
  p2: (i1 <= i2) ? r.line!.p2 : r.line!.p1,
  color: col.withOpacity(r.state == LuxTlState.temp ? 0.45 : (r.state == LuxTlState.confirming ? 0.65 : 0.95)),
  width: w,
);

// ===== LuxAlgo-like channel (parallel boundaries) =====
// Derive channel width from recent extremes relative to the main TL.
double linePriceAt(int idx) {
  final x1 = line.i1.toDouble();
  final x2 = line.i2.toDouble();
  final y1 = line.p1;
  final y2 = line.p2;
  if ((x2 - x1).abs() < 1e-9) return y2;
  final t = (idx.toDouble() - x1) / (x2 - x1);
  return y1 + (y2 - y1) * t;
}

final int s = line.i1;
final int e = candles.length - 1;
double delta = 0.0;

if (r.dir == LuxTlDir.down) {
  // Main line is resistance -> support line should cover the lowest lows.
  double dMin = 0.0;
  for (int k = s; k <= e; k++) {
    final d = candles[k].low - linePriceAt(k);
    if (d < dMin) dMin = d;
  }
  delta = dMin; // negative
} else if (r.dir == LuxTlDir.up) {
  // Main line is support -> resistance line should cover the highest highs.
  double dMax = 0.0;
  for (int k = s; k <= e; k++) {
    final d = candles[k].high - linePriceAt(k);
    if (d > dMax) dMax = d;
  }
  delta = dMax; // positive
}

final List<MiniChartLine> out = [line];

if (delta.abs() > 1e-8) {
  // opposite boundary
  out.add(MiniChartLine(
    i1: line.i1,
    i2: line.i2,
    p1: line.p1 + delta,
    p2: line.p2 + delta,
    color: col.withOpacity(r.state == LuxTlState.temp ? 0.22 : (r.state == LuxTlState.confirming ? 0.32 : 0.42)),
    width: math.max(1.2, w - 0.6),
  ));

  // mid guide (Lux-like): no dashed support in MiniChartLine, so thin & faint.
  out.add(MiniChartLine(
    i1: line.i1,
    i2: line.i2,
    p1: line.p1 + delta * 0.5,
    p2: line.p2 + delta * 0.5,
    color: col.withOpacity(0.14),
    width: 1.0,
  ));
}

return LuxTlOverlay(lines: out, label: r.label);
}