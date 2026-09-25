import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'neon_theme.dart';

/// 작은 공간에서 확률/상태를 한 눈에 보여주는 도넛 게이지
/// - value: 0~100
/// - title: 상단 라벨(짧게)
/// - center: 중앙 텍스트(예: "숏 78")
/// - footer: 하단 보조(예: "근거 7/10")
class DonutGaugeV1 extends StatelessWidget {
  final double value;
  final String title;
  final String center;
  final String? footer;
  final Color? activeColor;
  final double size;

  const DonutGaugeV1({
    super.key,
    required this.value,
    required this.title,
    required this.center,
    this.footer,
    this.activeColor,
    this.size = 88,
  });

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final v = value.isFinite ? value.clamp(0.0, 100.0) : 0.0;
    final col = activeColor ?? t.accent;

    return SizedBox(
      width: size,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textSecondary, fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          SizedBox(
            width: size,
            height: size,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  painter: _DonutPainter(
                    value: v / 100.0,
                    bg: t.border.withOpacity(0.55),
                    fg: col,
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(center, style: TextStyle(color: t.textPrimary, fontSize: 13, fontWeight: FontWeight.w900, height: 1.05)),
                    Text('${v.toStringAsFixed(0)}%', style: TextStyle(color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
                  ],
                ),
              ],
            ),
          ),
          if (footer != null) ...[
            const SizedBox(height: 6),
            Text(footer!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
          ],
        ],
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  final double value; // 0~1
  final Color bg;
  final Color fg;

  _DonutPainter({required this.value, required this.bg, required this.fg});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final r = math.min(size.width, size.height) / 2 - 3;
    final stroke = r * 0.22;

    final pBg = Paint()
      ..color = bg
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final pFg = Paint()
      ..color = fg
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    final rect = Rect.fromCircle(center: center, radius: r);
    const start = -math.pi / 2;
    canvas.drawArc(rect, start, math.pi * 2, false, pBg);
    canvas.drawArc(rect, start, math.pi * 2 * value, false, pFg);
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) {
    return oldDelegate.value != value || oldDelegate.bg != bg || oldDelegate.fg != fg;
  }
}
