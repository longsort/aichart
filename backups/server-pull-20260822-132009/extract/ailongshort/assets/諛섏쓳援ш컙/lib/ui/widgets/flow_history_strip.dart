import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Mini history charts for Flow metrics (buy/sell/ob/abs + cvd).
///
/// This widget is intentionally lightweight:
/// - No external deps
/// - No fixed colors (uses ColorScheme primary with opacity)
/// - Safe with empty/short lists
class FlowHistoryStrip extends StatelessWidget {
  final List<int> buy;
  final List<int> sell;
  final List<int> ob;
  final List<int> absorption;
  final List<double> cvd;
  final int maxPoints;

  const FlowHistoryStrip({
    super.key,
    required this.buy,
    required this.sell,
    required this.ob,
    required this.absorption,
    required this.cvd,
    this.maxPoints = 60,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Flow History',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                '${_last(buy)}/${_last(sell)}  OB ${_last(ob)}  ABS ${_last(absorption)}',
                style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _RowSpark(
            label: 'BUY',
            values: _tailInt(buy, maxPoints),
          ),
          const SizedBox(height: 6),
          _RowSpark(
            label: 'SELL',
            values: _tailInt(sell, maxPoints),
          ),
          const SizedBox(height: 6),
          _RowSpark(
            label: 'OB',
            values: _tailInt(ob, maxPoints),
          ),
          const SizedBox(height: 6),
          _RowSpark(
            label: 'ABS',
            values: _tailInt(absorption, maxPoints),
          ),
          const SizedBox(height: 10),
          Text(
            'CVD',
            style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 44,
            width: double.infinity,
            child: CustomPaint(
              painter: _SparkPainter(
                values: _tailDouble(cvd, maxPoints),
                color: cs.primary.withOpacity(0.85),
                fill: cs.primary.withOpacity(0.12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static int _last(List<int> v) => v.isEmpty ? 0 : v.last.clamp(0, 100);

  static List<int> _tailInt(List<int> src, int n) {
    if (src.length <= n) return List<int>.from(src);
    return src.sublist(src.length - n);
  }

  static List<double> _tailDouble(List<double> src, int n) {
    if (src.length <= n) return List<double>.from(src);
    return src.sublist(src.length - n);
  }
}

class _RowSpark extends StatelessWidget {
  final String label;
  final List<int> values;

  const _RowSpark({
    required this.label,
    required this.values,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Row(
      children: [
        SizedBox(
          width: 44,
          child: Text(
            label,
            style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w900),
          ),
        ),
        Expanded(
          child: SizedBox(
            height: 26,
            child: CustomPaint(
              painter: _SparkPainter(
                values: values.map((e) => e.toDouble()).toList(growable: false),
                color: cs.primary.withOpacity(0.75),
                fill: cs.primary.withOpacity(0.10),
                normalize01: true,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> values;
  final Color color;
  final Color fill;
  final bool normalize01;

  _SparkPainter({
    required this.values,
    required this.color,
    required this.fill,
    this.normalize01 = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) {
      // draw a subtle baseline
      final p = Paint()
        ..color = color.withOpacity(0.25)
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;
      canvas.drawLine(Offset(0, size.height * 0.6), Offset(size.width, size.height * 0.6), p);
      return;
    }

    final minV = values.reduce(math.min);
    final maxV = values.reduce(math.max);
    final span = (maxV - minV).abs();
    final safeSpan = span < 1e-9 ? 1.0 : span;

    double norm(double v) {
      if (normalize01) return (v.clamp(0, 100)) / 100.0;
      return (v - minV) / safeSpan;
    }

    final dx = size.width / (values.length - 1);

    final path = Path();
    final fillPath = Path();
    for (int i = 0; i < values.length; i++) {
      final x = dx * i;
      final y = size.height - (norm(values[i]) * size.height);
      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();

    final fillPaint = Paint()
      ..color = fill
      ..style = PaintingStyle.fill;
    canvas.drawPath(fillPath, fillPaint);

    final linePaint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(path, linePaint);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) {
    return oldDelegate.values != values ||
        oldDelegate.color != color ||
        oldDelegate.fill != fill ||
        oldDelegate.normalize01 != normalize01;
  }
}
