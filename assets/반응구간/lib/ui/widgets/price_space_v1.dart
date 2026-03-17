
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../overlays/war_overlay_painter.dart';

class PriceSpaceV1 extends StatelessWidget {
  final FuState state;
  const PriceSpaceV1({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F14),
        border: Border(right: BorderSide(color: Colors.white.withOpacity(0.08))),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          color: Colors.black.withOpacity(0.22),
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _PricePainter(state),
                ),
              ),
              // WAR overlay: future bands + reaction band + wait veil
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    painter: WarOverlayPainter(
                      candles: state.candles,
                      price: state.price,
                      bias: state.showSignal ? state.finalDir : "WAIT",
                      prob: state.confidence,
                      reactLow: state.reactLow,
                      reactHigh: state.reactHigh,
                      showPlan: state.entry > 0 && state.stop > 0,
                      entry: state.entry,
                      stop: state.stop,
                      target: state.target,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PricePainter extends CustomPainter {
  final FuState s;
  _PricePainter(this.s);

  @override
  void paint(Canvas canvas, Size size) {
    if (s.candles.isEmpty) return;

    // scale
    double minP = s.candles.first.low, maxP = s.candles.first.high;
    for (final c in s.candles) {
      minP = math.min(minP, c.low);
      maxP = math.max(maxP, c.high);
    }
    final pad = (maxP - minP) * 0.08;
    minP -= pad; maxP += pad;
    if ((maxP - minP).abs() < 1e-9) maxP = minP + 1;

    double yOf(double p) {
      final t = (p - minP) / (maxP - minP);
      return size.height * (1 - t.clamp(0.0, 1.0));
    }

    // candle geometry (simple)
    final n = s.candles.length;
    final w = size.width / math.max(1, n);
    final wick = Paint()
      ..strokeWidth = 1.0
      ..color = Colors.white.withOpacity(0.35);

    for (int i = 0; i < n; i++) {
      final c = s.candles[i];
      final x = i * w + w * 0.5;

      final yH = yOf(c.high);
      final yL = yOf(c.low);
      canvas.drawLine(Offset(x, yH), Offset(x, yL), wick);

      final isUp = c.close >= c.open;
      final body = Paint()
        ..color = (isUp ? const Color(0xFF6BE7B6) : const Color(0xFFFF6B6B)).withOpacity(0.85);

      final yO = yOf(c.open);
      final yC = yOf(c.close);
      final top = math.min(yO, yC);
      final bot = math.max(yO, yC);
      final rect = Rect.fromLTWH(i * w + w * 0.15, top, w * 0.7, math.max(1.5, bot - top));
      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(3)), body);
    }

    // structure: keep it minimal (3 lines max)
    final line = Paint()
      ..strokeWidth = 1.0
      ..color = Colors.lightBlueAccent.withOpacity(0.20);

    final chLow = (s.s1 > 0 ? s.s1 : minP);
    final chHigh = (s.r1 > 0 ? s.r1 : maxP);
    final chMid = (chLow + chHigh) / 2.0;

    canvas.drawLine(Offset(0, yOf(chHigh)), Offset(size.width, yOf(chHigh)), line);
    canvas.drawLine(Offset(0, yOf(chMid)), Offset(size.width, yOf(chMid)), line..color = Colors.lightBlueAccent.withOpacity(0.14));
    canvas.drawLine(Offset(0, yOf(chLow)), Offset(size.width, yOf(chLow)), line..color = Colors.lightBlueAccent.withOpacity(0.20));
  }

  @override
  bool shouldRepaint(covariant _PricePainter oldDelegate) => true;
}
