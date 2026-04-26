import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

/// WAR Overlay (v1)
/// - Reserve right-side future space (30% width)
/// - Draw 3 scenario bands (MAIN/ALT/FAIL) as probability spaces
/// - Project reaction zones as horizontal bands
/// - Apply NO-TRADE gray veil when locked
class WarOverlayPainter extends CustomPainter {
  final List<FuCandle> candles;
  final double price;
  final String? bias; // "LONG" / "SHORT" / "LOCK"
  final int? prob;    // 0..100
  final double reactLow;
  final double reactHigh;

  // Optional plan
  final bool showPlan;
  final double entry;
  final double stop;
  final double target;

  const WarOverlayPainter({
    required this.candles,
    required this.price,
    required this.bias,
    required this.prob,
    required this.reactLow,
    required this.reactHigh,
    required this.showPlan,
    required this.entry,
    required this.stop,
    required this.target,
  });

  bool get _locked {
    final b = (bias ?? '').toUpperCase();
    return b.contains('LOCK') || b.contains('NO') || b.contains('WAIT');
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;

    // Chart area: left(70%) real, right(30%) future
    final futureW = size.width * 0.0; // v2: disable in-chart future space (prevents candle shift)
    final chartW = size.width - futureW;
    final chartRect = Rect.fromLTWH(0, 0, chartW, size.height);
    final futureRect = Rect.fromLTWH(chartW, 0, futureW, size.height);

    // Price scale from candles
    double minP = candles.first.low;
    double maxP = candles.first.high;
    for (final c in candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }
    final pad = (maxP - minP) * 0.08;
    minP -= pad;
    maxP += pad;
    if ((maxP - minP).abs() < 1e-9) {
      maxP = minP + 1.0;
    }

    double yOf(double p) {
      final t = (p - minP) / (maxP - minP);
      return size.height * (1.0 - t.clamp(0.0, 1.0));
    }

    // 0) Future divider line
    final divPaint = Paint()
      ..color = Colors.white.withOpacity(0.10)
      ..strokeWidth = 1.0;
    canvas.drawLine(Offset(chartW, 0), Offset(chartW, size.height), divPaint);

    // 1) Reaction band (project on full width for quick read)
    if (reactHigh > 0 && reactLow > 0 && reactHigh > reactLow) {
      final y1 = yOf(reactHigh);
      final y2 = yOf(reactLow);
      final band = Rect.fromLTWH(0, math.min(y1, y2), size.width, (y1 - y2).abs());
      final p = Paint()..color = Colors.white.withOpacity(0.06);
      canvas.drawRect(band, p);

      // edge lines
      final edge = Paint()
        ..color = Colors.white.withOpacity(0.15)
        ..strokeWidth = 1.0;
      canvas.drawLine(Offset(0, y1), Offset(size.width, y1), edge);
      canvas.drawLine(Offset(0, y2), Offset(size.width, y2), edge);
    }

    // 2) Scenario probability spaces in futureRect
    if (futureRect.width <= 20) {
      // No in-chart future space: keep chart full width.
      // Scenario info is shown in the right panel / cards.
      return;
    }
    final pProb = (prob ?? 0).clamp(0, 100);
    final b = (bias ?? '').toUpperCase();
    final isLong = b.contains('LONG');
    final isShort = b.contains('SHORT');

    // Define rough targets from plan/price (keep v1 simple)
    final mainTarget = showPlan && target > 0
        ? target
        : (isShort ? price * 0.985 : price * 1.015);
    final failLevel = showPlan && stop > 0
        ? stop
        : (isShort ? price * 1.01 : price * 0.99);

    // Band thickness from volatility proxy (range)
    final range = (maxP - minP);
    final baseBand = range * 0.06; // 6% of range

    void drawBand({
      required double centerPrice,
      required double half,
      required Paint paint,
      required String label,
      required int alphaText,
    }) {
      final yC = yOf(centerPrice);
      final yT = yOf(centerPrice + half);
      final yB = yOf(centerPrice - half);
      final top = math.min(yT, yB);
      final h = (yT - yB).abs();
      final r = Rect.fromLTWH(futureRect.left + 6, top, futureRect.width - 12, h.clamp(10.0, size.height));
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(12)), paint);

      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(
            color: Colors.white.withOpacity(alphaText / 255.0),
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: r.width);
      tp.paint(canvas, Offset(r.left + 8, r.top + 6));
    }

    // MAIN band: opacity by probability
    final mainPaint = Paint()..color = Colors.white.withOpacity(0.08 + (pProb / 100.0) * 0.10);
    drawBand(
      centerPrice: (price + mainTarget) / 2.0,
      half: baseBand * (0.9 + (1.0 - pProb / 100.0) * 0.5),
      paint: mainPaint,
      label: "MAIN (메인) ${pProb}%",
      alphaText: 210,
    );

    // ALT band: neutral drift
    final altPaint = Paint()..color = Colors.white.withOpacity(0.06);
    drawBand(
      centerPrice: price * 1.005,
      half: baseBand * 0.8,
      paint: altPaint,
      label: "ALT (대체)",
      alphaText: 170,
    );

    // FAIL band: thinner + higher warning opacity
    final failPaint = Paint()..color = Colors.white.withOpacity(0.05);
    drawBand(
      centerPrice: failLevel,
      half: baseBand * 0.6,
      paint: failPaint,
      label: "FAIL (무효)",
      alphaText: 150,
    );

    // 3) Current price guide line (across futureRect)
    final yNow = yOf(price);
    final nowPaint = Paint()
      ..color = Colors.white.withOpacity(0.18)
      ..strokeWidth = 1.0;
    canvas.drawLine(Offset(futureRect.left, yNow), Offset(futureRect.right, yNow), nowPaint);

    // 4) NO-TRADE veil
    if (_locked) {
      final veil = Paint()..color = Colors.black.withOpacity(0.25);
      canvas.drawRect(futureRect, veil);

      final tp = TextPainter(
        text: const TextSpan(
          text: "WAIT (대기)",
          style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w900),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: futureRect.width);
      tp.paint(canvas, Offset(futureRect.left + 10, 10));
    }
  }

  @override
  bool shouldRepaint(covariant WarOverlayPainter oldDelegate) {
    return oldDelegate.candles != candles ||
        oldDelegate.price != price ||
        oldDelegate.bias != bias ||
        oldDelegate.prob != prob ||
        oldDelegate.reactLow != reactLow ||
        oldDelegate.reactHigh != reactHigh ||
        oldDelegate.showPlan != showPlan ||
        oldDelegate.entry != entry ||
        oldDelegate.stop != stop ||
        oldDelegate.target != target;
  }
}
