import 'package:flutter/material.dart';
import '../../data/models/candle.dart';
import 'mini_chart_overlays.dart';

class MiniRealtimeChart extends StatelessWidget {
  final List<Candle> candles;
  final double height;
  final List<ZoneOverlay> zones;
  final List<LineOverlay> lines;

  const MiniRealtimeChart({
    super.key,
    required this.candles,
    this.height = 140,
    this.zones = const [],
    this.lines = const [],
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _CandlePainter(candles, zones, lines),
      ),
    );
  }
}

class _CandlePainter extends CustomPainter {
  final List<Candle> cs;
  final List<ZoneOverlay> zones;
  final List<LineOverlay> lines;
  _CandlePainter(this.cs, this.zones, this.lines);

  @override
  void paint(Canvas canvas, Size size) {
    if (cs.isEmpty) return;

    final valid = cs.where((c) => c.h > 0 && c.l > 0).toList();
    if (valid.isEmpty) return;

    double lo = valid.first.l, hi = valid.first.h;
    for (final c in valid) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }

    final w = size.width;
    final h = size.height;
    final n = valid.length;
    final step = w / (n);
    // ê³µë°± ê³¼ìž¥ ?„í™”: step?????Œë„ ë°”ë”” ??´ ì¶©ë¶„??ì»¤ì??„ë¡ ?í•œ???¬ë¦¬ê³? step ë¹„ìœ¨???•ë?
    final bodyW = (step * 0.88).clamp(3.0, 18.0);

    double y(double p) => h - ((p - lo) / (hi - lo)) * h;

    // 1) zones (ë°°ê²½ ë°•ìŠ¤)
    for (final z in zones) {
      final top = y(z.top);
      final bot = y(z.bottom);
      final rect = Rect.fromLTRB(0, top, w, bot);
      final paint = Paint()..color = z.color.withOpacity(z.opacity);
      canvas.drawRect(rect, paint);

      if (z.label.isNotEmpty) {
        final tp = TextPainter(
          text: TextSpan(
            text: z.label,
            style: const TextStyle(fontSize: 10, color: Colors.white70),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: w);
        tp.paint(canvas, Offset(6, (top < bot ? top : bot) + 4));
      }
    }

    // 2) lines (?ˆë²¨)
    for (final l in lines) {
      final yy = y(l.y);
      final p = Paint()
        ..color = l.color.withOpacity(0.8)
        ..strokeWidth = l.width;
      canvas.drawLine(Offset(0, yy), Offset(w, yy), p);

      if (l.label.isNotEmpty) {
        final tp = TextPainter(
          text: TextSpan(
            text: l.label,
            style: const TextStyle(fontSize: 10, color: Colors.white70),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: w);
        tp.paint(canvas, Offset(w - tp.width - 6, yy - 12));
      }
    }

    // 3) candles
    final up = Paint()..color = const Color(0xFF2EE6A6);
    final dn = Paint()..color = const Color(0xFFFF4D6D);

    for (int i = 0; i < n; i++) {
      final c = valid[i];
      final x = (i + 0.5) * step;

      final isUp = c.c >= c.o;
      final p = isUp ? up : dn;

      canvas.drawLine(Offset(x, y(c.h)), Offset(x, y(c.l)), p..strokeWidth = 2);

      final top = y(isUp ? c.c : c.o);
      final bot = y(isUp ? c.o : c.c);
      final rect = Rect.fromCenter(
        center: Offset(x, (top + bot) / 2),
        width: bodyW,
        height: (bot - top).abs().clamp(2.0, h),
      );
      canvas.drawRect(rect, p);
    }
  }

  @override
  bool shouldRepaint(covariant _CandlePainter oldDelegate) =>
      oldDelegate.cs != cs || oldDelegate.zones != zones || oldDelegate.lines != lines;
}
