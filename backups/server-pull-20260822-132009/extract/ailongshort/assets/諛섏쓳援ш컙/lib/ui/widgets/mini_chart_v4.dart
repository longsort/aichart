import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/analysis/candle_event_analyzer.dart';
import '../../core/app_settings.dart';
import 'neon_theme.dart';

class MiniChartLine {
  /// candle index 기준 (0..len-1)
  final int i1;
  final int i2;
  /// price 값
  final double p1;
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

  /// 타임프레임 키 (예: 1m/5m/15m/1h/4h/1D/1W/1M)
  /// 기본값은 ''이며, title에서 자동 추론된다.
  final String tfKey;

  final double price;
  final double s1;
  final double r1;

  // 구조/반응 구간(CHOCH/BOS) 표시
  final String structureTag;
  final double reactLevel;
  final double reactLow;
  final double reactHigh;

  /// CoreAI 방향 (롱/숏/LOCK)
  final String? bias;
  /// 확률(0~100)
  final int? prob;

  /// 확정 진입 표시(차트 오버레이)
  final bool showPlan;
  final double entry;
  final double stop;
  final double target;

  /// AI 패턴 작도(추세선/수렴선 등)
  final List<MiniChartLine> overlayLines;
  final String overlayLabel;

  /// (옵션) 차트 높이 강제/조절
  /// - [heightOverride] 지정 시 그대로 사용
  /// - 미지정 시 기본 비율 계산값에 [heightMin]/[heightMax] clamp 적용
  final double? heightOverride;
  final double? heightMin;
  final double? heightMax;

  // ✅ BOS / CHoCH 표시 (설정 패널 토글과 연결)
  final bool showBOS;
  final bool showCHoCH;

  /// (옵션) 차트 현재(0) 앵커 키(가이드 라인 연결용)
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

  // 타임프레임별 미니차트 목표 캔들 개수(밀도/가독성 기준)
  // 데이터가 적으면 그대로 그리되, Painter에서 캔들 폭을 자동으로 키워 간격을 줄인다.
  int _preferredVisibleCount(String tfKey) {
    // Default visible candles per timeframe (user can pinch/zoom).
    // 월봉은 2019-07~현재 79봉 기준 -> 기본 90봉 확보
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

  // 우측 여백(미래 투영 공간) 확보
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
      // "없음" 문구는 공간만 차지해서 숨김(필요할 때만 표시)
      if (ev.typeKo == '없음') return '';
      if (ev.sample < 5) return '${ev.typeKo} 발생(표본 부족: ${ev.sample}) — 확률은 참고만';
      return '${ev.typeKo} 발생(표본 ${ev.sample})  |  상승확률: 1캔들 ${ev.pUp1}%, 3캔들 ${ev.pUp3}%, 5캔들 ${ev.pUp5}%';
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
              // 텍스트는 길어져도 줄바꿈/말줄임으로 안전하게
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
                      '실시간 ${widget.price > 0 ? widget.price.toStringAsFixed(widget.price >= 100 ? 2 : 6) : '--'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: t.fg.withOpacity(0.72), fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // 배지는 화면이 좁으면 자동 줄바꿈
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.end,
                children: [
                  if (nearSupport) badge('지지 근접', t.good),
                  if (nearResist) badge('저항 근접', t.bad),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          // 미니차트 비율(높이) 패치: 화면이 커져도 과도하게 길어지지 않게 고정 비율 + 상/하한
          Expanded(
            child: LayoutBuilder(
            builder: (context, cts) {
              final w = cts.maxWidth.isFinite ? cts.maxWidth : MediaQuery.of(context).size.width;
              // 1분봉처럼 캔들이 많아지면 폭이 너무 좁아 "점"처럼 보일 수 있어서
              // 화면 픽셀폭에 맞춰 자동으로 샘플링(표시용)한다.
              // ⚠️ 중요: 단순 "n개마다 1개" 샘플링을 하면
              // - 시간축이 건너뛰어서 캔들이 듬성듬성(공백/점) 보이고
              // - 캔들 형태(OHLC)가 망가진다.
              // 해결: (1) ts 정렬 고정 (2) 화면폭 기반 "버킷 OHLC 압축"으로 밀도 유지
              final raw0 = widget.candles;
              final raw = [...raw0]..sort((a, b) => a.ts.compareTo(b.ts));

              // 캔들이 "점"처럼 보이지 않게: 슬롯폭이 최소 5~6px 정도 나오도록 목표 캔들 수를 제한
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
              // 타임프레임별로 보이는 캔들 밀도를 맞추기 위해 최근 N개만 사용
              final int prefVis = _preferredVisibleCount(_resolvedTfKey);
              if (cView.length > prefVis) {
                cView = cView.sublist(cView.length - prefVis);
              }

              // 기본: width:height ~= 2.8:1 (모바일/PC 둘 다 안정)
              // 단, 상위 위젯이 Expanded/SizedBox 등으로 높이를 명확히 주는 경우
              // 그 높이를 우선 사용해서 "차트 아래 빈공간"을 없앤다.
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
                            // 확대/축소(InteractiveViewer)는 캔들 짤림/왜곡 이슈가 있어 비활성화.
                            // 메인 화면은 "비율 고정"으로만 표시하고, 필요 시 향후 전용 차트 화면에서 제공.
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
                                    // 사용자 설정
                                    showOB: s.showOB.value,
                                    showFVG: s.showFVG.value,
                                    showBPR: s.showBPR.value,
                                    showMB: s.showMB.value,
                                    showBos: s.showBOS.value,
                                    showChoch: s.showCHoCH.value,
                                    zoneOpacity: s.zoneOpacity.value,
                                    labelOpacity: s.labelOpacity.value,
                                    // 확률이 높을수록 FX가 강해 보이도록 0..1 정규화
                                    intensity: ((widget.prob ?? 0) / 100.0).clamp(0.0, 1.0),
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
                                _lightChart ? '라이트' : '다크',
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
  // 라이트/다크 차트 배경 토글
  final bool light;
  final String structureTag;
  final double reactLevel;
  final double reactLow;
  final double reactHigh;
  final double blink;
  /// FX 강도(0..1). 확률/신뢰도가 높을수록 링/펄스가 더 크게 보이도록 사용.
  final double intensity;
  final String? bias;
  final int? prob;
  final bool showPlan;
  final double entry;
  final double stop;
  final double target;

  final List<MiniChartLine> overlayLines;
  final String overlayLabel;

  // 오버레이 표시/투명도(설정에서 조절)
  final bool showOB;
  final bool showFVG;
  final bool showBPR;
  final bool showMB;
  final bool showBos;
  final bool showChoch;
  final double zoneOpacity;
  final double labelOpacity;

  /// 타임프레임 키 (우측 미래 여백/투영 길이 계산용)
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

    // --- 스케일링 안정화(거래소 느낌: 최근 N개 캔들 기준) ---
    // 미니차트는 타임프레임에 따라 더 많은 캔들이 필요할 때가 있어
    // 기본 가시 캔들 상한을 조금 넉넉하게 둔다.
    const int maxVis = 160;
    final int startIndex = c.length > maxVis ? (c.length - maxVis) : 0;
    final List<FuCandle> rawVis = c.sublist(startIndex);

    // ⚠️ 데이터가 0/NaN/역전(high<low) 상태로 섞여 있으면
    // 자동 스케일(rangeMin/Max)이 망가지면서 캔들이 "점"처럼 보이거나
    // 화면이 비정상적으로 잘리는 문제가 생김.
    // => 표시/스케일 계산은 '정상 캔들'만으로 진행.
    final List<FuCandle> _filtered = rawVis
        // 데이터 깨짐(0값/NaN/비정상 스파이크) 강하게 제거
        .where((e) => e.open.isFinite && e.close.isFinite && e.high.isFinite && e.low.isFinite)
        .where((e) => e.open > 0 && e.close > 0 && e.high > 0 && e.low > 0)
        .where((e) => e.high >= e.low)
        // 거래소/수집 오류로 한 캔들만 튀는 경우(예: low=1, high=1000000) 제거
        .where((e) => (e.high / e.low) <= 5.0)
        .toList();

    // 전부 필터돼버리면 raw를 그대로 써서 UI가 죽는걸 막는다.
    final List<FuCandle> vis = _filtered.isNotEmpty ? _filtered : rawVis;
    final int n = vis.length;
    if (n == 0) return;

    // === 구조(스윙/이퀄/BOS/MSB) 자동 오버레이 v0.1 ===
    // - 엔진/서버 없이 차트만으로 EQL/EQH + BOS/MSB를 즉시 표시
    // - "미래차트" 관점: 과거에 반복된 '같은 고점/저점'과 '스윙 돌파'는
    //   향후 가격이 반응/스윕/리테스트할 확률이 높은 구간이므로
    //   차트에 고정 라벨로 박아둔다.

    // y-range는 vis 기준 + outlier 완화(5%~95%)
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

    // 표시 중인 존들은 스케일에 포함(캔들 잘림 방지)
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

    // 소표본(주봉/월봉 포함)에서도 outlier 1개로 차트가 납작해지는 문제를 막기 위해
    // 퍼센타일 기반으로 y-range를 잡는다(보간).
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
      // 퍼센타일이 말이 안되면 fallback
      if (p95 > p05 && p05 > 0) {
        lo = p05;
        hi = p95;
      }
    }

    // 그래도 비정상값이 있으면 전체 범위로 복귀
    if (!(hi.isFinite && lo.isFinite) || hi <= lo) {
      lo = pts.first;
      hi = pts.last;
    }

    // 상하 여유(캔들 윗/아랫꼬리 안 짤리게)
    // range가 매우 작을 때도 최소 여백을 강제(줌/스케일과 무관하게 안정)
    final range = (hi - lo).abs();
    final base = math.max(hi.abs(), lo.abs());
    final pad = math.max(range == 0 ? (base * 0.02 + 1.0) : range * 0.12, base * 0.002);
    lo -= pad;
    hi += pad;

    // 오버레이(상단 상태 박스/우측 버튼/하단 AI바) 때문에 plot 안전 패딩을 두되,
    // '미니차트 높이'가 작은 모바일에서는 패딩이 과해지면 캔들이 점처럼 눌려 보인다.
    // -> 화면 크기에 비례해서 패딩을 계산 + plot 최소 높이를 보장
    double padL = 14;
    double padT = math.min(30, size.height * 0.14);
    double padR = math.max(42, math.min(88, size.width * 0.18));
    double padB = math.min(34, size.height * 0.18);

    const double minPlotH = 110; // 이보다 작아지면 캔들이 납작해짐(점처럼 보임)
    final double availableH = size.height - (padT + padB);
    if (availableH < minPlotH) {
      // 패딩을 비율로 줄여서 plot 높이를 확보
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

    // ✅ 우측 미래 투영 공간(캔들/라벨 우측 잘림 방지)
    final int rightBars = _futureBarsForTf(tfKey);
    final int denom = ((n - 1) + rightBars).clamp(1, 999999);
    final double dx = plot.width / denom;
    double xIdx(int i) => plot.left + i * dx;

    // =========================
    // ✅ 실시간 채널(기반선 + 상/하단 통로)
    // - 채널이 있어야 "경로"가 의미가 생김
    // - 최근 캔들 종가를 선형 회귀로 근사해서 중심선을 만들고
    // - ATR(근사) 기반 밴드 폭으로 상/하단 채널을 그린다.
    // - 현재 위치는 "0"으로 강제 표기
    // =========================

    double y(double p) {
      if (!p.isFinite) return plot.center.dy;
      final yy = plot.bottom - (p - lo) / (hi - lo) * plot.height;
      // 극단 꼬리(한두 개 스파이크)로 인해 화면이 허옇게 비는 느낌을 줄이기 위해
      // 프레임 안쪽으로 살짝 클램프
      return yy.clamp(plot.top + 1, plot.bottom - 1).toDouble();
    }

    // ATR 근사로 띠(구간) 두께 계산
    final ranges = <double>[];
    final look = vis.length < 30 ? vis.length : 30;
    for (int i = vis.length - look; i < vis.length; i++) {
      ranges.add((vis[i].high - vis[i].low).abs());
    }
    final avgRange = ranges.isEmpty ? (hi - lo) * 0.01 : (ranges.reduce((a, b) => a + b) / ranges.length);
    final baseBand = avgRange * 0.8;

    // ✅ 채널 그리기(최근 m개 기준)
    void drawRealtimeChannel() {
      if (n < 3) return;
      final m = math.min(48, n);
      final start = n - m;

      // 선형 회귀 y = a + b*x (x: 0..m-1)
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

      // 밴드 폭(통로)
      final band = (baseBand * (1.10 + 0.35 * intensity)).clamp(baseBand * 0.6, baseBand * 2.2);

      // TradingView "패러렐 채널" 프리셋 느낌(사용자가 체크한 레벨):
      //  -0.17, 0, 0.5, 1, 1.25 (+ 대칭)
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

      // 레벨별 Path 모으기
      final Map<double, Path> paths = {};
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

      // 채널 채우기(upper + reversed lower)
      final fillPath = Path()..addPath(upper, Offset.zero);
      final metrics = lower.computeMetrics().toList();
      // reverse lower (간단히 샘플링)
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

      // 메인 채널 (±1)
      canvas.drawPath(upper, edgeMain);
      canvas.drawPath(lower, edgeMain);

      // 내부 레벨: 0.5는 점선, -0.17은 점선, 1.25는 외곽 라인
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

      // 0(중심) 점선
      drawDashed(center, midDash, dash: 7, gap: 5);

      // 0.5, -0.5
      if (paths[0.5] != null) drawDashed(paths[0.5]!, innerDash, dash: 6, gap: 6);
      if (paths[-0.5] != null) drawDashed(paths[-0.5]!, innerDash, dash: 6, gap: 6);

      // -0.17
      if (paths[-0.17] != null) drawDashed(paths[-0.17]!, innerDash, dash: 4, gap: 6);

      // 1.25, -1.25 (외곽)
      if (paths[1.25] != null) canvas.drawPath(paths[1.25]!, outerSoft);
      if (paths[-1.25] != null) canvas.drawPath(paths[-1.25]!, outerSoft);

      // ✅ 가격 라벨: 마지막 캔들 세로선 기준(우측 끝에 붙여서 가독성)
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
        // 왼쪽에 작은 컬러틱(라인 색상 느낌)
        canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(x, yTop, 2.2, h), const Radius.circular(4)),
          Paint()..color = linePaint.color.withOpacity(0.85),
        );
        tp.paint(canvas, Offset(x + pad, yTop + 1));
      }

      // 마지막 인덱스에서 각 레벨의 가격 계산(회귀선 a,b 기반)
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

      // 보여주기(사용자 체크 레벨 + 대칭 + 엣지)
      drawPriceTag(levelPrices[1.25]!, y(levelPrices[1.25]!), outerSoft);
      drawPriceTag(levelPrices[1.0]!, y(levelPrices[1.0]!), edgeMain);
      drawPriceTag(levelPrices[0.5]!, y(levelPrices[0.5]!), innerDash);
      drawPriceTag(levelPrices[0.0]!, y(levelPrices[0.0]!), midDash);
      drawPriceTag(levelPrices[-0.17]!, y(levelPrices[-0.17]!), innerDash);
      drawPriceTag(levelPrices[-0.5]!, y(levelPrices[-0.5]!), innerDash);
      drawPriceTag(levelPrices[-1.0]!, y(levelPrices[-1.0]!), edgeMain);
      drawPriceTag(levelPrices[-1.25]!, y(levelPrices[-1.25]!), outerSoft);

      // ✅ 현재 위치(0) 표시: 마지막 캔들 위치에 고정
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

    // 채널 먼저(뒤 레이어)
    drawRealtimeChannel();

    // 가까우면 굵게(강조)
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

      // '미용실 간판'처럼 라벨이 너무 많이 찍히는 것을 방지:
      // - 화면엔 "가까운 존" 위주로 최대 3개만
      // - 라벨은 그룹당 1번만
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

        // MU/MB는 점선 테두리로 '조작 구간' 느낌을 강화
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


    // 표시 순서: OB → FVG → BPR → MB
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
    // 사용자가 원하는 "미래차트" 핵심:
    // - EQL/EQH: 유동성 풀(반복 고저점) → 스윕/반응 확률이 높아 재방문 가능
    // - BOS/MSB: 구조 확정/전환 지점 → 리테스트 반응 구간
    void drawStructureOverlay() {
      if (n < 10) return;
      // 우측 미래 여백을 포함한 x 맵
      double xOf(int i) => xIdx(i);

      // tol: 동일고점/동일저점 허용 오차(캔들 평균 range 기반)
      final tol = (avgRange * 0.18).clamp((hi - lo).abs() * 0.0015, (hi - lo).abs() * 0.02);

      // 스윙(프랙탈) 탐지(좌2/우2)
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

      // (UI) EQH/EQL 표시는 숨김

      // BOS/CHOCH: 현재 종가가 마지막 스윙을 유의미하게 돌파/이탈하면 표시
      final lastClose = vis.last.close;
      final lastSh = sh.isNotEmpty ? sh.last : null;
      final lastSl = sl.isNotEmpty ? sl.last : null;

      // trend hint (단순): 마지막 2개 스윙으로 HL/LL 판정
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
        tagAt(downTrend ? 'CHOCH↑' : 'BOS↑', plot.right - 26, y0 - 14, col);
      }
      if (lastSl != null && lastClose < lastSl.$2 - tol) {
        final col = const Color(0xFFFF7A45);
        final y0 = y(lastSl.$2);
        dashedHLine(y0, xOf(lastSl.$1), plot.right, col);
        tagAt(upTrend ? 'CHOCH↓' : 'BOS↓', plot.right - 26, y0 + 14, col);
      }
    }

    // 구조 오버레이는 존 위에 살짝, 캔들 위에 과도하게 가리지 않도록 중간 레이어
    drawStructureOverlay();

    // ===== Future Path Overlay (v0.1) =====
    // - 우측 여백 영역에 '미래 경로'를 점선으로 투영
    // - 확률 20% 미만이면 WATCH로 간주하고 표시하지 않음(사용자 룰)
    void drawFuturePath() {
      final b = (bias ?? '').toUpperCase();
      final p = (prob ?? 0);
      if (p < 20) return;
      if (b.isEmpty || b == 'LOCK' || b == 'WATCH') return;
      if (n < 5) return;

      final isLong = b.contains('롱') || b == 'UP';
      final isShort = b.contains('숏') || b == 'DOWN';
      if (!isLong && !isShort) return;

      // 타겟 1: 반응구간/지지저항 우선
      final t1 = isLong
          ? ((reactHigh > 0 ? reactHigh : (r1 > 0 ? r1 : (price + (hi - lo) * 0.25))))
          : ((reactLow > 0 ? reactLow : (s1 > 0 ? s1 : (price - (hi - lo) * 0.25))));

      // 타겟 2: 다음 존(가까운) 또는 확장
      double t2 = t1;
      if (isLong) {
        // 위쪽에 가장 가까운 존 경계(저항 후보)
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

      // 타겟 링
      final ring = Paint()..color = col.withOpacity(0.20);
      canvas.drawCircle(Offset(x1, y1), 7.5 + 5.0 * blink, ring);
      canvas.drawCircle(Offset(x2, y2), 7.5 + 5.0 * blink, ring);

      // 확률 라벨
      final lbl = isLong ? '롱 $p%' : '숏 $p%';
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
      // 경계선(굵기 차등)
      final border = Paint()
        ..color = col.withOpacity(0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = factor >= 1.15 ? 2.6 : 1.4;
      canvas.drawRect(r, border);
    }

    // 지지/저항 띠
    bandRect(s1, t.good, nearS ? 1.25 : 0.90);
    bandRect(r1, t.bad, nearR ? 1.25 : 0.90);

    // ✅ 지지/저항 가격 라벨(초록/빨강 박스 안)
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

    levelLabel(s1, '지지', t.good);
    levelLabel(r1, '저항', t.bad);

    // 반응구간(CHOCH/BOS) 띠
    if (structureTag != 'RANGE' && reactLevel > 0 && reactHigh > reactLow) {
      final isUp = structureTag.contains('UP');
      final col = isUp ? t.good : t.bad;
      final top = y(reactHigh);
      final bot = y(reactLow);
      final rect = Rect.fromLTWH(plot.left, math.min(top, bot), plot.width, (top - bot).abs());
      final fill = Paint()..color = col.withOpacity(0.10);
      final border = Paint()..color = col.withOpacity(0.55)..style = PaintingStyle.stroke..strokeWidth = 2.0;
      canvas.drawRect(rect, fill);
      canvas.drawRect(rect, border);
      // 반응가격 라인
      final ry = y(reactLevel);
      final lp2 = Paint()..color = col.withOpacity(0.75)..strokeWidth = 1.8;
      canvas.drawLine(Offset(plot.left, ry), Offset(plot.right, ry), lp2);
    }



    // BOS / CHOCH 라인 (구조 전환 지점)
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
        // 점선 느낌
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

    // 확정 진입 선(Entry/SL/TP) - showPlan일 때만
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

      // 우측 라벨(작게) + 가격(더 작게)
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

    // 강력 신호 표시(화살표 + 펄스 링)
    final b = (bias ?? 'LOCK').toUpperCase();
    final isLong = b.contains('롱');
    final isShort = b.contains('숏');
    final arrowCol = isLong ? t.good : (isShort ? t.bad : t.fg);
    final pr = (prob ?? 0).clamp(0, 100);
    if (isLong || isShort) {
      final col = isLong ? t.good : t.bad;
      final alpha = (0.25 + 0.75 * blink).clamp(0.0, 1.0);
      // 화살표
      final x0 = size.width - 26;
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

      // 펄스 링 (확률이 높을수록 강)
      final pulse = 7.0 + (pr / 100.0) * (10.0 + 14.0 * intensity);
      final ring = Paint()
        ..color = col.withOpacity(0.10 + 0.20 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0 + 1.4 * (pr / 100.0);
      canvas.drawCircle(Offset(size.width - 10, py), pulse, ring);

      // B/S 문자(확정일 때만 크게)
      if (showPlan) {
        final tag = isLong ? 'B' : 'S';
        final fs = 20.0 + 10.0 * blink; // 확정 시 임팩트(살짝 커졌다 작아짐)
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
        // 배경 글로우(원)
        final bg = Paint()..color = col.withOpacity(0.10 + 0.18 * blink);
        canvas.drawCircle(Offset(size.width - 18, py - 16), 18.0 + 10.0 * blink, bg);
        tp.paint(canvas, Offset(size.width - tp.width - 18, py - tp.height - 18));
      }
    }


// Candles
// - 데이터 누락/오류 캔들이 섞이면 i 인덱스는 유지되는데 실제 draw를 skip해서
//   '캔들 사이에 빈 공간(구멍)'처럼 보이는 문제가 생김.
// - 해결: 유효 캔들만 먼저 필터링해서 '연속 배열'로 만든 뒤 그 배열 기준으로 간격 계산.
final valid = vis.where((x) {
  if (!x.low.isFinite || !x.high.isFinite || !x.open.isFinite || !x.close.isFinite) return false;
  if (x.low <= 0 || x.high <= 0) return false;
  if (x.high < x.low) return false;
  return true;
}).toList();

if (valid.isEmpty) return;

final nn = valid.length;
// 캔들은 '현재 영역'까지만 채우고, 우측은 미래 투영 공간으로 비워둔다.
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

  // 캔들 밀도(공백) 보정:
  // - n이 적을 때: bodyW가 너무 작게 제한되면 공백이 과장됨
  // - n이 많을 때: bodyW가 너무 커지면 뭉개짐
  // -> w 기준 비율 + 상한만 두고, 'w에 비례'하도록 유지
	  // body 폭은 "슬롯폭(w)"에 비례해야 TF별 밀도가 안정된다.
	  // - 데이터가 많아 w가 작을 때: 최소폭 2.2 유지(점 방지)
	  // - 데이터가 적어 w가 클 때: 상한 18.0 같은 고정 캡을 두면 공백이 과장됨
	  // -> w의 92%를 기본으로, 최대는 슬롯폭의 98%로만 제한
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
    // ✅ AI 패턴 작도(추세선/수렴선/채널 등)
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

    // 확률 라벨 (우측 상단)
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