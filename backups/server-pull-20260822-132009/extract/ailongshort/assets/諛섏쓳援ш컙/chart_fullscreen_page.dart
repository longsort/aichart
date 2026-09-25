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
/// 전체화면 차트 – 좌(캔들+OB/FVG/BPR/MB/구조) / 우(미래파동)
/// (v8.2) 좌측 차트의 현재(0) ↔ 우측 미래파동의 0(현재)을 시각적으로 연결(가이드 라인)
class ChartFullScreenPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;

  final List<FuCandle> candles;
  final List<FuZone> obZones;
  final List<FuZone> mbZones;
  final List<FuZone> fvgZones;
  final List<FuZone> bprZones;

  /// AI 매니저 반응구간(상/하) – 박스+가격라벨은 MiniChartV4 내부에서 표시
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

    // ✅ Fullscreen 차트에서도 캔들/존이 멈추지 않도록 자체 리프레시 루프
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
        // 존은 비어있으면 유지(실시간 스냅샷 보호)
        _fvgZones = st.fvgZones.isNotEmpty ? st.fvgZones : _fvgZones;
        _obZones = st.obZones.isNotEmpty ? st.obZones : _obZones;
        _bprZones = st.bprZones.isNotEmpty ? st.bprZones : _bprZones;
        _mbZones = st.mbZones.isNotEmpty ? st.mbZones : _mbZones;
        _reactLow = st.reactLow > 0 ? st.reactLow : _reactLow;
        _reactHigh = st.reactHigh > 0 ? st.reactHigh : _reactHigh;
      });
      // 앵커 갱신(우측 미래패널 0점 연결선)
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
    final title = '${widget.symbol} · ${widget.tfLabel}';
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
                // 좌측: 캔들 + 존(OB/FVG/BPR/MB/구조)
                Expanded(
                  flex: 7,
                  child: InteractiveViewer(
                    panEnabled: true,
                    scaleEnabled: true,
                    minScale: 1.0,
                    maxScale: 6.0,
                    child: LayoutBuilder(
                      builder: (context, c) {
                        // TradingView 느낌처럼 "차트 비율"을 고정(기본 16:9)해서
                        // TF가 바뀌어도 시각적인 밀도가 유지되도록 한다.
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

                // 우측: 미래 파동(시나리오/확률/무효/목표존)
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

            // TF 바 (분/시간/일/주/달) - 선택 시 홈으로 TF 반환
            Positioned(
              top: 8,
              left: 8,
              child: _TfBar(
                current: widget.tfLabel,
                onPick: (v) => Navigator.of(context).pop(v),
              ),
            ),

            // 0(현재) 연결 가이드 라인
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

    // 너무 가까우면 생략(시각 노이즈 방지)
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

    // 살짝 굴곡(직선보다 “AI 연결” 느낌)
    final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
    final ctrl = Offset(mid.dx, mid.dy - 24);

    final p = Path()
      ..moveTo(a.dx, a.dy)
      ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);

    canvas.drawPath(p, glow);
    canvas.drawPath(p, line);

    // 끝점 도트
    final dot = Paint()..color = const Color(0xFF7CE8FF).withOpacity(0.70);
    canvas.drawCircle(a, 2.6, dot);
    canvas.drawCircle(b, 2.6, dot);
  }

  @override
  bool shouldRepaint(covariant _LinkPainter oldDelegate) => true;
}