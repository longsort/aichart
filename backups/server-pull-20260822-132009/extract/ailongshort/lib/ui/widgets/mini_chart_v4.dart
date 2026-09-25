import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/analysis/candle_event_analyzer.dart';
import '../../core/app_settings.dart';
import 'neon_theme.dart';

class MiniChartLine {
  /// candle index ê¸°ì? (0..len-1)
  final int i1;
  final int i2;
  /// price ê°?  final double p1;
  final double p2;
  final Color? color;
  final double width;
  const MiniChartLine({
    required this.i1,
    required this.i2,
    required this.p1,
    required this.p2,
    this.color,
    this.width = 1.6,
  });
}

class MiniChartV4 extends StatefulWidget {
  final List<FuCandle> candles;
  final List<FuZone> fvgZones;
  final List<FuZone> obZones;
  final List<FuZone> bprZones;
  final List<FuZone> mbZones;
  final String
      title;

  /// ?€?„í”„?ˆì„ ??(?? 1m/5m/15m/1h/4h/1D/1W/1M)
  /// ê¸°ë³¸ê°’ì? ''?´ë©°, title?ì„œ ?ë™ ì¶”ë¡ ?œë‹¤.
  final String tfKey;

  final double price;
  final double s1;
  final double r1;

  // êµ¬ì¡°/ë°˜ì‘ êµ¬ê°„(CHOCH/BOS) ?œì‹œ
  final String structureTag;
  final double reactLevel;
  final double reactLow;
  final double reactHigh;

  /// CoreAI ë°©í–¥ (ë¡???LOCK)
  final String? bias;
  /// ?•ë¥ (0~100)
  final int? prob;

  /// ?•ì • ì§„ì… ?œì‹œ(ì°¨íŠ¸ ?¤ë²„?ˆì´)
  final bool showPlan;
  final double entry;
  final double stop;
  final double target;

  /// AI ?¨í„´ ?‘ë„(ì¶”ì„¸???˜ë ´????
  final List<MiniChartLine> overlayLines;
  final String overlayLabel;

  /// (?µì…˜) ì°¨íŠ¸ ?’ì´ ê°•ì œ/ì¡°ì ˆ
  /// - [heightOverride] ì§€????ê·¸ë?ë¡??¬ìš©
  /// - ë¯¸ì?????ê¸°ë³¸ ë¹„ìœ¨ ê³„ì‚°ê°’ì— [heightMin]/[heightMax] clamp ?ìš©
  final double? heightOverride;
  final double? heightMin;
  final double? heightMax;

  // ??BOS / CHoCH ?œì‹œ (?¤ì • ?¨ë„ ? ê?ê³??°ê²°)
  final bool showBOS;
  final bool showCHoCH;

  /// (?µì…˜) ì°¨íŠ¸ ?„ì¬(0) ?µì»¤ ??ê°€?´ë“œ ?¼ì¸ ?°ê²°??
  final GlobalKey? nowAnchorKey;
  const MiniChartV4({
    super.key,
    required this.candles,
    required this.fvgZones,
    this.obZones = const <FuZone>[],
    this.bprZones = const <FuZone>[],
    this.mbZones = const <FuZone>[],
    required this.title,
    required this.price,
    required this.s1,
    required this.r1,
    this.bias,
    this.prob,
    this.showPlan = false,
    this.entry = 0,
    this.stop = 0,
    this.target = 0,
    this.overlayLines = const [],
    this.overlayLabel = '',
    this.structureTag = 'RANGE',
    this.reactLevel = 0,
    this.reactLow = 0,
    this.reactHigh = 0,
    this.heightOverride,
    this.heightMin,
    this.heightMax,
    this.showBOS = false,
    this.showCHoCH = false,
    this.tfKey = '',
    this.nowAnchorKey,
  });


  @override
  State<MiniChartV4> createState() => _MiniChartV4State();
}

class _MiniChartV4State extends State<MiniChartV4> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;
  bool _lightChart = false;

  String get _resolvedTfKey {
    final k = widget.tfKey.trim();
    if (k.isNotEmpty) return k;
    final m = RegExp(r'\b(1m|5m|15m|1h|4h|1D|1W|1M)\b').firstMatch(widget.title);
    return m?.group(1) ?? '15m';
  }
  final TransformationController _tc = TransformationController();

  // ?€?„í”„?ˆì„ë³?ë¯¸ë‹ˆì°¨íŠ¸ ëª©í‘œ ìº”ë“¤ ê°œìˆ˜(ë°€??ê°€?…ì„± ê¸°ì?)
  // ?°ì´?°ê? ?ìœ¼ë©?ê·¸ë?ë¡?ê·¸ë¦¬?? Painter?ì„œ ìº”ë“¤ ??„ ?ë™?¼ë¡œ ?¤ì›Œ ê°„ê²©??ì¤„ì¸??
  int _preferredVisibleCount(String tfKey) {
    // Default visible candles per timeframe (user can pinch/zoom).
    // ?”ë´‰?€ 2019-07~?„ì¬ 79ë´?ê¸°ì? -> ê¸°ë³¸ 90ë´??•ë³´
    switch (tfKey) {
      case '1m':
        return 720;
      case '5m':
        return 520;
      case '15m':
        return 420;
      case '1h':
        return 320;
      case '4h':
        return 240;
      case '1D':
        return 220;
      case '1W':
        return 140;
      case '1M':
        return 90;
      default:
        return 320;
    }
  }

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ac.dispose();
    _tc.dispose();
    super.dispose();
  }



Offset _nowAnchor(List<FuCandle> cView, double w, double h) {
  final vis = cView;
  final n = vis.length;
  if (n <= 1) return Offset(w * 0.5, h * 0.5);
  double lo = vis.first.low;
  double hi = vis.first.high;
  for (final c in vis) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  final pad = (hi - lo).abs() * 0.06;
  lo -= pad;
  hi += pad;

  double padL = 14;
  double padT = math.min(30, h * 0.14);
  double padR = math.max(42, math.min(88, w * 0.18));
  double padB = math.min(34, h * 0.18);
  final plot = Rect.fromLTWH(
    padL,
    padT,
    math.max(1, w - (padL + padR)),
    math.max(1, h - (padT + padB)),
  );

  double y(double p) {
    if (!p.isFinite || (hi - lo).abs() < 1e-9) return plot.center.dy;
    final yy = plot.bottom - (p - lo) / (hi - lo) * plot.height;
    return yy.clamp(plot.top + 1, plot.bottom - 1).toDouble();
  }

  // ?°ì¸¡ ?¬ë°±(ë¯¸ë˜ ?¬ì˜ ê³µê°„) ?•ë³´
  int _futureBars(String tf) {
    final k = tf.trim().toLowerCase();
    switch (k) {
      case '15m':
      case '30m':
        return 90;
      case '1h':
        return 72;
      case '4h':
        return 54;
      case '1d':
        return 42;
      case '1w':
        return 30;
      case '1m':
        return 18;
      default:
        return 60;
    }
  }
  final rightBars = _futureBars(widget.tfKey);
  final denom = ((n - 1) + rightBars).clamp(1, 99999);
  final dx = plot.width / denom;
  final xNow = plot.left + (n - 1) * dx;
  final yNow = y(widget.price);
  return Offset(xNow, yNow);
}

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final ev = CandleEventAnalyzer.analyze(widget.candles);

    String eventLine() {
      // "?†ìŒ" ë¬¸êµ¬??ê³µê°„ë§?ì°¨ì??´ì„œ ?¨ê?(?„ìš”???Œë§Œ ?œì‹œ)
      if (ev.typeKo == '?†ìŒ') return '';
      if (ev.sample < 5) return '${ev.typeKo} ë°œìƒ(?œë³¸ ë¶€ì¡? ${ev.sample}) ???•ë¥ ?€ ì°¸ê³ ë§?;
      return '${ev.typeKo} ë°œìƒ(?œë³¸ ${ev.sample})  |  ?ìŠ¹?•ë¥ : 1ìº”ë“¤ ${ev.pUp1}%, 3ìº”ë“¤ ${ev.pUp3}%, 5ìº”ë“¤ ${ev.pUp5}%';
    }

    final nearSupport = widget.price <= widget.s1 * 1.01;
    final nearResist = widget.price >= widget.r1 * 0.99;

    Widget badge(String txt, Color col) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: col.withOpacity(0.14),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: col.withOpacity(0.35)),
        ),
        child: Text(txt, style: TextStyle(color: col, fontWeight: FontWeight.w900, fontSize: 11)),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ?ìŠ¤?¸ëŠ” ê¸¸ì–´?¸ë„ ì¤„ë°”ê¿?ë§ì¤„?„ìœ¼ë¡??ˆì „?˜ê²Œ
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: t.fg, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '?¤ì‹œê°?${widget.price > 0 ? widget.price.toStringAsFixed(widget.price >= 100 ? 2 : 6) : '--'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: t.fg.withOpacity(0.72), fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // ë°°ì????”ë©´??ì¢ìœ¼ë©??ë™ ì¤„ë°”ê¿?              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.end,
                children: [
                  if (nearSupport) badge('ì§€ì§€ ê·¼ì ‘', t.good),
                  if (nearResist) badge('?€??ê·¼ì ‘', t.bad),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          // ë¯¸ë‹ˆì°¨íŠ¸ ë¹„ìœ¨(?’ì´) ?¨ì¹˜: ?”ë©´??ì»¤ì ¸??ê³¼ë„?˜ê²Œ ê¸¸ì–´ì§€ì§€ ?Šê²Œ ê³ ì • ë¹„ìœ¨ + ???˜í•œ
          Expanded(
            child: LayoutBuilder(
            builder: (context, cts) {
              final w = cts.maxWidth.isFinite ? cts.maxWidth : MediaQuery.of(context).size.width;
              // 1ë¶„ë´‰ì²˜ëŸ¼ ìº”ë“¤??ë§ì•„ì§€ë©???´ ?ˆë¬´ ì¢ì•„ "??ì²˜ëŸ¼ ë³´ì¼ ???ˆì–´??              // ?”ë©´ ?½ì???— ë§ì¶° ?ë™?¼ë¡œ ?˜í”Œë§??œì‹œ???œë‹¤.
              // ? ï¸ ì¤‘ìš”: ?¨ìˆœ "nê°œë§ˆ??1ê°? ?˜í”Œë§ì„ ?˜ë©´
              // - ?œê°„ì¶•ì´ ê±´ë„ˆ?°ì–´??ìº”ë“¤???¬ì„±?¬ì„±(ê³µë°±/?? ë³´ì´ê³?              // - ìº”ë“¤ ?•íƒœ(OHLC)ê°€ ë§ê?ì§„ë‹¤.
              // ?´ê²°: (1) ts ?•ë ¬ ê³ ì • (2) ?”ë©´??ê¸°ë°˜ "ë²„í‚· OHLC ?•ì¶•"?¼ë¡œ ë°€??? ì?
              final raw0 = widget.candles;
              final raw = [...raw0]..sort((a, b) => a.ts.compareTo(b.ts));

              // ìº”ë“¤??"??ì²˜ëŸ¼ ë³´ì´ì§€ ?Šê²Œ: ?¬ë¡¯??´ ìµœì†Œ 5~6px ?•ë„ ?˜ì˜¤?„ë¡ ëª©í‘œ ìº”ë“¤ ?˜ë? ?œí•œ
              final target = (w / 6.0).floor().clamp(50, 140);

              List<FuCandle> cView = raw;
              if (raw.length > target) {
                final out = <FuCandle>[];
                final step = raw.length / target;
                for (int bi = 0; bi < target; bi++) {
                  final s = (bi * step).floor();
                  final e = ((bi + 1) * step).floor().clamp(s + 1, raw.length);
                  final seg = raw.sublist(s, e);
                  double hi = seg.first.high;
                  double lo = seg.first.low;
                  double vol = 0;
                  for (final c in seg) {
                    if (c.high > hi) hi = c.high;
                    if (c.low < lo) lo = c.low;
                    vol += c.volume;
                  }
                  out.add(FuCandle(
                    open: seg.first.open,
                    high: hi,
                    low: lo,
                    close: seg.last.close,
                    ts: seg.last.ts,
                    volume: vol,
                  ));
                }
                cView = out;
              }
              // ?€?„í”„?ˆì„ë³„ë¡œ ë³´ì´??ìº”ë“¤ ë°€?„ë? ë§ì¶”ê¸??„í•´ ìµœê·¼ Nê°œë§Œ ?¬ìš©
              final int prefVis = _preferredVisibleCount(_resolvedTfKey);
              if (cView.length > prefVis) {
                cView = cView.sublist(cView.length - prefVis);
              }

              // ê¸°ë³¸: width:height ~= 2.8:1 (ëª¨ë°”??PC ?????ˆì •)
              // ?? ?ìœ„ ?„ì ¯??Expanded/SizedBox ?±ìœ¼ë¡??’ì´ë¥?ëª…í™•??ì£¼ëŠ” ê²½ìš°
              // ê·??’ì´ë¥??°ì„  ?¬ìš©?´ì„œ "ì°¨íŠ¸ ?„ë˜ ë¹ˆê³µê°????†ì•¤??
              final base = (w / 2.8);
              final minH = widget.heightMin ?? 110.0;
              final inferredMaxH = (cts.maxHeight.isFinite ? cts.maxHeight : 200.0);
              final maxH = widget.heightMax ?? inferredMaxH;

              final desired = widget.heightOverride ?? (cts.maxHeight.isFinite ? cts.maxHeight : base);
              final h = desired.clamp(minH, maxH);
              return SizedBox(
                height: h,
                width: double.infinity,
                child: AnimatedBuilder(
                  animation: _ac,
                  builder: (context, _) {
                    final s = AppSettings.I;
                    return Stack(
                      children: [
                        Positioned.fill(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(18),
                            // ?•ë?/ì¶•ì†Œ(InteractiveViewer)??ìº”ë“¤ ì§¤ë¦¼/?œê³¡ ?´ìŠˆê°€ ?ˆì–´ ë¹„í™œ?±í™”.
                            // ë©”ì¸ ?”ë©´?€ "ë¹„ìœ¨ ê³ ì •"?¼ë¡œë§??œì‹œ?˜ê³ , ?„ìš” ???¥í›„ ?„ìš© ì°¨íŠ¸ ?”ë©´?ì„œ ?œê³µ.
                            child: InteractiveViewer(
                              panEnabled: false,
                              scaleEnabled: false,
                              minScale: 1.0,
                              maxScale: 1.0,
                              boundaryMargin: EdgeInsets.zero,
                              child: RepaintBoundary(
                                child: SizedBox(
                                  width: w,
                                  height: h,
                                  child: CustomPaint(
                                    size: Size(w, h),
                                    painter: _PV4(
                                    cView,
                                    widget.fvgZones,
                                    widget.obZones,
                                    widget.bprZones,
                                    widget.mbZones,
                                    t,
                                    widget.price,
                                    widget.s1,
                                    widget.r1,
                                    light: _lightChart,
                                    bias: widget.bias,
                                    structureTag: widget.structureTag,
                                    reactLevel: widget.reactLevel,
                                    reactLow: widget.reactLow,
                                    reactHigh: widget.reactHigh,
                                    prob: widget.prob,
                                    showPlan: widget.showPlan,
                                    entry: widget.entry,
                                    stop: widget.stop,
                                    target: widget.target,
                                    overlayLines: widget.overlayLines,
                                    overlayLabel: widget.overlayLabel,
                                    // ?¬ìš©???¤ì •
                                    showOB: s.showOB.value,
                                    showFVG: s.showFVG.value,
                                    showBPR: s.showBPR.value,
                                    showMB: s.showMB.value,
                                    showBos: s.showBOS.value,
                                    showChoch: s.showCHoCH.value,
                                    zoneOpacity: s.zoneOpacity.value,
                                    labelOpacity: s.labelOpacity.value,
                                    // ?•ë¥ ???’ì„?˜ë¡ FXê°€ ê°•í•´ ë³´ì´?„ë¡ 0..1 ?•ê·œ??                                    intensity: ((widget.prob ?? 0) / 100.0).clamp(0.0, 1.0),
                                    blink: _ac.value,
                                    tfKey: _resolvedTfKey,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 8,
                          top: 8,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => setState(() => _lightChart = !_lightChart),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: t.card.withOpacity(0.55),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: t.border.withOpacity(0.35)),
                              ),
                              child: Text(
                                _lightChart ? '?¼ì´?? : '?¤í¬',
                                style: TextStyle(color: t.fg.withOpacity(0.92), fontWeight: FontWeight.w900, fontSize: 11),
                              ),
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
          if (eventLine().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(eventLine(), style: TextStyle(color: t.muted, fontSize: 11, height: 1.2)),
          ],
        ],
      ),
    );
  }
}

class _PV4 extends CustomPainter {
  final List<FuCandle> c;
  final List<FuZone> z;
  final List<FuZone> ob;
  final List<FuZone> bpr;
  final List<FuZone> mb;
  final NeonTheme t;
  final double price;
  final double s1;
  final double r1;
  // ?¼ì´???¤í¬ ì°¨íŠ¸ ë°°ê²½ ? ê?
  final bool light;
  final String structureTag;
  final double reactLevel;
  final double reactLow;
  final double reactHigh;
  final double blink;
  /// FX ê°•ë„(0..1). ?•ë¥ /? ë¢°?„ê? ?’ì„?˜ë¡ ë§??„ìŠ¤ê°€ ???¬ê²Œ ë³´ì´?„ë¡ ?¬ìš©.
  final double intensity;
  final String? bias;
  final int? prob;
  final bool showPlan;
  final double entry;
  final double stop;
  final double target;

  final List<MiniChartLine> overlayLines;
  final String overlayLabel;

  // ?¤ë²„?ˆì´ ?œì‹œ/?¬ëª…???¤ì •?ì„œ ì¡°ì ˆ)
  final bool showOB;
  final bool showFVG;
  final bool showBPR;
  final bool showMB;
  final bool showBos;
  final bool showChoch;
  final double zoneOpacity;
  final double labelOpacity;

  /// ?€?„í”„?ˆì„ ??(?°ì¸¡ ë¯¸ë˜ ?¬ë°±/?¬ì˜ ê¸¸ì´ ê³„ì‚°??
  final String tfKey;

  _PV4(
    this.c,
    this.z,
    this.ob,
    this.bpr,
    this.mb,
    this.t,
    this.price,
    this.s1,
    this.r1, {
    required this.light,
    required this.structureTag,
    required this.reactLevel,
    required this.reactLow,
    required this.reactHigh,
    required this.blink,
    this.intensity = 1.0,
    this.bias,
    this.prob,
    this.showPlan = false,
    this.entry = 0,
    this.stop = 0,
    this.target = 0,
    this.overlayLines = const [],
    this.overlayLabel = '',
    this.showOB = true,
    this.showFVG = true,
    this.showBPR = true,
    this.showMB = true,
    this.showBos = true,
    this.showChoch = true,
    this.zoneOpacity = 0.18,
    this.labelOpacity = 0.85,
    this.tfKey = '',
  });

  int _futureBarsForTf(String tf) {
    final k = tf.trim().toLowerCase();
    switch (k) {
      case '15m':
      case '30m':
        return 90;
      case '1h':
        return 72;
      case '4h':
        return 54;
      case '1d':
      case '1D':
        return 42;
      case '1w':
      case '1W':
        return 30;
      case '1m':
      case '1M':
        return 18;
      default:
        return 60;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = (light ? const Color(0xFFF7F8FA) : t.bg);
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14)), bg);
    if (light) {
      final bd = Paint()..color = const Color(0x22000000)..style = PaintingStyle.stroke..strokeWidth = 1;
      canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14)), bd);
    }
    if (c.isEmpty) return;

    // --- ?¤ì??¼ë§ ?ˆì •??ê±°ë˜???ë‚Œ: ìµœê·¼ Nê°?ìº”ë“¤ ê¸°ì?) ---
    // ë¯¸ë‹ˆì°¨íŠ¸???€?„í”„?ˆì„???°ë¼ ??ë§ì? ìº”ë“¤???„ìš”???Œê? ?ˆì–´
    // ê¸°ë³¸ ê°€??ìº”ë“¤ ?í•œ??ì¡°ê¸ˆ ?‰ë„‰?˜ê²Œ ?”ë‹¤.
    const int maxVis = 160;
    final int startIndex = c.length > maxVis ? (c.length - maxVis) : 0;
    final List<FuCandle> rawVis = c.sublist(startIndex);

    // ? ï¸ ?°ì´?°ê? 0/NaN/?? „(high<low) ?íƒœë¡??ì—¬ ?ˆìœ¼ë©?    // ?ë™ ?¤ì???rangeMin/Max)??ë§ê?ì§€ë©´ì„œ ìº”ë“¤??"??ì²˜ëŸ¼ ë³´ì´ê±°ë‚˜
    // ?”ë©´??ë¹„ì •?ì ?¼ë¡œ ?˜ë¦¬??ë¬¸ì œê°€ ?ê?.
    // => ?œì‹œ/?¤ì???ê³„ì‚°?€ '?•ìƒ ìº”ë“¤'ë§Œìœ¼ë¡?ì§„í–‰.
    final List<FuCandle> _filtered = rawVis
        // ?°ì´??ê¹¨ì§(0ê°?NaN/ë¹„ì •???¤íŒŒ?´í¬) ê°•í•˜ê²??œê±°
        .where((e) => e.open.isFinite && e.close.isFinite && e.high.isFinite && e.low.isFinite)
        .where((e) => e.open > 0 && e.close > 0 && e.high > 0 && e.low > 0)
        .where((e) => e.high >= e.low)
        // ê±°ë˜???˜ì§‘ ?¤ë¥˜ë¡???ìº”ë“¤ë§??€??ê²½ìš°(?? low=1, high=1000000) ?œê±°
        .where((e) => (e.high / e.low) <= 5.0)
        .toList();

    // ?„ë? ?„í„°?¼ë²„ë¦¬ë©´ rawë¥?ê·¸ë?ë¡??¨ì„œ UIê°€ ì£½ëŠ”ê±?ë§‰ëŠ”??
    final List<FuCandle> vis = _filtered.isNotEmpty ? _filtered : rawVis;
    final int n = vis.length;
    if (n == 0) return;

    // === êµ¬ì¡°(?¤ìœ™/?´í€?BOS/MSB) ?ë™ ?¤ë²„?ˆì´ v0.1 ===
    // - ?”ì§„/?œë²„ ?†ì´ ì°¨íŠ¸ë§Œìœ¼ë¡?EQL/EQH + BOS/MSBë¥?ì¦‰ì‹œ ?œì‹œ
    // - "ë¯¸ë˜ì°¨íŠ¸" ê´€?? ê³¼ê±°??ë°˜ë³µ??'ê°™ì? ê³ ì /?€??ê³?'?¤ìœ™ ?ŒíŒŒ'??    //   ?¥í›„ ê°€ê²©ì´ ë°˜ì‘/?¤ìœ•/ë¦¬í…Œ?¤íŠ¸???•ë¥ ???’ì? êµ¬ê°„?´ë?ë¡?    //   ì°¨íŠ¸??ê³ ì • ?¼ë²¨ë¡?ë°•ì•„?”ë‹¤.

    // y-range??vis ê¸°ì? + outlier ?„í™”(5%~95%)
    final pts = <double>[];
    for (final x in vis) {
      pts.add(x.low);
      pts.add(x.high);
    }
    if (s1 > 0) pts.add(s1);
    if (r1 > 0) pts.add(r1);
    if (price > 0) pts.add(price);
    if (reactLow > 0) pts.add(reactLow);
    if (reactHigh > 0) pts.add(reactHigh);

    // ?œì‹œ ì¤‘ì¸ ì¡´ë“¤?€ ?¤ì??¼ì— ?¬í•¨(ìº”ë“¤ ?˜ë¦¼ ë°©ì?)
    if (showFVG) {
      for (final zz in z) {
        if (zz.low > 0) pts.add(zz.low);
        if (zz.high > 0) pts.add(zz.high);
      }
    }
    if (showOB) {
      for (final zz in ob) {
        if (zz.low > 0) pts.add(zz.low);
        if (zz.high > 0) pts.add(zz.high);
      }
    }
    if (showBPR) {
      for (final zz in bpr) {
        if (zz.low > 0) pts.add(zz.low);
        if (zz.high > 0) pts.add(zz.high);
      }
    }
    if (showMB) {
      for (final zz in mb) {
        if (zz.low > 0) pts.add(zz.low);
        if (zz.high > 0) pts.add(zz.high);
      }
    }

    pts.sort();

    // ?Œí‘œë³?ì£¼ë´‰/?”ë´‰ ?¬í•¨)?ì„œ??outlier 1ê°œë¡œ ì°¨íŠ¸ê°€ ?©ì‘?´ì???ë¬¸ì œë¥?ë§‰ê¸° ?„í•´
    // ?¼ì„¼?€??ê¸°ë°˜?¼ë¡œ y-rangeë¥??¡ëŠ”??ë³´ê°„).
    double _percentile(List<double> s, double p) {
      if (s.isEmpty) return 0;
      if (s.length == 1) return s[0];
      final pos = (s.length - 1) * p;
      final i = pos.floor();
      final frac = pos - i;
      final a = s[i];
      final b = s[(i + 1).clamp(0, s.length - 1)];
      return a + (b - a) * frac;
    }

    double lo = pts.first;
    double hi = pts.last;

    if (pts.length >= 4) {
      final p05 = _percentile(pts, 0.05);
      final p95 = _percentile(pts, 0.95);
      // ?¼ì„¼?€?¼ì´ ë§ì´ ?ˆë˜ë©?fallback
      if (p95 > p05 && p05 > 0) {
        lo = p05;
        hi = p95;
      }
    }

    // ê·¸ë˜??ë¹„ì •?ê°’???ˆìœ¼ë©??„ì²´ ë²”ìœ„ë¡?ë³µê?
    if (!(hi.isFinite && lo.isFinite) || hi <= lo) {
      lo = pts.first;
      hi = pts.last;
    }

    // ?í•˜ ?¬ìœ (ìº”ë“¤ ???„ë«ê¼¬ë¦¬ ??ì§¤ë¦¬ê²?
    // rangeê°€ ë§¤ìš° ?‘ì„ ?Œë„ ìµœì†Œ ?¬ë°±??ê°•ì œ(ì¤??¤ì??¼ê³¼ ë¬´ê??˜ê²Œ ?ˆì •)
    final range = (hi - lo).abs();
    final base = math.max(hi.abs(), lo.abs());
    final pad = math.max(range == 0 ? (base * 0.02 + 1.0) : range * 0.12, base * 0.002);
    lo -= pad;
    hi += pad;

    // ?¤ë²„?ˆì´(?ë‹¨ ?íƒœ ë°•ìŠ¤/?°ì¸¡ ë²„íŠ¼/?˜ë‹¨ AIë°? ?Œë¬¸??plot ?ˆì „ ?¨ë”©???ë˜,
    // 'ë¯¸ë‹ˆì°¨íŠ¸ ?’ì´'ê°€ ?‘ì? ëª¨ë°”?¼ì—?œëŠ” ?¨ë”©??ê³¼í•´ì§€ë©?ìº”ë“¤???ì²˜???Œë ¤ ë³´ì¸??
    // -> ?”ë©´ ?¬ê¸°??ë¹„ë??´ì„œ ?¨ë”©??ê³„ì‚° + plot ìµœì†Œ ?’ì´ë¥?ë³´ì¥
    double padL = 14;
    double padT = math.min(30, size.height * 0.14);
    double padR = math.max(42, math.min(88, size.width * 0.18));
    double padB = math.min(34, size.height * 0.18);

    const double minPlotH = 110; // ?´ë³´???‘ì•„ì§€ë©?ìº”ë“¤???©ì‘?´ì§(?ì²˜??ë³´ì„)
    final double availableH = size.height - (padT + padB);
    if (availableH < minPlotH) {
      // ?¨ë”©??ë¹„ìœ¨ë¡?ì¤„ì—¬??plot ?’ì´ë¥??•ë³´
      final double need = (minPlotH - availableH);
      final double totalPad = padT + padB;
      if (totalPad > 1) {
        final double shrink = math.min(0.85, need / totalPad);
        padT = math.max(10, padT * (1 - shrink));
        padB = math.max(10, padB * (1 - shrink));
      }
    }

    final plot = Rect.fromLTWH(
      padL,
      padT,
      math.max(1, size.width - (padL + padR)),
      math.max(1, size.height - (padT + padB)),
    );

    // ???°ì¸¡ ë¯¸ë˜ ?¬ì˜ ê³µê°„(ìº”ë“¤/?¼ë²¨ ?°ì¸¡ ?˜ë¦¼ ë°©ì?)
    final int rightBars = _futureBarsForTf(tfKey);
    final int denom = ((n - 1) + rightBars).clamp(1, 999999);
    final double dx = plot.width / denom;
    double xIdx(int i) => plot.left + i * dx;

    // =========================
    // ???¤ì‹œê°?ì±„ë„(ê¸°ë°˜??+ ???˜ë‹¨ ?µë¡œ)
    // - ì±„ë„???ˆì–´??"ê²½ë¡œ"ê°€ ?˜ë?ê°€ ?ê?
    // - ìµœê·¼ ìº”ë“¤ ì¢…ê?ë¥?? í˜• ?Œê?ë¡?ê·¼ì‚¬?´ì„œ ì¤‘ì‹¬? ì„ ë§Œë“¤ê³?    // - ATR(ê·¼ì‚¬) ê¸°ë°˜ ë°´ë“œ ??œ¼ë¡????˜ë‹¨ ì±„ë„??ê·¸ë¦°??
    // - ?„ì¬ ?„ì¹˜??"0"?¼ë¡œ ê°•ì œ ?œê¸°
    // =========================

    double y(double p) {
      if (!p.isFinite) return plot.center.dy;
      final yy = plot.bottom - (p - lo) / (hi - lo) * plot.height;
      // ê·¹ë‹¨ ê¼¬ë¦¬(?œë‘ ê°??¤íŒŒ?´í¬)ë¡??¸í•´ ?”ë©´???ˆì˜‡ê²?ë¹„ëŠ” ?ë‚Œ??ì¤„ì´ê¸??„í•´
      // ?„ë ˆ???ˆìª½?¼ë¡œ ?´ì§ ?´ë¨??      return yy.clamp(plot.top + 1, plot.bottom - 1).toDouble();
    }

    // ATR ê·¼ì‚¬ë¡???êµ¬ê°„) ?ê»˜ ê³„ì‚°
    final ranges = <double>[];
    final look = vis.length < 30 ? vis.length : 30;
    for (int i = vis.length - look; i < vis.length; i++) {
      ranges.add((vis[i].high - vis[i].low).abs());
    }
    final avgRange = ranges.isEmpty ? (hi - lo) * 0.01 : (ranges.reduce((a, b) => a + b) / ranges.length);
    final baseBand = avgRange * 0.8;

    // ??ì±„ë„ ê·¸ë¦¬ê¸?ìµœê·¼ mê°?ê¸°ì?)
    void drawRealtimeChannel() {
      if (n < 3) return;
      final m = math.min(48, n);
      final start = n - m;

      // ? í˜• ?Œê? y = a + b*x (x: 0..m-1)
      double sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
      for (int i = 0; i < m; i++) {
        final c0 = vis[start + i];
        final x = i.toDouble();
        final yv = c0.close;
        sumX += x;
        sumY += yv;
        sumXX += x * x;
        sumXY += x * yv;
      }
      final denom = (m * sumXX - sumX * sumX);
      final b = denom.abs() < 1e-9 ? 0.0 : ((m * sumXY - sumX * sumY) / denom);
      final a = (sumY - b * sumX) / m;

      // ë°´ë“œ ???µë¡œ)
      final band = (baseBand * (1.10 + 0.35 * intensity)).clamp(baseBand * 0.6, baseBand * 2.2);

      // TradingView "?¨ëŸ¬??ì±„ë„" ?„ë¦¬???ë‚Œ(?¬ìš©?ê? ì²´í¬???ˆë²¨):
      //  -0.17, 0, 0.5, 1, 1.25 (+ ?€ì¹?
      const tvLevels = <double>[-0.17, 0.0, 0.5, 1.0, 1.25];

      final fill = Paint()..color = const Color(0xFF00D4FF).withOpacity(0.06);
      final edgeMain = Paint()
        ..color = Colors.white.withOpacity(0.70)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6;
      final midDash = Paint()
        ..color = Colors.white.withOpacity(0.40)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2;
      final innerDash = Paint()
        ..color = Colors.white.withOpacity(0.28)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1;
      final outerSoft = Paint()
        ..color = const Color(0xFFFF4D8D).withOpacity(0.22)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3;

      // ?ˆë²¨ë³?Path ëª¨ìœ¼ê¸?      final Map<double, Path> paths = {};
      for (final lv in tvLevels) {
        paths[lv] = Path();
        if (lv > 0) paths[-lv] = Path();
      }

      for (int i = 0; i < m; i++) {
        final cx = xIdx(start + i);
        final cy = a + b * i;

        for (final e in paths.entries) {
          final lv = e.key;
          final py = y(cy + band * lv);
          if (i == 0) {
            e.value.moveTo(cx, py);
          } else {
            e.value.lineTo(cx, py);
          }
        }
      }

      final center = paths[0.0]!;
      final upper = paths[1.0]!;
      final lower = paths[-1.0]!;

      // ì±„ë„ ì±„ìš°ê¸?upper + reversed lower)
      final fillPath = Path()..addPath(upper, Offset.zero);
      final metrics = lower.computeMetrics().toList();
      // reverse lower (ê°„ë‹¨???˜í”Œë§?
      if (metrics.isNotEmpty) {
        final pm = metrics.first;
        for (double t = pm.length; t >= 0; t -= (pm.length / 60.0)) {
          final p = pm.getTangentForOffset(t)?.position;
          if (p == null) continue;
          fillPath.lineTo(p.dx, p.dy);
        }
      } else {
        // fallback
        for (int i = m - 1; i >= 0; i--) {
          final cx = xIdx(start + i);
          final cy = a + b * i;
          fillPath.lineTo(cx, y(cy - band));
        }
      }
      fillPath.close();
      canvas.drawPath(fillPath, fill);

      // ë©”ì¸ ì±„ë„ (Â±1)
      canvas.drawPath(upper, edgeMain);
      canvas.drawPath(lower, edgeMain);

      // ?´ë? ?ˆë²¨: 0.5???ì„ , -0.17?€ ?ì„ , 1.25???¸ê³½ ?¼ì¸
      void drawDashed(Path p, Paint paint, {double dash = 6, double gap = 5}) {
        for (final metric in p.computeMetrics()) {
          double dist = 0;
          while (dist < metric.length) {
            final next = math.min(dist + dash, metric.length);
            final a0 = metric.getTangentForOffset(dist);
            final a1 = metric.getTangentForOffset(next);
            if (a0 != null && a1 != null) {
              canvas.drawLine(a0.position, a1.position, paint);
            }
            dist += dash + gap;
          }
        }
      }

      // 0(ì¤‘ì‹¬) ?ì„ 
      drawDashed(center, midDash, dash: 7, gap: 5);

      // 0.5, -0.5
      if (paths[0.5] != null) drawDashed(paths[0.5]!, innerDash, dash: 6, gap: 6);
      if (paths[-0.5] != null) drawDashed(paths[-0.5]!, innerDash, dash: 6, gap: 6);

      // -0.17
      if (paths[-0.17] != null) drawDashed(paths[-0.17]!, innerDash, dash: 4, gap: 6);

      // 1.25, -1.25 (?¸ê³½)
      if (paths[1.25] != null) canvas.drawPath(paths[1.25]!, outerSoft);
      if (paths[-1.25] != null) canvas.drawPath(paths[-1.25]!, outerSoft);

      // ??ê°€ê²??¼ë²¨: ë§ˆì?ë§?ìº”ë“¤ ?¸ë¡œ??ê¸°ì?(?°ì¸¡ ?ì— ë¶™ì—¬??ê°€?…ì„±)
      String fmt(double v) {
        if (v.abs() >= 1000) return v.toStringAsFixed(0);
        if (v.abs() >= 100) return v.toStringAsFixed(1);
        return v.toStringAsFixed(2);
      }

      void drawPriceTag(double priceAtLine, double py, Paint linePaint) {
        final text = fmt(priceAtLine);
        final tp = TextPainter(
          text: TextSpan(
            text: text,
            style: TextStyle(
              color: Colors.white.withOpacity(0.85),
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        final pad = 4.0;
        final w = tp.width + pad * 2;
        final h = tp.height + 2;
        final x = plot.right - w - 2;
        final yTop = (py - h / 2).clamp(plot.top + 1, plot.bottom - h - 1);
        final r = RRect.fromRectAndRadius(Rect.fromLTWH(x, yTop, w, h), const Radius.circular(4));
        canvas.drawRRect(r, Paint()..color = Colors.black.withOpacity(0.55));
        // ?¼ìª½???‘ì? ì»¬ëŸ¬???¼ì¸ ?‰ìƒ ?ë‚Œ)
        canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(x, yTop, 2.2, h), const Radius.circular(4)),
          Paint()..color = linePaint.color.withOpacity(0.85),
        );
        tp.paint(canvas, Offset(x + pad, yTop + 1));
      }

      // ë§ˆì?ë§??¸ë±?¤ì—??ê°??ˆë²¨??ê°€ê²?ê³„ì‚°(?Œê???a,b ê¸°ë°˜)
      final lastI = (m - 1).toDouble();
      final baseNow = a + b * lastI;
      final levelPrices = <double, double>{
        1.25: baseNow + band * 1.25,
        1.0: baseNow + band,
        0.5: baseNow + band * 0.5,
        0.0: baseNow,
        -0.17: baseNow - band * 0.17,
        -0.5: baseNow - band * 0.5,
        -1.0: baseNow - band,
        -1.25: baseNow - band * 1.25,
      };

      // ë³´ì—¬ì£¼ê¸°(?¬ìš©??ì²´í¬ ?ˆë²¨ + ?€ì¹?+ ?£ì?)
      drawPriceTag(levelPrices[1.25]!, y(levelPrices[1.25]!), outerSoft);
      drawPriceTag(levelPrices[1.0]!, y(levelPrices[1.0]!), edgeMain);
      drawPriceTag(levelPrices[0.5]!, y(levelPrices[0.5]!), innerDash);
      drawPriceTag(levelPrices[0.0]!, y(levelPrices[0.0]!), midDash);
      drawPriceTag(levelPrices[-0.17]!, y(levelPrices[-0.17]!), innerDash);
      drawPriceTag(levelPrices[-0.5]!, y(levelPrices[-0.5]!), innerDash);
      drawPriceTag(levelPrices[-1.0]!, y(levelPrices[-1.0]!), edgeMain);
      drawPriceTag(levelPrices[-1.25]!, y(levelPrices[-1.25]!), outerSoft);

      // ???„ì¬ ?„ì¹˜(0) ?œì‹œ: ë§ˆì?ë§?ìº”ë“¤ ?„ì¹˜??ê³ ì •
      final xNow = plot.left + (n - 1) * dx;
      final yNow = y(price);
      final ring = Paint()
        ..color = const Color(0xFF7CE8FF).withOpacity(0.35 + 0.35 * blink)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      final dot = Paint()..color = const Color(0xFF7CE8FF).withOpacity(0.75);
      canvas.drawCircle(Offset(xNow, yNow), 5.2, dot);
      canvas.drawCircle(Offset(xNow, yNow), 10.0 + 6.0 * blink, ring);

      final tp0 = TextPainter(
        text: TextSpan(
          text: '0',
          style: TextStyle(
            color: Colors.white.withOpacity(0.95),
            fontWeight: FontWeight.w900,
            fontSize: 11,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      final badge = RRect.fromRectAndRadius(
        Rect.fromLTWH(
          (xNow - 10).clamp(plot.left + 2, plot.right - 26),
          (yNow - 28).clamp(plot.top + 2, plot.bottom - 24),
          22,
          18,
        ),
        const Radius.circular(8),
      );
      canvas.drawRRect(badge, Paint()..color = const Color(0xFF00D4FF).withOpacity(0.18));
      canvas.drawRRect(badge, Paint()..color = const Color(0xFF00D4FF).withOpacity(0.38)..style = PaintingStyle.stroke..strokeWidth = 1.0);
      tp0.paint(canvas, Offset(badge.left + (badge.width - tp0.width) / 2, badge.top + (badge.height - tp0.height) / 2));
    }

    // ì±„ë„ ë¨¼ì?(???ˆì´??
    drawRealtimeChannel();

    // ê°€ê¹Œìš°ë©?êµµê²Œ(ê°•ì¡°)
    final nearS = price <= s1 * 1.01;
    final nearR = price >= r1 * 0.99;

    // ===== Overlay Zones: OB / FVG / BPR / MB =====
    void drawZoneGroup({
      required List<FuZone> zones,
      required bool enabled,
      required Color base,
      required String label,
    }) {
      if (!enabled) return;
      if (zones.isEmpty) return;

      // 'ë¯¸ìš©??ê°„íŒ'ì²˜ëŸ¼ ?¼ë²¨???ˆë¬´ ë§ì´ ì°íˆ??ê²ƒì„ ë°©ì?:
      // - ?”ë©´??"ê°€ê¹Œìš´ ì¡? ?„ì£¼ë¡?ìµœë? 3ê°œë§Œ
      // - ?¼ë²¨?€ ê·¸ë£¹??1ë²ˆë§Œ
      final centerP = price;
      final sorted = [...zones]
        ..sort((a, b) {
          final da = ((a.low + a.high) * 0.5 - centerP).abs();
          final db = ((b.low + b.high) * 0.5 - centerP).abs();
          return da.compareTo(db);
        });
      final pick = sorted.take(3).toList(growable: false);

      Paint makeFill(Color c) => Paint()
        ..style = PaintingStyle.fill
        ..color = c.withOpacity(zoneOpacity.clamp(0.05, 0.6));
      Paint makeBorder(Color c) => Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = c.withOpacity((zoneOpacity * 1.2).clamp(0.10, 0.85));

      void dashedRect(Rect r, Paint p, {double dash = 7, double gap = 5}) {
        // top
        for (double x = r.left; x < r.right; x += (dash + gap)) {
          canvas.drawLine(Offset(x, r.top), Offset(math.min(x + dash, r.right), r.top), p);
          canvas.drawLine(Offset(x, r.bottom), Offset(math.min(x + dash, r.right), r.bottom), p);
        }
        // sides
        for (double yv = r.top; yv < r.bottom; yv += (dash + gap)) {
          canvas.drawLine(Offset(r.left, yv), Offset(r.left, math.min(yv + dash, r.bottom)), p);
          canvas.drawLine(Offset(r.right, yv), Offset(r.right, math.min(yv + dash, r.bottom)), p);
        }
      }

      bool paintedLabel = false;
      for (final z in pick) {
        final zoneColor = z.dir == 1
            ? const Color(0xFF2ECC71)
            : z.dir == -1
                ? const Color(0xFFE74C3C)
                : base;
        final top = y(z.high);
        final bot = y(z.low);
        // Optional x-span (candle index) support
        double xL = plot.left;
        double xR = plot.right;
        if (z.iStart != null && z.iEnd != null && n > 1) {
          final i1 = z.iStart!.clamp(0, n - 1);
          final i2 = z.iEnd!.clamp(0, n - 1);
          xL = xIdx(math.min(i1, i2));
          xR = xIdx(math.max(i1, i2));
        }
        final rect = Rect.fromLTWH(xL, math.min(top, bot), (xR - xL).abs(), (top - bot).abs());
        canvas.drawRect(rect, makeFill(zoneColor));

        // MU/MB???ì„  ?Œë‘ë¦¬ë¡œ 'ì¡°ì‘ êµ¬ê°„' ?ë‚Œ??ê°•í™”
        final isManip = z.label.toUpperCase().contains('MU') || z.label.toUpperCase().contains('MB') || label == 'MB';
        final borderP = makeBorder(zoneColor)..strokeWidth = isManip ? 1.6 : 1.0;
        if (isManip) {
          dashedRect(rect, borderP, dash: 8, gap: 5);
        } else {
          canvas.drawRect(rect, borderP);
        }

        // (UI) zone label hidden
        // (UI) per-zone labels hidden
      }
    }


    // ?œì‹œ ?œì„œ: OB ??FVG ??BPR ??MB
    drawZoneGroup(
      zones: ob,
      enabled: showOB,
      base: const Color(0xFF8A5CFF),
      label: 'OB',
    );
    drawZoneGroup(
      zones: z,
      enabled: showFVG,
      base: const Color(0xFF00D4FF),
      label: 'FVG',
    );
    drawZoneGroup(
      zones: bpr,
      enabled: showBPR,
      base: const Color(0xFFFFD54F),
      label: 'BPR',
    );
    drawZoneGroup(
      zones: mb,
      enabled: showMB,
      base: const Color(0xFFFF9F43),
      label: 'MB',
    );

    // ===== Structure Overlay: EQH/EQL + BOS/MSB (v0.1) =====
    // ?¬ìš©?ê? ?í•˜??"ë¯¸ë˜ì°¨íŠ¸" ?µì‹¬:
    // - EQL/EQH: ? ë™???€(ë°˜ë³µ ê³ ì??? ???¤ìœ•/ë°˜ì‘ ?•ë¥ ???’ì•„ ?¬ë°©ë¬?ê°€??    // - BOS/MSB: êµ¬ì¡° ?•ì •/?„í™˜ ì§€????ë¦¬í…Œ?¤íŠ¸ ë°˜ì‘ êµ¬ê°„
    void drawStructureOverlay() {
      if (n < 10) return;
      // ?°ì¸¡ ë¯¸ë˜ ?¬ë°±???¬í•¨??x ë§?      double xOf(int i) => xIdx(i);

      // tol: ?™ì¼ê³ ì /?™ì¼?€???ˆìš© ?¤ì°¨(ìº”ë“¤ ?‰ê·  range ê¸°ë°˜)
      final tol = (avgRange * 0.18).clamp((hi - lo).abs() * 0.0015, (hi - lo).abs() * 0.02);

      // ?¤ìœ™(?„ë™?? ?ì?(ì¢?/??)
      final sh = <(int i, double p)>[];
      final sl = <(int i, double p)>[];
      for (int i = 2; i <= n - 3; i++) {
        final h0 = vis[i].high;
        final l0 = vis[i].low;
        bool isHigh = true;
        bool isLow = true;
        for (int k = 1; k <= 2; k++) {
          if (vis[i - k].high >= h0 || vis[i + k].high >= h0) isHigh = false;
          if (vis[i - k].low <= l0 || vis[i + k].low <= l0) isLow = false;
        }
        if (isHigh) sh.add((i, h0));
        if (isLow) sl.add((i, l0));
      }
      if (sh.isEmpty && sl.isEmpty) return;

      // dashed line helper
      void dashedHLine(double y0, double x1, double x2, Color col) {
        final p = Paint()..color = col.withOpacity(0.75)..strokeWidth = 1.6;
        final a = math.min(x1, x2);
        final b = math.max(x1, x2);
        for (double xx = a; xx < b; xx += 10) {
          canvas.drawLine(Offset(xx, y0), Offset(math.min(xx + 6, b), y0), p);
        }
      }

      void tagAt(String txt, double x, double y0, Color col) {
        final tp = TextPainter(
          text: TextSpan(
            text: txt,
            style: TextStyle(color: col.withOpacity(labelOpacity), fontSize: 9, fontWeight: FontWeight.w900),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        final rr = RRect.fromRectAndRadius(
          Rect.fromLTWH(x - tp.width / 2 - 7, y0 - tp.height / 2 - 5, tp.width + 14, tp.height + 10),
          const Radius.circular(999),
        );
        canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.16));
        canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.32)..style = PaintingStyle.stroke..strokeWidth = 1);
        tp.paint(canvas, Offset(rr.left + (rr.width - tp.width) / 2, rr.top + (rr.height - tp.height) / 2));
      }

      // (UI) EQH/EQL ?œì‹œ???¨ê?

      // BOS/CHOCH: ?„ì¬ ì¢…ê?ê°€ ë§ˆì?ë§??¤ìœ™??? ì˜ë¯¸í•˜ê²??ŒíŒŒ/?´íƒˆ?˜ë©´ ?œì‹œ
      final lastClose = vis.last.close;
      final lastSh = sh.isNotEmpty ? sh.last : null;
      final lastSl = sl.isNotEmpty ? sl.last : null;

      // trend hint (?¨ìˆœ): ë§ˆì?ë§?2ê°??¤ìœ™?¼ë¡œ HL/LL ?ì •
      bool downTrend = false;
      bool upTrend = false;
      if (sh.length >= 2 && sl.length >= 2) {
        final hh = sh[sh.length - 1].$2 > sh[sh.length - 2].$2;
        final hl = sl[sl.length - 1].$2 > sl[sl.length - 2].$2;
        final lh = sh[sh.length - 1].$2 < sh[sh.length - 2].$2;
        final ll = sl[sl.length - 1].$2 < sl[sl.length - 2].$2;
        upTrend = hh && hl;
        downTrend = lh && ll;
      }

      if (lastSh != null && lastClose > lastSh.$2 + tol) {
        final col = const Color(0xFF4DA3FF);
        final y0 = y(lastSh.$2);
        dashedHLine(y0, xOf(lastSh.$1), plot.right, col);
        tagAt(downTrend ? 'CHOCH?? : 'BOS??, plot.right - 26, y0 - 14, col);
      }
      if (lastSl != null && lastClose < lastSl.$2 - tol) {
        final col = const Color(0xFFFF7A45);
        final y0 = y(lastSl.$2);
        dashedHLine(y0, xOf(lastSl.$1), plot.right, col);
        tagAt(upTrend ? 'CHOCH?? : 'BOS??, plot.right - 26, y0 + 14, col);
      }
    }

    // êµ¬ì¡° ?¤ë²„?ˆì´??ì¡??„ì— ?´ì§, ìº”ë“¤ ?„ì— ê³¼ë„?˜ê²Œ ê°€ë¦¬ì? ?Šë„ë¡?ì¤‘ê°„ ?ˆì´??    drawStructureOverlay();

    // ===== Future Path Overlay (v0.1) =====
    // - ?°ì¸¡ ?¬ë°± ?ì—­??'ë¯¸ë˜ ê²½ë¡œ'ë¥??ì„ ?¼ë¡œ ?¬ì˜
    // - ?•ë¥  20% ë¯¸ë§Œ?´ë©´ WATCHë¡?ê°„ì£¼?˜ê³  ?œì‹œ?˜ì? ?ŠìŒ(?¬ìš©??ë£?
    void drawFuturePath() {
      final b = (bias ?? '').toUpperCase();
      final p = (prob ?? 0);
      if (p < 20) return;
      if (b.isEmpty || b == 'LOCK' || b == 'WATCH') return;
      if (n < 5) return;

      final isLong = b.contains('ë¡?) || b == 'UP';
      final isShort = b.contains('??) || b == 'DOWN';
      if (!isLong && !isShort) return;

      // ?€ê²?1: ë°˜ì‘êµ¬ê°„/ì§€ì§€?€???°ì„ 
      final t1 = isLong
          ? ((reactHigh > 0 ? reactHigh : (r1 > 0 ? r1 : (price + (hi - lo) * 0.25))))
          : ((reactLow > 0 ? reactLow : (s1 > 0 ? s1 : (price - (hi - lo) * 0.25))));

      // ?€ê²?2: ?¤ìŒ ì¡?ê°€ê¹Œìš´) ?ëŠ” ?•ì¥
      double t2 = t1;
      if (isLong) {
        // ?„ìª½??ê°€??ê°€ê¹Œìš´ ì¡?ê²½ê³„(?€???„ë³´)
        final ups = <double>[];
        for (final zz in [...z, ...ob, ...bpr, ...mb]) {
          if (zz.high > t1) ups.add(zz.high);
        }
        ups.sort();
        t2 = ups.isNotEmpty ? ups.first : (t1 + (hi - lo) * 0.18);
      } else {
        final dns = <double>[];
        for (final zz in [...z, ...ob, ...bpr, ...mb]) {
          if (zz.low < t1) dns.add(zz.low);
        }
        dns.sort();
        t2 = dns.isNotEmpty ? dns.last : (t1 - (hi - lo) * 0.18);
      }

      final x0 = xIdx(n - 1);
      final x1 = xIdx(n - 1 + (rightBars * 0.55).round());
      final x2 = plot.right - 4;
      final y0 = y(price);
      final y1 = y(t1);
      final y2 = y(t2);

      final col = isLong ? const Color(0xFF2ECC71) : const Color(0xFFE74C3C);

      // dashed polyline
      void dashedLine(Offset a, Offset b, Paint p, {double dash = 8, double gap = 6}) {
        final dxl = b.dx - a.dx;
        final dyl = b.dy - a.dy;
        final len = math.sqrt(dxl * dxl + dyl * dyl);
        if (len <= 1) return;
        final ux = dxl / len;
        final uy = dyl / len;
        double dist = 0;
        while (dist < len) {
          final d1 = math.min(dash, len - dist);
          final p1 = Offset(a.dx + ux * dist, a.dy + uy * dist);
          final p2 = Offset(a.dx + ux * (dist + d1), a.dy + uy * (dist + d1));
          canvas.drawLine(p1, p2, p);
          dist += dash + gap;
        }
      }

      final pnt = Paint()
        ..color = col.withOpacity(0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;

      dashedLine(Offset(x0, y0), Offset(x1, y1), pnt);
      dashedLine(Offset(x1, y1), Offset(x2, y2), pnt);

      // ?€ê²?ë§?      final ring = Paint()..color = col.withOpacity(0.20);
      canvas.drawCircle(Offset(x1, y1), 7.5 + 5.0 * blink, ring);
      canvas.drawCircle(Offset(x2, y2), 7.5 + 5.0 * blink, ring);

      // ?•ë¥  ?¼ë²¨
      final lbl = isLong ? 'ë¡?$p%' : '??$p%';
      final tp = TextPainter(
        text: TextSpan(
          text: lbl,
          style: TextStyle(color: Colors.white.withOpacity(0.95), fontSize: 10, fontWeight: FontWeight.w900),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final rr = RRect.fromRectAndRadius(
        Rect.fromLTWH((x1 - tp.width / 2 - 8).clamp(plot.left + 4, plot.right - tp.width - 20),
            (y1 - 28).clamp(plot.top + 4, plot.bottom - 24), tp.width + 16, tp.height + 10),
        const Radius.circular(999),
      );
      canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.18));
      canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.38)..style = PaintingStyle.stroke..strokeWidth = 1.0);
      tp.paint(canvas, Offset(rr.left + (rr.width - tp.width) / 2, rr.top + (rr.height - tp.height) / 2));
    }

    drawFuturePath();

    void bandRect(double center, Color col, double factor) {
      final top = y(center + baseBand * factor);
      final bot = y(center - baseBand * factor);
      final r = Rect.fromLTWH(plot.left, math.min(top, bot), plot.width, (top - bot).abs());
      final p = Paint()..color = col.withOpacity(0.18);
      canvas.drawRect(r, p);
      // ê²½ê³„??êµµê¸° ì°¨ë“±)
      final border = Paint()
        ..color = col.withOpacity(0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = factor >= 1.15 ? 2.6 : 1.4;
      canvas.drawRect(r, border);
    }

    // ì§€ì§€/?€????    bandRect(s1, t.good, nearS ? 1.25 : 0.90);
    bandRect(r1, t.bad, nearR ? 1.25 : 0.90);

    // ??ì§€ì§€/?€??ê°€ê²??¼ë²¨(ì´ˆë¡/ë¹¨ê°• ë°•ìŠ¤ ??
    void levelLabel(double level, String label, Color col) {
      if (!level.isFinite || level <= 0) return;
      final yy = y(level);
      final text = '$label ${level.toStringAsFixed(0)}';
      final tp = TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(color: col.withOpacity(0.95), fontWeight: FontWeight.w900, fontSize: 10),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final padX = 8.0;
      final padY = 4.0;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(8, (yy - tp.height * 0.5) - padY, tp.width + padX * 2, tp.height + padY * 2),
        const Radius.circular(999),
      );
      final fill = Paint()..color = col.withOpacity(0.10);
      final bd = Paint()..color = col.withOpacity(0.35)..style = PaintingStyle.stroke..strokeWidth = 1.2;
      canvas.drawRRect(rect, fill);
      canvas.drawRRect(rect, bd);
      tp.paint(canvas, Offset(8 + padX, (yy - tp.height * 0.5)));
    }

    levelLabel(s1, 'ì§€ì§€', t.good);
    levelLabel(r1, '?€??, t.bad);

    // ë°˜ì‘êµ¬ê°„(CHOCH/BOS) ??    if (structureTag != 'RANGE' && reactLevel > 0 && reactHigh > reactLow) {
      final isUp = structureTag.contains('UP');
      final col = isUp ? t.good : t.bad;
      final top = y(reactHigh);
      final bot = y(reactLow);
      final rect = Rect.fromLTWH(plot.left, math.min(top, bot), plot.width, (top - bot).abs());
      final fill = Paint()..color = col.withOpacity(0.10);
      final border = Paint()..color = col.withOpacity(0.55)..style = PaintingStyle.stroke..strokeWidth = 2.0;
      canvas.drawRect(rect, fill);
      canvas.drawRect(rect, border);
      // ë°˜ì‘ê°€ê²??¼ì¸
      final ry = y(reactLevel);
      final lp2 = Paint()..color = col.withOpacity(0.75)..strokeWidth = 1.8;
      canvas.drawLine(Offset(plot.left, ry), Offset(plot.right, ry), lp2);
    }



    // BOS / CHOCH ?¼ì¸ (êµ¬ì¡° ?„í™˜ ì§€??
    if (reactLevel > 0 && (showBos || showChoch)) {
      final isBOS = structureTag.contains('BOS');
      final isCHOCH = structureTag.contains('CHOCH');
      if ((isBOS && showBos) || (isCHOCH && showChoch)) {
        final yy = y(reactLevel);
        final col = isBOS ? const Color(0xFF4DA3FF) : const Color(0xFFFF7A45);
        final line = Paint()
          ..color = col.withOpacity(0.85)
          ..strokeWidth = 2
          ..style = PaintingStyle.stroke;
        // ?ì„  ?ë‚Œ
        for (double xx = plot.left; xx < plot.right; xx += 10) {
          canvas.drawLine(Offset(xx, yy), Offset(xx + 6, yy), line);
        }

        final label = isBOS ? 'BOS' : 'CHOCH';
        final tp = TextPainter(
          text: TextSpan(
            text: label,
            style: TextStyle(
              color: col.withOpacity(labelOpacity),
              fontSize: 9,
              fontWeight: FontWeight.w900,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        final rr = RRect.fromRectAndRadius(
          Rect.fromLTWH(size.width - tp.width - 28, yy - tp.height / 2 - 6, tp.width + 14, tp.height + 10),
          const Radius.circular(999),
        );
        canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.18));
        canvas.drawRRect(rr, Paint()..color = col.withOpacity(0.35)..style = PaintingStyle.stroke..strokeWidth = 1);
        tp.paint(canvas, Offset(size.width - tp.width - 21, yy - tp.height / 2));
      }
    }
    // Price line
    final py = y(price);
    final lp = Paint()..color = t.fg.withOpacity(0.78)..strokeWidth = 2.4;
    canvas.drawLine(Offset(plot.left, py), Offset(plot.right, py), lp);

    // ?•ì • ì§„ì… ??Entry/SL/TP) - showPlan???Œë§Œ
    if (showPlan && entry > 0 && stop > 0 && target > 0) {
      final yE = y(entry);
      final yS = y(stop);
      final yT = y(target);

      final pe = Paint()..color = t.fg.withOpacity(0.80)..strokeWidth = 1.8;
      final ps = Paint()..color = t.bad.withOpacity(0.75)..strokeWidth = 2.2;
      final pt = Paint()..color = t.good.withOpacity(0.75)..strokeWidth = 2.0;

      canvas.drawLine(Offset(plot.left, yE), Offset(plot.right, yE), pe);
      canvas.drawLine(Offset(plot.left, yS), Offset(plot.right, yS), ps);
      canvas.drawLine(Offset(plot.left, yT), Offset(plot.right, yT), pt);

      // ?°ì¸¡ ?¼ë²¨(?‘ê²Œ) + ê°€ê²????‘ê²Œ)
      void tag(String txt, double yy, Color col, {String? val}) {
        final t1 = TextPainter(
          text: TextSpan(
            text: txt,
            style: TextStyle(color: col.withOpacity(0.95), fontWeight: FontWeight.w900, fontSize: 10),
          ),
          textDirection: TextDirection.ltr,
        )..layout();

        TextPainter? t2;
        if (val != null && val.isNotEmpty) {
          t2 = TextPainter(
            text: TextSpan(
              text: val,
              style: TextStyle(color: col.withOpacity(0.85), fontWeight: FontWeight.w900, fontSize: 9),
            ),
            textDirection: TextDirection.ltr,
          )..layout();
        }

        final rightPad = 10.0;
        final totalW = t1.width + (t2 == null ? 0.0 : (4.0 + t2.width));
        final x = size.width - totalW - rightPad;
        t1.paint(canvas, Offset(x, yy - 8));
        if (t2 != null) {
          t2.paint(canvas, Offset(x + t1.width + 4.0, yy - 8));
        }
      }

      String fmt(double v) {
        if (!v.isFinite || v <= 0) return '';
        final iv = v.roundToDouble();
        return (v - iv).abs() < 0.0001 ? iv.toStringAsFixed(0) : v.toStringAsFixed(2);
      }

      tag('E', yE, t.fg, val: fmt(entry));
      tag('SL', yS, t.bad, val: fmt(stop));
      tag('TP', yT, t.good, val: fmt(target));
    }

    // ê°•ë ¥ ? í˜¸ ?œì‹œ(?”ì‚´??+ ?„ìŠ¤ ë§?
    final b = (bias ?? 'LOCK').toUpperCase();
    final isLong = b.contains('ë¡?);
    final isShort = b.contains('??);
    final arrowCol = isLong ? t.good : (isShort ? t.bad : t.fg);
    final pr = (prob ?? 0).clamp(0, 100);
    if (isLong || isShort) {
      final col = isLong ? t.good : t.bad;
      final alpha = (0.25 + 0.75 * blink).clamp(0.0, 1.0);
      // ?”ì‚´??      final x0 = size.width - 26;
      final dy = isLong ? -10.0 : 10.0;
      final tri = Path()
        ..moveTo(x0, py)
        ..lineTo(x0 + 14, py + dy)
        ..lineTo(x0 + 14, py - dy)
        ..close();
      final tp = Paint()..color = col.withOpacity(0.22 + 0.30 * alpha);
      canvas.drawPath(tri, tp);
      final ts = Paint()
        ..color = col.withOpacity(0.55 + 0.35 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawPath(tri, ts);

      // ?„ìŠ¤ ë§?(?•ë¥ ???’ì„?˜ë¡ ê°?
      final pulse = 7.0 + (pr / 100.0) * (10.0 + 14.0 * intensity);
      final ring = Paint()
        ..color = col.withOpacity(0.10 + 0.20 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0 + 1.4 * (pr / 100.0);
      canvas.drawCircle(Offset(size.width - 10, py), pulse, ring);

      // B/S ë¬¸ì(?•ì •???Œë§Œ ?¬ê²Œ)
      if (showPlan) {
        final tag = isLong ? 'B' : 'S';
        final fs = 20.0 + 10.0 * blink; // ?•ì • ???„íŒ©???´ì§ ì»¤ì¡Œ???‘ì•„ì§?
        final tp = TextPainter(
          text: TextSpan(
            text: tag,
            style: TextStyle(
              color: col.withOpacity(0.92),
              fontWeight: FontWeight.w900,
              fontSize: fs,
              shadows: [
                Shadow(color: col.withOpacity(0.25 + 0.40 * blink), blurRadius: 10),
              ],
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        // ë°°ê²½ ê¸€ë¡œìš°(??
        final bg = Paint()..color = col.withOpacity(0.10 + 0.18 * blink);
        canvas.drawCircle(Offset(size.width - 18, py - 16), 18.0 + 10.0 * blink, bg);
        tp.paint(canvas, Offset(size.width - tp.width - 18, py - tp.height - 18));
      }
    }


// Candles
// - ?°ì´???„ë½/?¤ë¥˜ ìº”ë“¤???ì´ë©?i ?¸ë±?¤ëŠ” ? ì??˜ëŠ”???¤ì œ drawë¥?skip?´ì„œ
//   'ìº”ë“¤ ?¬ì´??ë¹?ê³µê°„(êµ¬ë©)'ì²˜ëŸ¼ ë³´ì´??ë¬¸ì œê°€ ?ê?.
// - ?´ê²°: ? íš¨ ìº”ë“¤ë§?ë¨¼ì? ?„í„°ë§í•´??'?°ì† ë°°ì—´'ë¡?ë§Œë“  ??ê·?ë°°ì—´ ê¸°ì??¼ë¡œ ê°„ê²© ê³„ì‚°.
final valid = vis.where((x) {
  if (!x.low.isFinite || !x.high.isFinite || !x.open.isFinite || !x.close.isFinite) return false;
  if (x.low <= 0 || x.high <= 0) return false;
  if (x.high < x.low) return false;
  return true;
}).toList();

if (valid.isEmpty) return;

final nn = valid.length;
// ìº”ë“¤?€ '?„ì¬ ?ì—­'ê¹Œì?ë§?ì±„ìš°ê³? ?°ì¸¡?€ ë¯¸ë˜ ?¬ì˜ ê³µê°„?¼ë¡œ ë¹„ì›Œ?”ë‹¤.
final candleAreaW = dx * math.max(1, (n - 1));
final w = candleAreaW / nn;

for (int i = 0; i < nn; i++) {
  final x = valid[i];
  final cx = plot.left + i * w + w * 0.5;
  final up = x.close >= x.open;
  final col = light ? const Color(0xFF111318) : (up ? t.good : t.bad);

  final wick = Paint()
    ..color = (light ? const Color(0xFF111318).withOpacity(0.85) : col.withOpacity(0.85))
    ..strokeWidth = math.max(1.2, math.min(2.4, w * 0.12));
  canvas.drawLine(Offset(cx, y(x.high)), Offset(cx, y(x.low)), wick);

  final body = Paint()
    ..color = (light ? (up ? const Color(0xFFFDFDFD) : const Color(0xFF111318)) : col.withOpacity(0.85));
  final top = y(math.max(x.open, x.close));
  final bot = y(math.min(x.open, x.close));

  // ìº”ë“¤ ë°€??ê³µë°±) ë³´ì •:
  // - n???ì„ ?? bodyWê°€ ?ˆë¬´ ?‘ê²Œ ?œí•œ?˜ë©´ ê³µë°±??ê³¼ì¥??  // - n??ë§ì„ ?? bodyWê°€ ?ˆë¬´ ì»¤ì?ë©?ë­‰ê°œì§?  // -> w ê¸°ì? ë¹„ìœ¨ + ?í•œë§??ê³ , 'w??ë¹„ë?'?˜ë„ë¡?? ì?
	  // body ??? "?¬ë¡¯??w)"??ë¹„ë??´ì•¼ TFë³?ë°€?„ê? ?ˆì •?œë‹¤.
	  // - ?°ì´?°ê? ë§ì•„ wê°€ ?‘ì„ ?? ìµœì†Œ??2.2 ? ì?(??ë°©ì?)
	  // - ?°ì´?°ê? ?ì–´ wê°€ ???? ?í•œ 18.0 ê°™ì? ê³ ì • ìº¡ì„ ?ë©´ ê³µë°±??ê³¼ì¥??	  // -> w??92%ë¥?ê¸°ë³¸?¼ë¡œ, ìµœë????¬ë¡¯??˜ 98%ë¡œë§Œ ?œí•œ
	  final bodyW = math.max(2.2, w * 0.92);
  final rect = Rect.fromLTWH(
    cx - bodyW * 0.5,
    top,
    bodyW,
    math.max(2, (bot - top).abs()),
  );
  canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(2)), body);

  if (light) {
    final bd = Paint()
      ..color = const Color(0xFF111318).withOpacity(0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(2)), bd);
  }
}
    // ??AI ?¨í„´ ?‘ë„(ì¶”ì„¸???˜ë ´??ì±„ë„ ??
    if (overlayLines.isNotEmpty) {
      final linePaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      for (final l in overlayLines) {
        final i1 = l.i1.clamp(0, n - 1);
        final i2 = l.i2.clamp(0, n - 1);
        final x1 = plot.left + i1 * w + w * 0.5;
        final x2 = plot.left + i2 * w + w * 0.5;
        linePaint
          ..color = (l.color ?? t.accent).withOpacity(0.85)
          ..strokeWidth = l.width;
        canvas.drawLine(Offset(x1, y(l.p1)), Offset(x2, y(l.p2)), linePaint);
      }

      if (overlayLabel.isNotEmpty) {
        final tp = TextPainter(
          text: TextSpan(
            text: overlayLabel,
            style: TextStyle(color: t.fg.withOpacity(0.92), fontWeight: FontWeight.w900, fontSize: 11),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        final rect = RRect.fromRectAndRadius(
          Rect.fromLTWH(8, 8, tp.width + 16, tp.height + 10),
          const Radius.circular(12),
        );
        canvas.drawRRect(rect, Paint()..color = t.card.withOpacity(0.55));
        canvas.drawRRect(rect, Paint()..color = t.border.withOpacity(0.35)..style = PaintingStyle.stroke..strokeWidth = 1);
        tp.paint(canvas, const Offset(16, 13));
      }
    }

    // Blinking current price dot (right side)
    final dotAlpha = (0.25 + 0.75 * blink).clamp(0.0, 1.0);
    final dot = Paint()..color = arrowCol.withOpacity(dotAlpha);
    canvas.drawCircle(Offset(size.width - 10, py), 4.0, dot);
    final ring = Paint()
      ..color = arrowCol.withOpacity(0.25 + 0.35 * blink)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawCircle(Offset(size.width - 10, py), 8.0, ring);

    // ?•ë¥  ?¼ë²¨ (?°ì¸¡ ?ë‹¨)
    if (prob != null) {
      final tp = TextPainter(
        text: TextSpan(
          text: '${prob}% ',
          style: TextStyle(color: arrowCol.withOpacity(0.95), fontWeight: FontWeight.w900, fontSize: 12),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(size.width - tp.width - 10, 8));
    }
  }

  @override
  bool shouldRepaint(covariant _PV4 oldDelegate) => true;
}