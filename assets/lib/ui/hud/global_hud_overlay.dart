import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'hud_state.dart';
import 'prob_history.dart';
import 'prob_sparkline.dart';
import 'ring_gauge.dart';

class GlobalHudOverlay extends StatefulWidget {
  const GlobalHudOverlay({super.key});

  @override
  State<GlobalHudOverlay> createState() => _GlobalHudOverlayState();
}

class _GlobalHudOverlayState extends State<GlobalHudOverlay> with SingleTickerProviderStateMixin {
  double dx = 8;
  double dy = 0;
  bool minimized = false;

  late final AnimationController _scan =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
        ..repeat();

  final HistoryBuf _upHist = HistoryBuf(capacity: 36);
  final HistoryBuf _downHist = HistoryBuf(capacity: 36);
  final HistoryBuf _buyHist = HistoryBuf(capacity: 36);
  final HistoryBuf _sellHist = HistoryBuf(capacity: 36);

  Color _decisionColor(String d) {
    final up = d.toUpperCase();
    if (up.contains("LONG")) return Colors.greenAccent;
    if (up.contains("SHORT")) return Colors.pinkAccent;
    if (up.contains("NO")) return Colors.amberAccent;
    return Colors.white70;
  }

  @override
  void dispose() {
    _scan.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final top = mq.padding.top;

    return ValueListenableBuilder<FulinkHudState>(
      valueListenable: FulinkHudBus.I,
      builder: (context, s, _) {
        _upHist.add(s.upProb01);
        _downHist.add(s.downProb01);
        _buyHist.add(s.buyPressure01);
        _sellHist.add(s.sellPressure01);

        final decisionColor = _decisionColor(s.decision);
        final now = DateTime.now().millisecondsSinceEpoch;
        final ageSec = max(0.0, (now - s.updatedAtMs) / 1000.0);

        final maxX = max(8.0, mq.size.width - 8.0);
        final baseY = top + 6.0;
        final maxY = max(baseY, mq.size.height - 60.0);
        final x = dx.clamp(8.0, maxX);
        final y = (baseY + dy).clamp(baseY, maxY);

        return Positioned(
          left: x,
          top: y,
          right: 8,
          child: _HudCard(
            scan: _scan,
            decision: s.decision,
            decisionColor: decisionColor,
            engulfMode: s.engulfMode,
            upProb01: s.upProb01,
            downProb01: s.downProb01,
            buy01: s.buyPressure01,
            sell01: s.sellPressure01,
            lockReason: s.lockReason,
            zoneHigh: s.zoneHigh,
            zoneLow: s.zoneLow,
            zoneTf: s.zoneTf,
            topReason: s.topReason,
            minimized: minimized,
            ageSec: ageSec,
            upHistory: _upHist.values,
            downHistory: _downHist.values,
            buyHistory: _buyHist.values,
            sellHistory: _sellHist.values,
            onToggleMin: () => setState(() => minimized = !minimized),
            onDrag: (delta) => setState(() {
              dx += delta.dx;
              dy += delta.dy;
            }),
          ),
        );
      },
    );
  }
}

class _HudCard extends StatefulWidget {
  final AnimationController scan;
  final String decision;
  final Color decisionColor;
  final bool engulfMode;
  final double upProb01;
  final double downProb01;
  final double buy01;
  final double sell01;
  final String lockReason;

  final double? zoneHigh;
  final double? zoneLow;
  final String? zoneTf;
  final String? topReason;

  final bool minimized;
  final double ageSec;

  final List<double> upHistory;
  final List<double> downHistory;
  final List<double> buyHistory;
  final List<double> sellHistory;

  final VoidCallback onToggleMin;
  final ValueChanged<Offset> onDrag;

  const _HudCard({
    required this.scan,
    required this.decision,
    required this.decisionColor,
    required this.engulfMode,
    required this.upProb01,
    required this.downProb01,
    required this.buy01,
    required this.sell01,
    required this.lockReason,
    required this.zoneHigh,
    required this.zoneLow,
    required this.zoneTf,
    required this.topReason,
    required this.minimized,
    required this.ageSec,
    required this.upHistory,
    required this.downHistory,
    required this.buyHistory,
    required this.sellHistory,
    required this.onToggleMin,
    required this.onDrag,
  });

  @override
  State<_HudCard> createState() => _HudCardState();
}

class _HudCardState extends State<_HudCard> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 850));

  @override
  void didUpdateWidget(covariant _HudCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.engulfMode && !oldWidget.engulfMode) {
      _pulse.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  String _zoneLine() {
    final h = widget.zoneHigh;
    final l = widget.zoneLow;
    final tf = (widget.zoneTf ?? "").trim();
    if (h == null || l == null) return "ZONE: -";
    final tfPart = tf.isEmpty ? "" : " ($tf)";
    return "ZONE: ${h.toStringAsFixed(2)} ~ ${l.toStringAsFixed(2)}$tfPart";
  }

  double _strength01() {
    final p = (widget.upProb01 - widget.downProb01) * 0.5 + 0.5;
    final m = (widget.buy01 - widget.sell01) * 0.5 + 0.5;
    return ((p * 0.6) + (m * 0.4)).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final lock = widget.lockReason.trim().isNotEmpty;
    final title = widget.engulfMode ? "ENGULF MODE" : "AI HUD";
    final subtitle = lock ? "LOCK: ${widget.lockReason}" : "LOCK: OFF";
    final age = "upd ${widget.ageSec.toStringAsFixed(1)}s";
    final zoneLine = _zoneLine();
    final reason = (widget.topReason ?? "").trim();
    final reasonLine = reason.isEmpty ? "REASON: -" : "REASON: $reason";

    Widget sparkRow(String label, List<double> v, Color c) {
      return Row(
        children: [
          SizedBox(width: 52, child: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 10.5))),
          Expanded(child: Sparkline(values: v, color: c)),
        ],
      );
    }

    Widget bar(String label, double v, {required Color color}) {
      return Row(
        children: [
          SizedBox(width: 52, child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 10.5))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: LinearProgressIndicator(
                value: v.clamp(0.0, 1.0),
                minHeight: 10,
                backgroundColor: Colors.white10,
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 40,
            child: Text("${(v * 100).toStringAsFixed(0)}%",
                textAlign: TextAlign.right,
                style: const TextStyle(color: Colors.white70, fontSize: 10.5)),
          ),
        ],
      );
    }

    return GestureDetector(
      onPanUpdate: (d) => widget.onDrag(d.delta),
      child: AnimatedBuilder(
        animation: Listenable.merge([widget.scan, _pulse]),
        builder: (context, _) {
          final pulse = widget.engulfMode ? (0.25 + 0.55 * _pulse.value) : 0.10;
          final scanY = (widget.scan.value * 120.0) % 120.0;
          final strength = _strength01();

          return ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.56),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: widget.decisionColor.withOpacity(0.30 + pulse), width: 1.2),
                  boxShadow: [
                    BoxShadow(
                      color: widget.decisionColor.withOpacity(0.12 + pulse),
                      blurRadius: 22,
                      spreadRadius: 0.8,
                    ),
                  ],
                ),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: IgnorePointer(
                        child: Opacity(
                          opacity: 0.10,
                          child: Transform.translate(
                            offset: Offset(0, scanY - 60.0),
                            child: Container(
                              height: 16,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [Colors.transparent, widget.decisionColor.withOpacity(0.42), Colors.transparent],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Text(title, style: TextStyle(color: widget.decisionColor, fontWeight: FontWeight.w800, fontSize: 12)),
                            const Spacer(),
                            Text(age, style: const TextStyle(color: Colors.white54, fontSize: 10.5)),
                            const SizedBox(width: 6),
                            InkWell(
                              onTap: widget.onToggleMin,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.white10,
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: Colors.white24),
                                ),
                                child: Text(widget.minimized ? "EXPAND" : "MIN", style: const TextStyle(color: Colors.white70, fontSize: 10.5)),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            RingGauge(value01: strength, color: widget.decisionColor, size: 34, stroke: 3.2),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: widget.decisionColor.withOpacity(0.10),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: widget.decisionColor.withOpacity(0.35)),
                                ),
                                child: Text(widget.decision.toUpperCase(), textAlign: TextAlign.center, style: TextStyle(color: widget.decisionColor, fontWeight: FontWeight.w900, fontSize: 12)),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 10.8)),
                        const SizedBox(height: 3),
                        Text(zoneLine, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 10.8)),
                        const SizedBox(height: 3),
                        Text(reasonLine, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 10.8)),
                        const SizedBox(height: 8),
                        sparkRow("UP→", widget.upHistory, Colors.greenAccent),
                        const SizedBox(height: 4),
                        sparkRow("DOWN→", widget.downHistory, Colors.pinkAccent),
                        const SizedBox(height: 4),
                        sparkRow("BUY→", widget.buyHistory, Colors.lightGreenAccent),
                        const SizedBox(height: 4),
                        sparkRow("SELL→", widget.sellHistory, Colors.redAccent),
                        if (!widget.minimized) ...[
                          const SizedBox(height: 10),
                          bar("UP", widget.upProb01, color: Colors.greenAccent),
                          const SizedBox(height: 6),
                          bar("DOWN", widget.downProb01, color: Colors.pinkAccent),
                          const SizedBox(height: 6),
                          bar("BUY", widget.buy01, color: Colors.lightGreenAccent),
                          const SizedBox(height: 6),
                          bar("SELL", widget.sell01, color: Colors.redAccent),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
