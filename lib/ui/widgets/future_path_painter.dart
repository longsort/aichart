import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/future_path_price_dto.dart';
import '../../core/models/struct_mark.dart';
import '../../core/models/match_window.dart';
import '../../core/models/fu_state.dart';

/// STEP16: 차트 ?�버?�이 - 미래경로(5?�동) ?�각??Painter
/// - 좌표 변?��? ?�출 측에??priceToY, indexToX 콜백?�로 주입(차트 ?�이브러�??�존 ?�거)
class FuturePathPainter extends CustomPainter {
  final FuturePathPriceDTO fp;

  /// CLEAN MODE: ?�벨/??TP·SL 마커�??�기�?  /// '?�률 밴드(가???�역)' + ?��? 중심 경로�?그린??
  final bool cleanMode;

  /// 구조 ?�그(?? CHOCH_UP / BOS_DN / MSB_UP) - ?�택
  final String? structureTag;

  /// 구조 기�?가(?�파/?�탈 기�?) - ?�택
  final double? breakLevel;

  /// 진입 가�??�커?� ?��? ???�음) - ?�택
  final double? entryPrice;

  // 지지/?�??박스(?�시??
  final double? reactLow;
  final double? reactHigh;
  final List<FuZone> smcZones;
  final int? supportProb;
  final double? resistLow;
  final double? resistHigh;
  final int? resistProb;
  final double? planEntry;
  final double? planSl;
  final double? planTp;

  /// candle index -> x
  final double Function(int idx) indexToX;

  /// price -> y
  final double Function(double price) priceToY;

  /// ?�재(?�커) 캔들 ?�덱??  final int anchorIndex;

  /// �?캔들 ?�으�?그릴지
  final int horizon;

  /// 구조 ?�벨 마커(캔들 ?�치??직접 ?�기)
  final List<StructMark>? structureEvents;

  /// 과거 ?�사구간 ?�이?�이???�위 3�?
  final List<MatchWindow>? matchWindows;

  /// ?�측 ?�에 Entry/TP/SL 가�?마커�?그릴지
  final bool showTpSlMarkers;

  /// 마감 ?�정(캔들 close 직후)?????�인?????�껍�??�정/?�고 구분)
  final bool confirmed;

  /// ?�용??조정: ?�벨 배경??  final int labelBgColor;
  /// ?�용??조정: ?�벨 글?�색
  final int labelTextColor;
  /// ?�용??조정: ?�벨 글???�기 (8~20)
  final double labelFontSize;
  /// ?�용??조정: ?�벨 ?�체 X ?�동
  final double labelOffsetX;
  /// ?�용??조정: ?�벨 ?�체 Y ?�동
  final double labelOffsetY;

  FuturePathPainter({
    required this.fp,
    this.cleanMode = false,
    required this.indexToX,
    required this.priceToY,
    required this.anchorIndex,
    this.structureTag,
    this.breakLevel,
    this.entryPrice,
    this.planEntry,
    this.planSl,
    this.planTp,
    this.reactLow,
    this.reactHigh,
    this.smcZones = const [],
    this.supportProb,
    this.resistLow,
    this.resistHigh,
    this.resistProb,
    this.structureEvents,
    this.matchWindows,
    this.horizon = 60,
    this.showTpSlMarkers = true,
    this.confirmed = false,
    this.labelBgColor = 0xFF1A1D24,
    this.labelTextColor = 0xFFFFFFFF,
    this.labelFontSize = 11.0,
    this.labelOffsetX = 0.0,
    this.labelOffsetY = 0.0,
  });

  Offset get _labelOffset => Offset(labelOffsetX, labelOffsetY);
  Color get _labelBg => Color(labelBgColor);
  Color get _labelFg => Color(labelTextColor);
  double get _labelSize => labelFontSize.clamp(8.0, 20.0);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, size.width, size.height));
    final isLong = fp.dir == 'LONG';
    final cMain = isLong ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A);

    // ?�퍼AI 미니멀 UI: '가???�역(?�률 밴드)' + ?��? 중심 경로�?    if (cleanMode) {
      _paintClean(canvas, size, cMain);
      canvas.restore();
      return;
    }



    // SMC Zones (Bu/Be OB/MB/BB)
    if (smcZones.isNotEmpty) {
      _paintSmcZones(canvas, size, smcZones);
    }
    final pAnchor = Offset(indexToX(anchorIndex).clamp(0.0, size.width), priceToY(fp.anchor).clamp(0.0, size.height));
    final pTarget = Offset(indexToX(anchorIndex + horizon).clamp(0.0, size.width), priceToY(fp.target).clamp(0.0, size.height));
    final pInvalid = Offset(indexToX(anchorIndex + (horizon ~/ 2)).clamp(0.0, size.width), priceToY(fp.invalid).clamp(0.0, size.height));

    final mainPaint = Paint()
      ..color = cMain.withOpacity(0.95)
      ..style = PaintingStyle.stroke
      ..strokeWidth = confirmed ? 3.2 : 2.2
      ..strokeCap = StrokeCap.round;

    final invPaint = Paint()
      ..color = const Color(0xFFEA2A2A).withOpacity(0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round;

    // 5?�동 지그재�?(wavePrices 길이 6 권장: [anchor,w1,w2,w3,w4,w5])
    final wp = fp.wavePrices.isNotEmpty ? fp.wavePrices : [fp.anchor, fp.target];
    final seg = (horizon / (wp.length - 1)).clamp(6, 999).toDouble();

    // ?�측 미래경로: 줄선(?�선)?�로 ?�시
    Offset? prev;
    for (int i = 0; i < wp.length; i++) {
      final x0 = indexToX(anchorIndex + (seg * i).round());
      final y0 = priceToY(wp[i]);
      final x = x0.clamp(0.0, size.width);
      final y = y0.clamp(0.0, size.height);
      final p = Offset(x, y);
      if (prev != null) {
        _drawDashedLine(canvas, prev, p, mainPaint);
      }
      prev = p;
      canvas.drawCircle(p, 2.2, Paint()..color = cMain.withOpacity(0.9));
    }

    // 무효???�선) Anchor -> Invalid
    _drawDashedLine(canvas, pAnchor, pInvalid, invPaint);

    // 지지/?�??반응??빨강줄·초록줄) + ?�아???�살??    if (reactLow != null && reactLow! > 0) {
      final y = priceToY(reactLow!);
      if (y.isFinite) _drawReactLineWithArrow(canvas, size, y, true);
    }
    if (reactHigh != null && reactHigh! > 0) {
      final y = priceToY(reactHigh!);
      if (y.isFinite) _drawReactLineWithArrow(canvas, size, y, false);
    }

    // ?�벨??(?�용???�프???�용)
    _label(
      canvas,
      pTarget + _labelOffset,
      '?�� 목표 ${fp.target.toStringAsFixed(0)}  ${fp.pMain}%  ?�익�?${(fp.rrX10 / 10).toStringAsFixed(1)}',
      cMain,
    );
    _label(canvas, pInvalid + _labelOffset, '???�절 ${fp.invalid.toStringAsFixed(0)}', const Color(0xFFEA2A2A));
    _label(canvas, pAnchor + _labelOffset, '기�? ${fp.anchor.toStringAsFixed(0)}', _labelFg);

    // 구조(CHOCH/BOS/MSB) 뱃�?
    _drawStructureBadge(canvas, size);

    // STEP16C: ?�측 ??진입/?�절/목표 마커 (?�아?????��?·겹침 방�?)
    if (showTpSlMarkers) {
      final ep = (planEntry != null && planEntry! > 0) ? planEntry! : ((entryPrice != null && entryPrice! > 0) ? entryPrice! : fp.anchor);
      final slP = planSl ?? fp.invalid;
      final tpP = planTp ?? fp.target;
      _drawPriceMarkersWithSpacing(canvas, size, ep, slP, tpP);
    }
    if (matchWindows != null && matchWindows!.isNotEmpty && !cleanMode) {
      for (int i = 0; i < matchWindows!.length; i++) {
        _drawMatchWindow(canvas, size, matchWindows![i], i);
      }
    }
    
// === fallback zone when reactLow/reactHigh missing (주봉/?�봉 ?�함) ===
// ?�진??TF???�라 존을 �?만들�?react/resist null/0) UI가 �??�면????
// -> 미래경로(fp) 가�?범위�?기반?�로 기본 지지/?�??존을 ?�성?�서 ??�� ?�벨???�게 ??
double? _rLow = reactLow;
double? _rHigh = reactHigh;
int _sProb = ((supportProb ?? 0) <= 0 ? 50 : (supportProb ?? 0)).clamp(0, 100);
double? _eLow = resistLow;
double? _eHigh = resistHigh;
int _rProb = ((resistProb ?? 0) <= 0 ? 50 : (resistProb ?? 0)).clamp(0, 100);

if ((_rLow == null || _rHigh == null || _rLow! <= 0 || _rHigh! <= 0) ||
    (_eLow == null || _eHigh == null || _eLow! <= 0 || _eHigh! <= 0)) {
  final fpPrices = <double>[
    fp.anchor,
    fp.target,
    fp.invalid,
    ...fp.wavePrices,
  ].where((v) => v.isFinite && v > 0).toList();

  if (fpPrices.isNotEmpty) {
    fpPrices.sort();
    final minP = fpPrices.first;
    final maxP = fpPrices.last;
    final span = (maxP - minP).abs();
    final zH = math.max(50.0, span * 0.08);

    // 기본 ?�률: 메인?�률??지지/?�??�� 분배
    // (SHORT�??�??��률↑, LONG�?지지?�률??
    final base = fp.pMain.clamp(0, 100);
    if (fp.dir == 'SHORT') {
      _rProb = math.max(_rProb, base);
      _sProb = math.max(_sProb, (100 - base));
    } else if (fp.dir == 'LONG') {
      _sProb = math.max(_sProb, base);
      _rProb = math.max(_rProb, (100 - base));
    }

    // 지지(?�래) / ?�????
    if (_rLow == null || _rHigh == null || _rLow! <= 0 || _rHigh! <= 0) {
      _rLow = minP;
      _rHigh = (minP + zH);
    }
    if (_eLow == null || _eHigh == null || _eLow! <= 0 || _eHigh! <= 0) {
      _eHigh = maxP;
      _eLow = (maxP - zH);
    }
  }
}

    if (_rLow != null && _rHigh != null && _rLow! > 0 && _rHigh! > 0) {
      final y1 = priceToY(_rLow!);
      final y2 = priceToY(_rHigh!);
      final prob = _sProb;
      final range = '${_rLow!.toStringAsFixed(0)}-${_rHigh!.toStringAsFixed(0)}';
      _drawZoneBox(canvas, size, yTop: y1, yBot: y2, title: '', rangeText: range, prob: prob, color: const Color(0xFF00B0FF));
    }
    if (_eLow != null && _eHigh != null && _eLow! > 0 && _eHigh! > 0) {
      final y1 = priceToY(_eLow!);
      final y2 = priceToY(_eHigh!);
      final prob = _rProb;
      final range = '${_eLow!.toStringAsFixed(0)}-${_eHigh!.toStringAsFixed(0)}';
      _drawZoneBox(canvas, size, yTop: y1, yBot: y2, title: '', rangeText: range, prob: prob, color: const Color(0xFFFF5252));
    }
    // BOS/ChoCH/EQL/EQH: ?�진 마크가 ?�어??reactLow·reactHigh·breakLevel�?100% ?�시 (참조 ?��?지 ?�일)
    if (!cleanMode) {
      for (final m in _effectiveStructMarks()) {
        _drawStructLineAndLabel(canvas, size, m);
      }
    }
  }

  /// ?�진 structMarks가 비어 ?�어??EQL/EQH/BOS/ChoCH�?reactLow·reactHigh·breakLevel�??�시
  List<StructMark> _effectiveStructMarks() {
    if (structureEvents != null && structureEvents!.isNotEmpty) return structureEvents!;
    final fallback = <StructMark>[];
    final tagU = (structureTag ?? '').toUpperCase();
    if (breakLevel != null && breakLevel! > 0 && (tagU.contains('BOS') || tagU.contains('CHOCH') || tagU.contains('MSB'))) {
      final label = tagU.contains('CHOCH') ? 'ChoCH' : tagU.contains('MSB') ? 'MSB' : 'BOS';
      fallback.add(StructMark(index: anchorIndex, price: breakLevel!, label: label, isUp: tagU.contains('_UP')));
    }
    // EQL/EQH ?�벨 ?�거(분·시간·일·주·달 공통)
    return fallback;
  }

  void _paintClean(Canvas canvas, Size size, Color cMain) {
    final wp = fp.wavePrices.isNotEmpty ? fp.wavePrices : [fp.anchor, fp.target];
    if (wp.length < 2) return;

    // 밴드 ??가�??�위): 변?�이 ??BTC?�서??과도?�게 ?�껍지 ?�게 ?�한
    final a = fp.anchor;
    final t = fp.target;
    final inv = fp.invalid;
    final amp = (t - a).abs();
    final invAmp = (inv - a).abs();
    final band = (amp * 0.12 + invAmp * 0.06).clamp(amp * 0.03, amp * 0.22);

    final horizonLocal = horizon;
    final seg = (horizonLocal / (wp.length - 1)).clamp(6, 999).toDouble();

    // ????경로�?만들???�리�?밴드�?채�?
    final upper = <Offset>[];
    final lower = <Offset>[];
    for (int i = 0; i < wp.length; i++) {
      final x0 = indexToX(anchorIndex + (seg * i).round());
      final x = x0.clamp(0.0, size.width);
      final upY0 = priceToY(wp[i] + band);
      final dnY0 = priceToY(wp[i] - band);
      final upY = upY0.clamp(0.0, size.height);
      final dnY = dnY0.clamp(0.0, size.height);
      upper.add(Offset(x, upY));
      lower.add(Offset(x, dnY));
    }

    final bandPath = Path()..moveTo(upper.first.dx, upper.first.dy);
    for (int i = 1; i < upper.length; i++) {
      bandPath.lineTo(upper[i].dx, upper[i].dy);
    }
    for (int i = lower.length - 1; i >= 0; i--) {
      bandPath.lineTo(lower[i].dx, lower[i].dy);
    }
    bandPath.close();

    final bandPaint = Paint()
      ..color = cMain.withOpacity(0.11)
      ..style = PaintingStyle.fill;
    canvas.drawPath(bandPath, bandPaint);

    // 중심 경로(?�게)
    final centerPaint = Paint()
      ..color = cMain.withOpacity(0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;

    final center = Path();
    for (int i = 0; i < wp.length; i++) {
      final x0 = indexToX(anchorIndex + (seg * i).round());
      final y0 = priceToY(wp[i]);
      final x = x0.clamp(0.0, size.width);
      final y = y0.clamp(0.0, size.height);
      if (i == 0) {
        center.moveTo(x, y);
      } else {
        center.lineTo(x, y);
      }
    }
    canvas.drawPath(center, centerPaint);

    // 목표 캡슐 1개만(?�측)
    final xR0 = indexToX(anchorIndex + horizonLocal);
    final yT0 = priceToY(fp.target);
    final xR = xR0.clamp(0.0, size.width);
    final yT = yT0.clamp(0.0, size.height);
    _label(canvas, Offset(xR, yT) + _labelOffset, '목표 ${fp.target.toStringAsFixed(0)} · ${fp.pMain}%', cMain);
  }

  void _drawStructureBadge(Canvas canvas, Size size) {
    final tag = (structureTag ?? '').trim();
    final level = breakLevel ?? 0;
    if (tag.isEmpty || level <= 0) return;

    final up = tag.toUpperCase();
    String ko = '구조';
    Color c = const Color(0xFFB3B9C9);

    if (up.startsWith('CHOCH')) {
      ko = '?�환(변??';
      c = const Color(0xFFFFC44D);
    } else if (up.startsWith('BOS')) {
      ko = '추세?�인';
      c = const Color(0xFF56D7FF);
    } else if (up.startsWith('MSB')) {
      ko = '?�전??;
      c = const Color(0xFFB37CFF);
    }

    final dir = up.contains('_DN') ? '?? : (up.contains('_UP') ? '?? : '');
    final y = priceToY(level);
    if (y.isNaN || y.isInfinite) return;

    final x = math.min(size.width - 10, indexToX(anchorIndex) + 14) + labelOffsetX;
    final yy = y + labelOffsetY;
    final tp = TextPainter(
      text: TextSpan(
        text: '$ko$dir ${level.toStringAsFixed(0)}',
        style: TextStyle(
          color: _labelFg,
          fontSize: _labelSize,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: 220);

    const padH = 8.0;
    const padV = 4.0;
    final w = tp.width + padH * 2;
    final h = tp.height + padV * 2;
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH((x - w).clamp(6.0, size.width - w - 6.0), (yy - h - 6).clamp(6.0, size.height - h - 6.0), w, h),
      const Radius.circular(10),
    );

    canvas.drawRRect(rect, Paint()..color = _labelBg);
    canvas.drawRRect(
      rect,
      Paint()
        ..color = c.withOpacity(0.45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    tp.paint(canvas, Offset(rect.left + padH, rect.top + padV));
  }

  /// 진입/?�절/목표 ?�측 마커 ???�아?????��?(최소 40px 간격)
  void _drawPriceMarkersWithSpacing(Canvas canvas, Size size, double entry, double sl, double tp) {
    const minGap = 40.0;
    final list = <({String label, double price, Color color})>[
      (label: '진입', price: entry, color: const Color(0xFFB3B9C9)),
      (label: '?�절', price: sl, color: const Color(0xFFEA2A2A)),
      (label: '목표', price: tp, color: const Color(0xFF1EEA6A)),
    ];
    list.sort((a, b) => b.price.compareTo(a.price));
    final ys = list.map((e) => priceToY(e.price)).toList();
    for (int i = 1; i < ys.length; i++) {
      if (ys[i] < ys[i - 1] + minGap) ys[i] = ys[i - 1] + minGap;
    }
    for (int i = 0; i < list.length; i++) {
      _drawPriceMarkerAtY(canvas, size, list[i].label, list[i].price, list[i].color, ys[i]);
    }
  }

  void _drawPriceMarkerAtY(Canvas canvas, Size size, String label, double price, Color color, double labelY) {
    final priceY = priceToY(price);
    if (priceY.isNaN || priceY.isInfinite) return;

    final x2 = size.width - 8.0;
    final x1 = (math.max(8.0, x2 - 90.0)) as double;

    final linePaint = Paint()
      ..color = color.withOpacity(0.55)
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(x1, priceY), Offset(x2, priceY), linePaint);
    if ((labelY - priceY).abs() > 4) {
      canvas.drawLine(Offset(x2, priceY), Offset(x2, labelY), linePaint);
    }

    final text = '$label ${price.toStringAsFixed(0)}';
    final labelYAdj = labelY + labelOffsetY;
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: _labelFg,
          fontSize: _labelSize,
          fontWeight: FontWeight.w700,
        ),
      ),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout();

    const padH = 8.0;
    const padV = 4.0;
    final w = tp.width + padH * 2;
    final h = tp.height + padV * 2;
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(x2 - w + labelOffsetX, labelYAdj - h / 2, w, h),
      const Radius.circular(10),
    );

    canvas.drawRRect(rect, Paint()..color = _labelBg);
    canvas.drawRRect(
      rect,
      Paint()
        ..color = color.withOpacity(0.45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    tp.paint(canvas, Offset(rect.left + padH, rect.top + padV));
  }

  void _drawPriceMarker(
    Canvas canvas,
    Size size,
    String label,
    double price,
    Color color,
  ) {
    final y = priceToY(price);
    if (y.isNaN || y.isInfinite) return;
    _drawPriceMarkerAtY(canvas, size, label, price, color, y);
  }

  void _label(Canvas canvas, Offset p, String text, Color c) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(fontSize: _labelSize, fontWeight: FontWeight.w900, color: _labelFg),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '??,
    )..layout(maxWidth: 240);

    const pad = 4.0;
    final r = RRect.fromRectAndRadius(
      Rect.fromLTWH(p.dx + 6, p.dy - 14, tp.width + pad * 2, tp.height + pad * 2),
      const Radius.circular(8),
    );

    canvas.drawRRect(r, Paint()..color = _labelBg);
    canvas.drawRRect(r, Paint()..color = c.withOpacity(0.4)..style = PaintingStyle.stroke..strokeWidth = 1.0);
    tp.paint(canvas, Offset(r.left + pad, r.top + pad));
  }

  /// 지지/?�??반응????배경·캔들�?겹치지 ?�게 ?�?�?�게
  void _drawReactLineWithArrow(Canvas canvas, Size size, double y, bool isSupport) {
    final color = isSupport ? const Color(0xFF22C55E) : const Color(0xFFEF4444);
    final linePaint = Paint()
      ..color = color.withOpacity(0.5)
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(0, y), Offset(size.width - 24, y), linePaint);

    const arrowW = 10.0;
    const arrowH = 8.0;
    final cx = size.width - 14.0;
    final path = Path();
    if (isSupport) {
      path.moveTo(cx, y + arrowH);
      path.lineTo(cx - arrowW / 2, y);
      path.lineTo(cx + arrowW / 2, y);
    } else {
      path.moveTo(cx, y - arrowH);
      path.lineTo(cx - arrowW / 2, y);
      path.lineTo(cx + arrowW / 2, y);
    }
    path.close();
    canvas.drawPath(path, Paint()..color = color.withOpacity(0.65)..style = PaintingStyle.fill);
    canvas.drawPath(path, Paint()..color = color.withOpacity(0.5)..style = PaintingStyle.stroke..strokeWidth = 1);
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 6.0;
    const gap = 5.0;
    final dx = b.dx - a.dx;
    final dy = b.dy - a.dy;
    final dist = math.sqrt(dx * dx + dy * dy);
    if (dist <= 0) return;

    final vx = dx / dist;
    final vy = dy / dist;

    double cur = 0;
    while (cur < dist) {
      final p1 = Offset(a.dx + vx * cur, a.dy + vy * cur);
      cur = math.min(cur + dash, dist);
      final p2 = Offset(a.dx + vx * cur, a.dy + vy * cur);
      canvas.drawLine(p1, p2, paint);
      cur = math.min(cur + gap, dist);
    }
  }

  void _drawMatchWindow(Canvas canvas, Size size, MatchWindow w, int rank) {
    final x1 = indexToX(w.start);
    final x2 = indexToX(w.end);
    final left = (x1 < x2 ? x1 : x2).clamp(0.0, size.width);
    final right = (x1 < x2 ? x2 : x1).clamp(0.0, size.width);
    final rect = Rect.fromLTWH(left, 0, (right - left).clamp(2.0, size.width), size.height);
    final paint = Paint()..color = Colors.white.withOpacity(0.05 + (0.02 * (3 - rank)));
    canvas.drawRect(rect, paint);
    final label = '#${rank + 1} ${(w.similarity * 100).toStringAsFixed(0)}% / ${w.fwdReturn.toStringAsFixed(1)}%';
    final tp = TextPainter(
      text: TextSpan(text: label, style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w900)),
      textDirection: TextDirection.ltr,
    )..layout();
    final bx = (left + 6).clamp(6.0, size.width - tp.width - 18);
    final by = (6.0 + (rank * 16.0)).clamp(6.0, size.height - 18);
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(bx, by, tp.width + 12, tp.height + 6), const Radius.circular(10));
    canvas.drawRRect(r, Paint()..color = Colors.black.withOpacity(0.45));
    canvas.drawRRect(r, Paint()..color = Colors.white.withOpacity(0.18)..style = PaintingStyle.stroke..strokeWidth = 1);
    tp.paint(canvas, Offset(bx + 6, by + 3));
  }

  /// 배경·캔들�?겹치지 ?�게: �?채�? ?�?�?�게. title 비어 ?�으�?블랙 카드 ?�이 검??글?�로 "prob% range"�??�시
  void _drawZoneBox(Canvas canvas, Size size, {required double yTop, required double yBot, required String title, required String rangeText, required int prob, required Color color}) {
    final top = math.min(yTop, yBot).clamp(0.0, size.height);
    final bot = math.max(yTop, yBot).clamp(0.0, size.height);
    final rect = Rect.fromLTWH(0, top, size.width, (bot - top).clamp(2.0, size.height));
    final paint = Paint()..color = color.withOpacity(0.08);
    final border = Paint()..color = color.withOpacity(0.35)..style = PaintingStyle.stroke..strokeWidth = 1.0;
    canvas.drawRect(rect, paint);
    canvas.drawRect(rect, border);
    final labelOnly = title.isEmpty;
    final line1 = labelOnly ? '$prob% $rangeText' : '$title  $prob%';
    final textColor = labelOnly ? Colors.black : _labelFg;
    final tp = TextPainter(
      text: TextSpan(text: line1, style: TextStyle(color: textColor, fontSize: _labelSize, fontWeight: FontWeight.w900)),
      textDirection: TextDirection.ltr,
    )..layout();
    if (labelOnly) {
      final bx = ((size.width - tp.width) / 2 + labelOffsetX).clamp(6.0, size.width - tp.width - 6.0);
      final midY = (top + bot) / 2 + labelOffsetY;
      final by = (midY - tp.height / 2).clamp(6.0, size.height - tp.height - 6.0);
      tp.paint(canvas, Offset(bx, by));
      return;
    }
    final tp2 = TextPainter(
      text: TextSpan(text: rangeText, style: TextStyle(color: _labelFg.withOpacity(0.85), fontSize: _labelSize - 1, fontWeight: FontWeight.w800)),
      textDirection: TextDirection.ltr,
    )..layout();
    const pad = 10.0;
    final boxW = math.max(tp.width, tp2.width) + pad * 2;
    final boxH = tp.height + tp2.height + pad * 2 + 2;
    final bx = ((size.width - boxW) / 2 + labelOffsetX).clamp(6.0, size.width - boxW - 6.0);
    final midY = (top + bot) / 2 + labelOffsetY;
    final by = (midY - boxH / 2).clamp(6.0, size.height - boxH - 6.0);
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(bx, by, boxW, boxH), const Radius.circular(10));
    canvas.drawRRect(r, Paint()..color = _labelBg);
    canvas.drawRRect(r, Paint()..color = color.withOpacity(0.45)..style = PaintingStyle.stroke..strokeWidth = 1.0);
    tp.paint(canvas, Offset(bx + pad, by + pad));
    tp2.paint(canvas, Offset(bx + pad, by + pad + tp.height + 2));
  }

  /// 배경·캔들�?겹치지 ?�게: BOS/ChoCH/EQH/EQL ?�선 ?�?�?�게, ?�벨 ?�크 박스 + ??글??  void _drawStructLineAndLabel(Canvas canvas, Size size, StructMark m) {
    final x = indexToX(m.index);
    final y = priceToY(m.price);
    if (y.isNaN || y.isInfinite) return;

    final labelRaw = m.label.toUpperCase();
    final label = labelRaw == 'CH' ? 'ChoCH' : m.label;
    Color color;
    if (labelRaw == 'BOS') {
      color = const Color(0xFF22C55E);
    } else if (labelRaw == 'CHOCH' || labelRaw == 'CH') {
      color = m.isUp ? const Color(0xFF22C55E) : const Color(0xFFEF4444);
    } else if (labelRaw == 'EQH') {
      color = const Color(0xFFEF4444);
    } else if (labelRaw == 'EQL') {
      color = const Color(0xFF22C55E);
    } else {
      color = m.isUp ? const Color(0xFF22C55E) : const Color(0xFFEF4444);
    }

    final dashPaint = Paint()
      ..color = color.withOpacity(0.5)
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;
    _drawDashedLine(canvas, Offset(0, y), Offset(size.width, y), dashPaint);

    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(color: _labelFg, fontSize: _labelSize, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    const padX = 8.0, padY = 5.0;
    final w = tp.width + padX * 2;
    final h = tp.height + padY * 2;
    double bx = x - w / 2 + labelOffsetX;
    double by = y - h - 12 + labelOffsetY;
    bx = bx.clamp(6.0, size.width - w - 6.0);
    by = by.clamp(6.0, size.height - h - 6.0);
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(bx, by, w, h), const Radius.circular(6));
    canvas.drawRRect(r, Paint()..color = _labelBg);
    canvas.drawRRect(r, Paint()..color = color.withOpacity(0.45)..style = PaintingStyle.stroke..strokeWidth = 1.0);
    tp.paint(canvas, Offset(bx + padX, by + padY));
    canvas.drawCircle(Offset(x.clamp(0.0, size.width), y.clamp(0.0, size.height)), 3.0, Paint()..color = color.withOpacity(0.8));
  }

  void _drawStructLabel(Canvas canvas, Size size, StructMark m) {
    _drawStructLineAndLabel(canvas, size, m);
  }


  void _paintSmcZones(Canvas canvas, Size size, List<FuZone> zones) {
    for (final z in zones) {
      final dirUp = z.dir >= 0;
      final fill = Paint()
        ..color = (dirUp ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A)).withOpacity(0.12)
        ..style = PaintingStyle.fill;
      final border = Paint()
        ..color = (dirUp ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A)).withOpacity(0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2;

      final i0 = z.iStart ?? anchorIndex;
      final i1 = z.iEnd ?? (anchorIndex + horizon);
      final x0 = indexToX(i0).clamp(0.0, size.width);
      final x1 = indexToX(i1).clamp(0.0, size.width);
      final yTop = priceToY(z.high).clamp(0.0, size.height);
      final yBot = priceToY(z.low).clamp(0.0, size.height);
      final rect = Rect.fromLTRB(math.min(x0, x1), math.min(yTop, yBot), math.max(x0, x1), math.max(yTop, yBot));

      canvas.drawRect(rect, fill);
      canvas.drawRect(rect, border);

      // label (top-right inside)
      final label = z.label;
      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(
            fontSize: (_labelSize - 1).clamp(8.0, 18.0),
            fontWeight: FontWeight.w700,
            color: (dirUp ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A)).withOpacity(0.85),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: rect.width);

      final lx = (rect.right - tp.width - 6).clamp(0.0, size.width);
      final ly = (rect.top + 4).clamp(0.0, size.height);
      tp.paint(canvas, Offset(lx, ly));
    }
  }

  @override
  bool shouldRepaint(covariant FuturePathPainter old) {
    return old.fp.anchor != fp.anchor ||
        old.fp.target != fp.target ||
        old.fp.invalid != fp.invalid ||
        old.fp.pMain != fp.pMain ||
        old.fp.rrX10 != fp.rrX10 ||
        old.structureTag != structureTag ||
        old.breakLevel != breakLevel ||
        old.reactLow != reactLow ||
        old.reactHigh != reactHigh ||
        old.smcZones.length != smcZones.length ||
        old.entryPrice != entryPrice ||
        old.anchorIndex != anchorIndex ||
        old.horizon != horizon ||
        old.confirmed != confirmed ||
        old.cleanMode != cleanMode ||
        old.showTpSlMarkers != showTpSlMarkers ||
        old.labelBgColor != labelBgColor ||
        old.labelTextColor != labelTextColor ||
        old.labelFontSize != labelFontSize ||
        old.labelOffsetX != labelOffsetX ||
        old.labelOffsetY != labelOffsetY ||
        (old.structureEvents?.length ?? 0) != (structureEvents?.length ?? 0);
  }
}
