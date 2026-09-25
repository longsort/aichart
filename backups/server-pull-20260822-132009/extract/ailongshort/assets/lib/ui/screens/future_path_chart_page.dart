import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../data/bitget/bitget_live_store.dart';
import '../../core/models/fu_state.dart';
import '../../core/models/future_path_price_dto.dart';
import '../../core/services/future_path_price_service.dart';
import '../../data/models/candle.dart' as rt;
import '../../logic/tyron_pro_engine.dart';
import '../../core/services/fu_engine.dart';
import '../widgets/neon_theme.dart';
// FuturePath 화면은 Long/Short 바 대신 "결정 종가 게이지 + AI 매니저" 패널을 사용한다.
import '../widgets/csv_chip_row_v1.dart';
import '../widgets/path_chart_lite.dart';
import '../../core/app_settings.dart';
import '../../engine/risk/risk_sizing.dart';
import '../widgets/future_path_overlay.dart';
import '../widgets/future_path_price_legend.dart';
import '../../engine/similarity/pattern_matcher.dart';
import '../../core/models/struct_mark.dart';
import '../../core/models/match_window.dart';
import 'chart_fullscreen_page.dart';

enum _DragTarget { none, entry, sl, tp }

/// 캔들 마감까지 남은 시간 표시용
class _CandleCountdown {
  final int remainMs;
  const _CandleCountdown.none() : remainMs = 0;
  _CandleCountdown({required this.remainMs});
  bool get hasCountdown => remainMs > 0;
  String get pretty {
    if (remainMs <= 0) return '0초';
    final sec = (remainMs / 1000).ceil();
    if (sec < 60) return '${sec}초';
    final min = sec ~/ 60;
    final s = sec % 60;
    if (min < 60) return '${min}분 ${s}초';
    final h = min ~/ 60;
    final m = min % 60;
    return '${h}시간 ${m}분';
  }
}

class FuturePathChartPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;
  final FuState state;
  final double livePrice;

  const FuturePathChartPage({
    super.key,
    required this.symbol,
    required this.tfLabel,
    required this.state,
    required this.livePrice,
  });

  @override
  State<FuturePathChartPage> createState() => _FuturePathChartPageState();
}

class _FuturePathChartPageState extends State<FuturePathChartPage> {
  late FuState _curState;
  late String _tf;
  bool _tfLoading = false;
  bool _mtfLoading = false;

  final Map<String, FuState> _mtfStates = <String, FuState>{};

  /// 화면에 보여줄 캔들 수 (80/120/200)
  int _visibleCandleCount = 120;

  FuturePathPriceDTO? _fp;
  List<PatternMatch> _matches = const [];
  double _matchWinrate = 0;

  String _mode = 'AUTO'; // AUTO (경로/캔들수 선택 UI는 2번 삭제로 제거)
  bool _showSimilarTop3 = false;

  // 드래그로 조정되는 플랜 값(없으면 자동값 사용)
  double? _entry;
  double? _sl;
  double? _tp;

  // 차트 좌표 변환(드래그용)
  double Function(double y)? _yToPrice;
  double Function(double price)? _priceToY;
  double _chartH = 0;
  double _topPad = 0;
  double _bottomPad = 0;

  _DragTarget _dragTarget = _DragTarget.none;

  /// Optional: periodic FuEngine refresh when page is visible (audit: "low-frequency timer").
  Timer? _periodicRefreshTimer;

  /// 실시간 현재가: 거래소(Bitget) 티커 구독 → 매니저/차트/경로가 모두 실시간 반영
  double get _livePrice => BitgetLiveStore.I.livePrice > 0 ? BitgetLiveStore.I.livePrice : widget.livePrice;

  void _onTicker() {
    if (mounted) setState(() {});
  }

  void _onDragStart(double dy, double effEntry, double effSl, double effTp) {
    final convert = _yToPrice;
    if (convert == null) return;
    final price = convert(dy);
    final dEntry = (price - effEntry).abs();
    final dSl = (price - effSl).abs();
    final dTp = (price - effTp).abs();
    if (dEntry <= dSl && dEntry <= dTp) {
      _dragTarget = _DragTarget.entry;
    } else if (dSl <= dTp) {
      _dragTarget = _DragTarget.sl;
    } else {
      _dragTarget = _DragTarget.tp;
    }
    setState(() {});
  }

  void _onDragUpdate(double dy) {
    final convert = _yToPrice;
    if (convert == null || _dragTarget == _DragTarget.none) return;
    final price = convert(dy);
    setState(() {
      switch (_dragTarget) {
        case _DragTarget.entry:
          _entry = price;
          break;
        case _DragTarget.sl:
          _sl = price;
          break;
        case _DragTarget.tp:
          _tp = price;
          break;
        case _DragTarget.none:
          break;
      }
    });
  }

  void _onDragEnd() {
    if (_dragTarget != _DragTarget.none) {
      setState(() {
        _entry = _snapPrice(_entry);
        _sl = _snapPrice(_sl);
        _tp = _snapPrice(_tp);
      });
    }
    _dragTarget = _DragTarget.none;
    setState(() {});
  }

  double? _snapPrice(double? p) {
    if (p == null || p <= 0) return p;
    return (p / 10).round() * 10.0;
  }

  @override
  // AUTO_BOOT
  void initState() {
    super.initState();
    _curState = widget.state;
    // AUTO: boot with best TF once MTF scanned
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _fetchMTF();
      final best = _pickBestTF();
      if (best != _tf) {
        setState(() { _tf = best; _tfLoading = true; });
        final eng = FuEngine();
        final st = await eng.fetch(symbol: widget.symbol, tf: best, allowNetwork: true, safeMode: true);
        if (!mounted) return;
        setState(() { _curState = st; _tfLoading = false; });
        _rebuild();
      }
    });
    _tf = widget.tfLabel;
    _rebuild();
    _bootAuto();
    _startPeriodicRefresh();
    BitgetLiveStore.I.ticker.addListener(_onTicker);
  }

  @override
  void dispose() {
    BitgetLiveStore.I.ticker.removeListener(_onTicker);
    _periodicRefreshTimer?.cancel();
    super.dispose();
  }

  void _startPeriodicRefresh() {
    _periodicRefreshTimer?.cancel();
    _periodicRefreshTimer = Timer.periodic(const Duration(seconds: 45), (_) async {
      if (!mounted) return;
      try {
        final eng = FuEngine();
        final st = await eng.fetch(
          symbol: widget.symbol,
          tf: _tf,
          allowNetwork: true,
          safeMode: true,
        );
        if (!mounted) return;
        setState(() {
          _curState = st;
          _fp = null;
        });
        _rebuild();
      } catch (_) {}
    });
  }

  @override
  void didUpdateWidget(covariant FuturePathChartPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state || oldWidget.livePrice != widget.livePrice) {
      _rebuild();
    }
  }

  /// 실시간 기준 가격(경로/ATR 계산용) — 티커 갱신 시 path도 현재가 반영
  double get _priceForRebuild => _livePrice > 0 ? _livePrice : (_curState.candles.isNotEmpty ? _curState.candles.last.close : 0.0);

  double _atrPct(List<FuCandle> candles, {int n = 14}) {
    if (candles.length < 3) return 0.006; // 0.6% default
    final m = math.min(n, candles.length - 1);
    double sum = 0;
    for (int i = candles.length - m; i < candles.length; i++) {
      final c = candles[i];
      final prev = candles[i - 1].close;
      final tr = math.max(c.high - c.low, math.max((c.high - prev).abs(), (c.low - prev).abs()));
      sum += tr;
    }
    final atr = sum / m;
    final price = candles.last.close > 0 ? candles.last.close : _livePrice;
    if (price <= 0) return 0.006;
    final pct = atr / price;
    return pct.clamp(0.002, 0.03); // 0.2%~3%
  }

  String _autoMode(FuState s) {
    final tag = s.structureTag.toUpperCase();
    if (tag.contains('BOS_UP') || tag.contains('CHOCH_UP')) return 'A';
    if (tag.contains('BOS_DN') || tag.contains('CHOCH_DN')) return 'C';
    // 방향이 강하면 A/C로 살짝 기울임
    final dir = s.signalDir.toUpperCase();
    if (dir.contains('LONG') && s.confidence >= 75) return 'A';
    if (dir.contains('SHORT') && s.confidence >= 75) return 'C';
    return 'B';
  }

  void _rebuild() {
    final s = _curState;
    final candles = s.candles;
    final anchor = (candles.isNotEmpty ? candles.last.close : 0.0);
    final price = (anchor > 0 ? anchor : _livePrice);
    final priceForPath = _priceForRebuild > 0 ? _priceForRebuild : price;

    // invalidation: 계획이 있으면 stop 우선, 없으면 반응구간 경계
    final dir = s.signalDir.toUpperCase();
    final isLong = dir.contains('LONG') || s.signalKo.contains('롱');
    final inv = (s.stop > 0)
        ? s.stop
        : (isLong ? (s.reactLow > 0 ? s.reactLow : price * 0.993) : (s.reactHigh > 0 ? s.reactHigh : price * 1.007));

    // 구간(반응구간): 파동 시작~마무리 경로를 구간 내에서 정확히 그리기 위해 전달
    final zoneLow = s.reactLow > 0 ? s.reactLow : 0.0;
    final zoneHigh = s.reactHigh > 0 ? s.reactHigh : 0.0;

    final dto = <String, dynamic>{
      'price': priceForPath,
      'decisionDir': isLong ? 'LONG' : (dir.contains('SHORT') ? 'SHORT' : 'WATCH'),
      'confidence': s.confidence,
      'structureScore': s.breakoutScore,  // 돌파 품질
      'liquidityScore': s.obImbalance,    // 오더북 치우침
      'patternScore': s.score,            // 종합 점수
      'volScore': s.volumeScore,          // 거래량 질
      'atrPct': _atrPct(candles),
      'invalidation': inv,
      'breakLevel': s.breakLevel,
      'structureTag': s.structureTag,
      'zoneLow': zoneLow,
      'zoneHigh': zoneHigh,
    };

    final mode = (_mode == 'AUTO') ? _autoMode(s) : _mode;
    final fp = FuturePathPriceService.build(tf: _tf, dto: dto, mode: mode);

    // 최초 1회: 플랜 값 자동 채움(사용자가 드래그/수정하면 유지)
    final entryAuto = (s.entry > 0 ? s.entry : price);
    final slAuto = (s.stop > 0) ? s.stop : fp.invalid;
    final tpAuto = (s.target > 0) ? s.target : fp.target;
    _entry ??= entryAuto;
    _sl ??= slAuto;
    _tp ??= tpAuto;

    // 과거 유사구간 매칭(최근 20캔들 패턴 기준)
    final closes = candles.map((e) => e.close).where((v) => v > 0).toList();
    final matches = PatternMatcher.topMatches(
      closes: closes,
      recentLen: 20,
      horizon: 20,
      topK: 3,
    );
    final dirTag = (dir.contains('SHORT') ? 'SHORT' : 'LONG');
    final winr = PatternMatcher.winrate(matches: matches, dir: dirTag, thresholdPct: 0.2);

    setState(() {
      _fp = fp;
      _matches = matches;
      _matchWinrate = winr;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final s = _curState;

    final candles = s.candles;
    final title = '${widget.symbol} · ${_tf} · 미래경로 · 완전 AI 완자동';

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF050810), Color(0xFF0A0E18), Color(0xFF000000)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                // 고정: TF 라인 (스크롤해도 상단 고정)
                Row(
                  children: [
                    Expanded(child: _tfSelector()),
                    _realtimeChip(),
                  ],
                ),
                const SizedBox(height: 6),
                // ✅ 거래소 실시간 현재가 + 갱신 시 눈에 보이는 움직임
                _buildRealtimePriceBar(),
                const SizedBox(height: 6),
                // 스크롤: 스트립·MTF·경로·롱숏·완전 AI 완자동 브리핑
                Expanded(
                  flex: 1,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildHelpChip(context),
                        const SizedBox(height: 6),
                        _topStrip(s),
                        const SizedBox(height: 6),
                        _chartLabelSettingsChip(),
                        const SizedBox(height: 6),
                        _tyronPanelFull(t, s),
                        const SizedBox(height: 6),
                        CsvChipRowV1(
                          t: t,
                          candles: s.candles,
                          dir: s.signalDir,
                          prob: s.signalProb,
                          sweepRisk: s.sweepRisk,
                        ),
                        const SizedBox(height: 6),
                        _mtfPanel(),
                        const SizedBox(height: 6),
                        _decisionCloseGaugeAndManager(t, s, tfLabel: widget.tfLabel),
                        _signalAlarmChip(s),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),
                ),
                // 하단: 차트 50%
                Expanded(
                  flex: 1,
                  child: _buildPathChart(t, s),
                ),
                const SizedBox(height: 6),
                _bottomPlanCard(s),
              ],
            ),
          ),
        ),
      ),
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withOpacity(0.25),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: const Color(0xFF7C3AED).withOpacity(0.5)),
              ),
              child: const Text('완전 AI 완자동', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Color(0xFFA78BFA), letterSpacing: 0.5)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.fullscreen),
            tooltip: '전체 차트(기존)',
            onPressed: () {
              if (candles.isEmpty) return;
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ChartFullScreenPage(
                    symbol: widget.symbol,
                    tfLabel: widget.tfLabel,
                    candles: s.candles,
                    obZones: s.obZones,
                    mbZones: s.mbZones,
                    fvgZones: s.fvgZones,
                    bprZones: s.bprZones,
                    reactLow: s.reactLow > 0 ? s.reactLow : _livePrice,
                    reactHigh: s.reactHigh > 0 ? s.reactHigh : _livePrice,
                    mtfPulse: s.mtfPulse,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  /// AI 대시보드: 방향 + 확신 게이지 + 승부구간 바 (문자 최소, 게이지·애니메이션)
  Widget _buildAiStrip(NeonTheme t, FuState s) {
    final dir = s.signalDir.toUpperCase();
    final isLong = dir.contains('LONG');
    final isShort = dir.contains('SHORT');
    final c = isLong ? t.good : (isShort ? t.bad : t.muted);
    final conf = s.confidence.clamp(0, 100) / 100.0;
    final rLo = s.reactLow > 0 ? s.reactLow : (s.candles.isNotEmpty ? s.candles.last.low : 0.0);
    final rHi = s.reactHigh > 0 ? s.reactHigh : (s.candles.isNotEmpty ? s.candles.last.high : 0.0);
    final price = _livePrice > 0 ? _livePrice : (s.candles.isNotEmpty ? s.candles.last.close : 0.0);
    final range = (rHi - rLo).clamp(1.0, double.infinity);
    final zonePos = (price - rLo) / range;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: t.card,
        border: Border.all(color: c.withOpacity(0.35)),
        boxShadow: [BoxShadow(color: c.withOpacity(0.08), blurRadius: 12)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Tooltip(
                message: isLong ? '오를 가능성' : (isShort ? '내릴 가능성' : '지금은 관망'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: c.withOpacity(0.2),
                    border: Border.all(color: c.withOpacity(0.6)),
                  ),
                  child: Text(
                    isLong ? 'L' : isShort ? 'S' : 'W',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: c),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('확신', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 4),
                        Text('(AI가 믿는 정도)', style: TextStyle(color: t.muted.withOpacity(0.8), fontSize: 9, fontWeight: FontWeight.w500)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: SizedBox(
                        height: 8,
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final w = constraints.maxWidth;
                            return TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: conf),
                              duration: const Duration(milliseconds: 500),
                              curve: Curves.easeOutCubic,
                              builder: (context, v, _) => Stack(
                                children: [
                                  Positioned.fill(child: Container(color: t.bg)),
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    child: SizedBox(width: (w * v).clamp(0.0, w), child: Container(color: c)),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text('${s.confidence}%', style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
          if (rLo > 0 && rHi > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Text('구간', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w700)),
                const SizedBox(width: 4),
                Text('(흰선=지금 가격)', style: TextStyle(color: t.muted.withOpacity(0.8), fontSize: 9, fontWeight: FontWeight.w500)),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: SizedBox(
                      height: 6,
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final w = constraints.maxWidth;
                          final pos = zonePos.clamp(0.0, 1.0);
                          return Stack(
                            children: [
                              Positioned.fill(child: Container(color: t.bg)),
                              Positioned(
                                left: 0,
                                top: 0,
                                bottom: 0,
                                child: SizedBox(
                                  width: w,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.centerLeft,
                                        end: Alignment.centerRight,
                                        colors: [t.bad.withOpacity(0.5), t.good.withOpacity(0.5)],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              Positioned(
                                left: (w * pos - 1).clamp(0.0, w - 2),
                                top: 0,
                                bottom: 0,
                                child: Container(width: 2, color: Colors.white),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text('${rLo.toStringAsFixed(0)}~${rHi.toStringAsFixed(0)}', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w800)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _topStrip(FuState s) => _buildAiStrip(NeonTheme.of(context), s);

  Widget _modeSelector() {
    Widget pill(String label) {
    final sel = _mode == label;
    return LayoutBuilder(builder: (context, c) {
      return GestureDetector(
      onTap: () {
        setState(() => _mode = label);
        _rebuild();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: sel ? const Color(0x66FFFFFF) : const Color(0x22FFFFFF)),
          color: sel ? const Color(0x22FFFFFF) : const Color(0x11000000),
        ),
        child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
      ),
      );
    });
  }

  return Row(
    children: [
      const Text('경로', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
      const SizedBox(width: 8),
      pill('AUTO'),
      const SizedBox(width: 6),
      pill('A'),
      const SizedBox(width: 6),
      pill('B'),
      const SizedBox(width: 6),
      pill('C'),
      const Spacer(),
      const Text('드래그: 타점/손절/목표', style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w800)),
    ],
  );
  }

  /// 주봉/달봉: 현재 구간 캔들을 실시간 가격으로 갱신(형성중 캔들 병합)
  List<FuCandle> _mergeFormingCandle(List<FuCandle> candles, String tf, double livePrice) {
    if (candles.isEmpty || livePrice <= 0) return candles;
    final now = DateTime.now().toUtc();
    int periodStartMs;
    if (tf == '1W') {
      final monday = DateTime.utc(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1));
      periodStartMs = monday.millisecondsSinceEpoch;
    } else if (tf == '1M') {
      periodStartMs = DateTime.utc(now.year, now.month, 1).millisecondsSinceEpoch;
    } else {
      return candles;
    }
    final last = candles.last;
    if (last.ts == periodStartMs) {
      final updated = FuCandle(
        open: last.open,
        high: math.max(last.high, livePrice),
        low: math.min(last.low, livePrice),
        close: livePrice,
        ts: last.ts,
        volume: last.volume,
      );
      return [...candles.sublist(0, candles.length - 1), updated];
    }
    final appended = FuCandle(
      open: last.close,
      high: livePrice,
      low: livePrice,
      close: livePrice,
      ts: periodStartMs,
      volume: 0,
    );
    return [...candles, appended];
  }

  Widget _buildPathChart(NeonTheme t, FuState s) {
    final candles = s.candles;
    if (candles.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('캔들 로딩 중…', style: TextStyle(color: Colors.white70)),
            if (_tf == '1W' || _tf == '1M') const SizedBox(height: 4),
            if (_tf == '1W' || _tf == '1M')
              const Text('주봉/달봉은 데이터 수집에 시간이 걸릴 수 있습니다.', style: TextStyle(color: Colors.white38, fontSize: 11)),
          ],
        ),
      );
    }
    if (_fp == null) {
      return const Center(child: Text('경로 계산 중…', style: TextStyle(color: Colors.white70)));
    }

    final displayCandles = (_tf == '1W' || _tf == '1M') && _livePrice > 0
        ? _mergeFormingCandle(candles, _tf, _livePrice)
        : candles;
    final price = displayCandles.isNotEmpty ? displayCandles.last.close : _livePrice;
    final effEntry = _entry ?? (s.entry > 0 ? s.entry : price);
    final effSl = _sl ?? (s.stop > 0 ? s.stop : _fp?.invalid ?? 0);
    final effTp = _tp ?? (s.target > 0 ? s.target : _fp?.target ?? 0);

    final labelListenable = Listenable.merge([
      AppSettings.I.chartLabelBgColor,
      AppSettings.I.chartLabelTextColor,
      AppSettings.I.chartLabelFontSize,
      AppSettings.I.chartLabelOffsetX,
      AppSettings.I.chartLabelOffsetY,
    ]);

    return ListenableBuilder(
      listenable: labelListenable,
      builder: (context, _) {
        return LayoutBuilder(builder: (context, c) {
      return Column(
        children: [
          _smcChartTitleBar(s),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onPanStart: (d) => _onDragStart(d.localPosition.dy, effEntry, effSl, effTp),
              onPanUpdate: (d) => _onDragUpdate(d.localPosition.dy),
              onPanEnd: (_) => _onDragEnd(),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE5E7EB), width: 1),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 12,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    children: [
                      PathChartLite(
          candles: displayCandles,
          title: '',
          theme: t,
          projectionBars: (_tf == '1W' || _tf == '1M') ? 48 : 32,
          scrollableFuture: false,
          preferredVisibleCount: _visibleCandleCount,
          smcStyle: true,
          lightChartStyle: true,
          livePrice: _livePrice > 0 ? _livePrice : (displayCandles.isNotEmpty ? displayCandles.last.close : null),
          childBuilder: (indexToX, priceToY, yToPrice, startIndex, visibleCount, h, topPad, bottomPad) {
            final double curTopPrice = yToPrice(topPad);
            final double curBotPrice = yToPrice(h - bottomPad);
            double vMin = math.min(curTopPrice, curBotPrice);
            double vMax = math.max(curTopPrice, curBotPrice);

            void include(double? p) {
              if (p == null) return;
              if (p <= 0) return;
              if (p < vMin) vMin = p;
              if (p > vMax) vMax = p;
            }

            include(s.reactLow > 0 ? s.reactLow : null);
            include(s.reactHigh > 0 ? s.reactHigh : null);
            include(s.s1 > 0 ? s.s1 : null);
            include(s.r1 > 0 ? s.r1 : null);
            include(s.breakLevel > 0 ? s.breakLevel : null);
            include(_entry);
            include(_sl);
            include(_tp);
            if (_fp != null && _fp!.wavePrices.isNotEmpty) {
              for (final p in _fp!.wavePrices) {
                include(p);
              }
            }

            final pad = (vMax - vMin).abs() * 0.08;
            if (pad.isFinite && pad > 0) {
              vMax += pad;
              vMin -= pad;
            }
            if ((vMax - vMin).abs() < 1) {
              vMax += 1;
              vMin -= 1;
            }

            double priceToYAdj(double price) {
              final span = (vMax - vMin);
              final usableH = (h - topPad - bottomPad);
              if (span <= 0 || usableH <= 0) return priceToY(price);
              final t = ((vMax - price) / span);
              return (topPad + (t * usableH)).clamp(topPad, h - bottomPad);
            }

            _yToPrice = yToPrice;
            _priceToY = priceToYAdj;
            _chartH = h;
            _topPad = topPad;
            _bottomPad = bottomPad;

            final anchorIndex = startIndex + visibleCount - 1;
            // 오버레이: 미래 경로 + 구조 태그/기준가 + 타점/손절/목표 라인
            return FuturePathOverlay(
              chartChild: const SizedBox.expand(),
              fp: _fp!,
              indexToX: indexToX,
              priceToY: priceToYAdj,
              anchorIndex: anchorIndex,
              horizon: 32,
              structureTag: s.structureTag,
              breakLevel: s.breakLevel > 0 ? s.breakLevel : null,
              entryPrice: candles.last.close,
              planEntry: _entry,
              planSl: _sl,
              planTp: _tp,
              structureEvents: s.structMarks,
              matchWindows: _matches
                  .asMap()
                  .entries
                  .map((e) => MatchWindow(
                        start: e.value.startIndex,
                        end: e.value.startIndex + 20,
                        similarity: e.value.similarity,
                        fwdReturn: e.value.fwdReturn,
                      ))
                  .toList(),
              reactLow: (s.reactLow > 0) ? s.reactLow : _fallbackZone(candles).low,
              reactHigh: (s.reactHigh > 0) ? s.reactHigh : _fallbackZone(candles).high,
              smcZones: s.smcZones,
              supportProb: (_supportProb(s) <= 0 ? 50 : _supportProb(s)),
              resistLow: (s.breakLevel > 0)
                  ? (s.breakLevel * 0.997)
                  : ((s.reactHigh > 0 ? s.reactHigh : _fallbackZone(candles).high) * 1.002),
              resistHigh: (s.breakLevel > 0)
                  ? (s.breakLevel * 1.003)
                  : ((s.reactHigh > 0 ? s.reactHigh : _fallbackZone(candles).high) * 1.01),
              resistProb: (_resistProb(s) <= 0 ? 50 : _resistProb(s)),
              labelBgColor: AppSettings.I.chartLabelBgColor.value,
              labelTextColor: AppSettings.I.chartLabelTextColor.value,
              labelFontSize: AppSettings.I.chartLabelFontSize.value,
              labelOffsetX: AppSettings.I.chartLabelOffsetX.value,
              labelOffsetY: AppSettings.I.chartLabelOffsetY.value,
            );
          },
        ),
        Positioned(
          right: 10,
          top: 10,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: (c.maxWidth * 0.42).clamp(160.0, 260.0)),
            child: FuturePathPriceLegend(fp: _fp!),
          ),
        ),
        Positioned(
          left: 10,
          top: 10,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: (c.maxWidth * 0.46).clamp(180.0, 280.0)),
            child: _similarityPanel(),
          ),
        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          _smcBottomControlBar(),
        ],
      );
    });
      },
    );
  }

  /// 차트 라벨 설정: 배경색·글자색·글자크기·위치(X/Y) 사용자 조정
  Widget _chartLabelSettingsChip() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _showChartLabelSettingsSheet(),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF374151).withOpacity(0.5)),
            color: const Color(0xFF0D1220).withOpacity(0.8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.label_important_outline, size: 18, color: Colors.white70),
              const SizedBox(width: 8),
              const Text(
                '차트 라벨 설정',
                style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showChartLabelSettingsSheet() {
    final settings = AppSettings.I;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF111827),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final bg = settings.chartLabelBgColor.value;
            final fg = settings.chartLabelTextColor.value;
            final fontSize = settings.chartLabelFontSize.value;
            final offsetX = settings.chartLabelOffsetX.value;
            final offsetY = settings.chartLabelOffsetY.value;

            void updateBg(int v) {
              settings.chartLabelBgColor.value = v;
              setModalState(() {});
            }
            void updateFg(int v) {
              settings.chartLabelTextColor.value = v;
              setModalState(() {});
            }
            void updateFontSize(double v) {
              settings.chartLabelFontSize.value = v.clamp(8.0, 20.0);
              setModalState(() {});
            }
            void updateOffsetX(double v) {
              settings.chartLabelOffsetX.value = v.clamp(-100.0, 100.0);
              setModalState(() {});
            }
            void updateOffsetY(double v) {
              settings.chartLabelOffsetY.value = v.clamp(-100.0, 100.0);
              setModalState(() {});
            }

            final colorPresets = <String, int>{
              '다크': 0xFF1A1D24,
              '검정': 0xFF000000,
              '흰배경': 0xFFFFFFFF,
              '회색': 0xFF374151,
            };
            final textPresets = <String, int>{
              '흰색': 0xFFFFFFFF,
              '검정': 0xFF000000,
              '연회색': 0xFFD1D5DB,
              '노랑': 0xFFFBBF24,
            };

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.white24,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        '차트 라벨 설정',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 16),
                      const Text('라벨 배경색', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: colorPresets.entries.map((e) {
                          final selected = bg == e.value;
                          return GestureDetector(
                            onTap: () => updateBg(e.value),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: Color(e.value),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: selected ? Colors.white : Colors.white24, width: selected ? 2 : 1),
                              ),
                              child: Text(e.key, style: TextStyle(color: (e.value & 0xFF000000) != 0 && (e.value & 0x00FFFFFF) < 0x808080 ? Colors.white : Colors.black, fontSize: 11)),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 14),
                      const Text('라벨 글자색', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: textPresets.entries.map((e) {
                          final selected = fg == e.value;
                          return GestureDetector(
                            onTap: () => updateFg(e.value),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: Color(e.value),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: selected ? Colors.cyan : Colors.white24, width: selected ? 2 : 1),
                              ),
                              child: Text(e.key, style: TextStyle(color: (e.value & 0x00FFFFFF) > 0x808080 ? Colors.black : Colors.white, fontSize: 11)),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 14),
                      Text('글자 크기 ${fontSize.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                      Slider(value: fontSize.clamp(8.0, 20.0), min: 8, max: 20, divisions: 12, onChanged: (v) => updateFontSize(v), activeColor: Colors.cyan),
                      const SizedBox(height: 8),
                      Text('위치 X ${offsetX.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                      Slider(value: offsetX.clamp(-100.0, 100.0), min: -100, max: 100, divisions: 40, onChanged: (v) => updateOffsetX(v), activeColor: Colors.cyan),
                      const SizedBox(height: 8),
                      Text('위치 Y ${offsetY.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                      Slider(value: offsetY.clamp(-100.0, 100.0), min: -100, max: 100, divisions: 40, onChanged: (v) => updateOffsetY(v), activeColor: Colors.cyan),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () {
                              settings.chartLabelBgColor.value = 0xFF1A1D24;
                              settings.chartLabelTextColor.value = 0xFFFFFFFF;
                              settings.chartLabelFontSize.value = 11.0;
                              settings.chartLabelOffsetX.value = 0.0;
                              settings.chartLabelOffsetY.value = 0.0;
                              setModalState(() {});
                            },
                            child: const Text('초기화', style: TextStyle(color: Colors.white70)),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('닫기', style: TextStyle(color: Colors.cyan, fontWeight: FontWeight.w800)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// LuxAlgo 참조: 상단 타이틀바 (Smart Money Concepts [LuxAlgo] + 캐럿, 우측 Weak High/Strong Low)
  Widget _smcChartTitleBar(FuState s) {
    final tag = s.structureTag.toUpperCase();
    final rightLabel = tag.contains('BOS_UP') || tag.contains('CHOCH_UP')
        ? 'Weak High'
        : (tag.contains('BOS_DN') || tag.contains('CHOCH_DN') ? 'Strong Low' : '');
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: const Color(0xFFE5E7EB))),
      ),
      child: Row(
        children: [
          Icon(Icons.keyboard_arrow_up, size: 18, color: Colors.black87),
          const SizedBox(width: 6),
          Text(
            'Smart Money Concepts [LuxAlgo]',
            style: const TextStyle(
              color: Colors.black87,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          if (rightLabel.isNotEmpty)
            Text(
              rightLabel,
              style: const TextStyle(
                color: Colors.black54,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }

  /// TradingView 라이트: 하단 줌·네비 (흰/회색 배경, 검정 아이콘)
  Widget _smcBottomControlBar() {
    const btnColor = Color(0xFFF3F4F6);
    const iconColor = Colors.black87;
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: const Color(0xFFE5E7EB))),
      ),
      child: Row(
        children: [
          const Text(
            'TradingView',
            style: TextStyle(
              color: Colors.black54,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          _smcControlBtn(icon: Icons.remove, color: btnColor, iconColor: iconColor),
          const SizedBox(width: 4),
          _smcControlBtn(icon: Icons.add, color: btnColor, iconColor: iconColor),
          const SizedBox(width: 4),
          _smcControlBtn(icon: Icons.arrow_back_ios_new, color: btnColor, iconColor: iconColor, size: 16),
          const SizedBox(width: 4),
          _smcControlBtn(icon: Icons.arrow_forward_ios, color: btnColor, iconColor: iconColor, size: 16),
          const SizedBox(width: 4),
          _smcControlBtn(icon: Icons.refresh, color: btnColor, iconColor: iconColor),
          const Spacer(),
        ],
      ),
    );
  }

  Widget _smcControlBtn({required IconData icon, required Color color, required Color iconColor, double size = 20}) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(4),
      child: InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(
          width: 32,
          height: 24,
          child: Icon(icon, size: size, color: iconColor),
        ),
      ),
    );
  }

  Widget _similarityPanel() {
    if (_matches.isEmpty) return const SizedBox.shrink();

    Widget row(PatternMatch m, int i) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Text('#${i + 1}', style: const TextStyle(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.w900)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '유사도 ${(m.similarity * 100).toStringAsFixed(1)}% · 이후 ${m.fwdReturn.toStringAsFixed(2)}%',
                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }

    // 접혀 있을 때: 버튼만 표시 (클릭 시 펼침)
    if (!_showSimilarTop3) {
      return GestureDetector(
        onTap: () => setState(() => _showSimilarTop3 = true),
        child: Container(
          width: 260,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0x22FFFFFF)),
            color: const Color(0x14000000),
          ),
          child: Row(
            children: [
              const Text('과거 유사구간 TOP3', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
              const SizedBox(width: 6),
              Icon(_showSimilarTop3 ? Icons.expand_less : Icons.expand_more, color: Colors.white54, size: 18),
            ],
          ),
        ),
      );
    }

    // 펼쳐 있을 때: 전체 패널 + 클릭 시 접기
    return GestureDetector(
      onTap: () => setState(() => _showSimilarTop3 = false),
      child: Container(
        width: 260,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x22FFFFFF)),
          color: const Color(0x14000000),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Text('과거 유사구간 TOP3', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                const SizedBox(width: 6),
                Icon(Icons.expand_less, color: Colors.white54, size: 18),
                const Text(' (탭하여 접기)', style: TextStyle(color: Colors.white38, fontSize: 9)),
              ],
            ),
            const SizedBox(height: 6),
            Text('현재방향: ${_curState.signalDir.toUpperCase()} · 예상 승률(샘플3): ${_matchWinrate.toStringAsFixed(0)}%',
                style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            for (int i = 0; i < _matches.length; i++) row(_matches[i], i),
            const SizedBox(height: 2),
            const Text('※ 최근 20캔들 패턴 vs 과거 슬라이딩 비교(코사인)', style: TextStyle(color: Colors.white30, fontSize: 9, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  /// 하단 플랜: E/S/T 스케일 + RR·확률 게이지 (문자 최소, 게이지·애니메이션)
  Widget _buildBottomPlanGauges(NeonTheme t, FuState s) {
    final fp = _fp;
    final price = (s.candles.isNotEmpty ? s.candles.last.close : _livePrice);
    final entry = (_entry ?? (s.entry > 0 ? s.entry : price));
    final sl = (_sl ?? (s.stop > 0 ? s.stop : (fp?.invalid ?? 0)));
    final tp = (_tp ?? (s.target > 0 ? s.target : (fp?.target ?? 0)));
    double rr = 0.0;
    if (sl > 0 && tp > 0) {
      final risk = (entry - sl).abs();
      final reward = (tp - entry).abs();
      if (risk > 0) rr = reward / risk;
    }
    rr = rr.clamp(0.0, 5.0);
    final rrNorm = (rr / 5.0).clamp(0.0, 1.0);
    final prob = fp != null ? (fp.pMain.clamp(0, 100) / 100.0) : 0.0;
    final lock = s.locked || !s.showSignal;
    final lo = [entry, sl, tp].where((e) => e > 0).fold<double>(price, (a, b) => a < b ? a : b);
    final hi = [entry, sl, tp].where((e) => e > 0).fold<double>(price, (a, b) => a > b ? a : b);
    final span = (hi - lo).clamp(1.0, double.infinity);
    double pos(double v) => ((v - lo) / span).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: t.card,
        border: Border.all(color: lock ? t.bad.withOpacity(0.4) : t.line.withOpacity(0.3)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (lock) Icon(Icons.block, size: 14, color: t.bad),
              if (lock) const SizedBox(width: 6),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    height: 24,
                    child: LayoutBuilder(
                      builder: (context, c) {
                        final w = c.maxWidth;
                        return Stack(
                          children: [
                            Positioned.fill(child: Container(color: t.bg)),
                            if (entry > 0) Positioned(left: w * pos(entry) - 4, top: 0, bottom: 0, child: Center(child: _dot(t.good, 'E'))),
                            if (sl > 0) Positioned(left: w * pos(sl) - 4, top: 0, bottom: 0, child: Center(child: _dot(t.bad, 'S'))),
                            if (tp > 0) Positioned(left: w * pos(tp) - 4, top: 0, bottom: 0, child: Center(child: _dot(t.accent, 'T'))),
                            Positioned(left: w * pos(price) - 2, top: 0, bottom: 0, child: Container(width: 2, height: 20, color: Colors.white)),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 44,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('RR', style: TextStyle(color: t.muted, fontSize: 9, fontWeight: FontWeight.w800)),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: SizedBox(
                        height: 6,
                        width: 44,
                        child: LayoutBuilder(
                          builder: (context, cx) => TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: rrNorm),
                            duration: const Duration(milliseconds: 400),
                            builder: (context, v, _) => Stack(
                              children: [
                                Positioned.fill(child: Container(color: t.bg)),
                                Positioned(left: 0, top: 0, bottom: 0, child: SizedBox(width: cx.maxWidth * v, child: Container(color: t.good))),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Text(rr.toStringAsFixed(1), style: TextStyle(color: t.good, fontSize: 10, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              SizedBox(
                width: 44,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('확률', style: TextStyle(color: t.muted, fontSize: 9, fontWeight: FontWeight.w800)),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: SizedBox(
                        height: 6,
                        width: 44,
                        child: LayoutBuilder(
                          builder: (context, cx) => TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: prob),
                            duration: const Duration(milliseconds: 400),
                            builder: (context, v, _) => Stack(
                              children: [
                                Positioned.fill(child: Container(color: t.bg)),
                                Positioned(left: 0, top: 0, bottom: 0, child: SizedBox(width: cx.maxWidth * v, child: Container(color: t.accent))),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Text(fp != null ? '${fp.pMain}%' : '-', style: TextStyle(color: t.accent, fontSize: 10, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dot(Color color, String label) {
    return Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: Colors.white, width: 1)),
      alignment: Alignment.center,
      child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900)),
    );
  }

  Widget _bottomPlanCard(FuState s) {
    final t = NeonTheme.of(context);
    return _buildBottomPlanGauges(t, s);
  }

  Widget _kv(String k, double v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Text('$k ${v.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }

  Widget _kvText(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Text('$k $v', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }


({double low, double high}) _fallbackZone(List<FuCandle> candles, {int lookback = 40}) {
  if (candles.isEmpty) return (low: 0, high: 0);
  final lb = lookback.clamp(10, candles.length);
  double lo = candles[candles.length - lb].low;
  double hi = candles[candles.length - lb].high;
  for (int i = candles.length - lb; i < candles.length; i++) {
    if (candles[i].low < lo) lo = candles[i].low;
    if (candles[i].high > hi) hi = candles[i].high;
  }
  // zone 폭이 너무 크면 살짝 줄여서 UI 가독성 확보
  final mid = (lo + hi) / 2;
  final half = ((hi - lo) * 0.35).clamp(mid * 0.001, mid * 0.02);
  return (low: mid - half, high: mid + half);
}

  int _supportProb(FuState s) => s.confidence.clamp(0, 100);
  int _resistProb(FuState s) => (100 - s.confidence).clamp(0, 100);

  List<StructMark> _buildStructMarks(FuState s) {
  final candles = s.candles;
  if (candles.isEmpty) return const [];
  final marks = <StructMark>[];

  int crossIndex(double level) {
    // 마지막으로 level을 '관통'한 지점 찾기(근사)
    for (int i = candles.length - 2; i >= 1; i--) {
      final a = candles[i - 1].close;
      final b = candles[i].close;
      if ((a - level) == 0) return i - 1;
      if ((a < level && b > level) || (a > level && b < level)) return i;
    }
    return candles.length - 1;
  }

  int touchIndex(double level) {
    // level 근처 터치(저가/고가) 가장 최근 캔들
    final tol = (level * 0.0008).abs(); // 0.08%
    for (int i = candles.length - 1; i >= 0; i--) {
      final c = candles[i];
      if ((c.low - level).abs() <= tol || (c.high - level).abs() <= tol) return i;
    }
    return candles.length - 1;
  }

  final tag = s.structureTag.toUpperCase();
  final lvl = s.breakLevel;

  if (lvl > 0 && (tag.contains('BOS') || tag.contains('CHOCH') || tag.contains('MSB'))) {
    final idx = crossIndex(lvl);
    final isUp = tag.contains('_UP');
    final label = tag.contains('CHOCH') ? 'CHOCH' : tag.contains('MSB') ? 'MSB' : 'BOS';
    marks.add(StructMark(index: idx, price: lvl, label: label, isUp: isUp));
  }

  // “”  // EQL/EQH 라벨 제거(분·시간·일·주·달 공통)

  return marks;
  }

  /// 거래소(Bitget) 실시간 현재가 + 갱신 시 눈에 보이는 움직임
  Widget _buildRealtimePriceBar() {
    return ValueListenableBuilder<dynamic>(
      valueListenable: BitgetLiveStore.I.ticker,
      builder: (context, _, __) {
        final price = BitgetLiveStore.I.livePrice;
        if (price <= 0) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Text(
              '거래소(Bitget) 연결 후 실시간 가격이 표시됩니다.',
              style: TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w600),
            ),
          );
        }
        return _RealtimePricePulse(
          price: price,
          symbol: widget.symbol,
        );
      },
    );
  }

  /// "무슨 뜻이에요?" 탭 시 한글 용어 설명 시트
  Widget _buildHelpChip(BuildContext context) {
    return GestureDetector(
      onTap: () => _showGlossarySheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withOpacity(0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.help_outline, size: 16, color: Colors.white70),
            const SizedBox(width: 6),
            Text('무슨 뜻이에요? 한눈에 보기', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }

  void _showGlossarySheet(BuildContext context) {
    final t = NeonTheme.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: t.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: t.muted, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 12),
              Text('한눈에 보기 · 용어 설명', style: TextStyle(color: t.text, fontSize: 16, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              _glossaryRow('L / S / W', '오를 가능성 / 내릴 가능성 / 지금은 관망'),
              _glossaryRow('확신', 'AI가 이 방향을 얼마나 확신하는지 (높을수록 믿을 만함)'),
              _glossaryRow('구간', '가격이 움직이는 범위 (흰선 = 지금 가격 위치)'),
              _glossaryRow('BEAR / BULL', '하락 쪽 / 상승 쪽 (게이지가 어디 쪽인지 보면 됨)'),
              _glossaryRow('종가·돌파·거래량', '마감 품질 / 방향 전환 신호 / 거래량 강도'),
              _glossaryRow('진입·손절·목표', '들어갈 가격 / 잃어도 끊을 가격 / 목표 가격'),
              _glossaryRow('RR', '목표까지 이익 ÷ 손절까지 손실 비율 (2면 2배 수익 노림)'),
              _glossaryRow('게이트·NO-TRADE', '진입 허용 여부 / 지금은 매매하지 말라는 뜻'),
              _glossaryRow('MTF', '여러 시간봉(5분·1시간·1일 등)을 같이 본 결과'),
              _glossaryRow('실시간', '거래소(Bitget) 현재가와 연동되어 계속 갱신됨'),
              const SizedBox(height: 8),
              Text('· 모든 수치는 거래소 실데이터 기준으로 갱신됩니다.', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _glossaryRow(String term, String meaning) {
    final t = NeonTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(term, style: TextStyle(color: t.accent, fontSize: 12, fontWeight: FontWeight.w800)),
          ),
          Expanded(child: Text(meaning, style: TextStyle(color: t.text.withOpacity(0.9), fontSize: 12, height: 1.3))),
        ],
      ),
    );
  }

  /// 실시간 데이터 활성화 시 "실시간" 칩 표시 (audit: optional "realtime active" indicator).
  Widget _realtimeChip() {
    return ValueListenableBuilder<dynamic>(
      valueListenable: BitgetLiveStore.I.ticker,
      builder: (context, _, __) {
        final livePrice = BitgetLiveStore.I.livePrice;
        if (livePrice <= 0) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(left: 8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFF00E676).withOpacity(0.2),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFF00E676).withOpacity(0.6)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: Color(0xFF00E676),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Color(0xFF00E676), blurRadius: 4)],
                  ),
                ),
                const SizedBox(width: 6),
                const Text('실시간', style: TextStyle(color: Color(0xFF00E676), fontSize: 10, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _tfSelector() {
  const tfs = <String>['5m', '15m', '1h', '4h', '1D', '1W', '1M', '1Y'];
  Widget pill(String label) {
    final sel = _tf == label;
    return GestureDetector(
      onTap: _tfLoading
          ? null
          : () async {
              if (_tf == label) return;
              setState(() {
                _tfLoading = true;
                _tf = label;
              });
              final eng = FuEngine();
              try {
                final st = await eng.fetch(
                  symbol: widget.symbol,
                  tf: label,
                  allowNetwork: true,
                  safeMode: true,
                );
                if (!mounted) return;
                setState(() {
                  _curState = st;
                  _tfLoading = false;
                  // TF 바뀌면 드래그 값 초기화(새 플랜 기준)
                  _entry = null;
                  _sl = null;
                  _tp = null;
                });
                _rebuild();
              } catch (_) {
                if (!mounted) return;
                setState(() => _tfLoading = false);
              }
            },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: sel ? const Color(0x66FFFFFF) : const Color(0x22FFFFFF)),
          color: sel ? const Color(0x22FFFFFF) : const Color(0x11000000),
        ),
        child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
      ),
    );
  }

  return Row(
    children: [
      const Text('TF', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
      const SizedBox(width: 8),
      Expanded(
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final tf in tfs) ...[
                pill(tf),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ),
      ),
      if (_tfLoading)
        const Padding(
          padding: EdgeInsets.only(left: 6),
          child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
    ],
  );
  }

  Future<void> _fetchMTF() async {
  if (_mtfLoading) return;
  setState(() => _mtfLoading = true);
  const tfs = <String>['5m', '15m', '1h', '4h', '1D', '1W', '1M', '1Y'];
  final eng = FuEngine();
  final map = <String, FuState>{};
  for (final tf in tfs) {
    try {
      final st = await eng.fetch(
        symbol: widget.symbol,
        tf: tf,
        allowNetwork: true,
        safeMode: true,
      );
      map[tf] = st;
    } catch (_) {
      // ignore single TF fail
    }
  }
  if (!mounted) return;
  setState(() {
    _mtfStates
      ..clear()
      ..addAll(map);
    _mtfLoading = false;
  });
  }

  /// TYRON 기능 전체(여기에): 결정·진입/손절/목표·근거
  Widget _tyronPanelFull(NeonTheme t, FuState s) {
    if (s.candles.length < 60) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF374151).withOpacity(0.5)),
          color: const Color(0xFF0D1220).withOpacity(0.6),
        ),
        child: Row(
          children: [
            Icon(Icons.bolt, size: 18, color: Colors.white54),
            const SizedBox(width: 8),
            Text('TYRON · 데이터 부족', style: TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.w800)),
          ],
        ),
      );
    }
    final rtCandles = s.candles.map((fc) => rt.Candle(
      t: DateTime.fromMillisecondsSinceEpoch(fc.ts),
      o: fc.open,
      h: fc.high,
      l: fc.low,
      c: fc.close,
      v: fc.volume,
    )).toList();
    final pro = TyronProEngine.analyze(rtCandles);
    int confirm = pro.confidence;
    String decision = pro.bias;
    if (decision == 'NEUTRAL') decision = 'NO TRADE';
    if (confirm < AppSettings.signalMinProb) decision = 'NO TRADE';

    Color c = const Color(0xFF9CA3AF);
    if (decision == 'LONG') c = const Color(0xFF3BC6FF);
    if (decision == 'SHORT') c = const Color(0xFFFF4D6D);

    final last = rtCandles.isNotEmpty ? rtCandles.last : null;
    final entry = (last?.c ?? 0.0);
    final atr = _atr14Rt(rtCandles);
    final stop = _structureStopRt(rtCandles, decision, entry, atr);
    final stopDist = (entry - stop).abs();
    final stopPct = (entry > 0) ? (stopDist / entry * 100.0) : 0.0;

    final riskUsd = AppSettings.accountUsdt * (AppSettings.riskPct / 100.0);
    final qty = (stopDist > 0) ? (riskUsd / stopDist) : 0.0;
    final notional = qty * entry;
    double lev = (AppSettings.accountUsdt > 0) ? (notional / AppSettings.accountUsdt) : 0.0;
    if (AppSettings.leverageOverride > 0) lev = AppSettings.leverageOverride;
    lev = lev.clamp(0.0, AppSettings.leverageCap);

    final tp = _targetByRR(decision, entry, stop, rr: 2.0);
    final reasons = pro.reasons.take(4).toList();
    final isNoTrade = decision == 'NO TRADE';
    final confNorm = (confirm / 100.0).clamp(0.0, 1.0);
    final stopPctNorm = (stopPct / 2.0).clamp(0.0, 1.0);
    final levNorm = (lev / 20.0).clamp(0.0, 1.0);
    final qtyNorm = (qty * 1000).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.4)),
        color: c.withOpacity(0.06),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.bolt, color: c, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text('TYRON', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              ),
              _TyronDecisionPill(decision: decision, confirm: confirm, color: c, isNoTrade: isNoTrade),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _miniGaugeLabel(t, 'E', entry, c)),
              const SizedBox(width: 6),
              Expanded(child: _miniGaugeLabel(t, 'S', stop, t.bad)),
              const SizedBox(width: 6),
              Expanded(child: _miniGaugeLabel(t, 'T', tp, t.good)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: _thinBar(t, 'STOP%', stopPctNorm, t.bad),
              ),
              const SizedBox(width: 6),
              Expanded(child: _thinBar(t, 'LEV', levNorm, c)),
              const SizedBox(width: 6),
              Expanded(child: _thinBar(t, 'SIZE', qtyNorm, t.accent)),
            ],
          ),
          if (reasons.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                ...List.generate(reasons.length.clamp(0, 4), (i) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Container(
                    width: 6,
                    height: 20,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(2),
                      color: c.withOpacity(0.3 + (i + 1) * 0.15),
                    ),
                  ),
                )),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _miniGaugeLabel(NeonTheme t, String label, double value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: color.withOpacity(0.12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w900)),
          const SizedBox(width: 4),
          Text(value.isFinite ? value.toStringAsFixed(0) : '-', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _thinBar(NeonTheme t, String label, double norm, Color color) {
    final v = norm.clamp(0.0, 1.0);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: t.muted, fontSize: 9, fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: SizedBox(
            height: 5,
            child: LayoutBuilder(
              builder: (context, c) => Stack(
                children: [
                  Positioned.fill(child: Container(color: t.bg)),
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    child: SizedBox(width: (c.maxWidth * v).clamp(0.0, c.maxWidth), child: Container(color: color)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  double _atr14Rt(List<rt.Candle> c) {
    if (c.length < 16) return 0.0;
    const len = 14;
    double sum = 0.0;
    for (int i = c.length - len; i < c.length; i++) {
      final cur = c[i];
      final prevClose = c[i - 1].c;
      final tr = math.max(cur.h - cur.l, math.max((cur.h - prevClose).abs(), (cur.l - prevClose).abs()));
      sum += tr;
    }
    return sum / len;
  }

  double _structureStopRt(List<rt.Candle> c, String decision, double entry, double atr) {
    if (c.isEmpty || entry <= 0) return entry;
    final lookback = math.min(40, c.length);
    if (decision == 'LONG') {
      double lo = double.infinity;
      for (int i = c.length - lookback; i < c.length; i++) {
        lo = math.min(lo, c[i].l);
      }
      if (atr > 0 && (entry - lo) < atr * 0.55) lo = entry - atr * 0.55;
      return lo.isFinite ? lo : entry;
    }
    if (decision == 'SHORT') {
      double hi = -double.infinity;
      for (int i = c.length - lookback; i < c.length; i++) {
        hi = math.max(hi, c[i].h);
      }
      if (atr > 0 && (hi - entry) < atr * 0.55) hi = entry + atr * 0.55;
      return hi.isFinite ? hi : entry;
    }
    return entry;
  }

  double _targetByRR(String decision, double entry, double stop, {double rr = 2.0}) {
    final dist = (entry - stop).abs();
    if (dist <= 0) return entry;
    if (decision == 'LONG') return entry + dist * rr;
    if (decision == 'SHORT') return entry - dist * rr;
    return entry;
  }

  Widget _planRowTyron(NeonTheme t, String label, double v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w900))),
          Text(v.isFinite ? v.toStringAsFixed(0) : '-', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _mtfPanel() {
  if (_mtfStates.isEmpty && !_mtfLoading) {
    return Row(
      children: [
        Row(children: const [Text('MTF', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900))]),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: _fetchMTF,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0x22FFFFFF)),
              color: const Color(0x11000000),
            ),
            child: const Text('스캔', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
          ),
        ),
        const Spacer(),
        const Text('모든 TF 방향/확신', style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w800)),
      ],
    );
  }

  String _mtfZoneLine(FuState s) {
    final z = s.zoneName;
    return z.isNotEmpty ? z : '구간정보없음';
  }

  Color cFor(FuState s) {
    final d = s.finalDir.toUpperCase();
    if (d.contains('LONG')) return const Color(0xFF1EEA6A);
    if (d.contains('SHORT')) return const Color(0xFFEA2A2A);
    return const Color(0xFFB3B9C9);
  }

  Widget pill(String tf, FuState s) {
    final c = cFor(s);
    final d = s.finalDir.toUpperCase().contains('LONG')
        ? 'L'
        : s.finalDir.toUpperCase().contains('SHORT')
            ? 'S'
            : 'W';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.45)),
        color: c.withOpacity(0.12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$tf $d ${s.confidence}%', style: TextStyle(color: c, fontSize: 10, fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(_mtfZoneLine(s), style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Row(
      children: [
        Row(children: const [Text('MTF', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900))]),
        const SizedBox(width: 8),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final e in _mtfStates.entries) ...[
                  pill(e.key, e.value),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
        ),
        if (_mtfLoading)
          const Padding(
            padding: EdgeInsets.only(left: 6),
            child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else
          GestureDetector(
            onTap: _fetchMTF,
            child: const Icon(Icons.refresh, size: 16, color: Colors.white54),
          ),
      ],
    ),
  );
  }

  String _pickBestTF() {
    if (_mtfStates.isEmpty) return _tf;
    double score(FuState s) {
      final dir = s.finalDir.toUpperCase();
    final d = dir.contains('LONG') || dir.contains('SHORT') ? 1.0 : 0.4;
    final conf = (s.confidence / 100.0).clamp(0.0, 1.0);
    final rr = (s.rr / 2.0).clamp(0.0, 1.0);
    final z = (_supportProb(s) + _resistProb(s)) / 200.0;
      return d * (conf * 0.45 + rr * 0.35 + z * 0.20);
    }
    String best = _tf;
    double bestScore = -1;
    _mtfStates.forEach((tf, s) {
      final sc = score(s);
      if (sc > bestScore) {
        bestScore = sc;
        best = tf;
      }
    });
    return best;
  }

  Future<void> _bootAuto() async {
  // 1) MTF 스캔
  await _fetchMTF();
  // 2) AUTO TF 선택
  final best = _pickBestTF();
  if (best != _tf) {
    setState(() {
      _tf = best;
      _tfLoading = true;
    });
    final eng = FuEngine();
    try {
      final st = await eng.fetch(symbol: widget.symbol, tf: best, allowNetwork: true, safeMode: true);
      if (!mounted) return;
      setState(() {
        _curState = st;
        _tfLoading = false;
        _entry = null;
        _sl = null;
        _tp = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _tfLoading = false);
    }
  }
  // 3) 모드 AUTO
  if (_mode != 'AUTO') {
    setState(() => _mode = 'AUTO');
  }
  _rebuild();
  }

  Widget _candleCountSelector() {
    const options = [80, 120, 190, 200];
    return Row(
      children: [
        const Text('캔들 수', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
        const SizedBox(width: 8),
        for (final n in options) ...[
          GestureDetector(
            onTap: () => setState(() => _visibleCandleCount = n),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _visibleCandleCount == n ? const Color(0x66FFFFFF) : const Color(0x22FFFFFF)),
                color: _visibleCandleCount == n ? const Color(0x22FFFFFF) : const Color(0x11000000),
              ),
              child: Text('$n', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(width: 6),
        ],
      ],
    );
  }

  Widget _aiManagerBriefing(NeonTheme t, FuState s) {
    final dir = s.signalDir.toUpperCase();
    final isLong = dir.contains('LONG');
    final isShort = dir.contains('SHORT');
    final pos = (s.reactLow > 0 && s.reactHigh > 0)
        ? (_livePrice <= s.reactLow * 1.002 ? '지지 근처' : (_livePrice >= s.reactHigh * 0.998 ? '저항 근처' : '중간 구간'))
        : '중간 구간';
    final flow = '호가 매수 ${s.signalProb}% · 체결·고래 반영';
    final action = (s.locked || !s.showSignal)
        ? '매매 금지 (조건 불충분)'
        : (s.confidence >= 75 ? (isLong ? '분할 매수 진입 고려' : (isShort ? '분할 매도 진입 고려' : '관망')) : '관망 권장');
    final tfKo = _tfLabelKo(_tf);
    final src = 'Bitget 실시간 · ${tfKo}봉 기준 · 분/시간/일/주/달 TF별 실시간 반영';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF1E2A3D).withOpacity(0.95),
            const Color(0xFF0D1520),
          ],
        ),
        border: Border.all(color: const Color(0xFF39FFB6).withOpacity(0.2)),
        boxShadow: [
          BoxShadow(color: const Color(0xFF39FFB6).withOpacity(0.06), blurRadius: 12),
          BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 16, color: const Color(0xFF39FFB6).withOpacity(0.9)),
              const SizedBox(width: 6),
              Text('완전 AI 완자동 매니저 · 실시간', style: TextStyle(color: t.textStrong, fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          Text('· 실시간 현재가: ${_livePrice.toStringAsFixed(0)} (거래소 연동)', style: TextStyle(color: const Color(0xFF39FFB6).withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w800)),
          Text('· 분/시간/일/주/달 각 TF별로 실시간 분석·브리핑 반영', style: TextStyle(color: const Color(0xFF39FFB6).withOpacity(0.85), fontSize: 10, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('· 포지션: $pos', style: TextStyle(color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
          Text('· 흐름: $flow', style: TextStyle(color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
          Text('· 권장: $action', style: TextStyle(color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
          Text('· 출처: $src', style: TextStyle(color: t.textSecondary.withOpacity(0.8), fontSize: 9, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  /// 롱/숏/관망 3분할 게이지 (실데이터 %, 애니메이션)
  Widget _buildLongShortWaitGauge(NeonTheme t, int longPct, int shortPct, int waitPct) {
    final total = (longPct + shortPct + waitPct).clamp(1, 300);
    final l = longPct / total;
    final s = shortPct / total;
    final w = waitPct / total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('롱 ', style: TextStyle(color: t.good, fontSize: 11, fontWeight: FontWeight.w800)),
            Text('숏 ', style: TextStyle(color: t.bad, fontSize: 11, fontWeight: FontWeight.w800)),
            Text('관망', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            height: 20,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final ww = constraints.maxWidth;
                return TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: const Duration(milliseconds: 400),
                  curve: Curves.easeOutCubic,
                  builder: (context, k, _) {
                    final lW = (ww * l * k).clamp(0.0, ww);
                    final sW = (ww * s * k).clamp(0.0, ww);
                    final wW = (ww - lW - sW).clamp(0.0, ww);
                    return Row(
                      children: [
                        if (lW > 1) SizedBox(width: lW, child: Container(color: t.good.withOpacity(0.85))),
                        if (sW > 1) SizedBox(width: sW, child: Container(color: t.bad.withOpacity(0.85))),
                        if (wW > 1) SizedBox(width: wW, child: Container(color: t.muted.withOpacity(0.6))),
                      ],
                    );
                  },
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '롱 ${longPct}% · 숏 ${shortPct}% · 관망 ${waitPct}%',
          style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  /// 근거 Hit/Total 바 + 게이트(NO-TRADE 시 펄스)
  Widget _buildEvidenceBarAndGate(NeonTheme t, FuState s, bool isNoTrade) {
    final total = s.evidenceTotal.clamp(1, 10);
    final hit = s.evidenceHit.clamp(0, total);
    final ratio = hit / total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('근거 ', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 10,
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: ratio),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                    builder: (context, v, _) => LayoutBuilder(
                      builder: (context, c) => Stack(
                        children: [
                          Positioned.fill(child: Container(color: t.bg)),
                          Positioned(
                            left: 0,
                            top: 0,
                            bottom: 0,
                            child: SizedBox(
                              width: (c.maxWidth * v).clamp(0.0, c.maxWidth),
                              child: Container(color: t.accent),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text('$hit/$total', style: TextStyle(color: t.text, fontSize: 12, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 6),
        _NoTradeGatePill(t: t, gate: s.decisionTitle, isNoTrade: isNoTrade),
      ],
    );
  }

  /// 결정: 롱/숏/관망 · 확신 OO% 한 줄 (한눈에)
  Widget _buildDecisionSummaryLine(NeonTheme t, FuState s, bool isLong, bool isShort, Color directionColor) {
    final dirKo = isLong ? '롱' : (isShort ? '숏' : '관망');
    final conf = s.confidence.clamp(0, 100);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: directionColor.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: directionColor.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Text('결정: ', style: TextStyle(color: t.muted, fontSize: 14, fontWeight: FontWeight.w700)),
          Text(dirKo, style: TextStyle(color: directionColor, fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(width: 12),
          Text('· 확신 ', style: TextStyle(color: t.muted, fontSize: 14, fontWeight: FontWeight.w700)),
          Text('$conf%', style: TextStyle(color: directionColor, fontSize: 18, fontWeight: FontWeight.w900)),
          const Spacer(),
          Text(conf >= 75 ? '믿을 만함' : (conf >= 50 ? '참고' : '낮음'), style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  /// 매매 초보용: "오른다/내린다/관망" 한줄 요약 (signalDir + signalKo 기반)
  String _oneLineForBeginner(FuState s) {
    final dir = (s.pLocked && s.pLockDir != 'NO' ? s.pLockDir : s.signalDir).toUpperCase();
    if (dir == 'LONG') return '📈 오를 가능성 · 상승 쪽이 조금 더 유리해요';
    if (dir == 'SHORT') return '📉 내릴 가능성 · 하락 쪽이 조금 더 유리해요';
    return '⏸ 방향 애매 · 지금은 관망이 좋아요';
  }

  // === FUTURE PATH TOP PANEL (요청: 이 화면에 "결정 종가 게이지 + AI 매니저" 넣기) ===
  Widget _decisionCloseGaugeAndManager(NeonTheme t, FuState s, {required String tfLabel}) {
    final int closeScore = s.closeScore.clamp(0, 100);
    final int breakoutScore = s.breakoutScore.clamp(0, 100);
    final int volumeScore = s.volumeScore.clamp(0, 100);

    // 종가 기준 게이트(마감이 핵심) — closeScore를 메인으로 쓰고, breakout/volume은 보조.
    final int decisionScore = ((closeScore * 0.55) + (breakoutScore * 0.25) + (volumeScore * 0.20)).round().clamp(0, 100);

    final String dir = (s.pLocked && s.pLockDir != 'NO') ? s.pLockDir : s.signalDir;
    final bool isLong = dir.toUpperCase() == 'LONG';
    final bool isShort = dir.toUpperCase() == 'SHORT';

    final String decisionLabel = decisionScore >= 72
        ? '확정'
        : (decisionScore >= 60 ? '우위' : (decisionScore >= 52 ? '주의' : '대기'));

    final _CandleCountdown cd = _calcCandleCountdown(s, tfLabel);

    final String oneLine = _oneLineForBeginner(s);
    final Color oneLineColor = isLong ? t.good : (isShort ? t.bad : t.muted);
    final bool isNoTrade = s.locked || (s.decisionTitle.toUpperCase().contains('NO-TRADE'));

    // 롱/숏/관망 비율 (zone 또는 signal 기반, 0~100 합 100)
    int lP = s.zoneLongP.clamp(0, 100);
    int sP = s.zoneShortP.clamp(0, 100);
    int wP = s.zoneWaitP.clamp(0, 100);
    final int sum = lP + sP + wP;
    if (sum <= 0) {
      lP = (s.longPct * 100).round().clamp(0, 100);
      sP = (s.shortPct * 100).round().clamp(0, 100);
      wP = (100 - lP - sP).clamp(0, 100);
    } else if (sum != 100) {
      lP = (lP * 100 / sum).round();
      sP = (sP * 100 / sum).round();
      wP = 100 - lP - sP;
    }

    return Container(
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.line.withOpacity(0.65)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius: 12, offset: const Offset(0, 6)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ✅ 결정: 롱/숏/관망 · 확신 OO% (한눈에)
          _buildDecisionSummaryLine(t, s, isLong, isShort, oneLineColor),
          const SizedBox(height: 8),
          // ✅ 초보용 한줄 + NO-TRADE 시 펄스
          _AnimatedOneLine(oneLine: oneLine, oneLineColor: oneLineColor, isNoTrade: isNoTrade),
          const SizedBox(height: 10),

          // ✅ 롱/숏/관망 3분할 게이지 (실데이터, 애니메이션)
          _buildLongShortWaitGauge(t, lP, sP, wP),
          const SizedBox(height: 10),

          Row(
            children: [
              Text('결정 종가 게이지', style: TextStyle(color: t.text, fontWeight: FontWeight.w800)),
              const SizedBox(width: 6),
              Text('(왼쪽=하락, 오른쪽=상승)', style: TextStyle(color: t.muted.withOpacity(0.8), fontSize: 10, fontWeight: FontWeight.w500)),
              const SizedBox(width: 8),
              _pill(
                t,
                text: '$decisionLabel $decisionScore%',
                color: decisionScore >= 72
                    ? (isShort ? t.bad : t.good)
                    : (decisionScore >= 60 ? t.accent : t.muted),
              ),
              const Spacer(),
              if (cd.hasCountdown)
                Text(
                  '마감까지 ${cd.pretty}',
                  style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w600),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // 메인 BEAR-BULL 게이지 (폭 대비 비율 + 애니메이션)
          _scoreGaugeAnimated(
            t,
            value: decisionScore / 100.0,
            leftLabel: 'BEAR',
            rightLabel: 'BULL',
            highlight: isLong ? 'BULL' : (isShort ? 'BEAR' : 'NEUTRAL'),
          ),

          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _miniScoreChip(t, '종가', closeScore, primary: true),
              _miniScoreChip(t, '돌파', breakoutScore),
              _miniScoreChip(t, '거래량', volumeScore),
              if (s.tapeBuyPct > 0) _miniScoreChip(t, '체결매수', s.tapeBuyPct.clamp(0, 100).round()),
              if (s.obImbalance.abs() > 0.0001) _miniScoreChip(t, '호가', ((s.obImbalance + 1) * 50).round().clamp(0, 100)),
              if (s.whaleScore > 0) _miniScoreChip(t, '고래', s.whaleScore.clamp(0, 100)),
              if (s.pLocked) _pill(t, text: 'P-LOCK ${s.pLockDir} ${s.pLockProb}%', color: t.accent),
              if (!s.consensusOk) _pill(t, text: '합의부족', color: t.bad.withOpacity(0.9)),
              if (!s.roiOk) _pill(t, text: 'ROI부족', color: t.bad.withOpacity(0.9)),
            ],
          ),
          const SizedBox(height: 4),
          Text('종가=마감 품질 · 돌파=방향전환 신호 · 거래량=거래 강도 · ROI부족=수익률 조건 미달', style: TextStyle(color: t.muted.withOpacity(0.7), fontSize: 9, fontWeight: FontWeight.w500)),

          const SizedBox(height: 10),

          // 엔트리/SL/TP + 레버/수량 (이미 계산된 값 사용)
          Container(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
            decoration: BoxDecoration(
              color: t.bg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.line.withOpacity(0.45)),
            ),
            child: Row(
              children: [
                _kvThemed(t, '진입', _fmt(s.entry)),
                const SizedBox(width: 10),
                _kvThemed(t, '손절', _fmt(s.stop)),
                const SizedBox(width: 10),
                _kvThemed(t, '목표', _fmt(s.target)),
                const Spacer(),
                _kvThemed(t, '레버', s.leverage <= 0 ? '-' : '${s.leverage.toStringAsFixed(1)}x'),
                const SizedBox(width: 10),
                _kvThemed(t, '수량', s.qty <= 0 ? '-' : _fmtQty(s.qty)),
              ],
            ),
          ),

          const SizedBox(height: 10),
          Text('AI 매니저 (실시간 근거)', style: TextStyle(color: t.text, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),

          // ✅ 근거 Hit/Total 게이지 + 게이트(NO-TRADE) 펄스 (문장/불릿 제거)
          _buildEvidenceBarAndGate(t, s, isNoTrade),
        ],
      ),
    );
  }

  /// BEAR-BULL 게이지: 폭 대비 비율 + 애니메이션 니들
  Widget _scoreGaugeAnimated(
    NeonTheme t, {
    required double value,
    required String leftLabel,
    required String rightLabel,
    required String highlight,
  }) {
    final double v = value.clamp(0.0, 1.0);
    return Column(
      children: [
        Row(
          children: [
            Text(leftLabel, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text(
              highlight,
              style: TextStyle(
                color: highlight == 'BULL' ? t.good : (highlight == 'BEAR' ? t.bad : t.muted),
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
            const Spacer(),
            Text(rightLabel, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            height: 18,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final barWidth = constraints.maxWidth;
                return Stack(
                  children: [
                    Positioned.fill(
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [t.bad.withOpacity(0.85), t.line.withOpacity(0.6), t.good.withOpacity(0.85)],
                            stops: const [0.0, 0.5, 1.0],
                          ),
                        ),
                      ),
                    ),
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: v),
                      duration: const Duration(milliseconds: 450),
                      curve: Curves.easeOutCubic,
                      builder: (context, animV, _) => Positioned(
                        left: (animV * barWidth - 1).clamp(0.0, barWidth - 2),
                        top: 0,
                        bottom: 0,
                        child: Container(
                          width: 3,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(1),
                            boxShadow: [BoxShadow(color: Colors.black38, blurRadius: 2, offset: const Offset(0, 1))],
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _scoreGauge(
    NeonTheme t, {
    required double value,
    required String leftLabel,
    required String rightLabel,
    required String highlight,
  }) => _scoreGaugeAnimated(t, value: value, leftLabel: leftLabel, rightLabel: rightLabel, highlight: highlight);

  Widget _miniScoreChip(NeonTheme t, String label, int score, {bool primary = false}) {
    final int s = score.clamp(0, 100);
    final Color c = s >= 70 ? t.good : (s >= 55 ? t.accent : t.bad);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (primary ? c.withOpacity(0.18) : t.bg),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: (primary ? c : t.line).withOpacity(0.65)),
      ),
      child: Text('$label $s%', style: TextStyle(color: primary ? c : t.text, fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }

  Widget _pill(NeonTheme t, {required String text, required Color color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.65)),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }

  Widget _kvThemed(NeonTheme t, String k, String v) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(k, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(v, style: TextStyle(color: t.text, fontSize: 12, fontWeight: FontWeight.w900)),
      ],
    );
  }

  String _fmt(double x) {
    if (x.isNaN || x.isInfinite || x <= 0) return '-';
    return x >= 1000 ? x.toStringAsFixed(0) : x.toStringAsFixed(2);
  }

  String _fmtQty(double x) {
    if (x.isNaN || x.isInfinite || x <= 0) return '-';
    if (x >= 1) return x.toStringAsFixed(3);
    return x.toStringAsFixed(6);
  }

  _CandleCountdown _calcCandleCountdown(FuState s, String tfLabel) {
    if (s.candles.isEmpty) return const _CandleCountdown.none();
    final int tfSec = _tfSecondsFromLabel(tfLabel);
    if (tfSec <= 0) return const _CandleCountdown.none();
    final int lastTs = s.candles.last.ts;
    final int endTs = lastTs + (tfSec * 1000);
    final int now = DateTime.now().millisecondsSinceEpoch;
    final int remainMs = endTs - now;
    if (remainMs <= 0) return const _CandleCountdown.none();
    return _CandleCountdown(remainMs: remainMs);
  }

  int _tfSecondsFromLabel(String tf) {
    final String x = tf.trim().toUpperCase();
    if (x == '5M') return 5 * 60;
    if (x == '15M') return 15 * 60;
    if (x == '1H') return 60 * 60;
    if (x == '4H') return 4 * 60 * 60;
    if (x == '1D') return 24 * 60 * 60;
    if (x == '1W') return 7 * 24 * 60 * 60;
    if (x == '1M') return 30 * 24 * 60 * 60;
    if (x == '1Y') return 365 * 24 * 60 * 60;
    return 0;
  }

  String _formatDuration(Duration d) {
    final int totalSec = d.inSeconds;
    if (totalSec <= 0) return '0s';
    final int days = totalSec ~/ 86400;
    final int hrs = (totalSec % 86400) ~/ 3600;
    final int mins = (totalSec % 3600) ~/ 60;
    final int secs = totalSec % 60;
    if (days > 0) return '${days}d ${hrs}h';
    if (hrs > 0) return '${hrs}h ${mins}m';
    if (mins > 0) return '${mins}m ${secs}s';
    return '${secs}s';
  }

  static String _tfLabelKo(String tf) {
    switch (tf) {
      case '5m': return '5분';
      case '15m': return '15분';
      case '1h': return '1시간';
      case '4h': return '4시간';
      case '1D': return '1일';
      case '1W': return '1주';
      case '1M': return '1달';
      case '1Y': return '1년';
      default: return tf;
    }
  }

  /// 멀티타임프레임 중 확정 신호(롱/숏)가 있는지 확인
  ({bool hasSignal, String tf, FuState? state}) _confirmedSignalState() {
    if (_curState.confidence >= 75) {
      final d = _curState.signalDir.toUpperCase();
      if (d.contains('LONG') || d.contains('SHORT')) {
        return (hasSignal: true, tf: _tf, state: _curState);
      }
    }
    for (final e in _mtfStates.entries) {
      if (e.value.confidence >= 75) {
        final d = e.value.signalDir.toUpperCase();
        if (d.contains('LONG') || d.contains('SHORT')) {
          return (hasSignal: true, tf: e.key, state: e.value);
        }
      }
    }
    return (hasSignal: false, tf: _tf, state: null);
  }

  Widget _signalAlarmChip(FuState s) {
    final res = _confirmedSignalState();
    if (!res.hasSignal || res.state == null) return const SizedBox.shrink();

    final st = res.state!;
    final tfKo = _tfLabelKo(res.tf);
    final isLong = st.signalDir.toUpperCase().contains('LONG');
    final c = isLong ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A);

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: GestureDetector(
        onTap: () => _showSignalDetailCard(this.context, res.tf, st),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: LinearGradient(
              colors: [c.withOpacity(0.25), c.withOpacity(0.08)],
            ),
            border: Border.all(color: c.withOpacity(0.6)),
            boxShadow: [BoxShadow(color: c.withOpacity(0.2), blurRadius: 10)],
          ),
          child: Row(
            children: [
              Icon(Icons.notifications_active, size: 20, color: c),
              const SizedBox(width: 10),
              Text(
                '$tfKo에서 롱숏 신호 발생 · 탭하면 상세',
                style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSignalDetailCard(BuildContext ctx, String tf, FuState st) {
    final tfKo = _tfLabelKo(tf);
    final isLong = st.signalDir.toUpperCase().contains('LONG');
    final c = isLong ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A);
    final price = st.candles.isNotEmpty ? st.candles.last.close : _livePrice;
    final entry = st.entry > 0 ? st.entry : price;
    final sl = st.stop > 0 ? st.stop : (entry * (isLong ? 0.995 : 1.005));
    final tp = st.target > 0 ? st.target : (entry * (isLong ? 1.01 : 0.99));
    final balance = AppSettings.accountUsdt;
    final sizing = RiskSizing.size(balance: balance, entry: entry, sl: sl, riskPct: AppSettings.riskPct / 100.0);
    final qty = (sizing['qty'] ?? 0.0) as double;
    final lev = (sizing['leverage'] ?? 1) as int;
    final effLev = st.leverage > 0 ? st.leverage.round() : lev;
    final rr = (entry - sl).abs() > 0 ? ((tp - entry).abs() / (entry - sl).abs()).toStringAsFixed(2) : '-';

    showDialog(
      context: ctx,
      barrierColor: Colors.black54,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 24),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xFF1A1F35),
                const Color(0xFF0D1220),
              ],
            ),
            border: Border.all(color: c.withOpacity(0.5)),
            boxShadow: [
              BoxShadow(color: c.withOpacity(0.2), blurRadius: 20),
              BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 16),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.insights, color: c, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    '$tfKo에서 신호 확정',
                    style: TextStyle(color: c, fontSize: 16, fontWeight: FontWeight.w900),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white54),
                    onPressed: () => Navigator.of(ctx).pop(),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _detailRow('진입가', entry.toStringAsFixed(0), Colors.white),
              _detailRow('시드(잔고)', '${balance.toStringAsFixed(0)} U', Colors.white70),
              _detailRow('레버리지', '${effLev}x', c),
              _detailRow('손절', sl.toStringAsFixed(0), const Color(0xFFFF4D6D)),
              _detailRow('수익(목표)', tp.toStringAsFixed(0), const Color(0xFF39FFB6)),
              _detailRow('수량', qty >= 0.01 ? qty.toStringAsFixed(4) : qty.toStringAsFixed(6), Colors.white70),
              _detailRow('RR', rr, const Color(0xFFFFD166)),
              const SizedBox(height: 12),
              Text(
                '위 값은 ${AppSettings.riskPct.toStringAsFixed(0)}% 리스크 기준 자동 계산입니다.',
                style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 10, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value, Color valueColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w800)),
          Text(value, style: TextStyle(color: valueColor, fontSize: 13, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

/// 한줄 요약 + NO-TRADE 시 펄스
class _AnimatedOneLine extends StatefulWidget {
  final String oneLine;
  final Color oneLineColor;
  final bool isNoTrade;

  const _AnimatedOneLine({required this.oneLine, required this.oneLineColor, required this.isNoTrade});

  @override
  State<_AnimatedOneLine> createState() => _AnimatedOneLineState();
}

class _AnimatedOneLineState extends State<_AnimatedOneLine> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));
    _pulse = Tween<double>(begin: 0.72, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
    if (widget.isNoTrade) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _AnimatedOneLine oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isNoTrade && !_ctrl.isAnimating) _ctrl.repeat(reverse: true);
    if (!widget.isNoTrade && _ctrl.isAnimating) _ctrl.stop();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isNoTrade) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: widget.oneLineColor.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: widget.oneLineColor.withOpacity(0.4)),
        ),
        child: Text(
          widget.oneLine,
          style: TextStyle(color: widget.oneLineColor, fontSize: 14, fontWeight: FontWeight.w900, height: 1.2),
        ),
      );
    }
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: widget.oneLineColor.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: widget.oneLineColor.withOpacity(0.4 * _pulse.value)),
        ),
        child: Text(
          widget.oneLine,
          style: TextStyle(color: widget.oneLineColor.withOpacity(_pulse.value), fontSize: 14, fontWeight: FontWeight.w900, height: 1.2),
        ),
      ),
    );
  }
}

/// 게이트 뱃지 + NO-TRADE 시 펄스
class _NoTradeGatePill extends StatefulWidget {
  final NeonTheme t;
  final String gate;
  final bool isNoTrade;

  const _NoTradeGatePill({required this.t, required this.gate, required this.isNoTrade});

  @override
  State<_NoTradeGatePill> createState() => _NoTradeGatePillState();
}

class _NoTradeGatePillState extends State<_NoTradeGatePill> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    _pulse = Tween<double>(begin: 0.75, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
    if (widget.isNoTrade) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _NoTradeGatePill oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isNoTrade && !_ctrl.isAnimating) _ctrl.repeat(reverse: true);
    if (!widget.isNoTrade && _ctrl.isAnimating) _ctrl.stop();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isNo = widget.gate.toUpperCase().contains('NO-TRADE');
    final color = isNo ? widget.t.bad : widget.t.accent;
    if (!widget.isNoTrade) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.16),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withOpacity(0.65)),
        ),
        child: Text('게이트: ${widget.gate}', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w800)),
      );
    }
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.16 * _pulse.value + 0.1),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withOpacity(0.5 + 0.2 * _pulse.value)),
        ),
        child: Text('게이트: ${widget.gate}', style: TextStyle(color: color.withOpacity(_pulse.value), fontSize: 12, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

/// TYRON 결정 뱃지 (NO TRADE 시 펄스)
class _TyronDecisionPill extends StatefulWidget {
  final String decision;
  final int confirm;
  final Color color;
  final bool isNoTrade;

  const _TyronDecisionPill({required this.decision, required this.confirm, required this.color, required this.isNoTrade});

  @override
  State<_TyronDecisionPill> createState() => _TyronDecisionPillState();
}

class _TyronDecisionPillState extends State<_TyronDecisionPill> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    _pulse = Tween<double>(begin: 0.7, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
    if (widget.isNoTrade) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _TyronDecisionPill oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isNoTrade && !_ctrl.isAnimating) _ctrl.repeat(reverse: true);
    if (!widget.isNoTrade && _ctrl.isAnimating) _ctrl.stop();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String label = widget.decision == 'NO TRADE' ? 'NO TRADE' : (widget.decision == 'LONG' ? 'L' : 'S');
    if (!widget.isNoTrade) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: widget.color.withOpacity(0.2),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: widget.color.withOpacity(0.6)),
        ),
        child: Text('$label ${widget.confirm}%', style: TextStyle(color: widget.color, fontWeight: FontWeight.w900, fontSize: 12)),
      );
    }
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: widget.color.withOpacity(0.15 * _pulse.value + 0.05),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: widget.color.withOpacity(0.4 + 0.3 * _pulse.value)),
        ),
        child: Text('$label ${widget.confirm}%', style: TextStyle(color: widget.color.withOpacity(_pulse.value), fontWeight: FontWeight.w900, fontSize: 12)),
      ),
    );
  }
}

/// 거래소 실시간 현재가 + 갱신 시 눈에 보이는 펄스
class _RealtimePricePulse extends StatefulWidget {
  final double price;
  final String symbol;

  const _RealtimePricePulse({required this.price, required this.symbol});

  @override
  State<_RealtimePricePulse> createState() => _RealtimePricePulseState();
}

class _RealtimePricePulseState extends State<_RealtimePricePulse> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _scale = Tween<double>(begin: 1.0, end: 1.04).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
  }

  @override
  void didUpdateWidget(covariant _RealtimePricePulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.price != widget.price) {
      _ctrl.forward(from: 0);
      _ctrl.reverse();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String _fmtPrice(double p) {
    final s = p >= 1000 ? p.toStringAsFixed(0) : p.toStringAsFixed(2);
    if (p >= 1000) {
      return s.replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},');
    }
    return s;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _scale,
      builder: (context, child) => Transform.scale(
        scale: _scale.value,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFF00E676).withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF00E676).withOpacity(0.5)),
            boxShadow: [BoxShadow(color: const Color(0xFF00E676).withOpacity(0.15), blurRadius: 8)],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF00E676),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Color(0xFF00E676), blurRadius: 4)],
                ),
              ),
              const SizedBox(width: 8),
              Text('Bitget 실시간 연동', style: TextStyle(color: const Color(0xFF00E676).withOpacity(0.95), fontSize: 10, fontWeight: FontWeight.w800)),
              const SizedBox(width: 10),
              Text('현재가 ', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
              Text(_fmtPrice(widget.price), style: const TextStyle(color: Color(0xFF39FFB6), fontSize: 14, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      ),
    );
  }
}
