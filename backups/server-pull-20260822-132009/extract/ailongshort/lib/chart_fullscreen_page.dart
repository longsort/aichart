import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/services/fu_engine.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/future_wave_panel.dart';
import '../widgets/ai_cards_panel.dart';

import '../../core/analysis/adaptive_lux_trendline.dart';
import '../../service/tl_cache.dart';
import '../helpers/lux_tl_overlay.dart';
/// ?„ì²´?”ë©´ ì°¨íŠ¸ ??ì¢?ìº”ë“¤+OB/FVG/BPR/MB/êµ¬ì¡°) / ??ë¯¸ë˜?Œë™)
/// (v8.2) ì¢Œì¸¡ ì°¨íŠ¸???„ì¬(0) ???°ì¸¡ ë¯¸ë˜?Œë™??0(?„ì¬)???œê°?ìœ¼ë¡??°ê²°(ê°€?´ë“œ ?¼ì¸)
class ChartFullScreenPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;

  final List<FuCandle> candles;
  final List<FuZone> obZones;
  final List<FuZone> mbZones;
  final List<FuZone> fvgZones;
  final List<FuZone> bprZones;

  /// AI ë§¤ë‹ˆ?€ ë°˜ì‘êµ¬ê°„(???? ??ë°•ìŠ¤+ê°€ê²©ë¼ë²¨ì? MiniChartV4 ?´ë??ì„œ ?œì‹œ
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
  final FuEngine _engine = FuEngine();
  Timer? _timer;
  bool _refreshing = false;

  late List<FuCandle> _candles;
  late List<FuZone> _obZones;
  late List<FuZone> _mbZones;
  late List<FuZone> _fvgZones;
  late List<FuZone> _bprZones;
  late double _reactLow;
  late double _reactHigh;

  final _stackKey = GlobalKey();
  final _leftNowKey = GlobalKey();
  final _rightNowKey = GlobalKey();

  Offset? _leftNow;
  Offset? _rightNow;

  @override
  void initState() {
    super.initState();
    _candles = widget.candles;
    _obZones = widget.obZones;
    _mbZones = widget.mbZones;
    _fvgZones = widget.fvgZones;
    _bprZones = widget.bprZones;
    _reactLow = widget.reactLow;
    _reactHigh = widget.reactHigh;

    // ??Fullscreen ì°¨íŠ¸?ì„œ??ìº”ë“¤/ì¡´ì´ ë©ˆì¶”ì§€ ?Šë„ë¡??ì²´ ë¦¬í”„?ˆì‹œ ë£¨í”„
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _tick());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncAnchors();
      _tick();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    if (!mounted || _refreshing) return;
    _refreshing = true;
    try {
      final st = await _engine.fetch(
        symbol: widget.symbol,
        tf: widget.tfLabel,
        allowNetwork: true,
        safeMode: true,
      );
      if (!mounted) return;
      setState(() {
        _candles = st.candles;
        // ì¡´ì? ë¹„ì–´?ˆìœ¼ë©?? ì?(?¤ì‹œê°??¤ëƒ…??ë³´í˜¸)
        _fvgZones = st.fvgZones.isNotEmpty ? st.fvgZones : _fvgZones;
        _obZones = st.obZones.isNotEmpty ? st.obZones : _obZones;
        _bprZones = st.bprZones.isNotEmpty ? st.bprZones : _bprZones;
        _mbZones = st.mbZones.isNotEmpty ? st.mbZones : _mbZones;
        _reactLow = st.reactLow > 0 ? st.reactLow : _reactLow;
        _reactHigh = st.reactHigh > 0 ? st.reactHigh : _reactHigh;
      });
      // ?µì»¤ ê°±ì‹ (?°ì¸¡ ë¯¸ë˜?¨ë„ 0???°ê²°??
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncAnchors());
    } catch (_) {
      // keep last
    } finally {
      _refreshing = false;
    }
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
  Widget build(BuildContext context) {
    final title = '${widget.symbol} Â· ${widget.tfLabel}';
    final last = _candles.isNotEmpty ? _candles.last.close : 0.0;

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
                // ì¢Œì¸¡: ìº”ë“¤ + ì¡?OB/FVG/BPR/MB/êµ¬ì¡°)
                Expanded(
                  flex: 7,
                  child: InteractiveViewer(
                    panEnabled: true,
                    scaleEnabled: true,
                    minScale: 1.0,
                    maxScale: 6.0,
                    child: LayoutBuilder(
                      builder: (context, c) {
                        // TradingView ?ë‚Œì²˜ëŸ¼ "ì°¨íŠ¸ ë¹„ìœ¨"??ê³ ì •(ê¸°ë³¸ 16:9)?´ì„œ
                        // TFê°€ ë°”ë€Œì–´???œê°?ì¸ ë°€?„ê? ? ì??˜ë„ë¡??œë‹¤.
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
                            final lux = AdaptiveLuxTrendline.compute(candles: _candles, tfKey: widget.tfLabel);
                            final luxOv = luxTlToOverlay(r: lux, candles: _candles);
                            if (lux.line != null) { unawaited(TlCache.save(widget.symbol, widget.tfLabel, lux)); }
                            return MiniChartV4(
                            nowAnchorKey: _leftNowKey,
                            candles: _candles,
                            obZones: _obZones,
                            mbZones: _mbZones,
                            fvgZones: _fvgZones,
                            bprZones: _bprZones,
                            title: title,
                            price: last,
                            s1: 0,
                            r1: 0,
                            reactLow: _reactLow,
                            reactHigh: _reactHigh,
                            tfKey: widget.tfLabel,
                            overlayLines: luxOv.lines,
                            overlayLabel: luxOv.label,
                            );
                            }),
                          ),
                        );
                      },
                    ),
                  ),
                ),

                // ?°ì¸¡: ë¯¸ë˜ ?Œë™(?œë‚˜ë¦¬ì˜¤/?•ë¥ /ë¬´íš¨/ëª©í‘œì¡?
                Expanded(
                  flex: 3,
                  child: Column(
  children: [
    AiCardsPanel(dtoVN: _dtoVN),
    const SizedBox(height: 8),
    Expanded(
      child: FutureWavePanel(
                nowAnchorKey: _rightNowKey,
                symbol: widget.symbol,
                tfLabel: widget.tfLabel,
                candles: _candles,
                zones: [..._obZones, ..._mbZones, ..._fvgZones, ..._bprZones],
                reactLow: _reactLow,
                reactHigh: _reactHigh,
              ),
    ),
  ],
),
,
                ),
              ],
            ),

            // TF ë°?(ë¶??œê°„/??ì£??? - ? íƒ ???ˆìœ¼ë¡?TF ë°˜í™˜
            Positioned(
              top: 8,
              left: 8,
              child: _TfBar(
                current: widget.tfLabel,
                onPick: (v) => Navigator.of(context).pop(v),
              ),
            ),

            // 0(?„ì¬) ?°ê²° ê°€?´ë“œ ?¼ì¸
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _LinkPainter(_leftNow, _rightNow),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


class _TfBar extends StatelessWidget {
  final String current;
  final ValueChanged<String> onPick;
  const _TfBar({required this.current, required this.onPick});

  static const _tfs = ['1m','5m','15m','1h','4h','1D','1W','1M'];

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

class _LinkPainter extends CustomPainter {
  final Offset? left;
  final Offset? right;
  _LinkPainter(this.left, this.right);

  @override
  void paint(Canvas canvas, Size size) {
    if (left == null || right == null) return;

    final a = left!;
    final b = right!;

    // ?ˆë¬´ ê°€ê¹Œìš°ë©??ëµ(?œê° ?¸ì´ì¦?ë°©ì?)
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

    // ?´ì§ êµ´ê³¡(ì§ì„ ë³´ë‹¤ ?œAI ?°ê²°???ë‚Œ)
    final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
    final ctrl = Offset(mid.dx, mid.dy - 24);

    final p = Path()
      ..moveTo(a.dx, a.dy)
      ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);

    canvas.drawPath(p, glow);
    canvas.drawPath(p, line);

    // ?ì  ?„íŠ¸
    final dot = Paint()..color = const Color(0xFF7CE8FF).withOpacity(0.70);
    canvas.drawCircle(a, 2.6, dot);
    canvas.drawCircle(b, 2.6, dot);
  }

  @override
  bool shouldRepaint(covariant _LinkPainter oldDelegate) => true;
}