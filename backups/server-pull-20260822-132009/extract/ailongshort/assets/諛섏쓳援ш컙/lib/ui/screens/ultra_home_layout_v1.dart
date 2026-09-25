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
/// - 상단 차트(약 40%)
/// - 하단 드래그 분석 패널(DraggableScrollableSheet)
/// - 하단 고정 결정 바(롱/숏/관망)
/// - PATH 버튼으로 차트 영역을 "미래경로" 모드로 스위치(현재는 스캐폴드/플레이스홀더)
class UltraHomeLayoutV1 extends StatefulWidget {
  const UltraHomeLayoutV1({super.key});

  @override
  State<UltraHomeLayoutV1> createState() => _UltraHomeLayoutV1State();
}

/// 스크롤 오버스크롤(파란/주황 글로우) 제거
class _NoGlowScroll extends ScrollBehavior {
  const _NoGlowScroll();

  @override
  Widget buildOverscrollIndicator(BuildContext context, Widget child, ScrollableDetails details) {
    return child;
  }
}

class _UltraHomeLayoutV1State extends State<UltraHomeLayoutV1> {

// --- 마감(종가) 카운트다운/판정 ---
// 전 시간봉 마감(종가) 감시: 5분~년봉
late final BarCloseWatcher _closeWatcher = BarCloseWatcher(
  tfs: const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'],
);
List<CandleCloseInfo> _closeInfos = const <CandleCloseInfo>[];

final CloseContextEngineV1 _closeCtx = const CloseContextEngineV1();
final BreakoutQualityEngineV1 _bq = const BreakoutQualityEngineV1();
final VolumeQualityEngineV1 _vq = const VolumeQualityEngineV1();

  // ✅ 하단 패널 강제 제어(드래그 먹통 방지)
  final DraggableScrollableController _sheetCtl = DraggableScrollableController();

  // ✅ 차트 확대/축소 + 자동 맞춤(폰/윈도우 비율 차이 대응)
  final TransformationController _viewerTc = TransformationController();
  final GlobalKey _chartKey = GlobalKey();

  // DraggableScrollableSheet가 제공하는 스크롤러를 사용(중복 스크롤 컨트롤러 제거)

  // --- 마감 브리핑(자동) ---
  List<TfBriefing> _tfBriefs = const <TfBriefing>[];
  List<PeriodicBriefingRow> _periodicBriefs = const <PeriodicBriefingRow>[];



  final FuEngine _engine = FuEngine();
  FuState _s = FuState.initial();

  String _symbol = 'BTCUSDT';
  /// Chart timeframe: user wants to trade off 5m/15m.
  String _tf = '15m';
  final List<String> _tfs = const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'];

  /// Swing/zone timeframe (targets/structure): 1h+ 기준.
  /// 기본은 "스윙(4시간)".
  String _swingTf = '4h';

  /// 스윙 기준을 사용자가 이해하기 쉬운 "프로파일"로 선택
  /// - 단타: 1시간 구간
  /// - 스윙: 4시간 구간
  /// - 중투: 1일 구간
  /// - 장투: 1주 구간
  /// - 직접: 사용자가 구간을 직접 선택
  String _swingProfile = '스윙';

  /// Future projection controls
  int _padBars = 120; // right-side future space
  int _horizonBars = 34; // how far the path extends (in bars)

  Timer? _timer;
  bool _pathMode = false;
  // 표시 토글(차트 본문 오버레이)
  bool _showReaction = true;
  bool _showStructure = true;
  bool _showBoxes = true;
  // 미니멀 UI 기본값: 미래경로 옵션 패널은 숨김(차트 지저분 방지)
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

    // 첫 렌더 후 화면 자동 맞춤(특히 Windows 창 비율 깨짐 방지)
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

    // 화면(뷰포트) 대비 차트 영역을 최대한 "한 화면에" 들어오게 스케일 계산
    final vp = rootBox.size;
    final child = chartBox.size;
    if (vp.width <= 0 || vp.height <= 0 || child.width <= 0 || child.height <= 0) {
      _resetChartView();
      return;
    }

    // 하단 카드/시트가 가리는 영역을 고려해 약간 여유를 둠
    final safe = MediaQuery.of(context).padding;
    final reservedBottom = 210.0 + safe.bottom;
    final availW = vp.width - 18.0; // 좌우 여백
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

      // ⚠️ 주/월/연(및 일) 브리핑은 데스크탑에서 DB(sqflite) 런타임 이슈가 날 수 있어
      // 데이터 로딩(차트/신호)을 절대 막지 않도록 "비동기 + 실패 무시"로 분리.
      if (!mounted) return;
      setState(() {
        _s = st;
        _tfBriefs = tfBriefs;
        // _periodicBriefs는 백그라운드에서 채움(실패해도 UI/차트 유지)
      });

      // 백그라운드(안전) 로딩: 실패하면 그냥 스킵
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
          // Windows/desktop에서 sqflite 미지원 등 런타임 실패는 무시
        }
      });
      _closeWatcher.updateState(st);
      if (_closeInfos.isEmpty) { _closeWatcher.start(st); }
    } catch (_) {
      // 네트워크/레이트리밋 등은 UI를 깨지 않도록 조용히 무시
    }
  }

  // ✅ 줌/맞춤 컨트롤(폰: 핀치, PC: 휠 + 버튼)
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
                btn(Icons.zoom_out, '축소', () => _zoomChart(0.90)),
                btn(Icons.center_focus_strong, '맞춤', _fitChartToView),
                btn(Icons.zoom_in, '확대', () => _zoomChart(1.10)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // UI 라벨(1D/1W/1M) -> 엔진 tf
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
    if (tf == '5m') return '5분';
    if (tf == '15m') return '15분';
    if (tf == '1h') return '1시간';
    if (tf == '4h') return '4시간';
    if (tf == '1d') return '일봉';
    if (tf == '1w') return '주봉';
    if (tf == '1m') return '달봉';
    if (tf == '1y') return '년봉';
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
            // ✅ 차트는 전체 배경으로 크게 유지
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  12,
                  10,
                  12,
                  // 하단 시트(최소 20%)에 가려지는 영역만큼 자동 확보
                  chartBottomPad,
                ),
                // ✅ 거래소처럼: 차트 확대/이동(핀치 줌)
                // - 하단 드래그 시트는 시트 영역에서만 동작
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
            // ✅ 상단 상태바: 모드/LOCK/WATCH/활성 모듈 한눈에
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: ActivationStatusBar(
                isFutureMode: _pathMode,
                isLocked: _s.noTrade,
                decisionPct: (((_s.probFinal ?? 0.0) * 100.0).clamp(0.0, 100.0)).toDouble(),
              ),
            ),


            // ✅ 아래 패널은 드래그(20%~90%)로 확장/축소
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

            // 고정 결정 바
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(top: false, child: _decisionBar(theme)),
            ),

            // PATH 토글 버튼 (우측 하단)
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

  /// PATH(미래경로) - 실시간 캔들 기준 재계산
  /// - FuturePathEngine(v1 안전 엔진)로 MAIN/ALT/FAIL 생성
  /// - PathChartLite(가벼운 캔들/라인 차트) 위에 FuturePathPainter 오버레이
  Widget _futurePathLive(NeonTheme theme) {
    final candles = _s.candles;
    final last = candles.isNotEmpty ? candles.last.close : _s.price;
    final anchorIdx = candles.isNotEmpty ? candles.length - 1 : 0;

    // 캔들 마감 직후(확정) → 라인 두껍게 / 그 외는 예고(얇게)
    final confirmed = _justClosed(_tf);

    // Chart(5m/15m) 위에서 보되, 목표/구조는 1h+ 스윙 기준으로 뽑는다.
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

      // 정확도 가중(구조+세력+마감)
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
              title: '$_symbol  $_tf  미래경로',
              theme: theme,
              // ✅ 미래경로(horizon)가 projectionBars보다 크면 x좌표가 우측 끝으로 눌려버려서
              //    점/라벨이 모두 오른쪽에 몰리는 현상이 생김.
              //    → 항상 projectionBars가 horizon보다 크거나 같게 유지.
              projectionBars: math.max(_padBars, _horizonBars + 4),
              scrollableFuture: true,
              childBuilder: (indexToX, priceToY, yToPrice, startIndex, visibleCount, h, topPad, bottomPad) {
                // painter는 전체 인덱스를 기대 → visible 영역 기준으로 변환
                double ixToX(int idx) => indexToX(idx);
                double prToY(double p) => priceToY(p);

                final viewport = Rect.fromLTWH(0, 0, c.maxWidth, c.maxHeight);
                final safeInset = EdgeInsets.fromLTRB(
                  10,
                  10,
                  10,
                  (viewport.height * 0.22 + 24).clamp(92.0, 220.0) + 12,
                );

                // 반응구간(reactLow/high) -> 픽셀 Rect
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

                // 확률/라벨 계산(간단 버전)
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
                    // ✅ FUTURE MODE HUD(색/글로우는 TF 톤으로 자동 통일)
                    Positioned.fill(
                      child: FutureModeOverlayThemed(
                        enabled: true,
                        tf: _tf,
                        confidencePct: basePct,
                        reactionPct: split.reversalPct,
                        invalidPct: split.breakoutPct,
                        subtitle: '반응/무효 실시간 표기',
                      ),
                    ),

                    // ✅ 반응구간 확률(지지/저항)
                    if (reactRect != null && DensityGate.showZoneLabels(_tf))
                      ZoneProbLabel(
                        zoneRect: reactRect!,
                        viewport: viewport,
                        title: isResistance ? '저항' : '지지',
                        probPct: basePct,
                        tone: isResistance ? const Color(0xFFFF4D6D) : const Color(0xFF2BFFB7),
                        safeInsets: safeInset,
                      ),

                    // ✅ 듀얼 확률(반전/돌파 or 반등/붕괴)
                    if (reactRect != null && DensityGate.showZoneLabels(_tf))
                      DualProbLabelSmart(
                        zoneRect: reactRect!,
                        viewport: viewport,
                        isResistance: isResistance,
                        aPct: split.reversalPct,
                        bPct: split.breakoutPct,
                        safeInsets: safeInset,
                      ),

                    // ✅ 엔트리 마커(확률>=20%만 SIGNAL)
                    if (DensityGate.showEntryMarkers(_tf))
                      EntryMarker(
                        pos: entryPos,
                        viewport: viewport,
                        dir: fp.dir,
                        probPct: basePct,
                        rr: rr,
                        safeInsets: safeInset,
                      ),

                    // ✅ 목표 도달확률(TP1~TP3)
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
                            // ✅ 진입가는 "현재가"가 아니라 "반응구간" 기반으로 잡는다
                            // (반응구간이 없을 때만 기존 값 fallback)
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
                                  child: Text('옵션', style: TextStyle(color: theme.textStrong, fontSize: 10, fontWeight: FontWeight.w900)),
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
      case '1m': return 43200; // 30일 근사
      case '1y': return 525600; // 365일 근사
      default: return 15;
    }
  }

  bool _justClosed(String tf) {
    final sec = _tfToMin(tf) * 60;
    if (sec <= 0) return false;
    final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final into = nowSec % sec;
    // 마감 후 8초 이내를 "확정"으로 간주(예고/확정 구분용)
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
      if (tf == '5m') return '5분';
      if (tf == '15m') return '15분';
      if (tf == '1h') return '1시간';
      if (tf == '4h') return '4시간';
      if (tf == '1d') return '일봉';
      if (tf == '1w') return '주봉';
      if (tf == '1m') return '달봉';
      if (tf == '1y') return '년봉';
      return tf;
    }

    String swingKo(String tf) {
      if (tf == '1h') return '1시간';
      if (tf == '4h') return '4시간';
      if (tf == '1d') return '일봉';
      if (tf == '1w') return '주봉';
      if (tf == '1m') return '달봉';
      if (tf == '1y') return '년봉';
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
          // 미래경로 설정(핵심만)
          // ✅ 컨트롤 과밀 방지: 가로 스크롤 1줄
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                // 미래 여백(오른쪽 공간)
                chip('여백80', _padBars == 80, () => setState(() => _padBars = 80)),
                const SizedBox(width: 6),
                chip('여백120', _padBars == 120, () => setState(() => _padBars = 120)),
                const SizedBox(width: 6),
                chip('여백200', _padBars == 200, () => setState(() => _padBars = 200)),
                const SizedBox(width: 10),
                chip('짧게', _horizonBars == 13, () => setState(() => _horizonBars = 13)),
                const SizedBox(width: 6),
                chip('중간', _horizonBars == 34, () => setState(() => _horizonBars = 34)),
                const SizedBox(width: 6),
                chip('길게', _horizonBars == 55, () => setState(() => _horizonBars = 55)),
                const SizedBox(width: 10),
                chip('스윙1H', _swingTf == '1h', () => setState(() => _swingTf = '1h')),
                const SizedBox(width: 6),
                chip('스윙4H', _swingTf == '4h', () => setState(() => _swingTf = '4h')),
                const SizedBox(width: 6),
                chip('스윙1D', _swingTf == '1d', () => setState(() => _swingTf = '1d')),
                const SizedBox(width: 6),
                chip('스윙1W', _swingTf == '1w', () => setState(() => _swingTf = '1w')),
                const SizedBox(width: 6),
                chip('스윙1M', _swingTf == '1m', () => setState(() => _swingTf = '1m')),
                const SizedBox(width: 6),
                chip('스윙1Y', _swingTf == '1y', () => setState(() => _swingTf = '1y')),
                const SizedBox(width: 10),
                // 표시 토글
                chip('반응', _showReaction, () => setState(() => _showReaction = !_showReaction)),
                const SizedBox(width: 6),
                chip('구조', _showStructure, () => setState(() => _showStructure = !_showStructure)),
                const SizedBox(width: 6),
                chip('박스', _showBoxes, () => setState(() => _showBoxes = !_showBoxes)),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '차트 ${tfKo(_tf)}  구간 ${swingKo(_swingTf)}',
            style: TextStyle(color: theme.textSecondary.withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _pathBadge(NeonTheme theme, FuturePathPriceDTO fp) {
    final dirKo = fp.dir == 'LONG' ? '롱' : (fp.dir == 'SHORT' ? '숏' : '중립');
    final label = '$dirKo  ${fp.pMain}%  손익비 ${(fp.rrX10 / 10).toStringAsFixed(1)}';
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
    // 1) 명시 신호 우선
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('UP')) return true;
    if (d.contains('SHORT') || d.contains('DOWN')) return false;
    // 2) MTF 다수결
    int up = 0, dn = 0;
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
    // 반응 구간이 있으면 "진입"을 그 구간 안으로 잡는다(현재가와 분리)
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
            // ✅ 드래그 핸들(여기서 위/아래로 밀면 무조건 패널이 움직이게 강제)
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

            // 탭(고정)
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
                  Tab(text: '요약'),
                  Tab(text: '시나리오'),
                  Tab(text: '증거10'),
                  Tab(text: '로그'),
                ],
              ),
            ),
            const SizedBox(height: 10),

            // ✅ 중요: DraggableScrollableSheet는 "하나의" ScrollController(sc)를 직접 연결해야
            //         손가락 드래그로 시트가 자연스럽게 올라가고(확장) 내려간다.
            //         TabBarView + 여러 ListView에 같은 controller를 공유하면
            //         모바일에서 드래그가 먹통/튕김 현상이 자주 발생.
            //         → 한 개의 스크롤뷰만 두고, 탭 내용은 내부에서 교체한다.
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
        _card(theme, '요약', [
          _kv(theme, '현재가', _s.price.toStringAsFixed(2)),
          _kv(theme, '방향', _s.signalKo.isEmpty ? _s.signalDir : _s.signalKo),
          _kv(theme, '신뢰도', '${_s.confidence}%'),
          _kv(theme, '증거', '${_s.evidenceHit}/${_s.evidenceTotal}'),
          const SizedBox(height: 6),
          _pill(theme, '구간', _s.zoneName.isEmpty ? '미정' : _s.zoneName),
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
        _card(theme, '핵심 레벨', [
          _kv(theme, 'S1', _s.s1.toStringAsFixed(2)),
          _kv(theme, 'R1', _s.r1.toStringAsFixed(2)),
          _kv(theme, 'VWAP', _s.vwap.toStringAsFixed(2)),
          _kv(theme, '반응구간', '${_s.reactLow.toStringAsFixed(2)} ~ ${_s.reactHigh.toStringAsFixed(2)}'),
          _kv(theme, '구조', _structureKo(_s.structureTag)),
        ]),
        const SizedBox(height: 10),
        _closeAndBriefCards(theme),
        const SizedBox(height: 10),
        _card(theme, '결론 한 줄', [
          Text(
            _oneLineConclusion(),
            style: TextStyle(color: theme.textStrong, fontSize: 12, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text('※ 롱/숏은 확률 20% 미만이면 “관망/주의”로만 표시', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
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
        _card(theme, '현재 상태', [
          _pill(theme, '방향', dir),
          const SizedBox(height: 6),
          _kv(theme, '확률', '$p%'),
          _kv(theme, '등급', grade),
          const SizedBox(height: 6),
          _noTradeBadge(theme),
        ]),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: '롱 시나리오',
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
            title: '숏 시나리오',
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
            title: '관망/주의',
            enabled: true,
            prob: _s.zoneWaitP,
            entry: 0,
            stop: 0,
            targets: const <double>[0, 0, 0],
            trigger: '기다림: 반응 구간 확인 후',
            invalid: '추격 금지 / 변동성 과다 시 쉬기',
            reasons: [
              if (noTrade) '거래 잠금: ${_s.noTradeReason}',
              if (_s.lossStreak >= 2) '연속 손실: ${_s.lossStreak}회',
            ]),
      ],
    );
  }

  Widget _tabEvidenceBody(NeonTheme theme) {
    final items = _evidence10(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '10대 증거(점수)', [
          Text('기준: 60 이상이면 강함(ON).', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
          const SizedBox(height: 10),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _evidenceRow(theme, e['label'] as String, e['score'] as int),
              )),
          const SizedBox(height: 6),
          _kv(theme, '활성', '${items.where((e) => (e['score'] as int) >= 60).length}/10'),
        ]),
      ],
    );
  }

  Widget _tabLogsBody(NeonTheme theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(theme, '자동 기록(예정)', [
          Text('여기에 신호/진입/손절/목표/결과(승/패/타임아웃) 로그가 쌓입니다.', style: TextStyle(color: theme.text, fontSize: 12, height: 1.25)),
          const SizedBox(height: 6),
          Text('지금은 마감 브리핑 DB(주/월/연)만 표시 중.', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
        ]),
        const SizedBox(height: 10),
        _card(theme, '중장기 브리핑(DB)', [
          if (_periodicBriefs.isEmpty)
            Text('데이터 없음', style: TextStyle(color: theme.textSecondary, fontSize: 12))
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
        _card(theme, '마감(종가)', [
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
                  return '5분';
                case '15m':
                  return '15분';
                case '1h':
                  return '1시간';
                case '4h':
                  return '4시간';
                case '1d':
                  return '일봉';
                case '1w':
                  return '주봉';
                case '1m':
                  return '달봉';
                case '1y':
                  return '년봉';
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
              final txt = '${tfKo(tf)} ${CandleCloseUtil.fmtRemain(i.remaining)} · ${i.verdict}';
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
                Text('다음 마감', style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: const ['5m', '15m', '1h', '4h', '1d', '1w', '1m', '1y'].map(badge).toList(),
                ),
                const SizedBox(height: 10),
                _kv(theme, '마감 품질', '${cc.labelKo} (${cc.score})'),
                _kv(theme, '돌파 품질', '${bq.labelKo} (${bq.score})'),
                _kv(theme, '거래량', '${vq.labelKo} (x${vq.ratio.toStringAsFixed(2)})'),
                const SizedBox(height: 10),
                Text('구조/세력', style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                _pill(theme, '구조', _structureKo(_s.structureTag)),
                const SizedBox(height: 6),
                _miniBar(theme, '매수힘', _s.forceScore),
                const SizedBox(height: 6),
                _miniBar(theme, '방어', _s.defenseScore),
                const SizedBox(height: 6),
                _miniBar(theme, '흡수', _s.absorptionScore),
                const SizedBox(height: 6),
                _miniBar(theme, '분산', _s.distributionScore),
                const SizedBox(height: 6),
                _miniBar(theme, '함정위험', _s.sweepRisk),
                const SizedBox(height: 4),
                Text(
                  '요약: ${cc.reason} / ${bq.reason} / ${vq.reason}',
                  style: TextStyle(color: theme.fg.withOpacity(0.75), fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            );
          }),
        ]),
        const SizedBox(height: 10),
        _card(theme, '마감 브리핑', [
          ..._tfBriefs.map((b) {
            String badgeKo(String badge) {
              if (badge == 'B') return '상승';
              if (badge == 'S') return '하락';
              return '관망';
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
                          '${_tfKo(b.tf)} 마감 · 남은시간 ${b.remainText}',
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
                    '실패 시: ${b.failScenario}',
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
            Text('중장기(기간 마감) 요약', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
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
        _card(theme, '현재 상태', [
          _pill(theme, '방향', dir),
          const SizedBox(height: 6),
          _kv(theme, '확률', '$p%'),
          _kv(theme, '등급', grade),
          const SizedBox(height: 6),
          _noTradeBadge(theme),
        ]),
        const SizedBox(height: 10),
        _scenarioCard(theme,
            title: '롱 시나리오',
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
            title: '숏 시나리오',
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
            title: '관망/주의',
            enabled: true,
            prob: _s.zoneWaitP,
            entry: 0,
            stop: 0,
            targets: const <double>[0, 0, 0],
            trigger: '기다림: 반응 구간 확인 후',
            invalid: '추격 금지 / 변동성 과다 시 쉬기',
            reasons: [
              if (noTrade) '거래 잠금: ${_s.noTradeReason}',
              if (_s.lossStreak >= 2) '연속 손실: ${_s.lossStreak}회',
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
              _s.noTrade ? '자동 잠금' : '거래 가능',
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
                '이유: ${_s.noTradeReason}',
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
      _kv(theme, '표시', enabled ? '진입 대기' : '관망/주의'),
      _kv(theme, '확률', '$prob%'),
      const SizedBox(height: 6),
      if (showPlan) ...[
        _kv(theme, '진입', entry.toStringAsFixed(2)),
        _kv(theme, '손절', stop.toStringAsFixed(2)),
        _kv(theme, '목표', '${t1.toStringAsFixed(2)} / ${t2.toStringAsFixed(2)} / ${t3.toStringAsFixed(2)}'),
      ] else
        Text('진입/손절/목표: 조건 충족 시 표시', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
      const SizedBox(height: 8),
      Text('진입 조건: $trigger', style: TextStyle(color: theme.text, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      Text('주의/무효: $invalid', style: TextStyle(color: theme.textSecondary, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 6),
      ...reasons.take(3).map((r) => Text('• $r', style: TextStyle(color: theme.textSecondary, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis)),
      const SizedBox(height: 6),
      const Text("※ 진입은 '반응 구간에서 지킴' 확인 후", style: TextStyle(fontSize: 10, color: Color(0xCCFFFFFF))),
    ]);
  }

  Widget _tabEvidence(NeonTheme theme, ScrollController sc) {
    final items = _evidence10(theme);
    return ListView(
      controller: sc,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 86),
      children: [
        _card(theme, '10대 증거(점수)', [
          Text('기준: 60 이상이면 강함(ON).', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
          const SizedBox(height: 10),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _evidenceRow(theme, e['label'] as String, e['score'] as int),
              )),
          const SizedBox(height: 6),
          _kv(theme, '활성', '${items.where((e) => (e['score'] as int) >= 60).length}/10'),
        ]),
      ],
    );
  }

  List<Map<String, Object>> _evidence10(NeonTheme theme) {
    // 10대 증거를 “누구나 이해하는 한글 라벨”로 노출(코드/필드명은 영어 유지)
    return [
      {'label': '세력 추적', 'score': _s.forceScore},
      {'label': '고래 행동', 'score': _s.whaleScore},
      {'label': '거래량 구조', 'score': _s.volumeScore},
      {'label': 'FVG/BPR', 'score': (_s.fvgZones.isNotEmpty || _s.bprZones.isNotEmpty) ? 65 : 45},
      {'label': '오더북/유동성', 'score': _s.obImbalance},
      {'label': '펀딩/포지션', 'score': (_s.roiOk ? 65 : 45)},
      {'label': '구조 패턴', 'score': _s.breakoutScore},
      {'label': '온체인 심리', 'score': 60},
      {'label': '거시 지표', 'score': 60},
      {'label': 'AI 오차 보정', 'score': (_s.lossStreak == 0 ? 60 : 45)},
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
            child: Text(on ? '활성' : '대기', style: TextStyle(color: theme.textStrong, fontSize: 11, fontWeight: FontWeight.w900)),
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
        _card(theme, '자동 기록(예정)', [
          Text('여기에 신호/진입/손절/목표/결과(승/패/타임아웃) 로그가 쌓입니다.', style: TextStyle(color: theme.text, fontSize: 12, height: 1.25)),
          const SizedBox(height: 6),
          Text('지금은 마감 브리핑 DB(주/월/연)만 표시 중.', style: TextStyle(color: theme.textSecondary, fontSize: 11)),
        ]),
        const SizedBox(height: 10),
        _card(theme, '중장기 브리핑(DB)', [
          if (_periodicBriefs.isEmpty)
            Text('데이터 없음', style: TextStyle(color: theme.textSecondary, fontSize: 12))
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
    if (_s.noTrade) return '지금은 거래 쉬기(자동 잠금). 반응 구간만 확인.';
    if (_s.signalProb < 20) return '신호 약함 → 관망/주의. 무리한 진입 금지.';
    return '${_s.signalKo.isEmpty ? _s.signalDir : _s.signalKo} 우세 · 확률 ${_s.signalProb}% · ${_s.signalWhy.isEmpty ? '핵심 구간 반응 확인' : _s.signalWhy}';
  }





  String _briefSummary(String body) {
    final s = body.replaceAll('\r', '').replaceAll('\n', ' ').trim();
    if (s.isEmpty) return '내용 없음';
    if (s.length <= 140) return s;
    return s.substring(0, 140) + '…';
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
    final label = dir.contains('LONG') ? '롱' : dir.contains('SHORT') ? '숏' : '관망';
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
            child: _pill(theme, '결정', '$label  $prob%'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _pill(theme, '리스크', '5% 고정'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _pill(theme, '손익비', _s.rr.toStringAsFixed(2)),
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
    if (t.contains('MSB_UP')) return '큰 전환↑';
    if (t.contains('MSB_DN')) return '큰 전환↓';
    if (t.contains('CHOCH_UP')) return '전환 시작↑';
    if (t.contains('CHOCH_DN')) return '전환 시작↓';
    if (t.contains('BOS_UP')) return '돌파(상)';
    if (t.contains('BOS_DN')) return '이탈(하)';
    return '박스';
  }

  Widget _miniBar(NeonTheme theme, String label, int v) {
    final vv = v.clamp(0, 100);
    final w = vv / 100.0;
    final Color fill = (label.contains('함정') || label.contains('위험'))
        ? theme.bad
        : (label.contains('흡수') ? theme.warn : theme.good);

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
            Text('미래', style: TextStyle(color: _pathMode ? theme.accent : theme.textStrong, fontWeight: FontWeight.w900, fontSize: 12)),
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
  final title = "마감 브리핑";
  final line1 = "${s.signalKo} · 확률 ${s.signalProb}% · ${s.signalGrade}";
  final reasons = (s.zoneReasons.isNotEmpty ? s.zoneReasons : s.signalBullets).take(3).toList();
  final trigger = s.zoneTrigger.isNotEmpty ? s.zoneTrigger : "반응 구간에서 지킴 확인 시";
  final invalid = s.zoneInvalidLine.isNotEmpty ? s.zoneInvalidLine : "구간 이탈 시";
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
      ...reasons.map((r) => Text("• $r", style: const TextStyle(fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis)),
      const SizedBox(height: 6),
      Text("진입: $trigger", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      Text("주의: $invalid", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
    ]),
  );
}


Widget _riskCard() {
  final s = _s;
  final noTrade = s.noTrade;
  final title = "리스크/자동 판단";
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
            child: Text("자동 잠금", style: TextStyle(fontSize: 11, color: Colors.redAccent.withOpacity(0.95))),
          )
        else
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: Colors.greenAccent.withOpacity(0.14),
              border: Border.all(color: Colors.greenAccent.withOpacity(0.35)),
            ),
            child: Text("거래 가능", style: TextStyle(fontSize: 11, color: Colors.greenAccent.withOpacity(0.95))),
          ),
      ]),
      const SizedBox(height: 6),
      if (noTrade && s.noTradeReason.isNotEmpty)
        Text("이유: ${s.noTradeReason}", style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 6, children: [
        _miniChip("진입", entry),
        _miniChip("손절", stop),
        _miniChip("목표", target),
        _miniChip("RR", rr.toStringAsFixed(2)),
        _miniChip("리스크", "5%"),
        _miniChip("권장레버", "x$lev"),
      ]),
      const SizedBox(height: 4),
      const Text("※ 진입은 '반응 구간에서 지킴' 확인 후", style: TextStyle(fontSize: 10, color: Colors.white70)),
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