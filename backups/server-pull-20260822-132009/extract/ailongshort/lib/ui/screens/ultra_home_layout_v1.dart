import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/services/fu_engine.dart';
import '../../core/utils/candle_close_util.dart';
import '../../core/services/bar_close_watcher.dart';
import '../../core/analysis/close_context_engine_v1.dart';
import '../../core/analysis/breakout_quality_engine_v1.dart';
import '../../core/analysis/volume_quality_engine_v1.dart';
import '../../core/briefing/tf_briefing.dart';
import '../../core/briefing_engine/periodic_briefing_engine.dart';
import '../../core/briefing_engine/periodic_briefing_db.dart';
import '../widgets/candle_close_badges_v1.dart';
import '../../core/services/future_path_engine.dart';
import '../../core/models/future_path_price_dto.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';
import '../widgets/path_chart_lite.dart';
import '../widgets/future_path_painter.dart';
import '../overlays/reaction_zones_painter.dart';
import '../widgets/activation_status_bar.dart';
import '../widgets/future_mode_overlay_themed.dart';
import '../widgets/zone_prob_label.dart';
import '../widgets/entry_marker.dart';
import '../widgets/dual_prob_label_smart.dart';
import '../widgets/targets_prob_label_smart.dart';
import '../ai/tf_theme.dart';
import '../ai/density_gate.dart';
import '../ai/prob_calc.dart';

/// UltraHomeLayoutV1
/// - ?ÅÎã® Ï∞®Ìä∏(??40%)
/// - ?òÎã® ?úÎûòÍ∑?Î∂ÑÏÑù ?®ÎÑê(DraggableScrollableSheet)
/// - ?òÎã® Í≥†Ï†ï Í≤∞Ï†ï Î∞?Î°???Í¥ÄÎß?
/// - PATH Î≤ÑÌäº?ºÎ°ú Ï∞®Ìä∏ ?ÅÏó≠??"ÎØ∏ÎûòÍ≤ΩÎ°ú" Î™®ÎìúÎ°??§ÏúÑÏπ??ÑÏû¨???§Ï∫ê?¥Îìú/?åÎ†à?¥Ïä§?Ä??
class UltraHomeLayoutV1 extends StatefulWidget {
  const UltraHomeLayoutV1({super.key});

  @override
  State<UltraHomeLayoutV1> createState() => _UltraHomeLayoutV1State();
}

/// ?§ÌÅ¨Î°??§Î≤Ñ?§ÌÅ¨Î°??åÎ?/Ï£ºÌô© Í∏ÄÎ°úÏö∞) ?úÍ±∞
class _NoGlowScroll extends ScrollBehavior {
  const _NoGlowScroll();

  @override
  Widget buildOverscrollIndicator(BuildContext context, Widget child, ScrollableDetails details) {
    return child;
  }
}

class _UltraHomeLayoutV1State extends State<UltraHomeLayoutV1> {

// --- ÎßàÍ∞ê(Ï¢ÖÍ?) Ïπ¥Ïö¥?∏Îã§???êÏ†ï ---
// ???úÍ∞ÑÎ¥?ÎßàÍ∞ê(Ï¢ÖÍ?) Í∞êÏãú: 5Î∂??ÑÎ¥â
late final BarCloseWatcher _closeWatcher = BarCloseWatcher(
  tfs: const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'],
);
List<CandleCloseInfo> _closeInfos = const <CandleCloseInfo>[];

final CloseContextEngineV1 _closeCtx = const CloseContextEngineV1();
final BreakoutQualityEngineV1 _bq = const BreakoutQualityEngineV1();
final VolumeQualityEngineV1 _vq = const VolumeQualityEngineV1();

  // ???òÎã® ?®ÎÑê Í∞ïÏ†ú ?úÏñ¥(?úÎûòÍ∑?Î®πÌÜµ Î∞©Ï?)
  final DraggableScrollableController _sheetCtl = DraggableScrollableController();

  // ??Ï∞®Ìä∏ ?ïÎ?/Ï∂ïÏÜå + ?êÎèô ÎßûÏ∂§(???àÎèÑ??ÎπÑÏú® Ï∞®Ïù¥ ?Ä??
  final TransformationController _viewerTc = TransformationController();
  final GlobalKey _chartKey = GlobalKey();

  // DraggableScrollableSheetÍ∞Ä ?úÍ≥µ?òÎäî ?§ÌÅ¨Î°§Îü¨Î•??¨Ïö©(Ï§ëÎ≥µ ?§ÌÅ¨Î°?Ïª®Ìä∏Î°§Îü¨ ?úÍ±∞)

  // --- ÎßàÍ∞ê Î∏åÎ¶¨???êÎèô) ---
  List<TfBriefing> _tfBriefs = const <TfBriefing>[];
  List<PeriodicBriefingRow> _periodicBriefs = const <PeriodicBriefingRow>[];



  final FuEngine _engine = FuEngine();
  FuState _s = FuState.initial();

  String _symbol = 'BTCUSDT';
  /// Chart timeframe: user wants to trade off 5m/15m.
  String _tf = '15m';
  final List<String> _tfs = const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'];

  /// Swing/zone timeframe (targets/structure): 1h+ Í∏∞Ï?.
  /// Í∏∞Î≥∏?Ä "?§Ïúô(4?úÍ∞Ñ)".
  String _swingTf = '4h';

  /// ?§Ïúô Í∏∞Ï????¨Ïö©?êÍ? ?¥Ìï¥?òÍ∏∞ ?¨Ïö¥ "?ÑÎ°ú?åÏùº"Î°??†ÌÉù
  /// - ?®Ì?: 1?úÍ∞Ñ Íµ¨Í∞Ñ
  /// - ?§Ïúô: 4?úÍ∞Ñ Íµ¨Í∞Ñ
  /// - Ï§ëÌà¨: 1??Íµ¨Í∞Ñ
  /// - ?•Ìà¨: 1Ï£?Íµ¨Í∞Ñ
  /// - ÏßÅÏ†ë: ?¨Ïö©?êÍ? Íµ¨Í∞Ñ??ÏßÅÏ†ë ?†ÌÉù
  String _swingProfile = '?§Ïúô';

  /// Future projection controls
  int _padBars = 120; // right-side future space
  int _horizonBars = 34; // how far the path extends (in bars)

  Timer? _timer;
  bool _pathMode = false;
  // ?úÏãú ?†Í?(Ï∞®Ìä∏ Î≥∏Î¨∏ ?§Î≤Ñ?àÏù¥)
  bool _showReaction = true;
  bool _showStructure = true;
  bool _showBoxes = true;
  // ÎØ∏ÎãàÎ©Ä UI Í∏∞Î≥∏Í∞? ÎØ∏ÎûòÍ≤ΩÎ°ú ?µÏÖò ?®ÎÑê?Ä ?®Í?(Ï∞®Ìä∏ ÏßÄ?ÄÎ∂?Î∞©Ï?)
  bool _showPathPanel = false;


  @override
  void initState() {
    super.initState();

    _closeWatcher.infos.addListener(() {
      if (!mounted) return;
      setState(() => _closeInfos = _closeWatcher.infos.value);
    });

    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());

    // Ï≤??åÎçî ???îÎ©¥ ?êÎèô ÎßûÏ∂§(?πÌûà Windows Ï∞?ÎπÑÏú® Íπ®Ïßê Î∞©Ï?)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _fitChartToView();
    });
  }

  void _resetChartView() {
    _viewerTc.value = Matrix4.identity();
  }

  void _zoomChart(double factor) {
    final m = _viewerTc.value.clone();
    final currentScale = m.getMaxScaleOnAxis();
    final next = (currentScale * factor).clamp(0.6, 3.2);
    final ratio = next / (currentScale == 0 ? 1.0 : currentScale);
    _viewerTc.value = m..scale(ratio);
  }

  void _fitChartToView() {
    final ctx = _chartKey.currentContext;
    if (ctx == null) {
      _resetChartView();
      return;
    }
    final chartBox = ctx.findRenderObject();
    final rootBox = context.findRenderObject();
    if (chartBox is! RenderBox || rootBox is! RenderBox) {
      _resetChartView();
      return;
    }

    // ?îÎ©¥(Î∑∞Ìè¨?? ?ÄÎπ?Ï∞®Ìä∏ ?ÅÏó≠??ÏµúÎ???"???îÎ©¥?? ?§Ïñ¥?§Í≤å ?§Ï???Í≥ÑÏÇ∞
    final vp = rootBox.size;
    final child = chartBox.size;
    if (vp.width <= 0 || vp.height <= 0 || child.width <= 0 || child.height <= 0) {
      _resetChartView();
      return;
    }

    // ?òÎã® Ïπ¥Îìú/?úÌä∏Í∞Ä Í∞ÄÎ¶¨Îäî ?ÅÏó≠??Í≥†Î†§???ΩÍ∞Ñ ?¨Ïú†Î•???    final safe = MediaQuery.of(context).padding;
    final reservedBottom = 210.0 + safe.bottom;
    final availW = vp.width - 18.0; // Ï¢åÏö∞ ?¨Î∞±
    final availH = (vp.height - reservedBottom).clamp(200.0, vp.height);

    final sx = availW / child.width;
    final sy = availH / child.height;
    final s = (sx < sy ? sx : sy).clamp(0.6, 1.35);

    _viewerTc.value = Matrix4.identity()..scale(s);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _closeWatcher.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final st = await _engine.fetch(
        symbol: _symbol,
        tf: _mapTfLabelToEngine(_tf),
        allowNetwork: true,
        safeMode: true,
      );
      if (!mounted) return;
      final tfBriefs = <TfBriefing>[
        TfBriefingEngine.build(s: st, tf: '5m', online: st.candles.isNotEmpty),
        TfBriefingEngine.build(s: st, tf: '15m', online: st.candles.isNotEmpty),
        TfBriefingEngine.build(s: st, tf: '1h', online: st.candles.isNotEmpty),
        TfBriefingEngine.build(s: st, tf: '4h', online: st.candles.isNotEmpty),
      ];

      // ?†Ô∏è Ï£?????Î∞??? Î∏åÎ¶¨?ëÏ? ?∞Ïä§?¨ÌÉë?êÏÑú DB(sqflite) ?∞Ì????¥ÏäàÍ∞Ä ?????àÏñ¥
      // ?∞Ïù¥??Î°úÎî©(Ï∞®Ìä∏/?†Ìò∏)???àÎ? ÎßâÏ? ?äÎèÑÎ°?"ÎπÑÎèôÍ∏?+ ?§Ìå® Î¨¥Ïãú"Î°?Î∂ÑÎ¶¨.
      if (!mounted) return;
      setState(() {
        _s = st;
        _tfBriefs = tfBriefs;
        // _periodicBriefs??Î∞±Í∑∏?ºÏö¥?úÏóê??Ï±ÑÏ?(?§Ìå®?¥ÎèÑ UI/Ï∞®Ìä∏ ?†Ï?)
      });

      // Î∞±Í∑∏?ºÏö¥???àÏ†Ñ) Î°úÎî©: ?§Ìå®?òÎ©¥ Í∑∏ÎÉ• ?§ÌÇµ
      Future(() async {
        try {
          final periodic = <PeriodicBriefingRow>[];
          for (final tf in const ['1d', '1w', '1m', '1y']) {
            final row = await PeriodicBriefingEngine.ensure(tf: tf, state: st);
            if (row != null) periodic.add(row);
          }
          if (!mounted) return;
          setState(() => _periodicBriefs = periodic);
        } catch (_) {
          // Windows/desktop?êÏÑú sqflite ÎØ∏Ï??????∞Ì????§Ìå®??Î¨¥Ïãú
        }
      });
      _closeWatcher.updateState(st);
      if (_closeInfos.isEmpty) { _closeWatcher.start(st); }
    } catch (_) {
      // ?§Ìä∏?åÌÅ¨/?àÏù¥?∏Î¶¨Î∞??±Ï? UIÎ•?Íπ®Ï? ?äÎèÑÎ°?Ï°∞Ïö©??Î¨¥Ïãú
    }
  }

  // ??Ï§?ÎßûÏ∂§ Ïª®Ìä∏Î°??? ?ÄÏπ? PC: ??+ Î≤ÑÌäº)
  Widget _zoomControls({required double bottomOffset}) {
    Widget btn(IconData icon, String tip, VoidCallback onTap) {
      return InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Icon(icon, size: 18, color: const Color(0xFFE6F6FF)),
        ),
      );
    }

    return Positioned(
      right: 14,
      bottom: bottomOffset + 12,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0B1220).withOpacity(0.55),
              border: Border.all(color: const Color(0xFF2A405F).withOpacity(0.45)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                btn(Icons.zoom_out, 'Ï∂ïÏÜå', () => _zoomChart(0.90)),
                btn(Icons.center_focus_strong, 'ÎßûÏ∂§', _fitChartToView),
                btn(Icons.zoom_in, '?ïÎ?', () => _zoomChart(1.10)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // UI ?ºÎ≤®(1D/1W/1M) -> ?îÏßÑ tf
  String _mapTfLabelToEngine(String tf) {
    switch (tf) {
      case '1D':
        return '1d';
      case '1W':
        return '1w';
      case '1M':
        return '1mth';
      default:
        return tf;
    }
  }

  String _tfKo(String tf) {
    if (tf == '5m') return '5Î∂?;
    if (tf == '15m') return '15Î∂?;
    if (tf == '1h') return '1?úÍ∞Ñ';
    if (tf == '4h') return '4?úÍ∞Ñ';
    if (tf == '1d') return '?ºÎ¥â';
    if (tf == '1w') return 'Ï£ºÎ¥â';
    if (tf == '1m') return '?¨Î¥â';
    if (tf == '1y') return '?ÑÎ¥â';
    return tf;
  }

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);
    final livePrice = _s.price;

    final sz = MediaQuery.of(context).size;
    final chartBottomPad = (sz.height * 0.20 + 24).clamp(92.0, 220.0);
    final safeInset = EdgeInsets.fromLTRB(10, 10, 10, chartBottomPad + 12);

    return Scaffold(
      backgroundColor: theme.bg,
      appBar: AppBar(
        title: const Text('Fulink Pro'),
        actions: [
          _tfDrop(theme),
          const SizedBox(width: 6),
          _symbolDrop(theme),
          const SizedBox(width: 10),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            // ??Ï∞®Ìä∏???ÑÏ≤¥ Î∞∞Í≤Ω?ºÎ°ú ?¨Í≤å ?†Ï?
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  12,
                  10,
                  12,
                  // ?òÎã® ?úÌä∏(ÏµúÏÜå 20%)??Í∞Ä?§Ï????ÅÏó≠ÎßåÌÅº ?êÎèô ?ïÎ≥¥
                  chartBottomPad,
                ),
                // ??Í±∞Îûò?åÏ≤ò?? Ï∞®Ìä∏ ?ïÎ?/?¥Îèô(?ÄÏπ?Ï§?
                // - ?òÎã® ?úÎûòÍ∑??úÌä∏???úÌä∏ ?ÅÏó≠?êÏÑúÎß??ôÏûë
                child: ClipRect(
                  child: InteractiveViewer(
                    panEnabled: true,
                    scaleEnabled: true,
                    transformationController: _viewerTc,
                    minScale: 0.6,
                    maxScale: 3.2,
                    boundaryMargin: const EdgeInsets.all(200),
                    child: RepaintBoundary(
                      key: _chartKey,
                      child: _chartArea(theme, livePrice),
                    ),
                  ),
                ),
              ),
            ),

            _zoomControls(bottomOffset: chartBottomPad),
            // ???ÅÎã® ?ÅÌÉúÎ∞? Î™®Îìú/LOCK/WATCH/?úÏÑ± Î™®Îìà ?úÎàà??            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: ActivationStatusBar(
                isFutureMode: _pathMode,
                isLocked: _s.noTrade,
                decisionPct: (((_s.probFinal ?? 0.0) * 100.0).clamp(0.0, 100.0)).toDouble(),
              ),
            ),


            // ???ÑÎûò ?®ÎÑê?Ä ?úÎûòÍ∑?20%~90%)Î°??ïÏû•/Ï∂ïÏÜå
            DraggableScrollableSheet(
              controller: _sheetCtl,
              snap: true,
              snapSizes: const [0.20, 0.45, 0.90],
              shouldCloseOnMinExtent: false,
              initialChildSize: 0.24,
              minChildSize: 0.20,
              maxChildSize: 0.90,
              builder: (context, sheetController) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
                  child: _analysisSheet(theme, sheetController),
                );
              },
            ),

            // Í≥†Ï†ï Í≤∞Ï†ï Î∞?            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(top: false, child: _decisionBar(theme)),
            ),

            // PATH ?†Í? Î≤ÑÌäº (?∞Ï∏° ?òÎã®)
            Positioned(
              right: 14,
              bottom: 74,
              child: _pathButton(theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chartArea(NeonTheme theme, double livePrice) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      child: _pathMode
          ? _futurePathLive(theme)
          : _miniChart(theme, livePrice),
    );
  }

  Widget _miniChart(NeonTheme theme, double livePrice) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: MiniChartV4(
        candles: _s.candles,
        fvgZones: _s.fvgZones,
        obZones: _s.obZones,
        bprZones: _s.bprZones,
        mbZones: _s.mbZones,
        title: '$_symbol  $_tf',
        tfKey: _tf,
        price: livePrice,
        s1: _s.s1,
        r1: _s.r1,
        structureTag: _s.structureTag,
        reactLevel: _s.reactLevel,
        reactLow: _s.reactLow,
        reactHigh: _s.reactHigh,
        bias: _s.signalDir,
        prob: _s.signalProb,
        showPlan: _s.showSignal,
        entry: _s.entry,
        stop: _s.stop,
        target: _s.target,
        overlayLines: const [],
        overlayLabel: '',
        heightOverride: double.infinity,
        showBOS: true,
        showCHoCH: true,
      ),
    );
  }

  /// PATH(ÎØ∏ÎûòÍ≤ΩÎ°ú) - ?§ÏãúÍ∞?Ï∫îÎì§ Í∏∞Ï? ?¨Í≥Ñ??  /// - FuturePathEngine(v1 ?àÏ†Ñ ?îÏßÑ)Î°?MAIN/ALT/FAIL ?ùÏÑ±
  /// - PathChartLite(Í∞ÄÎ≤ºÏö¥ Ï∫îÎì§/?ºÏù∏ Ï∞®Ìä∏) ?ÑÏóê FuturePathPainter ?§Î≤Ñ?àÏù¥
  Widget _futurePathLive(NeonTheme theme) {
    final candles = _s.candles;
    final last = candles.isNotEmpty ? candles.last.close : _s.price;
    final anchorIdx = candles.isNotEmpty ? candles.length - 1 : 0;

    // Ï∫îÎì§ ÎßàÍ∞ê ÏßÅÌõÑ(?ïÏ†ï) ???ºÏù∏ ?êÍªçÍ≤?/ Í∑??∏Îäî ?àÍ≥†(?áÍ≤å)
    final confirmed = _justClosed(_tf);

    // Chart(5m/15m) ?ÑÏóê??Î≥¥Îêò, Î™©Ìëú/Íµ¨Ï°∞??1h+ ?§Ïúô Í∏∞Ï??ºÎ°ú ÎΩëÎäî??
    final swingGroup = _swingGroup(_tf, _swingTf);
    final swingCandles = FuturePathEngine.aggregateByGroup(candles, swingGroup);

    final dto = FuturePathEngine.build(
      symbol: _symbol,
      tf: _tf,
      structureTag: _s.structureTag,
      candles: candles,
      swingCandles: swingCandles,
      reactLow: _s.reactLow,
      reactHigh: _s.reactHigh,
      mtfPulse: _s.mtfPulse,
      selected: 0,

      // ?ïÌôï??Í∞ÄÏ§?Íµ¨Ï°∞+?∏Î†•+ÎßàÍ∞ê)
      closeScore: _s.closeScore,
      breakoutScore: _s.breakoutScore,
      volumeScore: _s.volumeScore,
      forceScore: _s.forceScore,
      absorptionScore: _s.absorptionScore,
      defenseScore: _s.defenseScore,
      distributionScore: _s.distributionScore,
      sweepRisk: _s.sweepRisk,
    );

    final isLong = _isLongBias(_s);
    final invalid = dto.levels.inv;
    final target = dto.levels.t2;
    final rr = _rr(last, invalid, target);

    // wave: anchor + main poly prices
    final wave = <double>[last];
    for (final p in dto.main.poly) {
      if ((p.price - wave.last).abs() < 1e-9) continue;
      wave.add(p.price);
    }
    if (wave.length < 6) {
      while (wave.length < 6) {
        wave.add(target);
      }
    } else if (wave.length > 7) {
      wave.removeRange(6, wave.length);
    }

    final fp = FuturePathPriceDTO(
      tf: _tf,
      anchor: last,
      target: target,
      invalid: invalid,
      pMain: dto.probMain,
      rrX10: (rr * 10).round().clamp(0, 999),
      dir: isLong ? 'LONG' : 'SHORT',
      wavePrices: wave,
    );

    return ClipRRect(
      key: const ValueKey('path'),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        color: theme.card,
        child: LayoutBuilder(
          builder: (context, c) {
            return PathChartLite(
              candles: candles,
              title: '$_symbol  $_tf  ÎØ∏ÎûòÍ≤ΩÎ°ú',
              theme: theme,
              // ??ÎØ∏ÎûòÍ≤ΩÎ°ú(horizon)Í∞Ä projectionBarsÎ≥¥Îã§ ?¨Î©¥ xÏ¢åÌëúÍ∞Ä ?∞Ï∏° ?ùÏúºÎ°??åÎ†§Î≤ÑÎ†§??              //    ???ºÎ≤®??Î™®Îëê ?§Î•∏Ï™ΩÏóê Î™∞Î¶¨???ÑÏÉÅ???ùÍ?.
              //    ????ÉÅ projectionBarsÍ∞Ä horizonÎ≥¥Îã§ ?¨Í±∞??Í∞ôÍ≤å ?†Ï?.
              projectionBars: math.max(_padBars, _horizonBars + 4),
              scrollableFuture: true,
              childBuilder: (indexToX, priceToY, yToPrice, startIndex, visibleCount, h, topPad, bottomPad) {
                // painter???ÑÏ≤¥ ?∏Îç±?§Î? Í∏∞Î? ??visible ?ÅÏó≠ Í∏∞Ï??ºÎ°ú Î≥Ä??                double ixToX(int idx) => indexToX(idx);
                double prToY(double p) => priceToY(p);

                final viewport = Rect.fromLTWH(0, 0, c.maxWidth, c.maxHeight);
                final safeInset = EdgeInsets.fromLTRB(
                  10,
                  10,
                  10,
                  (viewport.height * 0.22 + 24).clamp(92.0, 220.0) + 12,
                );

                // Î∞òÏùëÍµ¨Í∞Ñ(reactLow/high) -> ?ΩÏ? Rect
                Rect? reactRect;
                final lo = _s.reactLow;
                final hi = _s.reactHigh;
                if (lo > 0 && hi > 0 && (hi - lo).abs() > 1e-9) {
                  final y1 = prToY(hi);
                  final y2 = prToY(lo);
                  final top = y1 < y2 ? y1 : y2;
                  final bottom = y1 < y2 ? y2 : y1;
                  reactRect = Rect.fromLTRB(0, top, c.maxWidth, bottom);
                }

                // ?ïÎ•†/?ºÎ≤® Í≥ÑÏÇ∞(Í∞ÑÎã® Î≤ÑÏ†Ñ)
                final basePct = fp.pMain.toDouble();
                final isResistance = _s.zoneBias.toUpperCase() == 'SHORT';
                final split = ProbCalc.splitReversalBreakout(
                  basePct: basePct,
                  isResistance: isResistance,
                  trendStrong: _s.breakoutScore >= 65,
                );
                final tpProbs = ProbCalc.tpProbs(confidencePct: basePct, distFactor: 0.70);
                final tpEnd = Offset(ixToX(anchorIdx + _horizonBars), prToY(target));
                final entryPrice = _calcEntryFromZone(_s);
                final entryPos = Offset(ixToX(anchorIdx), prToY(entryPrice));

                return Stack(
                  children: [
                    // ??FUTURE MODE HUD(??Í∏ÄÎ°úÏö∞??TF ?§ÏúºÎ°??êÎèô ?µÏùº)
                    Positioned.fill(
                      child: FutureModeOverlayThemed(
                        enabled: true,
                        tf: _tf,
                        confidencePct: basePct,
                        reactionPct: split.reversalPct,
                        invalidPct: split.breakoutPct,
                        subtitle: 'Î∞òÏùë/Î¨¥Ìö® ?§ÏãúÍ∞??úÍ∏∞',
                      ),
                    ),

                    // ??Î∞òÏùëÍµ¨Í∞Ñ ?ïÎ•†(ÏßÄÏßÄ/?Ä??
                    if (reactRect != null && DensityGate.showZoneLabels(_tf))
                      ZoneProbLabel(
                        zoneRect: reactRect!,
                        viewport: viewport,
                        title: isResistance ? '?Ä?? : 'ÏßÄÏßÄ',
                        probPct: basePct,
                        tone: isResistance ? const Color(0xFFFF4D6D) : const Color(0xFF2BFFB7),
                        safeInsets: safeInset,
                      ),

                    // ???Ä???ïÎ•†(Î∞òÏ†Ñ/?åÌåå or Î∞òÎì±/Î∂ïÍ¥¥)
                    if (reactRect != null && DensityGate.showZoneLabels(_tf))
                      DualProbLabelSmart(
                        zoneRect: reactRect!,
                        viewport: viewport,
                        isResistance: isResistance,
                        aPct: split.reversalPct,
                        bPct: split.breakoutPct,
                        safeInsets: safeInset,
                      ),

                    // ???îÌä∏Î¶?ÎßàÏª§(?ïÎ•†>=20%Îß?SIGNAL)
                    if (DensityGate.showEntryMarkers(_tf))
                      EntryMarker(
                        pos: entryPos,
                        viewport: viewport,
                        dir: fp.dir,
                        probPct: basePct,
                        rr: rr,
                        safeInsets: safeInset,
                      ),

                    // ??Î™©Ìëú ?ÑÎã¨?ïÎ•†(TP1~TP3)
                    if (DensityGate.showEntryMarkers(_tf))
                      TargetsProbLabelSmart(
                        tpEnd: tpEnd,
                        viewport: viewport,
                        tpsPct: tpProbs,
                        safeInsets: safeInset,
                      ),

                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(
                          painter: ReactionZonesPainter(
                            s: _s,
                            theme: theme,
                            candles: candles,
                            indexToX: ixToX,
                            priceToY: prToY,
                            startIndex: startIndex,
                            visibleCount: visibleCount,
                            projectionBars: math.max(_padBars, _horizonBars + 4),
                            showReaction: _showReaction,
                            showStructure: _showStructure,
                            showBoxes: _showBoxes,
                          ),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(
                          painter: FuturePathPainter(
                            fp: fp,
                            cleanMode: true,
                            indexToX: ixToX,
                            priceToY: prToY,
                            anchorIndex: anchorIdx,
                            horizon: _horizonBars,
                            confirmed: confirmed,
                            structureTag: _s.structureTag,
                            breakLevel: _s.breakLevel,
                            // ??ÏßÑÏûÖÍ∞Ä??"?ÑÏû¨Í∞Ä"Í∞Ä ?ÑÎãà??"Î∞òÏùëÍµ¨Í∞Ñ" Í∏∞Î∞ò?ºÎ°ú ?°Îäî??                            // (Î∞òÏùëÍµ¨Í∞Ñ???ÜÏùÑ ?åÎßå Í∏∞Ï°¥ Í∞?fallback)
                            entryPrice: _calcEntryFromZone(_s),
                            showTpSlMarkers: false,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      right: 10,
                      top: 10,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _pathBadge(theme, fp),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () => setState(() => _showPathPanel = !_showPathPanel),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    color: theme.bg.withOpacity(0.55),
                                    border: Border.all(color: theme.line.withOpacity(0.22)),
                                  ),
                                  child: Text('?µÏÖò', style: TextStyle(color: theme.textStrong, fontSize: 10, fontWeight: FontWeight.w900)),
                                ),
                              ),
                            ],
                          ),
                          if (_showPathPanel) ...[
                            const SizedBox(height: 8),
                            _pathControls(theme),
                          ],
                        ],
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
  int _tfToMin(String tf) {
    switch (tf) {
      case '5m': return 5;
      case '15m': return 15;
      case '1h': return 60;
      case '4h': return 240;
      case '1d': return 1440;
      case '1w': return 10080;
      case '1m': return 43200; // 30??Í∑ºÏÇ¨
      case '1y': return 525600; // 365??Í∑ºÏÇ¨
      default: return 15;
    }
  }

  bool _justClosed(String tf) {
    final sec = _tfToMin(tf) * 60;
    if (sec <= 0) return false;
    final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final into = nowSec % sec;
    // ÎßàÍ∞ê ??8Ï¥??¥ÎÇ¥Î•?"?ïÏ†ï"?ºÎ°ú Í∞ÑÏ£º(?àÍ≥†/?ïÏ†ï Íµ¨Î∂Ñ??
    return into < 8;
  }


  int _swingGroup(String chartTf, String swingTf) {
    final baseMin = _tfToMin(chartTf);
    final swingMin = _tfToMin(swingTf);
    return (swingMin ~/ baseMin).clamp(1, 999);
  }

  Widget _pathControls(NeonTheme theme) {
    Widget chip(String t, bool on, VoidCallback fn) {
      return GestureDetector(
        onTap: fn,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: (on ? theme.card : theme.bg).withOpacity(0.70),
            border: Border.all(color: theme.line.withOpacity(on ? 0.45 : 0.22)),
          ),
          child: Text(t, style: TextStyle(color: theme.textStrong, fontSize: 10, fontWeight: FontWeight.w900)),
        ),
      );
    }

    String tfKo(String tf) {
      if (tf == '5m') return '5Î∂?;
      if (tf == '15m') return '15Î∂?;
      if (tf == '1h') return '1?úÍ∞Ñ';
      if (tf == '4h') return '4?úÍ∞Ñ';
      if (tf == '1d') return '?ºÎ¥â';
      if (tf == '1w') return 'Ï£ºÎ¥â';
      if (tf == '1m') return '?¨Î¥â';
      if (tf == '1y') return '?ÑÎ¥â';
      return tf;
    }

    String swingKo(String tf) {
      if (tf == '1h') return '1?úÍ∞Ñ';
      if (tf == '4h') return '4?úÍ∞Ñ';
      if (tf == '1d') return '?ºÎ¥â';
      if (tf == '1w') return 'Ï£ºÎ¥â';
      if (tf == '1m') return '?¨Î¥â';
      if (tf == '1y') return '?ÑÎ¥â';
      return tf;
    }

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: theme.bg.withOpacity(0.55),
        border: Border.all(color: theme.line.withOpacity(0.20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // ÎØ∏ÎûòÍ≤ΩÎ°ú ?§Ï†ï(?µÏã¨Îß?
          // ??Ïª®Ìä∏Î°?Í≥ºÎ? Î∞©Ï?: Í∞ÄÎ°??§ÌÅ¨Î°?1Ï§?          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                // ÎØ∏Îûò ?¨Î∞±(?§Î•∏Ï™?Í≥µÍ∞Ñ)
                chip('?¨Î∞±80', _padBars == 80, () => setState(() => _padBars = 80)),
                const SizedBox(width: 6),
                chip('?¨Î∞±120', _padBars == 120, () => setState(() => _padBars = 120)),
                const SizedBox(width: 6),
                chip('?¨Î∞±200', _padBars == 200, () => setState(() => _padBars = 200)),
                const SizedBox(width: 10),
                chip('ÏßßÍ≤å', _horizonBars == 13, () => setState(() => _horizonBars = 13)),
                const SizedBox(width: 6),
                chip('Ï§ëÍ∞Ñ', _horizonBars == 34, () => setState(() => _horizonBars = 34)),
                const SizedBox(width: 6),
                chip('Í∏∏Í≤å', _horizonBars == 55, () => setState(() => _horizonBars = 55)),
                const SizedBox(width: 10),
                chip('?§Ïúô1H', _swingTf == '1h', () => setState(() => _swingTf = '1h')),
                const SizedBox(width: 6),
                chip('?§Ïúô4H', _swingTf == '4h', () => setState(() => _swingTf = '4h')),
                const SizedBox(width: 6),
                chip('?§Ïúô1D', _swingTf == '1d', () => setState(() => _swingTf = '1d')),
                const SizedBox(width: 6),
                chip('?§Ïúô1W', _swingTf == '1w', () => setState(() => _swingTf = '1w')),
                const SizedBox(width: 6),
                chip('?§Ïúô1M', _swingTf == '1m', () => setState(() => _swingTf = '1m')),
                const SizedBox(width: 6),
                chip('?§Ïúô1Y', _swingTf == '1y', () => setState(() => _swingTf = '1y')),
                const SizedBox(width: 10),
                // ?úÏãú ?†Í?
                chip('Î∞òÏùë', _showReaction, () => setState(() => _showReaction = !_showReaction)),
                const SizedBox(width: 6),
                chip('Íµ¨Ï°∞', _showStructure, () => setState(() => _showStructure = !_showStructure)),
                const SizedBox(width: 6),
                chip('Î∞ïÏä§', _showBoxes, () => setState(() => _showBoxes = !_showBoxes)),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Ï∞®Ìä∏ ${tfKo(_tf)}  Íµ¨Í∞Ñ ${swingKo(_swingTf)}',
            style: TextStyle(color: theme.textSecondary.withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _pathBadge(NeonTheme theme, FuturePathPriceDTO fp) {
    final dirKo = fp.dir == 'LONG' ? 'Î°? : (fp.dir == 'SHORT' ? '?? : 'Ï§ëÎ¶Ω');
    final label = '$dirKo  ${fp.pMain}%  ?êÏùµÎπ?${(fp.rrX10 / 10).toStringAsFixed(1)}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: theme.bg.withOpacity(0.65),
        border: Border.all(color: theme.line.withOpacity(0.25)),
      ),
      child: Text(label, style: TextStyle(color: theme.textStrong, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }

  bool _isLongBias(FuState s) {
    // 1) Î™ÖÏãú ?†Ìò∏ ?∞ÏÑ†
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('UP')) return true;
    if (d.contains('SHORT') || d.contains('DOWN')) return false;
    // 2) MTF ?§ÏàòÍ≤?    int up = 0, dn = 0;
    for (final p in s.mtfPulse.values) {
      final dd = p.dir.toUpperCase();
      if (dd == 'LONG' || dd == 'UP') up++;
      if (dd == 'SHORT' || dd == 'DOWN') dn++;
    }
    return up >= dn;
  }

  double _rr(double anchor, double invalid, double target) {
    final risk = (anchor - invalid).abs();
    final reward = (target - anchor).abs();
    if (risk <= 0) return 0;
    return reward / risk;
  }

  double _calcEntryFromZone(FuState s) {
    // Î∞òÏùë Íµ¨Í∞Ñ???àÏúºÎ©?"ÏßÑÏûÖ"??Í∑?Íµ¨Í∞Ñ ?àÏúºÎ°??°Îäî???ÑÏû¨Í∞Ä?Ä Î∂ÑÎ¶¨)
    if (s.reactLow > 0 && s.reactHigh > 0 && s.reactHigh >= s.reactLow) {
      return (s.reactLow + s.reactHigh) / 2.0;
    }
    // fallback
    if (s.entry > 0) return s.entry;
    return s.price;
  }

  
  Widget _analysisSheet(NeonTheme theme, ScrollController sc) {
    return DefaultTabController(
      length: 4,
      child: Container(
        decoration: BoxDecoration(
          color: theme.bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          border: Border.all(color: theme.line.withOpacity(0.22)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 8),
            // ???úÎûòÍ∑??∏Îì§(?¨Í∏∞?????ÑÎûòÎ°?Î∞ÄÎ©?Î¨¥Ï°∞Í±??®ÎÑê???ÄÏßÅÏù¥Í≤?Í∞ïÏ†ú)
            Builder(builder: (context) {
              void jumpBy(double dy) {
                final h = MediaQuery.of(context).size.height;
                if (h <= 0) return;
                final next = (_sheetCtl.size - (dy / h)).clamp(0.20, 0.90);
                _sheetCtl.jumpTo(next);
              }

              void toggle() {
                final cur = _sheetCtl.size;
                final target = cur < 0.35 ? 0.45 : (cur < 0.80 ? 0.90 : 0.24);
                _sheetCtl.animateTo(
                  target,
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                );
              }

              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: toggle,
                onVerticalDragUpdate: (d) => jumpBy(d.delta.dy),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Center(
                    child: Container(
                      width: 56,
                      height: 6,
                      decoration: BoxDecoration(
                        color: theme.line.withOpacity(0.38),
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 6),

            // ??Í≥†Ï†ï)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 12),
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: theme.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.line.withOpacity(0.22)),
              ),
              child: TabBar(
                indicator: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: theme.line.withOpacity(0.18),
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                labelColor: theme.textStrong,
                unselectedLabelColor: theme.textSecondary,
                labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
                unselectedLabelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                tabs: const [
                  Tab(text: '?îÏïΩ'),
                  Tab(text: '?úÎÇòÎ¶¨Ïò§'),
                  Tab(text: 'Ï¶ùÍ±∞10'),
                  Tab(text: 'Î°úÍ∑∏'),
                ],
              ),
            ),
            const SizedBox(height: 10),

            // ??Ï§ëÏöî: DraggableScrollableSheet??"?òÎÇò?? ScrollController(sc)Î•?ÏßÅÏ†ë ?∞Í≤∞?¥Ïïº
            //         ?êÍ????úÎûòÍ∑∏Î°ú ?úÌä∏Í∞Ä ?êÏó∞?§ÎüΩÍ≤??¨ÎùºÍ∞ÄÍ≥??ïÏû•) ?¥Î†§Í∞ÑÎã§.
            //         TabBarView + ?¨Îü¨ ListView??Í∞ôÏ? controllerÎ•?Í≥µÏú†?òÎ©¥
            //         Î™®Î∞î?ºÏóê???úÎûòÍ∑∏Í? Î®πÌÜµ/?ïÍ? ?ÑÏÉÅ???êÏ£º Î∞úÏÉù.
            //         ????Í∞úÏùò ?§ÌÅ¨Î°§Î∑∞Îß??êÍ≥†, ???¥Ïö©?Ä ?¥Î??êÏÑú ÍµêÏ≤¥?úÎã§.
            Expanded(
              child: Builder(builder: (context) {
                final tc = DefaultTabController.of(context);
                return AnimatedBuilder(
                  animation: tc,
                  builder: (context, _) {
                    final idx = tc.index;
                    return ScrollConfiguration(
                      behavior: const _NoGlowScroll(),
                      child: SingleChildScrollView(
                        controller: sc,
                        physics: const ClampingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 86),
                        child: _tabBody(theme, idx),
                      ),
                    );
                  },
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabBody(NeonTheme theme, int idx) {
    switch (idx) {
      case 0:
        return _tabSummaryBody(theme);
      case 1:
        return _tabScenarioBody(theme);
      case 2:
        return _tabEvidenceBody(theme);
      case 3:
      default:
        return _tabLogsBody(theme);
    }
  }

  Widget _tabSummaryBody(NeonTheme theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '?îÏïΩ', [
          _kv(theme, '?ÑÏû¨Í∞Ä', _s.price.toStringAsFixed(2)),
          _kv(theme, 'Î∞©Ìñ•', _s.signalKo.isEmpty ? _s.signalDir : _s.signalKo),
          _kv(theme, '?†Î¢∞??, '${_s.confidence}%'),
          _kv(theme, 'Ï¶ùÍ±∞', '${_s.evidenceHit}/${_s.evidenceTotal}'),
          const SizedBox(height: 6),
          _pill(theme, 'Íµ¨Í∞Ñ', _s.zoneName.isEmpty ? 'ÎØ∏Ï†ï' : _s.zoneName),
          const SizedBox(height: 6),
          if (_s.signalWhy.isNotEmpty)
            Text(
              _s.signalWhy,
              style: TextStyle(color: theme.fg.withOpacity(0.80), fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
        ]),
        const SizedBox(height: 10),
        _card(theme, '?µÏã¨ ?àÎ≤®', [
          _kv(theme, 'S1', _s.s1.toStringAsFixed(2)),
          _kv(theme, 'R1', _s.r1.toStringAsFixed(2)),
          _kv(theme, 'VWAP', _s.vwap.toStringAsFixed(2)),
          _kv(theme, 'Î∞òÏùëÍµ¨Í∞Ñ', '${_s.reactLow.toStringAsFixed(2)} ~ ${_s.reactHigh.toStringAsFixed(2)}'),
          _kv(theme, 'Íµ¨Ï°∞', _structureKo(_s.structureTag)),
        ]),
        const SizedBox(height: 10),
        _closeAndBriefCards(theme),
        const SizedBox(height: 10),
        _card(theme, 'Í≤∞Î°† ??Ï§?, [
          Text(
            _oneLineConclusion(),
            style: TextStyle(color: theme.textStrong, fontSize: 12, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text('??Î°??èÏ? ?ïÎ•† 20% ÎØ∏Îßå?¥Î©¥ ?úÍ?Îß?Ï£ºÏùò?ùÎ°úÎß??úÏãú', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
        ]),
      ],
    );
  }

  Widget _tabScenarioBody(NeonTheme theme) {
    final bool noTrade = _s.noTrade;
    final String dir = (_s.signalKo.isEmpty ? _s.signalDir : _s.signalKo);
    final int p = _s.signalProb;
    final String grade = _s.signalGrade;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '?ÑÏû¨ ?ÅÌÉú', [
          _pill(theme, 'Î∞©Ìñ•', dir),
          const SizedBox(height: 6),
          _kv(theme, '?ïÎ•†', '$p%'),
          _kv(theme, '?±Í∏â', grade),
          const SizedBox(height: 6),
          _noTradeBadge(theme),
        ]),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: 'Î°??úÎÇòÎ¶¨Ïò§',
            enabled: !noTrade && _s.zoneLongP >= 20,
            prob: _s.zoneLongP,
            entry: _s.entry,
            stop: _s.stop,
            targets: _s.zoneTargets,
            trigger: _s.zoneTrigger,
            invalid: _s.zoneInvalidLine,
            reasons: _s.zoneReasons),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: '???úÎÇòÎ¶¨Ïò§',
            enabled: !noTrade && _s.zoneShortP >= 20,
            prob: _s.zoneShortP,
            entry: _s.entry,
            stop: _s.stop,
            targets: _s.zoneTargets,
            trigger: _s.zoneTrigger,
            invalid: _s.zoneInvalidLine,
            reasons: _s.zoneReasons),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: 'Í¥ÄÎß?Ï£ºÏùò',
            enabled: true,
            prob: _s.zoneWaitP,
            entry: 0,
            stop: 0,
            targets: const <double>[0, 0, 0],
            trigger: 'Í∏∞Îã§Î¶? Î∞òÏùë Íµ¨Í∞Ñ ?ïÏù∏ ??,
            invalid: 'Ï∂îÍ≤© Í∏àÏ? / Î≥Ä?ôÏÑ± Í≥ºÎã§ ???¨Í∏∞',
            reasons: [
              if (noTrade) 'Í±∞Îûò ?†Í∏à: ${_s.noTradeReason}',
              if (_s.lossStreak >= 2) '?∞ÏÜç ?êÏã§: ${_s.lossStreak}??,
            ]),
      ],
    );
  }

  Widget _tabEvidenceBody(NeonTheme theme) {
    final items = _evidence10(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '10?Ä Ï¶ùÍ±∞(?êÏàò)', [
          Text('Í∏∞Ï?: 60 ?¥ÏÉÅ?¥Î©¥ Í∞ïÌï®(ON).', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
          const SizedBox(height: 10),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _evidenceRow(theme, e['label'] as String, e['score'] as int),
              )),
          const SizedBox(height: 6),
          _kv(theme, '?úÏÑ±', '${items.where((e) => (e['score'] as int) >= 60).length}/10'),
        ]),
      ],
    );
  }

  Widget _tabLogsBody(NeonTheme theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '?êÎèô Í∏∞Î°ù(?àÏ†ï)', [
          Text('?¨Í∏∞???†Ìò∏/ÏßÑÏûÖ/?êÏ†à/Î™©Ìëú/Í≤∞Í≥º(?????Ä?ÑÏïÑ?? Î°úÍ∑∏Í∞Ä ?ìÏûÖ?àÎã§.', style: TextStyle(color: theme.text, fontSize: 12, height: 1.25)),
          const SizedBox(height: 6),
          Text('ÏßÄÍ∏àÏ? ÎßàÍ∞ê Î∏åÎ¶¨??DB(Ï£?????Îß??úÏãú Ï§?', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
        ]),
        const SizedBox(height: 10),
        _card(theme, 'Ï§ëÏû•Í∏?Î∏åÎ¶¨??DB)', [
          if (_periodicBriefs.isEmpty)
            Text('?∞Ïù¥???ÜÏùå', style: TextStyle(color: theme.textSecondary, fontSize: 12))
          else
            ..._periodicBriefs.map((r) {
              final sum = _briefSummary(r.body);
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: theme.line.withOpacity(0.20)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.title, style: TextStyle(color: theme.textStrong, fontSize: 12, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Text(sum, style: TextStyle(color: theme.text, fontSize: 12), maxLines: 3, overflow: TextOverflow.ellipsis),
                  ],
                ),
              );
            }),
        ]),
      ],
    );
  }

  Widget _closeAndBriefCards(NeonTheme theme) {
    return Column(
      children: [
        _card(theme, 'ÎßàÍ∞ê(Ï¢ÖÍ?)', [
          CandleCloseBadgesV1(infos: _closeInfos.isEmpty ? const <CandleCloseInfo>[] : _closeInfos),
          const SizedBox(height: 8),
          Builder(builder: (context) {
            final cc = _closeCtx.analyze(_s);
            final bq = _bq.analyze(_s);
            final vq = _vq.analyze(_s);

            final byTf = <String, CandleCloseInfo>{
              for (final e in _closeInfos) e.tfLabel: e,
            };

            String tfKo(String tf) {
              switch (tf) {
                case '5m':
                  return '5Î∂?;
                case '15m':
                  return '15Î∂?;
                case '1h':
                  return '1?úÍ∞Ñ';
                case '4h':
                  return '4?úÍ∞Ñ';
                case '1d':
                  return '?ºÎ¥â';
                case '1w':
                  return 'Ï£ºÎ¥â';
                case '1m':
                  return '?¨Î¥â';
                case '1y':
                  return '?ÑÎ¥â';
                default:
                  return tf;
              }
            }

            CandleCloseInfo getInfo(String tf) {
              return byTf[tf] ??
                  CandleCloseUtil.evaluate(
                    tfLabel: tf,
                    price: _s.price,
                    vwap: _s.vwap,
                    score: _s.score,
                    confidence: _s.confidence,
                    risk: _s.risk,
                  );
            }

            Widget badge(String tf) {
              final i = getInfo(tf);
              final txt = '${tfKo(tf)} ${CandleCloseUtil.fmtRemain(i.remaining)} ¬∑ ${i.verdict}';
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: theme.bg.withOpacity(0.60),
                  border: Border.all(color: theme.line.withOpacity(0.22)),
                ),
                child: Text(txt, style: TextStyle(color: theme.textStrong, fontSize: 10, fontWeight: FontWeight.w900)),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('?§Ïùå ÎßàÍ∞ê', style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'].map(badge).toList(),
                ),
                const SizedBox(height: 10),
                _kv(theme, 'ÎßàÍ∞ê ?àÏßà', '${cc.labelKo} (${cc.score})'),
                _kv(theme, '?åÌåå ?àÏßà', '${bq.labelKo} (${bq.score})'),
                _kv(theme, 'Í±∞Îûò??, '${vq.labelKo} (x${vq.ratio.toStringAsFixed(2)})'),
                const SizedBox(height: 10),
                Text('Íµ¨Ï°∞/?∏Î†•', style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                _pill(theme, 'Íµ¨Ï°∞', _structureKo(_s.structureTag)),
                const SizedBox(height: 6),
                _miniBar(theme, 'Îß§Ïàò??, _s.forceScore),
                const SizedBox(height: 6),
                _miniBar(theme, 'Î∞©Ïñ¥', _s.defenseScore),
                const SizedBox(height: 6),
                _miniBar(theme, '?°Ïàò', _s.absorptionScore),
                const SizedBox(height: 6),
                _miniBar(theme, 'Î∂ÑÏÇ∞', _s.distributionScore),
                const SizedBox(height: 6),
                _miniBar(theme, '?®Ï†ï?ÑÌóò', _s.sweepRisk),
                const SizedBox(height: 4),
                Text(
                  '?îÏïΩ: ${cc.reason} / ${bq.reason} / ${vq.reason}',
                  style: TextStyle(color: theme.fg.withOpacity(0.75), fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            );
          }),
        ]),
        const SizedBox(height: 10),
        _card(theme, 'ÎßàÍ∞ê Î∏åÎ¶¨??, [
          ..._tfBriefs.map((b) {
            String badgeKo(String badge) {
              if (badge == 'B') return '?ÅÏäπ';
              if (badge == 'S') return '?òÎùΩ';
              return 'Í¥ÄÎß?;
            }

            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.line.withOpacity(0.20)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.line.withOpacity(0.14),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          badgeKo(b.badge),
                          style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${_tfKo(b.tf)} ÎßàÍ∞ê ¬∑ ?®Ï??úÍ∞Ñ ${b.remainText}',
                          style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w700),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    b.primaryScenario,
                    style: TextStyle(color: theme.fg.withOpacity(0.90), fontSize: 12),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '?§Ìå® ?? ${b.failScenario}',
                    style: TextStyle(color: theme.fg.withOpacity(0.70), fontSize: 11),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            );
          }),

          if (_periodicBriefs.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Ï§ëÏû•Í∏?Í∏∞Í∞Ñ ÎßàÍ∞ê) ?îÏïΩ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            ..._periodicBriefs.map((r) {
              final lines = r.body.split('\n');
              final l1 = lines.isNotEmpty ? lines[0] : '';
              final l2 = lines.length > 1 ? lines[1] : '';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: theme.line.withOpacity(0.20)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.title, style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Text(l1, style: TextStyle(color: theme.fg.withOpacity(0.90), fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (l2.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(l2, style: TextStyle(color: theme.fg.withOpacity(0.70), fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                ),
              );
            }),
          ],
        ]),
      ],
    );
  }

  Widget _tabScenario(NeonTheme theme, ScrollController sc) {
    final bool noTrade = _s.noTrade;
    final String dir = (_s.signalKo.isEmpty ? _s.signalDir : _s.signalKo);
    final int p = _s.signalProb;
    final String grade = _s.signalGrade;

    return ListView(
      controller: sc,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 86),
      children: [
        _card(theme, '?ÑÏû¨ ?ÅÌÉú', [
          _pill(theme, 'Î∞©Ìñ•', dir),
          const SizedBox(height: 6),
          _kv(theme, '?ïÎ•†', '$p%'),
          _kv(theme, '?±Í∏â', grade),
          const SizedBox(height: 6),
          _noTradeBadge(theme),
        ]),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: 'Î°??úÎÇòÎ¶¨Ïò§',
            enabled: !noTrade && _s.zoneLongP >= 20,
            prob: _s.zoneLongP,
            entry: _s.entry,
            stop: _s.stop,
            targets: _s.zoneTargets,
            trigger: _s.zoneTrigger,
            invalid: _s.zoneInvalidLine,
            reasons: _s.zoneReasons),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: '???úÎÇòÎ¶¨Ïò§',
            enabled: !noTrade && _s.zoneShortP >= 20,
            prob: _s.zoneShortP,
            entry: _s.entry,
            stop: _s.stop,
            targets: _s.zoneTargets,
            trigger: _s.zoneTrigger,
            invalid: _s.zoneInvalidLine,
            reasons: _s.zoneReasons),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: 'Í¥ÄÎß?Ï£ºÏùò',
            enabled: true,
            prob: _s.zoneWaitP,
            entry: 0,
            stop: 0,
            targets: const <double>[0, 0, 0],
            trigger: 'Í∏∞Îã§Î¶? Î∞òÏùë Íµ¨Í∞Ñ ?ïÏù∏ ??,
            invalid: 'Ï∂îÍ≤© Í∏àÏ? / Î≥Ä?ôÏÑ± Í≥ºÎã§ ???¨Í∏∞',
            reasons: [
              if (noTrade) 'Í±∞Îûò ?†Í∏à: ${_s.noTradeReason}',
              if (_s.lossStreak >= 2) '?∞ÏÜç ?êÏã§: ${_s.lossStreak}??,
            ]),
      ],
    );
  }

  Widget _noTradeBadge(NeonTheme theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.line.withOpacity(0.22)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _s.noTrade ? '?êÎèô ?†Í∏à' : 'Í±∞Îûò Í∞Ä??,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: _s.noTrade ? const Color(0xFFFF6B6B) : const Color(0xFF55EFc4),
              ),
            ),
          ),
          if (_s.noTrade && _s.noTradeReason.isNotEmpty)
            Expanded(
              flex: 2,
              child: Text(
                '?¥Ïú†: ${_s.noTradeReason}',
                style: TextStyle(color: theme.textSecondary, fontSize: 11),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }

  Widget _scenarioCard(
    NeonTheme theme, {
    required String title,
    required bool enabled,
    required int prob,
    required double entry,
    required double stop,
    required List<double> targets,
    required String trigger,
    required String invalid,
    required List<String> reasons,
  }) {
    final showPlan = enabled && entry > 0 && stop > 0;
    final t1 = targets.isNotEmpty ? targets[0] : 0.0;
    final t2 = targets.length > 1 ? targets[1] : 0.0;
    final t3 = targets.length > 2 ? targets[2] : 0.0;

    return _card(theme, title, [
      _kv(theme, '?úÏãú', enabled ? 'ÏßÑÏûÖ ?ÄÍ∏? : 'Í¥ÄÎß?Ï£ºÏùò'),
      _kv(theme, '?ïÎ•†', '$prob%'),
      const SizedBox(height: 6),
      if (showPlan) ...[
        _kv(theme, 'ÏßÑÏûÖ', entry.toStringAsFixed(2)),
        _kv(theme, '?êÏ†à', stop.toStringAsFixed(2)),
        _kv(theme, 'Î™©Ìëú', '${t1.toStringAsFixed(2)} / ${t2.toStringAsFixed(2)} / ${t3.toStringAsFixed(2)}'),
      ] else
        Text('ÏßÑÏûÖ/?êÏ†à/Î™©Ìëú: Ï°∞Í±¥ Ï∂©Ï°± ???úÏãú', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
      const SizedBox(height: 8),
      Text('ÏßÑÏûÖ Ï°∞Í±¥: $trigger', style: TextStyle(color: theme.text, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      Text('Ï£ºÏùò/Î¨¥Ìö®: $invalid', style: TextStyle(color: theme.textSecondary, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 6),
      ...reasons.take(3).map((r) => Text('??$r', style: TextStyle(color: theme.textSecondary, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis)),
      const SizedBox(height: 6),
      const Text("??ÏßÑÏûÖ?Ä 'Î∞òÏùë Íµ¨Í∞Ñ?êÏÑú ÏßÄ?? ?ïÏù∏ ??, style: TextStyle(fontSize: 10, color: Color(0xCCFFFFFF))),
    ]);
  }

  Widget _tabEvidence(NeonTheme theme, ScrollController sc) {
    final items = _evidence10(theme);
    return ListView(
      controller: sc,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 86),
      children: [
        _card(theme, '10?Ä Ï¶ùÍ±∞(?êÏàò)', [
          Text('Í∏∞Ï?: 60 ?¥ÏÉÅ?¥Î©¥ Í∞ïÌï®(ON).', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
          const SizedBox(height: 10),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _evidenceRow(theme, e['label'] as String, e['score'] as int),
              )),
          const SizedBox(height: 6),
          _kv(theme, '?úÏÑ±', '${items.where((e) => (e['score'] as int) >= 60).length}/10'),
        ]),
      ],
    );
  }

  List<Map<String, Object>> _evidence10(NeonTheme theme) {
    // 10?Ä Ï¶ùÍ±∞Î•??úÎàÑÍµ¨ÎÇò ?¥Ìï¥?òÎäî ?úÍ? ?ºÎ≤®?ùÎ°ú ?∏Ï∂ú(ÏΩîÎìú/?ÑÎìúÎ™ÖÏ? ?ÅÏñ¥ ?†Ï?)
    return [
      {'label': '?∏Î†• Ï∂îÏ†Å', 'score': _s.forceScore},
      {'label': 'Í≥†Îûò ?âÎèô', 'score': _s.whaleScore},
      {'label': 'Í±∞Îûò??Íµ¨Ï°∞', 'score': _s.volumeScore},
      {'label': 'FVG/BPR', 'score': (_s.fvgZones.isNotEmpty || _s.bprZones.isNotEmpty) ? 65 : 45},
      {'label': '?§ÎçîÎ∂??†Îèô??, 'score': _s.obImbalance},
      {'label': '?Ä???¨Ï???, 'score': (_s.roiOk ? 65 : 45)},
      {'label': 'Íµ¨Ï°∞ ?®ÌÑ¥', 'score': _s.breakoutScore},
      {'label': '?®Ï≤¥???¨Î¶¨', 'score': 60},
      {'label': 'Í±∞Ïãú ÏßÄ??, 'score': 60},
      {'label': 'AI ?§Ï∞® Î≥¥Ï†ï', 'score': (_s.lossStreak == 0 ? 60 : 45)},
    ];
  }

  Widget _evidenceRow(NeonTheme theme, String label, int score) {
    final on = score >= 60;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.line.withOpacity(0.22)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w900, fontSize: 12)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: on ? theme.line.withOpacity(0.26) : theme.line.withOpacity(0.12),
            ),
            child: Text(on ? '?úÏÑ±' : '?ÄÍ∏?, style: TextStyle(color: theme.textStrong, fontSize: 11, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 54,
            child: Text('$score', textAlign: TextAlign.right, style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }

  Widget _tabLogs(NeonTheme theme, ScrollController sc) {
    return ListView(
      controller: sc,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 86),
      children: [
        _card(theme, '?êÎèô Í∏∞Î°ù(?àÏ†ï)', [
          Text('?¨Í∏∞???†Ìò∏/ÏßÑÏûÖ/?êÏ†à/Î™©Ìëú/Í≤∞Í≥º(?????Ä?ÑÏïÑ?? Î°úÍ∑∏Í∞Ä ?ìÏûÖ?àÎã§.', style: TextStyle(color: theme.text, fontSize: 12, height: 1.25)),
          const SizedBox(height: 6),
          Text('ÏßÄÍ∏àÏ? ÎßàÍ∞ê Î∏åÎ¶¨??DB(Ï£?????Îß??úÏãú Ï§?', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
        ]),
        const SizedBox(height: 10),
        _card(theme, 'Ï§ëÏû•Í∏?Î∏åÎ¶¨??DB)', [
          if (_periodicBriefs.isEmpty)
            Text('?∞Ïù¥???ÜÏùå', style: TextStyle(color: theme.textSecondary, fontSize: 12))
          else
            ..._periodicBriefs.map((r) {
              final sum = _briefSummary(r.body);
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: theme.line.withOpacity(0.20)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.title, style: TextStyle(color: theme.textStrong, fontSize: 12, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Text(sum, style: TextStyle(color: theme.text, fontSize: 12), maxLines: 3, overflow: TextOverflow.ellipsis),
                  ],
                ),
              );
            }),
        ]),
      ],
    );
  }

  String _oneLineConclusion() {
    if (_s.noTrade) return 'ÏßÄÍ∏àÏ? Í±∞Îûò ?¨Í∏∞(?êÎèô ?†Í∏à). Î∞òÏùë Íµ¨Í∞ÑÎß??ïÏù∏.';
    if (_s.signalProb < 20) return '?†Ìò∏ ?ΩÌï® ??Í¥ÄÎß?Ï£ºÏùò. Î¨¥Î¶¨??ÏßÑÏûÖ Í∏àÏ?.';
    return '${_s.signalKo.isEmpty ? _s.signalDir : _s.signalKo} ?∞ÏÑ∏ ¬∑ ?ïÎ•† ${_s.signalProb}% ¬∑ ${_s.signalWhy.isEmpty ? '?µÏã¨ Íµ¨Í∞Ñ Î∞òÏùë ?ïÏù∏' : _s.signalWhy}';
  }





  String _briefSummary(String body) {
    final s = body.replaceAll('\r', '').replaceAll('\n', ' ').trim();
    if (s.isEmpty) return '?¥Ïö© ?ÜÏùå';
    if (s.length <= 140) return s;
    return s.substring(0, 140) + '??;
  }

  Widget _card(NeonTheme theme, String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.line.withOpacity(0.22)),
      ),
      child: DefaultTextStyle(
        style: TextStyle(color: theme.text, fontSize: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: theme.textStrong, fontSize: 13, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _kv(NeonTheme theme, String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(k, style: TextStyle(color: theme.textSecondary, fontWeight: FontWeight.w700))),
          Text(v, style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _decisionBar(NeonTheme theme) {
    final dir = (_s.finalDir.isNotEmpty ? _s.finalDir : _s.signalDir).toUpperCase();
    final label = dir.contains('LONG') ? 'Î°? : dir.contains('SHORT') ? '?? : 'Í¥ÄÎß?;
    final prob = _s.signalProb;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: theme.bg.withOpacity(0.92),
        border: Border(top: BorderSide(color: theme.line.withOpacity(0.22))),
      ),
      child: Row(
        children: [
          Expanded(
            child: _pill(theme, 'Í≤∞Ï†ï', '$label  $prob%'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _pill(theme, 'Î¶¨Ïä§??, '5% Í≥†Ï†ï'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _pill(theme, '?êÏùµÎπ?, _s.rr.toStringAsFixed(2)),
          ),
        ],
      ),
    );
  }

  Widget _pill(NeonTheme theme, String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: theme.card,
        border: Border.all(color: theme.line.withOpacity(0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(k, style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(v, style: TextStyle(color: theme.textStrong, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }


  String _structureKo(String tag) {
    final t = tag.toUpperCase();
    if (t.contains('MSB_UP')) return '???ÑÌôò??;
    if (t.contains('MSB_DN')) return '???ÑÌôò??;
    if (t.contains('CHOCH_UP')) return '?ÑÌôò ?úÏûë??;
    if (t.contains('CHOCH_DN')) return '?ÑÌôò ?úÏûë??;
    if (t.contains('BOS_UP')) return '?åÌåå(??';
    if (t.contains('BOS_DN')) return '?¥ÌÉà(??';
    return 'Î∞ïÏä§';
  }

  Widget _miniBar(NeonTheme theme, String label, int v) {
    final vv = v.clamp(0, 100);
    final w = vv / 100.0;
    final Color fill = (label.contains('?®Ï†ï') || label.contains('?ÑÌóò'))
        ? theme.bad
        : (label.contains('?°Ïàò') ? theme.warn : theme.good);

    return Row(
      children: [
        SizedBox(
          width: 60,
          child: Text(label,
              style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 10,
              color: theme.line.withOpacity(0.18),
              child: Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: w,
                  child: Container(color: fill.withOpacity(0.85)),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 36,
          child: Text('$vv',
              textAlign: TextAlign.right,
              style: TextStyle(color: theme.textStrong, fontSize: 11, fontWeight: FontWeight.w900)),
        ),
      ],
    );
  }

  Widget _pathButton(NeonTheme theme) {
    return GestureDetector(
      onTap: () => setState(() => _pathMode = !_pathMode),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: theme.card,
          border: Border.all(color: (_pathMode ? theme.accent : theme.line).withOpacity(0.40)),
          boxShadow: [
            BoxShadow(
              color: theme.accent.withOpacity(_pathMode ? 0.18 : 0.06),
              blurRadius: 16,
              offset: const Offset(0, 8),
            )
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.timeline, size: 18, color: _pathMode ? theme.accent : theme.textSecondary),
            const SizedBox(width: 8),
            Text('ÎØ∏Îûò', style: TextStyle(color: _pathMode ? theme.accent : theme.textStrong, fontWeight: FontWeight.w900, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _tfDrop(NeonTheme theme) {
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: _tf,
        dropdownColor: theme.card,
        style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w900, fontSize: 12),
        icon: Icon(Icons.arrow_drop_down, color: theme.textSecondary),
        items: _tfs
            .map((t) => DropdownMenuItem(
                  value: t,
                  child: Text(_tfKo(t)),
                ))
            .toList(),
        onChanged: (v) {
          if (v == null) return;
          setState(() => _tf = v);
          _refresh();
        },
      ),
    );
  }

  Widget _symbolDrop(NeonTheme theme) {
    const symbols = <String>['BTCUSDT', 'XRPUSDT', 'SOLUSDT', 'SHIBUSDT', 'ADAUSDT'];
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: symbols.contains(_symbol) ? _symbol : symbols.first,
        dropdownColor: theme.card,
        style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w900, fontSize: 12),
        icon: Icon(Icons.arrow_drop_down, color: theme.textSecondary),
        items: symbols.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
        onChanged: (v) {
          if (v == null) return;
          setState(() => _symbol = v);
          _refresh();
        },
      ),
    );
  }

Widget _briefCard() {
  final s = _s;
  final title = "ÎßàÍ∞ê Î∏åÎ¶¨??;
  final line1 = "${s.signalKo} ¬∑ ?ïÎ•† ${s.signalProb}% ¬∑ ${s.signalGrade}";
  final reasons = (s.zoneReasons.isNotEmpty ? s.zoneReasons : s.signalBullets).take(3).toList();
  final trigger = s.zoneTrigger.isNotEmpty ? s.zoneTrigger : "Î∞òÏùë Íµ¨Í∞Ñ?êÏÑú ÏßÄ???ïÏù∏ ??;
  final invalid = s.zoneInvalidLine.isNotEmpty ? s.zoneInvalidLine : "Íµ¨Í∞Ñ ?¥ÌÉà ??;
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      color: Colors.black.withOpacity(0.25),
      border: Border.all(color: Colors.white.withOpacity(0.10)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
      const SizedBox(height: 6),
      Text(line1, style: const TextStyle(fontSize: 12)),
      const SizedBox(height: 6),
      ...reasons.map((r) => Text("??$r", style: const TextStyle(fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis)),
      const SizedBox(height: 6),
      Text("ÏßÑÏûÖ: $trigger", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      Text("Ï£ºÏùò: $invalid", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
    ]),
  );
}


Widget _riskCard() {
  final s = _s;
  final noTrade = s.noTrade;
  final title = "Î¶¨Ïä§???êÎèô ?êÎã®";
  final entry = s.entry.toStringAsFixed(0);
  final stop = s.stop.toStringAsFixed(0);
  final target = s.target.toStringAsFixed(0);
  final lev = s.posLev;
  final rr = (s.entry - s.stop).abs() > 0
      ? ((s.target - s.entry).abs() / (s.entry - s.stop).abs())
      : 0.0;
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      color: Colors.black.withOpacity(0.22),
      border: Border.all(color: Colors.white.withOpacity(0.10)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
        const Spacer(),
        if (noTrade)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: Colors.redAccent.withOpacity(0.18),
              border: Border.all(color: Colors.redAccent.withOpacity(0.45)),
            ),
            child: Text("?êÎèô ?†Í∏à", style: TextStyle(fontSize: 11, color: Colors.redAccent.withOpacity(0.95))),
          )
        else
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: Colors.greenAccent.withOpacity(0.14),
              border: Border.all(color: Colors.greenAccent.withOpacity(0.35)),
            ),
            child: Text("Í±∞Îûò Í∞Ä??, style: TextStyle(fontSize: 11, color: Colors.greenAccent.withOpacity(0.95))),
          ),
      ]),
      const SizedBox(height: 6),
      if (noTrade && s.noTradeReason.isNotEmpty)
        Text("?¥Ïú†: ${s.noTradeReason}", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 6, children: [
        _miniChip("ÏßÑÏûÖ", entry),
        _miniChip("?êÏ†à", stop),
        _miniChip("Î™©Ìëú", target),
        _miniChip("RR", rr.toStringAsFixed(2)),
        _miniChip("Î¶¨Ïä§??, "5%"),
        _miniChip("Í∂åÏû•?àÎ≤Ñ", "x$lev"),
      ]),
      const SizedBox(height: 4),
      const Text("??ÏßÑÏûÖ?Ä 'Î∞òÏùë Íµ¨Í∞Ñ?êÏÑú ÏßÄ?? ?ïÏù∏ ??, style: TextStyle(fontSize: 10, color: Colors.white70)),
    ]),
  );
}

Widget _miniChip(String k, String v) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(999),
      color: Colors.white.withOpacity(0.06),
      border: Border.all(color: Colors.white.withOpacity(0.10)),
    ),
    child: Text("$k $v", style: const TextStyle(fontSize: 11)),
  );
}

}