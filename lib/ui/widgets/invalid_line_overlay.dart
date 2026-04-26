import 'package:flutter/material.dart';

/// Overlay for "Invalidation Line" (?�나리오 무효???�인).
///
/// Usage (wrap your chart with Stack):
/// Stack(
///   children: [
///     YourFutureChart(...),
///     Positioned.fill(
///       child: InvalidationLineOverlay(
///         price: invalidationPrice,
///         priceToY: (p) => yourPriceToY(p), // map price -> y(px) in chart space
///         invalidated: isInvalidated,
///         label: '무효',
///       ),
///     ),
///   ],
/// )
class InvalidationLineOverlay extends StatelessWidget {
  final double price;

  /// Convert a price to Y coordinate (pixels) inside the same chart space.
  final double Function(double price) priceToY;

  /// If true, show the line as "broken/invalidated" (dim + dashed).
  final bool invalidated;

  /// Optional label text (e.g., "무효", "X", "Invalid").
  final String label;

  /// Left padding for label pill.
  final double leftPad;

  /// Right padding (to avoid overlapping your right-side price ladder).
  final double rightPad;

  const InvalidationLineOverlay({
    super.key,
    required this.price,
    required this.priceToY,
    required this.invalidated,
    this.label = '무효',
    this.leftPad = 10,
    this.rightPad = 84,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _InvalidationPainter(
        price: price,
        priceToY: priceToY,
        invalidated: invalidated,
        label: label,
        leftPad: leftPad,
        rightPad: rightPad,
      ),
    );
  }
}

class _InvalidationPainter extends CustomPainter {
  final double price;
  final double Function(double price) priceToY;
  final bool invalidated;
  final String label;
  final double leftPad;
  final double rightPad;

  _InvalidationPainter({
    required this.price,
    required this.priceToY,
    required this.invalidated,
    required this.label,
    required this.leftPad,
    required this.rightPad,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final y = priceToY(price);

    // Guard: if outside canvas
    if (y.isNaN || y.isInfinite) return;
    if (y < -2 || y > size.height + 2) return;

    final lineColor = invalidated
        ? Colors.red.withOpacity(0.35)
        : Colors.red.withOpacity(0.85);

    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;

    final x1 = 0.0;
    final x2 = size.width - rightPad;

    if (invalidated) {
      // dashed
      const dashW = 7.0;
      const dashGap = 5.0;
      double x = x1;
      while (x < x2) {
        final nx = (x + dashW).clamp(x1, x2);
        canvas.drawLine(Offset(x, y), Offset(nx, y), paint);
        x += dashW + dashGap;
      }
    } else {
      canvas.drawLine(Offset(x1, y), Offset(x2, y), paint);
    }

    // label pill
    final pillText = '$label ${price.toStringAsFixed(1)}';
    final tp = TextPainter(
      text: TextSpan(
        text: pillText,
        style: TextStyle(
          color: lineColor,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '??,
    )..layout(maxWidth: size.width * 0.7);

    final pillW = tp.width + 14;
    final pillH = 18.0;
    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(leftPad, y - pillH / 2, pillW, pillH),
      const Radius.circular(9),
    );

    final bg = Paint()
      ..color = (invalidated ? Colors.black.withOpacity(0.25) : Colors.black.withOpacity(0.35))
      ..style = PaintingStyle.fill;

    final border = Paint()
      ..color = lineColor.withOpacity(invalidated ? 0.35 : 0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    canvas.drawRRect(pillRect, bg);
    canvas.drawRRect(pillRect, border);

    tp.paint(canvas, Offset(leftPad + 7, y - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _InvalidationPainter oldDelegate) {
    return oldDelegate.price != price ||
        oldDelegate.invalidated != invalidated ||
        oldDelegate.label != label ||
        oldDelegate.leftPad != leftPad ||
        oldDelegate.rightPad != rightPad;
  }
}