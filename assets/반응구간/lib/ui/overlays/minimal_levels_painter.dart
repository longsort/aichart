import 'dart:ui';
import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../widgets/neon_theme.dart';

/// MinimalLevelsPainter
/// - 화면 지저분함 제거용 "3레벨 + 금지" 전용 오버레이
/// - 표시 규칙:
///   1) 즉시(Immediate): reactLow~reactHigh 얇은 띠 + reactLevel 라인
///   2) 다음(Target): breakLevel 라인
///   3) 대구조(Macro): mbZones 중 가장 큰 1개만 아주 연하게
///   4) NO-TRADE(locked): 상단 중앙에 '금지' 배너(짧게)
class MinimalLevelsPainter extends CustomPainter {
  final FuState s;
  final NeonTheme theme;
  final List<FuCandle> candles;

  final double Function(int idx) indexToX;
  final double Function(double price) priceToY;

  final int startIndex;
  final int visibleCount;
  final int projectionBars;

  const MinimalLevelsPainter({
    required this.s,
    required this.theme,
    required this.candles,
    required this.indexToX,
    required this.priceToY,
    required this.startIndex,
    required this.visibleCount,
    required this.projectionBars,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;

    final lastIdx = candles.length - 1;
    final xRight = indexToX(lastIdx);

    _drawMacroBox(canvas, size, xRight);
    _drawTargetLine(canvas, size, xRight);
    _drawImmediate(canvas, size, xRight);
    _drawLockBanner(canvas, size);
  }

  void _drawMacroBox(Canvas canvas, Size size, double xRight) {
    if (s.mbZones.isEmpty) return;

    // 가장 넓은(가격폭) 1개만
    FuZone best = s.mbZones.first;
    for (final z in s.mbZones) {
      final span = (z.high - z.low).abs();
      final bestSpan = (best.high - best.low).abs();
      if (span > bestSpan) best = z;
    }

    final y1 = priceToY(best.high);
    final y2 = priceToY(best.low);
    final top = y1 < y2 ? y1 : y2;
    final bottom = y1 < y2 ? y2 : y1;

    // 미래 PAD까지 얇게 확장
    final fill = Paint()..color = theme.border.withOpacity(0.06);
    final stroke = Paint()
      ..color = theme.border.withOpacity(0.14)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final r = RRect.fromRectAndRadius(
      Rect.fromLTRB(0, top, xRight, bottom),
      const Radius.circular(10),
    );
    canvas.drawRRect(r, fill);
    canvas.drawRRect(r, stroke);
  }

  void _drawTargetLine(Canvas canvas, Size size, double xRight) {
    final lvl = s.breakLevel;
    if (lvl <= 0) return;

    final y = priceToY(lvl);
    final p = Paint()
      ..color = theme.warn.withOpacity(0.85)
      ..strokeWidth = 1.6;

    // dashed-ish line
    const dash = 10.0;
    const gap = 8.0;
    double x = 0;
    while (x < xRight) {
      canvas.drawLine(Offset(x, y), Offset((x + dash).clamp(0, xRight), y), p);
      x += dash + gap;
    }

    _rightTag(canvas, '목표', lvl, Offset(xRight - 6, y), theme.warn.withOpacity(0.92));
  }

  void _drawImmediate(Canvas canvas, Size size, double xRight) {
    final lo = s.reactLow;
    final hi = s.reactHigh;
    if (lo > 0 && hi > 0 && (hi - lo).abs() > 1e-9) {
      final y1 = priceToY(hi);
      final y2 = priceToY(lo);
      final top = y1 < y2 ? y1 : y2;
      final bottom = y1 < y2 ? y2 : y1;

      final fill = Paint()..color = theme.good.withOpacity(0.07);
      final stroke = Paint()
        ..color = theme.good.withOpacity(0.18)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0;

      final r = RRect.fromRectAndRadius(
        Rect.fromLTRB(0, top, xRight, bottom),
        const Radius.circular(10),
      );
      canvas.drawRRect(r, fill);
      canvas.drawRRect(r, stroke);

      // 범위 가격은 오른쪽 작은 태그 1개만(겹침 방지)
      _rightTag(canvas, '즉시', (lo + hi) * 0.5, Offset(xRight - 6, top + 2), theme.good.withOpacity(0.90));
    }

    final core = s.reactLevel;
    if (core > 0) {
      final y = priceToY(core);
      final p = Paint()
        ..color = theme.good.withOpacity(0.9)
        ..strokeWidth = 1.2;
      canvas.drawLine(Offset(0, y), Offset(xRight, y), p);
    }
  }

  void _drawLockBanner(Canvas canvas, Size size) {
    if (!s.locked) return;

    const padX = 14.0;
    const padY = 10.0;
    final text = '금지';
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: Color(0xFFFFE6E6),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    final w = tp.width + padX * 2;
    final h = tp.height + padY * 2;
    final left = (size.width - w) / 2;
    final top = 18.0;

    final bg = Paint()..color = theme.bad.withOpacity(0.75);
    final border = Paint()
      ..color = theme.bad.withOpacity(0.95)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final r = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, top, w, h),
      const Radius.circular(18),
    );
    canvas.drawRRect(r, bg);
    canvas.drawRRect(r, border);

    tp.paint(canvas, Offset(left + padX, top + padY));
  }

  void _rightTag(Canvas canvas, String label, double price, Offset anchor, Color c) {
    final txt = '$label ${_fmt(price)}';
    final tp = TextPainter(
      text: TextSpan(
        text: txt,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: Colors.white.withOpacity(0.92),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    const padX = 10.0;
    const padY = 6.0;

    final w = tp.width + padX * 2;
    final h = tp.height + padY * 2;

    final x = (anchor.dx - w).clamp(6.0, (size.width - w - 6.0));
    final y = (anchor.dy - h / 2).clamp(8.0, (size.height - h - 8.0));

    final bg = Paint()..color = c.withOpacity(0.35);
    final border = Paint()
      ..color = c.withOpacity(0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final r = RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, w, h),
      const Radius.circular(14),
    );
    canvas.drawRRect(r, bg);
    canvas.drawRRect(r, border);

    tp.paint(canvas, Offset(x + padX, y + padY));
  }

  String _fmt(double v) {
    if (v.abs() >= 1000) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  @override
  bool shouldRepaint(covariant MinimalLevelsPainter oldDelegate) {
    return oldDelegate.s != s ||
        oldDelegate.startIndex != startIndex ||
        oldDelegate.visibleCount != visibleCount ||
        oldDelegate.projectionBars != projectionBars;
  }
}
