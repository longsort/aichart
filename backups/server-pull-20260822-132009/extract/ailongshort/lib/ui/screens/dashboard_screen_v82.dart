import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';


import '../widgets/bias_background.dart';
import '../../core/app_core.dart';
import '../../core/symbol_controller.dart';
import '../../data/snapshot/engine_snapshot.dart';
import '../../data/signal_log_store.dart';
import '../../engine/central/decision_logger.dart';
import '../../core/report_builder.dart';
import '../../data/bitget/bitget_live_store.dart';
import '../../data/bitget/bitget_models.dart';
import '../../engine/evidence/evidence_live_hub.dart';

class DashboardScreenV82 extends StatelessWidget {
  const DashboardScreenV82({super.key});

  Color _bgByBias(double bias) {
    if (bias >= 0.10) return const Color(0xFF00FF7A).withOpacity(0.10); // ?∞Ìïú Ï¥àÎ°ù
    if (bias <= -0.10) return const Color(0xFFFF2D55).withOpacity(0.10); // ?∞Ìïú Îπ®Í∞ï
    return Colors.transparent;
  }

  String _dir(double bias) => bias > 0.10 ? 'Î°? : (bias < -0.10 ? '?? : 'Ï§ëÎ¶Ω');

  String _stateText(TradeState s) {
    switch (s) {
      case TradeState.allow:
        return 'Í∞Ä??;
      case TradeState.caution:
        return 'Ï£ºÏùò';
      case TradeState.block:
        return 'Í∏àÏ?';
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<EngineSnapshot>(
      stream: AppCore.I.stream,
      initialData: AppCore.I.last,
      builder: (context, snap) {
        final s = snap.data ?? EngineSnapshot.empty();
        final bg = _bgByBias(s.bias);

        // left panel values (?ºÏù¥Î∏?Í∑ºÍ±∞ Í∏∞Î∞ò)
        final live = EvidenceLiveHub.I.items.value;
        double scoreOf(String k) {
          final it = live.firstWhere(
            (e) => e.key == k,
            orElse: () => EvidenceLive(key: k, title: k.toUpperCase(), score: 50, dir: 'NEUTRAL'),
          );
          return it.score.toDouble(); // 0..100
        }
        // pwr=Îß§Ïàò/Îß§ÎèÑ ?? vol=Î≥Ä?? whale=?∞ÏÜê, pat=?®ÌÑ¥
        final upPct = scoreOf('pwr');
        final downPct = (100 - upPct).clamp(0, 100).toDouble();
        final buyPress = scoreOf('whale');
        final sellPress = (100 - buyPress).clamp(0, 100).toDouble();

        return Scaffold(
          appBar: AppBar(title: Row(children: const [Text('?Ä?úÎ≥¥??)]), actions: [ValueListenableBuilder<String>(valueListenable: SymbolController.I.symbol, builder: (context, s, _) { return DropdownButtonHideUnderline(child: DropdownButton<String>(value: s, dropdownColor: Colors.black, items: const [DropdownMenuItem(value: 'BTCUSDT', child: Text('BTC')), DropdownMenuItem(value: 'ETHUSDT', child: Text('ETH')), DropdownMenuItem(value: 'SOLUSDT', child: Text('SOL'))], onChanged: (v) { if (v!=null) SymbolController.I.set(v); },)); })]),
          body: BiasBackground(
        child: Container(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.0, -0.9),
                radius: 1.6,
                colors: [bg, Colors.black],
              ),
            ),
            child: LayoutBuilder(
              builder: (context, c) {
                final isNarrow = c.maxWidth < 900;
                final left = _LeftPanel(
                  upPct: upPct,
                  downPct: downPct,
                  buyPress: buyPress,
                  sellPress: sellPress,
                );
                final center = ValueListenableBuilder<BitgetTicker?>(
                  valueListenable: BitgetLiveStore.I.ticker,
                  builder: (context, t, _) {
                    final priceText = t == null ? '--' : _fmtPrice(t.last);
                    final symbolText = t?.symbol ?? 'BTCUSDT';
                    final chg = t == null ? 0.0 : t.change24hPct * 100.0;
                    return _CenterPanel(
                      priceText: priceText,
                      symbolText: symbolText,
                      changeText: '${chg >= 0 ? '+' : ''}${chg.toStringAsFixed(2)}%',
                      direction: _dir(s.bias),
                      stateText: _stateText(s.state),
                      longPct: s.longPct,
                      shortPct: s.shortPct,
                      consensus: s.consensus,
                      confidence: s.confidence,
                    );
                  },
                );

                final right = _RightPanel();

                if (isNarrow) {
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
                    children: [
                      left,
                      const SizedBox(height: 12),
                      center,
                      const SizedBox(height: 12),
                      right,
                    ],
                  );
                }

                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 320, child: left),
                      const SizedBox(width: 14),
                      Expanded(child: center),
                      const SizedBox(width: 14),
                      SizedBox(width: 340, child: right),
                    ],
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }

  static String _fmtPrice(double v) {
    // Î≥¥Í∏∞ Ï¢ãÏ? Í∞ÄÍ≤??úÍ∏∞
    if (v >= 1000) return v.toStringAsFixed(1);
    if (v >= 1) return v.toStringAsFixed(3);
    return v.toStringAsFixed(6);
  }

  static String _priceTextFromSnapshot(EngineSnapshot s) {
    // Í∞ÄÍ≤©Ï? Î≥ÑÎèÑ ?§ÌÜ†?¥Ïóê??Í¥ÄÎ¶¨ÎêòÏßÄÎß? ?Ä?úÎ≥¥?úÏóê?úÎäî "Í∞íÏù¥ ?ÜÏúºÎ©?--"Î°??îÎã§.
    // (?§Í?Í≤??úÏãú?????†Ìò∏ ?îÎ©¥?êÏÑú ?¥Î? Í∞Ä??
    return '--';
  }
}

class _LeftPanel extends StatelessWidget {
  final double upPct;
  final double downPct;
  final double buyPress;
  final double sellPress;

  const _LeftPanel({
    required this.upPct,
    required this.downPct,
    required this.buyPress,
    required this.sellPress,
  });

  @override
  Widget build(BuildContext context) {
    return _PanelCard(
      title: '?ïÎ•† / ?ïÎ†•',
      badge: 'LIVE',
      child: Column(
        children: [
          _MetricTile(
            label: '?ÅÏäπ ?ïÎ•†',
            value: '${upPct.toStringAsFixed(0)}%',
            valueColor: const Color(0xFF00FF7A),
            lineColor: const Color(0xFF00FF7A),
            level01: upPct / 100.0,
          ),
          const SizedBox(height: 10),
          _MetricTile(
            label: '?òÎùΩ ?ïÎ•†',
            value: '${downPct.toStringAsFixed(0)}%',
            valueColor: const Color(0xFFFF2D55),
            lineColor: const Color(0xFFFF2D55),
            level01: downPct / 100.0,
          ),
          const SizedBox(height: 10),
          _MetricTile(
            label: 'Îß§Ïàò ?ïÎ†•',
            value: '${buyPress.toStringAsFixed(0)}%',
            valueColor: const Color(0xFF39C5FF),
            lineColor: const Color(0xFF39C5FF),
            level01: buyPress / 100.0,
          ),
          const SizedBox(height: 10),
          _MetricTile(
            label: 'Îß§ÎèÑ ?ïÎ†•',
            value: '${sellPress.toStringAsFixed(0)}%',
            valueColor: const Color(0xFFFFC94A),
            lineColor: const Color(0xFFFFC94A),
            level01: sellPress / 100.0,
          ),
        ],
      )
      ),
    );
  }
}

class _CenterPanel extends StatelessWidget {
  final String priceText;
  final String symbolText;
  final String changeText;
  final String direction;
  final String stateText;
  final double longPct;
  final double shortPct;
  final double consensus;
  final double confidence;

  const _CenterPanel({
    required this.priceText,
    required this.symbolText,
    required this.changeText,
    required this.direction,
    required this.stateText,
    required this.longPct,
    required this.shortPct,
    required this.consensus,
    required this.confidence,
  });

  @override
  Widget build(BuildContext context) {
    final longP = (longPct * 100).clamp(0, 100).toDouble();
    final shortP = (shortPct * 100).clamp(0, 100).toDouble();

    return _PanelCard(
      title: 'Ï¢ÖÌï© ?†Ìò∏',
      badge: stateText,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(symbolText, style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
              const Spacer(),
              Expanded(
                child: Text(
                  priceText,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const Spacer(),
              Text(changeText, style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 10),
          AspectRatio(
            aspectRatio: 2.2,
            child: Stack(
              children: [
                _PulseGlow(bias: (longPct - shortPct).clamp(-1.0, 1.0)),
                _HalfGauge(
                  longPct: longP / 100.0,
                  shortPct: shortP / 100.0,
                  needleBias: (longPct - shortPct).clamp(-1.0, 1.0),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Center(
            child: Text(
              direction == 'Î°?
                  ? 'Î°??†Ìò∏ (BUY)'
                  : (direction == '?? ? '???†Ìò∏ (SELL)' : 'Í¥ÄÎß?(NO)'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              'Î°?${longP.toStringAsFixed(0)}%  /  ??${shortP.toStringAsFixed(0)}%',
              style: TextStyle(color: Colors.white.withOpacity(0.70)),
            ),
          ),
          const SizedBox(height: 12),
          _ThinProgress(
            labelLeft: '?©Ïùò',
            labelRight: '${(consensus * 100).toStringAsFixed(0)}%',
            value01: consensus,
          ),
          const SizedBox(height: 8),
          _ThinProgress(
            labelLeft: '?†Î¢∞',
            labelRight: '${(confidence * 100).toStringAsFixed(0)}%',
            value01: confidence,
          ),
        ],
      ),
    );
  }
}

class _RightPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<List<SignalLogEntry>>(
      valueListenable: SignalLogStore.I.entries,
      builder: (context, entries, _) {
        int longCount = 0;
        int shortCount = 0;
        for (final e in entries) {
          if (e.decision.contains('Î°?)) longCount++;
          if (e.decision.contains('??)) shortCount++;
        }

        final total = max(1, entries.length);
        final longP = longCount / total;
        final shortP = shortCount / total;

        return _PanelCard(
          title: 'ÏßÑÏûÖ Î°úÍ∑∏ ?îÏïΩ',
          badge: 'Ï¥?${entries.length}Í∞?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _KeyValueRow(label: 'Î°??†Ìò∏', value: '$longCount Í∞?),
              const SizedBox(height: 8),
              _KeyValueRow(label: '???†Ìò∏', value: '$shortCount Í∞?),
              const SizedBox(height: 12),
              _SplitBar(long01: longP, short01: shortP),
              const SizedBox(height: 12),
              Text(
                'ÏµúÍ∑º ÏßÑÏûÖ Í∏∞Î°ù',
                style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white.withOpacity(0.9)),
              ),
              const SizedBox(height: 8),
              _MiniLogList(entries: entries),
              const SizedBox(height: 14),
              Text('Í∑ºÍ±∞ Top', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white.withOpacity(0.9))),
              const SizedBox(height: 8),
              _EvidenceTopList(),
              const SizedBox(height: 12),
              const _DashQuickResultCard(),
              const SizedBox(height: 12),
              const _DashReportCard(),
            ],
          ),
        );
      },
    );
  }
}

class _MiniLogList extends StatelessWidget {
  final List<SignalLogEntry> entries;
  const _MiniLogList({required this.entries});

  @override
  Widget build(BuildContext context) {
    final list = entries.take(6).toList();
    if (list.isEmpty) {
      return Text(
        '?ÑÏßÅ Í∏∞Î°ù???ÜÏäµ?àÎã§.\n(?†Ìò∏ ?îÎ©¥?êÏÑú Í∏∞Î°ù???ìÏûÖ?àÎã§)',
        style: TextStyle(color: Colors.white.withOpacity(0.60)),
      );
    }

    return Column(
      children: [
        for (final e in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${e.ts.hour.toString().padLeft(2, '0')}:${e.ts.minute.toString().padLeft(2, '0')}  ${e.symbol}',
                    style: TextStyle(color: Colors.white.withOpacity(0.70)),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  e.decision,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: e.decision.contains('Î°?)
                        ? const Color(0xFF00FF7A)
                        : (e.decision.contains('??) ? const Color(0xFFFF2D55) : Colors.white),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _PanelCard extends StatelessWidget {
  final String title;
  final String badge;
  final Widget child;

  const _PanelCard({required this.title, required this.badge, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withOpacity(0.08),
            Colors.white.withOpacity(0.03),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.35),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withOpacity(0.10),
                  border: Border.all(color: Colors.white.withOpacity(0.12)),
                ),
                child: Text(badge, style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12)),
              )
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;
  final Color lineColor;
  final double level01;

  const _MetricTile({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.lineColor,
    required this.level01,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        color: Colors.black.withOpacity(0.22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(label, style: TextStyle(color: Colors.white.withOpacity(0.85), fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(value, style: TextStyle(color: valueColor, fontWeight: FontWeight.w900, fontSize: 18)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 7,
              child: LinearProgressIndicator(
                value: level01.clamp(0.0, 1.0),
                backgroundColor: Colors.white.withOpacity(0.08),
                valueColor: AlwaysStoppedAnimation<Color>(lineColor.withOpacity(0.9)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThinProgress extends StatelessWidget {
  final String labelLeft;
  final String labelRight;
  final double value01;

  const _ThinProgress({required this.labelLeft, required this.labelRight, required this.value01});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(labelLeft, style: TextStyle(color: Colors.white.withOpacity(0.75), fontWeight: FontWeight.w700)),
        const SizedBox(width: 10),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 8,
              child: LinearProgressIndicator(
                value: value01.clamp(0.0, 1.0),
                backgroundColor: Colors.white.withOpacity(0.08),
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withOpacity(0.85)),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(labelRight, style: TextStyle(color: Colors.white.withOpacity(0.80), fontWeight: FontWeight.w800)),
      ],
    );
  }
}

class _KeyValueRow extends StatelessWidget {
  final String label;
  final String value;
  const _KeyValueRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.75), fontWeight: FontWeight.w700)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
      ],
    );
  }
}

class _SplitBar extends StatelessWidget {
  final double long01;
  final double short01;
  const _SplitBar({required this.long01, required this.short01});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 10,
        child: Row(
          children: [
            Expanded(
              flex: max(1, (long01 * 100).round()),
              child: Container(color: const Color(0xFF00FF7A).withOpacity(0.75)),
            ),
            Expanded(
              flex: max(1, (short01 * 100).round()),
              child: Container(color: const Color(0xFFFF2D55).withOpacity(0.75)),
            ),
          ],
        ),
      ),
    );
  }
}

class _HalfGauge extends StatefulWidget {
  final double longPct; // 0..1
  final double shortPct; // 0..1
  final double needleBias; // -1..+1

  const _HalfGauge({
    required this.longPct,
    required this.shortPct,
    required this.needleBias,
  });

  @override
  State<_HalfGauge> createState() => _HalfGaugeState();
}

class _HalfGaugeState extends State<_HalfGauge> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late Animation<double> _a;
  double _prev = 0.0;

  @override
  void initState() {
    super.initState();
    _prev = widget.needleBias;
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 520));
    _a = Tween<double>(begin: _prev, end: widget.needleBias).animate(
      CurvedAnimation(parent: _c, curve: Curves.easeOutCubic),
    );
    _c.forward();
  }

  @override
  void didUpdateWidget(covariant _HalfGauge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((oldWidget.needleBias - widget.needleBias).abs() < 0.01) return;

    _prev = _a.value;
    _c.reset();
    _a = Tween<double>(begin: _prev, end: widget.needleBias).animate(
      CurvedAnimation(parent: _c, curve: Curves.easeOutCubic),
    );
    _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _a,
      builder: (context, _) {
        return CustomPaint(
          painter: _HalfGaugePainter(
            longPct: widget.longPct,
            shortPct: widget.shortPct,
            needleBias: _a.value,
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _HalfGaugePainter extends CustomPainter {
  final double longPct;
  final double shortPct;
  final double needleBias;

  _HalfGaugePainter({
    required this.longPct,
    required this.shortPct,
    required this.needleBias,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height * 0.95;
    final r = min(size.width, size.height * 2) * 0.44;

    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);

    // background arc
    final bgPaint = Paint()
      ..color = Colors.white.withOpacity(0.10)
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.10
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, pi, pi, false, bgPaint);

    // segments: left=short red, right=long green
    final sw = r * 0.10;
    final redPaint = Paint()
      ..color = const Color(0xFFFF2D55).withOpacity(0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.round;

    final greenPaint = Paint()
      ..color = const Color(0xFF00FF7A).withOpacity(0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.round;

    // map: pi..2pi, left half is short, right half is long
    final shortSweep = (pi * shortPct).clamp(0.0, pi);
    final longSweep = (pi * longPct).clamp(0.0, pi);

    // draw short from pi going to center (counterclockwise sweep positive => clockwise? In Flutter, sweep is clockwise.
    canvas.drawArc(rect, pi, shortSweep, false, redPaint);
    canvas.drawArc(rect, pi + (pi - longSweep), longSweep, false, greenPaint);

    // glow
    final glow = Paint()
      ..color = Colors.white.withOpacity(0.08)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18);
    canvas.drawCircle(Offset(cx, cy), r * 0.06, glow);

    // needle (bias -1..+1 mapped to pi..2pi)
    final ang = pi + ((needleBias + 1) / 2).clamp(0.0, 1.0) * pi;
    final p0 = Offset(cx, cy);
    final p1 = Offset(cx + cos(ang) * r * 0.78, cy + sin(ang) * r * 0.78);

    final needlePaint = Paint()
      ..color = Colors.white.withOpacity(0.95)
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.025
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(p0, p1, needlePaint);

    final hub = Paint()..color = Colors.black.withOpacity(0.65);
    canvas.drawCircle(p0, r * 0.055, hub);
    canvas.drawCircle(p0, r * 0.035, Paint()..color = Colors.white.withOpacity(0.15));

    // labels
    _drawText(canvas, '??, Offset(cx - r * 0.92, cy - r * 0.45), 13, Colors.white.withOpacity(0.70));
    _drawText(canvas, 'Ï§ëÎ¶Ω', Offset(cx, cy - r * 1.02), 12, Colors.white.withOpacity(0.55), center: true);
    _drawText(canvas, 'Î°?, Offset(cx + r * 0.92, cy - r * 0.45), 13, Colors.white.withOpacity(0.70), center: true);
  }

  void _drawText(Canvas c, String t, Offset at, double size, Color color, {bool center = false}) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: TextStyle(fontSize: size, color: color, fontWeight: FontWeight.w800)),
      textDirection: TextDirection.ltr,
    )..layout();

    final offset = center
        ? Offset(at.dx - tp.width / 2, at.dy - tp.height / 2)
        : Offset(at.dx - tp.width, at.dy - tp.height / 2);
    tp.paint(c, offset);
  }

  @override
  bool shouldRepaint(covariant _HalfGaugePainter old) =>
      old.longPct != longPct || old.shortPct != shortPct || old.needleBias != needleBias;
}
