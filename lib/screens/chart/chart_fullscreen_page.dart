import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/models/future_path_dto.dart';
import '../../core/services/future_path_engine.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/future_wave_panel.dart';
import '../widgets/ai_cards_panel.dart';
import '../../core/app_settings.dart';
import '../../core/analysis/entry_planner.dart';

import '../../core/analysis/adaptive_lux_trendline.dart';
import '../../service/tl_cache.dart';
import '../helpers/lux_tl_overlay.dart';
/// ?ÑÏ≤¥?îÎ©¥ Ï∞®Ìä∏ ??Ï¢?Ï∫îÎì§+OB/FVG/BPR/MB/Íµ¨Ï°∞) / ??ÎØ∏Îûò?åÎèô)
/// (v8.2) Ï¢åÏ∏° Ï∞®Ìä∏???ÑÏû¨(0) ???∞Ï∏° ÎØ∏Îûò?åÎèô??0(?ÑÏû¨)???úÍ∞Å?ÅÏúºÎ°??∞Í≤∞(Í∞Ä?¥Îìú ?ºÏù∏)
class ChartFullScreenPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;

  final List<FuCandle> candles;
  final List<FuZone> obZones;
  final List<FuZone> mbZones;
  final List<FuZone> fvgZones;
  final List<FuZone> bprZones;

  /// AI Îß§Îãà?Ä Î∞òÏùëÍµ¨Í∞Ñ(???? ??Î∞ïÏä§+Í∞ÄÍ≤©ÎùºÎ≤®Ï? MiniChartV4 ?¥Î??êÏÑú ?úÏãú
  final double reactLow;
  final double reactHigh;

  const ChartFullScreenPage({
    super.key,
    required this.symbol,
    required this.tfLabel,
    required this.candles,
    required this.obZones,
    required this.mbZones,
    required this.fvgZones,
    required this.bprZones,
    required this.reactLow,
    required this.reactHigh,
  });

  @override
  State<ChartFullScreenPage> createState() => _ChartFullScreenPageState();
}

class _ChartFullScreenPageState extends State<ChartFullScreenPage> {
  final _stackKey = GlobalKey();
  final _leftNowKey = GlobalKey();
  final _rightNowKey = GlobalKey();

  Offset? _leftNow;
  Offset? _rightNow;

  final ValueNotifier<FuturePathDTO?> _dtoVN = ValueNotifier<FuturePathDTO?>(null);

  // (v9 PATCH) ÎßàÏö∞??Ïª§ÏÑú Í∏∞Î∞ò Ï¶âÏãú ?úÎ?
  Offset? _cursor;
  double? _hoverPrice;
  FutureScenarioSummary? _scenario;

  // (v9 PATCH) Ïª§ÏÑú ?úÎ?
  Offset? _cursor;
  double? _hoverPrice;
  FutureScenarioSummary? _scenario;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncAnchors());
  }

  @override
  void didUpdateWidget(covariant ChartFullScreenPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncAnchors());
  }

  void _syncAnchors() {
    final stackBox = _stackKey.currentContext?.findRenderObject();
    if (stackBox is! RenderBox) return;

    Offset? toLocal(GlobalKey k) {
      final ro = k.currentContext?.findRenderObject();
      if (ro is! RenderBox) return null;
      final g = ro.localToGlobal(ro.size.center(Offset.zero));
      return stackBox.globalToLocal(g);
    }

    final l = toLocal(_leftNowKey);
    final r = toLocal(_rightNowKey);

    if (l == null || r == null) return;
    if (_leftNow == l && _rightNow == r) return;

    setState(() {
      _leftNow = l;
      _rightNow = r;
    });
  }



  @override
  void dispose() {
    _dtoVN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final title = '${widget.symbol} ¬∑ ${widget.tfLabel}';
    final last = widget.candles.isNotEmpty ? widget.candles.last.close : 0.0;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
      ),
      body: SafeArea(
        child: Stack(
          key: _stackKey,
          children: [
            Row(
              children: [
                // Ï¢åÏ∏°: Ï∫îÎì§ + Ï°?OB/FVG/BPR/MB/Íµ¨Ï°∞)
                Expanded(
                  flex: 7,
                  child: InteractiveViewer(
                    panEnabled: true,
                    scaleEnabled: true,
                    minScale: 1.0,
                    maxScale: 6.0,
                    child: LayoutBuilder(
                      builder: (context, c) {
                        // TradingView ?êÎÇåÏ≤òÎüº "Ï∞®Ìä∏ ÎπÑÏú®"??Í≥†Ï†ï(Í∏∞Î≥∏ 16:9)?¥ÏÑú
                        // TFÍ∞Ä Î∞îÎÄåÏñ¥???úÍ∞Å?ÅÏù∏ Î∞Ä?ÑÍ? ?†Ï??òÎèÑÎ°??úÎã§.
                        const targetRatio = 16 / 9;
                        final maxW = c.maxWidth;
                        final maxH = c.maxHeight;
                        var w = maxW;
                        var h = w / targetRatio;
                        if (h > maxH) {
                          h = maxH;
                          w = h * targetRatio;
                        }

                        return Center(
                          child: SizedBox(
                            width: w,
                            height: h,
                            child: Builder(builder: (context) {
                            final lux = AdaptiveLuxTrendline.compute(candles: widget.candles, tfKey: widget.tfLabel);
                            final luxOv = luxTlToOverlay(r: lux, candles: widget.candles);
                            if (lux.line != null) { unawaited(TlCache.save(widget.symbol, widget.tfLabel, lux)); }
                            // (v9 PATCH) ÎßàÏö∞???ÑÏπò -> Í∞ÄÍ≤?Îß§Ìïë ??Ïª§ÏÑú ?úÎ?
                            return MouseRegion(
                              onExit: (_) => setState(() {
                                _cursor = null;
                                _hoverPrice = null;
                              }),
                              onHover: (e) {
                                final box = context.findRenderObject();
                                if (box is! RenderBox) return;
                                final local = box.globalToLocal(e.position);
                                final p = _mapYToPrice(local.dy, h, widget.candles);
                                setState(() {
                                  _cursor = local;
                                  _hoverPrice = p;
                                });
                              },
                              
        child: ValueListenableBuilder<FuturePathDTO?>(
                          valueListenable: _dtoVN,
                          builder: (context, dto, _) {
                            return Stack(
                              children: [
                                MiniChartV4(
nowAnchorKey: _leftNowKey,
                            candles: widget.candles,
                            obZones: widget.obZones,
                            mbZones: widget.mbZones,
                            fvgZones: widget.fvgZones,
                            bprZones: widget.bprZones,
                            title: title,
                            price: last,
                            s1: 0,
                            r1: 0,
                            reactLow: widget.reactLow,
                            reactHigh: widget.reactHigh,
tfKey: widget.tfLabel,
                            overlayLines: luxOv.lines,
                            overlayLabel: luxOv.label,
                                ),
                                if (dto != null)
                                  Positioned.fill(
                                    child: IgnorePointer(
                                      child: CustomPaint(
                                        painter: _FuturePathDtoPainter(widget.candles, dto),
                                      ),
                                    ),
                                  ),
                              ],
                            );
                          },
                        ),
                        );

                            }),
                          ),
                        );
                      },
                    ),
                  ),
                ),

                // ?∞Ï∏°: ÎØ∏Îûò ?åÎèô(?úÎÇòÎ¶¨Ïò§/?ïÎ•†/Î¨¥Ìö®/Î™©ÌëúÏ°?
                Expanded(
                  flex: 3,
                  child: Column(
                    children: [
                      _CursorSimCard(
                        hoverPrice: _hoverPrice,
                        scenario: _scenario,
                        reactLow: widget.reactLow,
                        reactHigh: widget.reactHigh,
                      ),
                      Expanded(
                        child: FutureWavePanel(
                    dtoOut: _dtoVN,
                    tf: '15m',
                    mtfPulse: widget.mtfPulse,
                          nowAnchorKey: _rightNowKey,
                          symbol: widget.symbol,
                          tfLabel: widget.tfLabel,
                          candles: widget.candles,
                          zones: [...widget.obZones, ...widget.mbZones, ...widget.fvgZones, ...widget.bprZones],
                          reactLow: widget.reactLow,
                          reactHigh: widget.reactHigh,
                          onScenario: (s) => setState(() => _scenario = s),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // TF Î∞?(Î∂??úÍ∞Ñ/??Ï£??? - ?†ÌÉù ???àÏúºÎ°?TF Î∞òÌôò
            Positioned(
              top: 8,
              left: 8,
              child: _TfBar(
                current: widget.tfLabel,
                onPick: (v) => Navigator.of(context).pop(v),
              ),
            ),

            // 0(?ÑÏû¨) ?∞Í≤∞ Í∞Ä?¥Îìú ?ºÏù∏
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _LinkPainter(_leftNow, _rightNow),
                ),
              ),
            ),

            // (v9 PATCH) Ï¢åÏ∏° Ï∞®Ìä∏ Ïª§ÏÑú ?¥ÌåÅ(Í∞ÑÎã®)
            if (_cursor != null && _hoverPrice != null)
              Positioned(
                left: 12,
                bottom: 12,
                child: _TinyTag(text: 'Ïª§ÏÑú: ${_hoverPrice!.toStringAsFixed(1)}'),
              ),
          ],
        ),
      ),
    );
  }
}

// ===== v9 PATCH helpers/widgets =====

double _mapYToPrice(double dy, double height, List<FuCandle> candles) {
  if (candles.isEmpty || height <= 1) return 0;
  double lo = candles.first.low;
  double hi = candles.first.high;
  for (final c in candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  final t = (dy / height).clamp(0.0, 1.0);
  // y=0(top) => hi, y=height(bottom) => lo
  return hi - (hi - lo) * t;
}

class _CursorSimCard extends StatelessWidget {
  final double? hoverPrice;
  final FutureScenarioSummary? scenario;
  final double reactLow;
  final double reactHigh;

  const _CursorSimCard({
    required this.hoverPrice,
    required this.scenario,
    required this.reactLow,
    required this.reactHigh,
  });

  EntryPlan? _plan() {
    final p = hoverPrice;
    final s = scenario;
    if (p == null || s == null || p <= 0) return null;
    final isLong = s.isLong;
    final sl = (s.invalidLine ?? (isLong ? reactLow : reactHigh));
    final tp = isLong ? (s.targetHigh ?? reactHigh) : (s.targetLow ?? reactLow);
    final s1 = isLong ? (sl > 0 ? sl : reactLow) : (tp > 0 ? tp : reactLow);
    final r1 = isLong ? (tp > 0 ? tp : reactHigh) : (sl > 0 ? sl : reactHigh);

    return EntryPlanner.plan(
      isLong: isLong,
      price: p,
      s1: s1,
      r1: r1,
      accountUsdt: AppSettings.accountUsdt,
      riskPct: AppSettings.riskPct,
    );
  }

  @override
  void dispose() {
    _dtoVN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = scenario;
    final p = hoverPrice;
    final plan = _plan();
    final bg = const Color(0xFF0B1020);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.85),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12),
      ),
      child: DefaultTextStyle(
        style: const TextStyle(fontSize: 11, color: Colors.white70, height: 1.2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Ïª§ÏÑú ?úÎ?', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white)),
                const Spacer(),
                if (s != null)
                  Text('${s.label} ¬∑ ${(s.prob * 100).round()}%', style: const TextStyle(fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 6),
            Text('Entry(Ïª§ÏÑú): ${p == null ? '-' : p.toStringAsFixed(1)}'),
            Text('Dir: ${s == null ? '-' : (s.isLong ? 'LONG' : 'SHORT')}'),
            if (plan != null) ...[
              const SizedBox(height: 6),
              Text('SL: ${plan.stop.toStringAsFixed(1)}  TP: ${plan.t1.toStringAsFixed(1)}'),
              Text('Qty: ${plan.qty.toStringAsFixed(4)}  Lev: ${plan.leverage.toStringAsFixed(1)}x  RR: ${plan.rr.toStringAsFixed(2)}'),
              Text('Risk: ${(AppSettings.riskPct * 100).toStringAsFixed(0)}%  Budget: ${AppSettings.accountUsdt.toStringAsFixed(0)} USDT'),
            ] else ...[
              const SizedBox(height: 6),
              const Text('ÎßàÏö∞?§Î? Ï∞®Ìä∏ ?ÑÎ°ú ?¨Î¶¨Î©?Í≥ÑÏÇ∞??),
            ],
          ],
        ),
      ),
    );
  }
}

class _TinyTag extends StatelessWidget {
  final String text;
  const _TinyTag({required this.text});

  @override
  void dispose() {
    _dtoVN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white24),
      ),
      child: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
    );
  }
}


class _TfBar extends StatelessWidget {
  final String current;
  final ValueChanged<String> onPick;
  const _TfBar({required this.current, required this.onPick});

  static const _tfs = ['1m','5m','15m','1h','4h','1D','1W','1M'];

  @override
  void dispose() {
    _dtoVN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.55),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: _tfs.map((tf) {
            final sel = tf == current;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => onPick(tf),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: sel ? const Color(0xFF2BD4FF).withOpacity(0.20) : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: sel ? const Color(0xFF2BD4FF).withOpacity(0.75) : Colors.white12),
                  ),
                  child: Text(
                    tf,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: sel ? const Color(0xFF7CE8FF) : Colors.white70,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class _FuturePathDtoPainter extends CustomPainter {
  final List<FuCandle> candles;
  final FuturePathDTO dto;
  _FuturePathDtoPainter(this.candles, this.dto);

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;

    // y-scale from candles
    double lo = candles.first.low, hi = candles.first.high;
    for (final c in candles) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; }
    final span = (hi - lo).abs();
    final pad = span == 0 ? (hi.abs() * 0.002) : span * 0.05;
    lo -= pad; hi += pad;

    double yOf(double p) {
      final t = (p - lo) / (hi - lo);
      return size.height * (1 - t.clamp(0.0, 1.0));
    }

    // map normalized x to canvas x
    double xOf(double nx) => size.width * nx.clamp(0.0, 1.0);

    final pathIdx = dto.selected.clamp(0, 2);
    final fp = dto.paths[pathIdx];

    final c = pathIdx == 0 ? const Color(0xFF4DFFB8) : (pathIdx == 1 ? const Color(0xFF66CCFF) : const Color(0xFFFF6B6B));
    final paint = Paint()
      ..color = c.withOpacity(0.70)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final p = Path()..moveTo(xOf(fp.poly.first.x), yOf(fp.poly.first.price));
    for (int i = 1; i < fp.poly.length; i++) {
      p.lineTo(xOf(fp.poly[i].x), yOf(fp.poly[i].price));
    }
    canvas.drawPath(p, paint);

    // badge
    final label = fp.name;
    final pct = pathIdx == 0 ? dto.probMain : (pathIdx == 1 ? dto.probAlt : dto.probFail);
    final tp = TextPainter(
      text: TextSpan(
        text: '$label $pct%',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white.withOpacity(0.95)),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    final w = tp.width + 10, h = tp.height + 6;
    final x0 = xOf(0.70) + 4;
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(x0, 6, w, h), const Radius.circular(6));
    canvas.drawRRect(r, Paint()..color = Colors.black.withOpacity(0.55));
    canvas.drawRRect(r, Paint()..color = paint.color.withOpacity(0.18));
    tp.paint(canvas, Offset(x0 + 5, 9));
  }

  @override
  bool shouldRepaint(covariant _FuturePathDtoPainter oldDelegate) {
    return oldDelegate.candles != candles || oldDelegate.dto != dto;
  }
}

class _LinkPainter extends CustomPainter {
  final Offset? left;
  final Offset? right;
  _LinkPainter(this.left, this.right);

  @override
  void paint(Canvas canvas, Size size) {
    if (left == null || right == null) return;

    final a = left!;
    final b = right!;

    // ?àÎ¨¥ Í∞ÄÍπåÏö∞Î©??ùÎûµ(?úÍ∞Å ?∏Ïù¥Ï¶?Î∞©Ï?)
    if ((a - b).distance < 12) return;

    final glow = Paint()
      ..color = const Color(0xFF66CCFF).withOpacity(0.12)
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final line = Paint()
      ..color = const Color(0xFF66CCFF).withOpacity(0.55)
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // ?¥Ïßù Íµ¥Í≥°(ÏßÅÏÑ†Î≥¥Îã§ ?úAI ?∞Í≤∞???êÎÇå)
    final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
    final ctrl = Offset(mid.dx, mid.dy - 24);

    final p = Path()
      ..moveTo(a.dx, a.dy)
      ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);

    canvas.drawPath(p, glow);
    canvas.drawPath(p, line);

    // ?ùÏ†ê ?ÑÌä∏
    final dot = Paint()..color = const Color(0xFF7CE8FF).withOpacity(0.70);
    canvas.drawCircle(a, 2.6, dot);
    canvas.drawCircle(b, 2.6, dot);
  }

  @override
  bool shouldRepaint(covariant _LinkPainter oldDelegate) => true;
}