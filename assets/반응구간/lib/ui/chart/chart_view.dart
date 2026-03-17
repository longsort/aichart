import 'package:flutter/material.dart';
import 'chart_transform.dart';
import 'chart_state.dart';
import 'painters/price_line_painter.dart';
import 'painters/level_painter.dart';
import 'painters/structure_painter.dart';
import '../../engine/models/candle.dart';
import '../../engine/models/engine_output.dart';
import '../../engine/models/level_line.dart';
import '../../engine/models/struct_event.dart';

/// PHASE D + S-02: ChartView 터치 → selectedTime/Price, 세로 가이드 + 툴팁
class ChartView extends StatefulWidget {
  final List<Candle> candles;
  final EngineOutput? engineOutput;

  const ChartView({super.key, required this.candles, this.engineOutput});

  @override
  State<ChartView> createState() => _ChartViewState();
}

class _ChartViewState extends State<ChartView> {
  ChartState _chartState = const ChartState();
  double _scaleStart = 1.0;
  int _panStartBegin = 0;
  int _panStartEnd = 0;

  int _nearestTime(List<Candle> list, int timeMs) {
    if (list.isEmpty) return timeMs;
    var best = list.first.t;
    for (final c in list) {
      if ((c.t - timeMs).abs() < (best - timeMs).abs()) best = c.t;
    }
    return best;
  }

  double _priceAtTime(List<Candle> list, int timeMs) {
    for (final c in list) {
      if (c.t == timeMs) return c.c;
    }
    final before = list.where((c) => c.t <= timeMs).toList();
    final after = list.where((c) => c.t > timeMs).toList();
    if (before.isEmpty) return after.isEmpty ? 0 : after.first.c;
    if (after.isEmpty) return before.last.c;
    return before.last.c;
  }

  void _onTapDown(TapDownDetails details, ChartTransform transform, List<Candle> list, List<StructEvent> events) {
    if (!transform.plotRect.contains(details.localPosition)) return;
    final timeMs = transform.xToTime(details.localPosition.dx);
    final nearest = _nearestTime(list, timeMs);
    final price = _priceAtTime(list, nearest);
    final tooltipText = ChartState.buildTooltip(nearest, price, list, events);
    setState(() => _chartState = ChartState(selectedTime: nearest, selectedPrice: price, tooltipText: tooltipText));
  }

  void _onScaleStart(ScaleStartDetails d, int startT, int endT) {
    _scaleStart = 1.0;
    _panStartBegin = startT;
    _panStartEnd = endT;
  }

  void _onScaleUpdate(ScaleUpdateDetails d, int fullStart, int fullEnd, double plotW) {
    final range = (_panStartEnd - _panStartBegin).toDouble();
    if (range <= 0) return;
    final newRange = (range / d.scale).clamp(60000.0, (fullEnd - fullStart).toDouble());
    final center = (_panStartBegin + _panStartEnd) / 2.0;
    final timePerPx = range / plotW;
    final panDelta = (d.focalPointDelta.dx * timePerPx).round();
    final newCenter = center - panDelta;
    var newStart = (newCenter - newRange / 2).round().clamp(fullStart, fullEnd);
    var newEnd = (newStart + newRange.round()).clamp(fullStart, fullEnd);
    if (newEnd - newStart < 60000) return;
    _panStartBegin = newStart;
    _panStartEnd = newEnd;
    setState(() => _chartState = _chartState.copyWith(viewStartTime: newStart, viewEndTime: newEnd));
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (widget.candles.isEmpty) return const Center(child: Text('캔들 없음'));
        const pad = 8.0;
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;
        final plotRect = Rect.fromLTWH(pad, pad, (w - pad * 2).clamp(0, double.infinity), (h - pad * 2).clamp(0, double.infinity));
        if (plotRect.width <= 0 || plotRect.height <= 0) return const SizedBox.shrink();

        final list = List<Candle>.from(widget.candles)..sort((a, b) => a.t.compareTo(b.t));
        final fullStart = list.first.t;
        final fullEnd = list.last.t;
        final startT = _chartState.viewStartTime ?? fullStart;
        final endT = _chartState.viewEndTime ?? fullEnd;
        final inRange = list.where((c) => c.t >= startT && c.t <= endT).toList();
        final minP = inRange.isEmpty ? 0.0 : inRange.map((c) => c.l).reduce((a, b) => a < b ? a : b);
        final maxP = inRange.isEmpty ? 0.0 : inRange.map((c) => c.h).reduce((a, b) => a > b ? a : b);
        final padding = (maxP - minP).clamp(1e-9, double.infinity) * 0.05;
        final transform = ChartTransform(
          plotRect: plotRect,
          minPrice: minP - padding,
          maxPrice: maxP + padding,
          startTime: startT,
          endTime: endT,
        );
        final lines = widget.engineOutput?.lines ?? const [];
        final events = widget.engineOutput?.events ?? const [];

        return RepaintBoundary(
          child: GestureDetector(
            onTapDown: (d) => _onTapDown(d, transform, inRange.isEmpty ? list : inRange, events),
            onScaleStart: (d) => _onScaleStart(d, startT, endT),
            onScaleUpdate: (d) => _onScaleUpdate(d, fullStart, fullEnd, plotRect.width),
            onDoubleTapDown: (_) => setState(() => _chartState = _chartState.copyWith(viewStartTime: null, viewEndTime: null)),
            child: CustomPaint(
            size: Size(w, h),
            painter: _CompositePainter(
              transform: transform,
              candles: inRange.isEmpty ? list : inRange,
              lines: lines,
              events: events,
              chartState: _chartState,
            ),
          ),
        ),
        );
      },
    );
  }
}

class _CompositePainter extends CustomPainter {
  final ChartTransform transform;
  final List<Candle> candles;
  final List<LevelLine> lines;
  final List<StructEvent> events;
  final ChartState chartState;

  _CompositePainter({
    required this.transform,
    required this.candles,
    required this.lines,
    required this.events,
    required this.chartState,
  });

  @override
  void paint(Canvas canvas, Size size) {
    PriceLinePainter(transform: transform, candles: candles).paint(canvas, size);
    LevelPainter(transform: transform, lines: lines).paint(canvas, size);
    StructurePainter(transform: transform, events: events).paint(canvas, size);

    if (chartState.selectedTime != null) {
      canvas.save();
      canvas.clipRect(transform.plotRect);
      final x = transform.timeToX(chartState.selectedTime!);
      canvas.drawLine(
        Offset(x, transform.plotRect.top),
        Offset(x, transform.plotRect.bottom),
        Paint()..color = Colors.white24..strokeWidth = 1,
      );
      canvas.restore();

      if (chartState.tooltipText.isNotEmpty) {
        final builder = TextPainter(
          text: TextSpan(text: chartState.tooltipText, style: TextStyle(color: Colors.white, fontSize: 12)),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: transform.plotRect.width * 0.5);
        final tx = (x + 8).clamp(transform.plotRect.left, transform.plotRect.right - builder.width);
        final ty = transform.plotRect.top + 4;
        canvas.drawRect(
          Rect.fromLTWH(tx - 4, ty - 2, builder.width + 8, builder.height + 4),
          Paint()..color = Colors.black87,
        );
        builder.paint(canvas, Offset(tx, ty));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CompositePainter old) =>
      old.chartState.selectedTime != chartState.selectedTime || old.chartState.tooltipText != chartState.tooltipText;
}
