import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/models/future_path_dto.dart';
import '../../core/services/future_path_engine.dart';
import '../../core/app_settings.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/future_wave_panel.dart';
import '../widgets/ai_cards_panel.dart';
import 'dart:math' as math;

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


  /// (옵션) 멀티TF 펄스(히트맵/통계용)
  final Map<String, FuTfPulse> mtfPulse;
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
    this.mtfPulse = const {},
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
  final ValueNotifier<Object?> _aiDtoVN = ValueNotifier<Object?>({});

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
    _aiDtoVN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final title = '${widget.symbol} · ${widget.tfLabel}';
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
                        return SizedBox(
                          width: c.maxWidth,
                          height: c.maxHeight,
                          
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

                      },
                    ),
                  ),
                ),

                
    // 우측: 미래 파동(시나리오/확률/무효/목표존)
    // - (요청) 1번(상단: AI 카드) / 2번(하단: 계획/레버리지) 구조로 고정 배치
    Expanded(
              flex: 3,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(6, 10, 10, 10),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final h = constraints.maxHeight;
                    final bottomH = (h * 0.42).clamp(240.0, 380.0);
                    final topH = (h - bottomH - 12).clamp(180.0, h);
                    return Stack(
                      children: [
                        Column(
                          children: [
                            SizedBox(
                              height: topH,
                              child: AiCardsPanel(dtoVN: _aiDtoVN, tfLabel: widget.tfLabel),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              height: bottomH,
                              child: FutureWavePanel(
                                dtoOut: _dtoVN,
                                tf: widget.tfLabel,
                                mtfPulse: widget.mtfPulse,
                                nowAnchorKey: _rightNowKey,
                                symbol: widget.symbol,
                                tfLabel: widget.tfLabel,
                                candles: widget.candles,
                                zones: [...widget.obZones, ...widget.mbZones],
                                reactLow: widget.reactLow,
                                reactHigh: widget.reactHigh,
                              ),
                            ),
                          ],
                        ),
                        Positioned(
                          right: 10,
                          bottom: bottomH + 12,
                          child: _LeverageQuickButton(),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
  ],
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

class _LeverageQuickButton extends StatefulWidget {
  @override
  State<_LeverageQuickButton> createState() => _LeverageQuickButtonState();
}

class _LeverageQuickButtonState extends State<_LeverageQuickButton> {
  final TextEditingController _entryCtrl = TextEditingController();
  final TextEditingController _stopCtrl = TextEditingController();

  double _coreRuleLeverage(double entry, double stop) {
    if (entry <= 0) return 10.0;
    final slPct = ((entry - stop).abs() / entry) * 100.0;
    double lev;
    if (slPct >= 5.0) {
      lev = 3.0;
    } else if (slPct >= 3.0) {
      lev = 5.0;
    } else if (slPct >= 2.0) {
      lev = 8.0;
    } else if (slPct >= 1.2) {
      lev = 10.0;
    } else if (slPct >= 0.8) {
      lev = 12.0;
    } else {
      lev = 15.0;
    }
    final maxLevByLiq = slPct <= 0 ? 25.0 : (80.0 / slPct);
    lev = math.min(lev, maxLevByLiq);
    return lev.clamp(2.0, 25.0).toDouble();
  }

  @override
  void dispose() {
    _entryCtrl.dispose();
    _stopCtrl.dispose();
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final v = AppSettings.leverageOverride;
    final label = v <= 0 ? '레버리지(자동)' : '레버리지 ${v.toStringAsFixed(v % 1 == 0 ? 0 : 1)}x';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final picked = await showDialog<double>(
            context: context,
            builder: (ctx) {
              double tmp = AppSettings.leverageOverride <= 0 ? 10 : AppSettings.leverageOverride;
              return AlertDialog(
                title: const Text('레버리지 설정'),
                content: StatefulBuilder(
                  builder: (ctx2, setS) {
                    return SizedBox(
                      width: 360,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              const Text('자동(엔진 추천)'),
                              const Spacer(),
                              Switch(
                                value: AppSettings.leverageOverride <= 0,
                                onChanged: (on) {
                                  setS(() {
                                    if (on) {
                                      AppSettings.leverageOverride = 0;
                                    } else {
                                      AppSettings.leverageOverride = tmp.clamp(1.0, 200.0);
                                    }
                                  });
                                },
                              ),
                            ],
                          ),
                          // 핵심룰(손절폭 기반) 미니 계산기
                          Builder(builder: (_) {
                            final e = double.tryParse(_entryCtrl.text.trim());
                            final s = double.tryParse(_stopCtrl.text.trim());
                            final can = e != null && s != null && e > 0;
                            final slPct = can ? ((e! - s!).abs() / e! * 100.0) : null;
                            final rec = can ? _coreRuleLeverage(e!, s!) : null;
                            return Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.white.withOpacity(0.08)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('핵심룰 추천(손절폭%)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: TextField(
                                          controller: _entryCtrl,
                                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                          decoration: const InputDecoration(
                                            isDense: true,
                                            labelText: 'Entry',
                                            border: OutlineInputBorder(),
                                          ),
                                          onChanged: (_) => setS(() {}),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: TextField(
                                          controller: _stopCtrl,
                                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                          decoration: const InputDecoration(
                                            isDense: true,
                                            labelText: 'Stop',
                                            border: OutlineInputBorder(),
                                          ),
                                          onChanged: (_) => setS(() {}),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          can ? '손절폭 ${slPct!.toStringAsFixed(2)}%  →  추천 ${rec!.toStringAsFixed(rec % 1 == 0 ? 0 : 1)}x' : 'Entry/Stop 넣으면 자동 추천 나옴',
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      ElevatedButton(
                                        onPressed: (!can) ? null : () {
                                          setS(() {
                                            tmp = rec!;
                                            AppSettings.leverageOverride = tmp;
                                          });
                                        },
                                        child: const Text('추천 적용'),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          }),
                          const SizedBox(height: 12),
                          const SizedBox(height: 12),
                          Opacity(
                            opacity: AppSettings.leverageOverride <= 0 ? 0.35 : 1,
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    const Text('수동'),
                                    const Spacer(),
                                    Text('${tmp.toStringAsFixed(tmp % 1 == 0 ? 0 : 1)}x'),
                                  ],
                                ),
                                Slider(
                                  value: tmp.clamp(1.0, 50.0),
                                  min: 1,
                                  max: 50,
                                  divisions: 49,
                                  onChanged: (AppSettings.leverageOverride <= 0)
                                      ? null
                                      : (nv) {
                                          setS(() {
                                            tmp = nv;
                                            AppSettings.leverageOverride = tmp;
                                          });
                                        },
                                ),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [1, 2, 3, 5, 10, 15, 20, 25, 30, 50]
                                      .map(
                                        (e) => OutlinedButton(
                                          onPressed: (AppSettings.leverageOverride <= 0)
                                              ? null
                                              : () {
                                                  setS(() {
                                                    tmp = e.toDouble();
                                                    AppSettings.leverageOverride = tmp;
                                                  });
                                                },
                                          child: Text('${e}x'),
                                        ),
                                      )
                                      .toList(),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(null),
                    child: const Text('닫기'),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.of(ctx).pop(AppSettings.leverageOverride),
                    child: const Text('적용'),
                  ),
                ],
              );
            },
          );
          if (picked != null) {
            setState(() {});
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.35),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withOpacity(0.12)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.tune, size: 16),
              const SizedBox(width: 8),
              Text(label, style: const TextStyle(fontSize: 12)),
            ],
          ),
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
      ..color = c.withOpacity(0.92)
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final p = Path()..moveTo(xOf(fp.poly.first.x), yOf(fp.poly.first.price));
    for (int i = 1; i < fp.poly.length; i++) {
      p.lineTo(xOf(fp.poly[i].x), yOf(fp.poly[i].price));
    }
    canvas.drawPath(p, paint);

    // nodes
    final nodePaint = Paint()..color = paint.color.withOpacity(0.95);
    for (final pt in fp.poly) {
      canvas.drawCircle(Offset(xOf(pt.x), yOf(pt.price)), 2.6, nodePaint);
    }

    // last price label
    final lastPricePt = fp.poly.last;
    final lastPriceLabel = "${lastPricePt.price.toStringAsFixed(0)}";
    final lastPriceTP = TextPainter(
      text: TextSpan(
        text: lastPriceLabel,
        style: const TextStyle(fontSize: 10, color: Color(0xFFB3E5FC)),
      ),
      textDirection: TextDirection.ltr,
     )..layout();
    lastPriceTP.paint(canvas, Offset(xOf(lastPricePt.x) + 4, yOf(lastPricePt.price) - 10));

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