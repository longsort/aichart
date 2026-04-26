import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import 'neon_theme.dart';

/// SMC ?òÎã® ?úÍ∞ÑÏ∂? Ï∫îÎì§ ?∏Îç±?§Î≥Ñ ?†Ïßú ?úÏãú (LuxAlgo/TradingView ?ôÏùº)
class _SmcBottomAxisPainter extends CustomPainter {
  final List<FuCandle> candles;
  final int startIndex;
  final int visibleCount;
  final double Function(int idx) indexToX;
  final double chartW;
  final Color? axisTextColor;

  _SmcBottomAxisPainter({
    required this.candles,
    required this.startIndex,
    required this.visibleCount,
    required this.indexToX,
    required this.chartW,
    this.axisTextColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty || visibleCount <= 0) return;
    final end = math.min(startIndex + visibleCount, candles.length);
    final step = math.max(1, visibleCount ~/ 12);
    int? lastMonth;
    for (int i = startIndex; i < end; i += step) {
      if (i >= candles.length) break;
      final c = candles[i];
      final x = indexToX(i).clamp(0.0, chartW);
      if (x < 0 || x > size.width) continue;
      final dt = DateTime.fromMillisecondsSinceEpoch(c.ts);
      final day = dt.day;
      final month = dt.month;
      final label = lastMonth != null && lastMonth != month
          ? '${month}??
          : '$day';
      if (lastMonth != month) lastMonth = month;
      final textColor = axisTextColor ?? Colors.white.withOpacity(0.9);
      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(color: textColor, fontSize: 10, fontWeight: FontWeight.w600),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x - tp.width / 2, 4));
    }
  }

  @override
  bool shouldRepaint(covariant _SmcBottomAxisPainter old) {
    return old.startIndex != startIndex || old.visibleCount != visibleCount || old.candles.length != candles.length || old.axisTextColor != axisTextColor;
  }
}

/// PathChartLite
/// - FuturePathPainterÍ∞Ä ??Ï¢åÌëúÍ≥?indexToX/priceToY)Î•??úÍ≥µ?òÎäî "Í∞ÄÎ≤ºÏö¥" Ï∞®Ìä∏
/// - MiniChartV4 ?¥Î? Ï¢åÌëúÍ≥ÑÏóê ?òÏ°¥?òÏ? ?äÍ∏∞ ?ÑÌï¥ Î≥ÑÎèÑÎ°???/// - candles???ÑÏ≤¥ ?∏Îç±?§Î? ?†Ï??òÍ≥†, ?åÎçî??ÏµúÍ∑º visibleCountÎß??úÏãú
class PathChartLite extends StatefulWidget {
  final List<FuCandle> candles;
  final String title;
  final NeonTheme theme;

  /// Right-side future projection padding measured in "bars".
  /// If > 0, [indexToX] will map indices beyond the last visible candle
  /// into the right-side empty space so that future overlays can extend.
  final int projectionBars;

  /// ?∞Ï∏° ÎØ∏Îûò Í≥µÍ∞Ñ??"?ïÏ∂ï"?òÏ? ?äÍ≥†, Í∞ÄÎ°??§ÌÅ¨Î°§Î°ú ??Î≥¥Ïù¥Í≤??úÎã§.
  /// - false: Í∏∞Ï°¥ Î∞©Ïãù(??Í≥†Ï†ï, projectionBars ÎßåÌÅº ?åÎ¶º)
  /// - true: ?¥Î? ??ùÑ ?òÎ†§ ?∞Ï∏° ÎØ∏Îûò Íµ¨Í∞Ñ???ìÌûàÍ≥? Í∏∞Î≥∏ ?ÑÏπò???∞Ï∏°(ÏµúÏã†)?ºÎ°ú ÎßûÏ∂ò??
  final bool scrollableFuture;

  /// ?¨Ïö©???†ÌÉù Ï∫îÎì§ ??80/120/200 ??. null?¥Î©¥ ?êÎèô(ÏµúÎ? 260).
  final int? preferredVisibleCount;

  /// Smart Money Concepts [LuxAlgo] ?§Ì??? ?∞Ï∏° Í∞ÄÍ≤©Ï∂ï, ?òÎã® ?úÍ∞ÑÏ∂? ?ÑÏû¨Í∞Ä ?êÏÑ†
  final bool smcStyle;

  /// TradingView ?ºÏù¥???§Ì???100%: ??Î∞∞Í≤Ω, ?ëÎ¥â=??Í≤Ä???åÎëêÎ¶?, ?åÎ¥â=Í≤Ä??  final bool lightChartStyle;

  /// ?ÑÏû¨Í∞Ä (?∞Ï∏° Ï∂ï¬∑Ï†ê???úÏãú??
  final double? livePrice;

  /// (indexToX, priceToY, yToPrice, startIndex, visibleCount, chartHeight, topPad, bottomPad) -> overlay widgets
  final Widget Function(
    double Function(int idx) indexToX,
    double Function(double price) priceToY,
    double Function(double y) yToPrice,
    int startIndex,
    int visibleCount,
    double chartHeight,
    double topPad,
    double bottomPad,
  ) childBuilder;

  const PathChartLite({
    super.key,
    required this.candles,
    required this.title,
    required this.theme,
    required this.childBuilder,
    this.projectionBars = 0,
    this.scrollableFuture = false,
    this.preferredVisibleCount,
    this.smcStyle = false,
    this.lightChartStyle = false,
    this.livePrice,
  });

  @override
  State<PathChartLite> createState() => _PathChartLiteState();
}

class _PathChartLiteState extends State<PathChartLite> {
  final ScrollController _sc = ScrollController();
  bool _jumped = false;

  @override
  void dispose() {
    _sc.dispose();
    super.dispose();
  }

  static const double _smcRightAxisW = 56.0;
  static const double _smcBottomAxisH = 26.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth;
        final h = c.maxHeight;

        const topPad = 38.0;
        const bottomPad = 28.0;

        final smc = widget.smcStyle;
        final chartW = smc ? (w - _smcRightAxisW).clamp(1.0, double.infinity) : w;
        final chartH = smc ? (h - _smcBottomAxisH).clamp(1.0, double.infinity) : h;
        final innerH = (chartH - topPad - bottomPad).clamp(1.0, 999999.0);

        final candles = widget.candles;
        final n = candles.length;
        final rawCount = widget.preferredVisibleCount ?? math.min(260, math.max(10, n));
        final visibleCount = math.min(260, math.max(10, math.min(rawCount, n)));
        final startIndex = n <= visibleCount ? 0 : (n - visibleCount);

        double minP = 0;
        double maxP = 0;
        if (n > 0) {
          minP = candles[startIndex].low;
          maxP = candles[startIndex].high;
          for (int i = startIndex; i < n; i++) {
            final c0 = candles[i];
            if (c0.low < minP) minP = c0.low;
            if (c0.high > maxP) maxP = c0.high;
          }
        }

        final span = (maxP - minP).abs();
        final pad = span <= 0 ? (maxP.abs() * 0.02).clamp(1.0, 999999.0) : span * 0.06;
        minP -= pad;
        maxP += pad;

        double innerW = chartW;
        if (widget.scrollableFuture && widget.projectionBars > 0 && visibleCount > 0) {
          final ratio = (widget.projectionBars / visibleCount).clamp(0.0, 3.0);
          innerW = chartW * (1.0 + ratio);
        }

        final actualCount = n - startIndex;
        final rightAlign = actualCount > 0 && actualCount < visibleCount;

        double indexToX(int idx) {
          if (visibleCount <= 1) return 0;
          final denom = (visibleCount - 1 + widget.projectionBars).toDouble().clamp(1.0, 999999.0);
          final rightEdge = innerW * (visibleCount - 1) / denom;
          if (rightAlign && actualCount > 1) {
            final candleAreaW = innerW * (actualCount - 1) / denom;
            final t = ((idx - startIndex) / (actualCount - 1)).clamp(0.0, 1.0);
            return rightEdge - candleAreaW + t * candleAreaW;
          }
          final t = ((idx - startIndex) / denom).clamp(0.0, 1.0);
          return t * innerW;
        }

        double priceToY(double price) {
          final denom = (maxP - minP);
          if (denom == 0) return chartH / 2;
          final t = ((price - minP) / denom).clamp(0.0, 1.0);
          return (chartH - bottomPad) - (t * innerH);
        }

        double yToPrice(double y) {
          final t = (((chartH - bottomPad) - y) / innerH).clamp(0.0, 1.0);
          return minP + (t * (maxP - minP));
        }

        Widget inner() {
          return SizedBox(
            width: innerW,
            height: chartH,
            child: Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: _PathChartLitePainter(
                      candles: candles,
                      theme: widget.theme,
                      startIndex: startIndex,
                      visibleCount: visibleCount,
                      indexToX: indexToX,
                      priceToY: priceToY,
                      title: widget.title,
                      minP: minP,
                      maxP: maxP,
                      livePrice: widget.livePrice,
                      smcStyle: smc,
                      lightChartStyle: widget.lightChartStyle,
                      chartWidth: chartW,
                    ),
                  ),
                ),
                Positioned.fill(child: widget.childBuilder(indexToX, priceToY, yToPrice, startIndex, visibleCount, chartH, topPad, bottomPad)),
              ],
            ),
          );
        }

        if (smc) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: chartH,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: inner()),
                    SizedBox(
                      width: _smcRightAxisW,
                      height: chartH,
                      child: CustomPaint(
                        painter: _SmcRightAxisPainter(
                          minP: minP,
                          maxP: maxP,
                          priceToY: priceToY,
                          livePrice: widget.livePrice,
                          chartH: chartH,
                          topPad: topPad,
                          bottomPad: bottomPad,
                          axisTextColor: widget.lightChartStyle ? Colors.black : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: _smcBottomAxisH,
                child: CustomPaint(
                  painter: _SmcBottomAxisPainter(
                    candles: candles,
                    startIndex: startIndex,
                    visibleCount: visibleCount,
                    indexToX: indexToX,
                    chartW: chartW,
                    axisTextColor: widget.lightChartStyle ? Colors.black : null,
                  ),
                ),
              ),
            ],
          );
        }
        if (!widget.scrollableFuture) {
          return inner();
        }

        // Ï≤??ÑÎ†à?ÑÏóê "?àÎ¨¥" ?∞Ï∏°?ºÎ°ú Î∂ôÏ? ?äÍ≤å ?¥Îèô.
        // - maxScrollExtentÎ°?Î∞îÎ°ú ?êÌîÑ?òÎ©¥ Í≥ºÍ±∞(Ï¢åÏ∏°)Í∞Ä Í±∞Ïùò ??Î≥¥Ïù¥Î©¥ÏÑú "?¨Ïã¨"??Î≥¥Ïùº ???àÏùå.
        // - Í∏∞Î≥∏?Ä "Í≥ºÍ±∞ + ?ΩÍ∞Ñ??ÎØ∏Îûò"Í∞Ä Í∞ôÏù¥ Î≥¥Ïù¥?ÑÎ°ù, ?∞Ï∏° ?ùÏóê???îÎ©¥??ùò ?ºÎ?ÎßåÌÅº ?ºÏ™Ω?ºÎ°ú ?πÍ∏¥??
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_jumped) return;
          if (!_sc.hasClients) return;
          _jumped = true;
          final max = _sc.position.maxScrollExtent;
          // ?îÎ©¥??ùò 30%ÎßåÌÅº ?ºÏ™Ω?ºÎ°ú ?πÍ≤®??"Í≥ºÍ±∞"Í∞Ä Í∞ôÏù¥ Î≥¥Ïù¥Í≤?
          final shift = w * 0.30;
          final target = (max - shift).clamp(0.0, max);
          _sc.jumpTo(target);
        });

        return SingleChildScrollView(
          controller: _sc,
          scrollDirection: Axis.horizontal,
          child: inner(),
        );
      },
    );
  }
}

class _PathChartLitePainter extends CustomPainter {
  final List<FuCandle> candles;
  final NeonTheme theme;
  final int startIndex;
  final int visibleCount;
  final double Function(int idx) indexToX;
  final double Function(double price) priceToY;
  final String title;
  final double minP;
  final double maxP;
  final double? livePrice;
  final bool smcStyle;
  final bool lightChartStyle;
  /// ?òÎèÑ??Ï∞®Ìä∏ ??Ï¢åÌëúÍ≥?Í∏∞Ï?). 0?¥Î©¥ canvas size Í∑∏Î?Î°??¨Ïö©.
  final double chartWidth;

  _PathChartLitePainter({
    required this.candles,
    required this.theme,
    required this.startIndex,
    required this.visibleCount,
    required this.indexToX,
    required this.priceToY,
    required this.title,
    this.minP = 0,
    this.maxP = 0,
    this.livePrice,
    this.smcStyle = false,
    this.lightChartStyle = false,
    this.chartWidth = 0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const topPad = 38.0;
    const bottomPad = 28.0;
    final chartBottom = smcStyle ? size.height - 26.0 : size.height;
    final chartTop = topPad;
    final chartAreaBottom = chartBottom - bottomPad;

    // ?ºÏù¥??TradingView 100%): ??Î∞∞Í≤Ω / ?§ÌÅ¨: Í∑∏Îùº?∞Ïù¥??    if (smcStyle) {
      final bgRect = Rect.fromLTRB(0, chartTop, size.width, chartAreaBottom);
      if (lightChartStyle) {
        canvas.drawRect(bgRect, Paint()..color = Colors.white);
        final borderPaint = Paint()
          ..color = const Color(0xFFE5E7EB)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.0;
        canvas.drawRect(Rect.fromLTRB(0.5, chartTop, size.width - 0.5, chartAreaBottom), borderPaint);
      } else {
        final bgPaint = Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFF1A1D24),
              const Color(0xFF16191F),
              const Color(0xFF14171C),
            ],
          ).createShader(bgRect);
        canvas.drawRect(bgRect, bgPaint);
        final borderPaint = Paint()
          ..color = Colors.white.withOpacity(0.06)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.0;
        canvas.drawRect(Rect.fromLTRB(0.5, chartTop, size.width - 0.5, chartAreaBottom), borderPaint);
      }
    }

    // Í∑∏Î¶¨?? ?ºÏù¥???∞Ìïú ?åÏÉâ, ?§ÌÅ¨=??8%
    final gridOpacity = lightChartStyle ? 0.15 : 0.08;
    final gridColor = lightChartStyle ? const Color(0xFF374151) : Colors.white;
    final gridPaint = Paint()
      ..color = gridColor.withOpacity(gridOpacity)
      ..strokeWidth = 1;
    final dashPaint = Paint()
      ..color = gridColor.withOpacity(gridOpacity)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    if (smcStyle) {
      // Í∞ÄÎ°?Í∑∏Î¶¨?? Í∞ÄÍ≤??àÍ∏à(8?±Î∂Ñ)??ÎßûÏ∂ò ?êÏÑ†
      final span = (maxP - minP).abs();
      if (span > 0) {
        final step = span / 8;
        for (int i = 0; i <= 8; i++) {
          final p = minP + step * i;
          final y = priceToY(p);
          if (y >= chartTop && y <= chartAreaBottom) {
            _drawDashedLine(canvas, Offset(0, y), Offset(size.width, y), dashPaint);
          }
        }
      }
      // ?∏Î°ú Í∑∏Î¶¨?? ?úÍ∞Ñ ?àÍ∏à(8?±Î∂Ñ)??ÎßûÏ∂ò ?êÏÑ†
      if (visibleCount > 0) {
        final step = math.max(1, visibleCount ~/ 8);
        for (int k = 0; k <= 8; k++) {
          final int idx = startIndex + math.min(k * step, visibleCount - 1).toInt();
          if (idx < candles.length) {
            final x = indexToX(idx).clamp(0.0, size.width);
            _drawDashedLine(canvas, Offset(x, chartTop), Offset(x, chartAreaBottom), dashPaint);
          }
        }
      }
    } else {
      for (int i = 1; i <= 3; i++) {
        final y = (chartBottom - bottomPad) * (i / 4) + topPad;
        if (y < chartAreaBottom) canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
      }
    }

    if (candles.isEmpty) return;

    final end = math.min(startIndex + visibleCount, candles.length);
    if (end <= startIndex) return;

    final effectiveW = (chartWidth > 0 && size.width > 0) ? chartWidth : size.width;
    final scaleX = (chartWidth > 0 && size.width > 0) ? (size.width / chartWidth) : 1.0;
    final slotW = visibleCount > 0 ? (effectiveW / visibleCount) : 4.0;
    final bodyW = smcStyle ? (slotW * 0.72).clamp(1.8, 6.0) : 3.0;

    for (int i = startIndex; i < end; i++) {
      final c = candles[i];
      final x = indexToX(i) * scaleX;
      final yH = priceToY(c.high);
      final yL = priceToY(c.low);
      final yO = priceToY(c.open);
      final yC = priceToY(c.close);

      final isUp = c.close >= c.open;
      const black = Color(0xFF000000);
      const white = Color(0xFFFFFFFF);
      if (lightChartStyle) {
        // TradingView 100%: ?ëÎ¥â=??Í≤Ä???åÎëêÎ¶?, ?åÎ¥â=Í≤Ä?? ?¨Ï?=Í≤Ä??        final wickPaint = Paint()
          ..color = black
          ..strokeWidth = 1.0
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(Offset(x, yH), Offset(x, yL), wickPaint);
        final top = math.min(yO, yC);
        final bottom = math.max(yO, yC);
        final bodyH = (bottom - top).clamp(1.0, 999.0);
        final bodyRect = Rect.fromLTWH(x - bodyW / 2, top, bodyW, bodyH);
        if (isUp) {
          canvas.drawRect(bodyRect, Paint()..color = white..style = PaintingStyle.fill);
          canvas.drawRect(bodyRect, Paint()..color = black..style = PaintingStyle.stroke..strokeWidth = 1.0);
        } else {
          canvas.drawRect(bodyRect, Paint()..color = black..style = PaintingStyle.fill);
          canvas.drawRect(bodyRect, Paint()..color = black..style = PaintingStyle.stroke..strokeWidth = 1.0);
        }
      } else {
        final cGreen = const Color(0xFF22C55E);
        final cRed = const Color(0xFFEF4444);
        final wickColor = isUp ? cGreen : cRed;
        final wickPaint = Paint()
          ..color = wickColor
          ..strokeWidth = 1.0
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(Offset(x, yH), Offset(x, yL), wickPaint);
        final top = math.min(yO, yC);
        final bottom = math.max(yO, yC);
        final bodyH = (bottom - top).clamp(1.0, 999.0);
        final bodyRect = Rect.fromLTWH(x - bodyW / 2, top, bodyW, bodyH);
        canvas.drawRect(bodyRect, Paint()..color = (isUp ? cGreen : cRed)..style = PaintingStyle.fill);
      }
    }

    if (smcStyle && livePrice != null && livePrice! > 0) {
      final y = priceToY(livePrice!);
      if (y >= 38 && y <= chartBottom - 28) {
        final lineColor = lightChartStyle ? Colors.black : Colors.white.withOpacity(0.5);
        final dashPaint = Paint()
          ..color = lineColor
          ..strokeWidth = 1.2
          ..style = PaintingStyle.stroke;
        _drawDashedLine(canvas, Offset(0, y), Offset(size.width, y), dashPaint);
        final tp = TextPainter(
          text: TextSpan(
            text: livePrice!.toStringAsFixed(3),
            style: TextStyle(
              color: lightChartStyle ? Colors.black : Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, Offset(size.width - tp.width - 8, y - tp.height / 2));
      }
    }

    // SMC????Í∞ÄÍ≤??àÍ∏à?Ä ?∞Ï∏° ?ÑÏö© ?®Ïù∏?∞Ïóê?úÎßå Í∑∏Î¶º(Ï§ëÎ≥µ ?úÍ±∞)

    // Ï¢ÖÍ? ?∞Í≤∞?? LuxAlgo ?§Ì??ºÏóê?úÎäî Îß§Ïö∞ ?ÖÍ≤å(Ï∫îÎì§ Í∞ïÏ°∞)
    if (!smcStyle) {
      final closePaint = Paint()
        ..color = theme.textStrong.withOpacity(0.45)
        ..strokeWidth = 1.2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      final path = Path();
      for (int i = startIndex; i < end; i++) {
        final c = candles[i];
        final x = indexToX(i) * scaleX;
        final yC = priceToY(c.close);
        if (i == startIndex) {
          path.moveTo(x, yC);
        } else {
          path.lineTo(x, yC);
        }
      }
      canvas.drawPath(path, closePaint);
    }

    // title (?ÅÎã® ?ÑÏö© Î∞??¨Ïö© ??ÎπÑÏõå ??
    if (title.isNotEmpty) {
      final tp = TextPainter(
        text: TextSpan(
          text: title,
          style: TextStyle(
            color: theme.textStrong.withOpacity(0.92),
            fontSize: 12,
            fontWeight: FontWeight.w900,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '??,
      )..layout(maxWidth: size.width - 18);
      tp.paint(canvas, const Offset(10, 10));
    }
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 6.0;
    const gap = 5.0;
    final dx = b.dx - a.dx;
    final dy = b.dy - a.dy;
    final dist = math.sqrt(dx * dx + dy * dy);
    if (dist <= 0) return;
    final vx = dx / dist;
    final vy = dy / dist;
    double cur = 0;
    while (cur < dist) {
      final p1 = Offset(a.dx + vx * cur, a.dy + vy * cur);
      cur = math.min(cur + dash, dist);
      final p2 = Offset(a.dx + vx * cur, a.dy + vy * cur);
      canvas.drawLine(p1, p2, paint);
      cur = math.min(cur + gap, dist);
    }
  }

  @override
  bool shouldRepaint(covariant _PathChartLitePainter oldDelegate) {
    return oldDelegate.candles.length != candles.length ||
        oldDelegate.startIndex != startIndex ||
        oldDelegate.visibleCount != visibleCount ||
        oldDelegate.title != title ||
        oldDelegate.livePrice != livePrice ||
        oldDelegate.lightChartStyle != lightChartStyle ||
        oldDelegate.chartWidth != chartWidth;
  }
}

/// SMC ?§Ì??? Ï∞®Ìä∏ ?∞Ï∏° Í∞ÄÍ≤?Ï∂?(LuxAlgo/TradingView ?ôÏùº)
class _SmcRightAxisPainter extends CustomPainter {
  final double minP;
  final double maxP;
  final double Function(double price) priceToY;
  final double? livePrice;
  final double chartH;
  final double topPad;
  final double bottomPad;
  final Color? axisTextColor;

  _SmcRightAxisPainter({
    required this.minP,
    required this.maxP,
    required this.priceToY,
    this.livePrice,
    required this.chartH,
    required this.topPad,
    required this.bottomPad,
    this.axisTextColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final span = (maxP - minP).abs();
    if (span <= 0) return;
    final textColor = axisTextColor ?? Colors.white.withOpacity(0.9);
    final step = span / 8;
    for (int i = 0; i <= 8; i++) {
      final p = minP + step * i;
      final y = priceToY(p);
      if (y >= topPad && y <= chartH - bottomPad) {
        final tp = TextPainter(
          text: TextSpan(
            text: p.toStringAsFixed(1),
            style: TextStyle(color: textColor, fontSize: 10, fontWeight: FontWeight.w600),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, Offset(4, y - tp.height / 2));
      }
    }
    if (livePrice != null && livePrice! > 0) {
      final y = priceToY(livePrice!);
      if (y >= topPad && y <= chartH - bottomPad) {
        final tp = TextPainter(
          text: TextSpan(
            text: livePrice!.toStringAsFixed(3),
            style: TextStyle(color: textColor, fontSize: 11, fontWeight: FontWeight.w700),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, Offset(2, y - tp.height / 2));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SmcRightAxisPainter old) {
    return old.minP != minP || old.maxP != maxP || old.livePrice != livePrice || old.axisTextColor != axisTextColor;
  }
}
