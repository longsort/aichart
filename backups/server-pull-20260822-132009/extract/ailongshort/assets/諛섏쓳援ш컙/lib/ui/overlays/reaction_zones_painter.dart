import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../widgets/neon_theme.dart';

/// 차트 오버레이: 반응구간/구조/박스(OB/FVG/BPR)
///
/// 목적
/// - "미래경로만" 있는 화면의 심심함 제거
/// - 초보도 이해 가능한 단어로, 지지/저항/반응/함정 위험을 시각화
///
/// 사용
/// - PathChartLite childBuilder에서 Positioned.fill(CustomPaint(...))로 얹는다.
class ReactionZonesPainter extends CustomPainter {
  final FuState s;
  final NeonTheme theme;
  final List<FuCandle> candles;

  /// 차트 좌표계
  final double Function(int idx) indexToX;
  final double Function(double price) priceToY;

  /// visible window
  final int startIndex;
  final int visibleCount;

  /// 우측 미래 PAD(막대 수)
  final int projectionBars;

  /// 표시 토글(심심함/과밀도 조절)
  final bool showReaction;
  final bool showStructure;
  final bool showBoxes;

  ReactionZonesPainter({
    required this.s,
    required this.theme,
    required this.candles,
    required this.indexToX,
    required this.priceToY,
    required this.startIndex,
    required this.visibleCount,
    required this.projectionBars,
    this.showReaction = true,
    this.showStructure = true,
    this.showBoxes = true,
  });

  @override
  void paint(Canvas canvas, Size size) {
    
    final _labelStack = <int, double>{};
if (candles.isEmpty) return;

    // "현재 구간"(미래 PAD 제외) 끝 X
    final lastIdx = candles.length - 1;
    final xRight = indexToX(lastIdx);

    // 1) OB/FVG/BPR 박스 (먼저 깔고)
    if (showBoxes) {
      _drawZoneList(canvas, size, s.fvgZones, base: theme.warn, xRight: xRight);
    _drawZoneList(canvas, size, s.obZones, base: theme.good, xRight: xRight);
    _drawZoneList(canvas, size, s.bprZones, base: theme.border, xRight: xRight);
    }

    // 2) 반응구간(지지/저항 띠)
    if (showReaction) {
      _drawReactionBand(canvas, size, xRight);
    }

    // 3) 구조 라인(CHOCH/BOS/MSB)
    if (showStructure) {
      _drawStructureLine(canvas, size, xRight);
    }
  }

  void _drawZoneList(Canvas canvas, Size size, List<FuZone> zones,
      {required Color base, required double xRight}) {
    if (zones.isEmpty) return;

    for (final z in zones) {
      final y1 = priceToY(z.high);
      final y2 = priceToY(z.low);
      final top = y1 < y2 ? y1 : y2;
      final bottom = y1 < y2 ? y2 : y1;

      // zone span
      double x1 = 0;
      double x2 = xRight;
      if (z.iStart != null) x1 = indexToX(z.iStart!);
      if (z.iEnd != null) x2 = indexToX(z.iEnd!);
      if (x2 < x1) {
        final tmp = x1;
        x1 = x2;
        x2 = tmp;
      }
      x1 = x1.clamp(0.0, xRight);
      x2 = x2.clamp(0.0, xRight);
      if ((x2 - x1) < 4) continue;

      Color c = base;
      if (z.dir > 0) c = theme.good;
      if (z.dir < 0) c = theme.bad;

      final fill = Paint()..color = c.withOpacity(0.10);
      final stroke = Paint()
        ..color = c.withOpacity(0.24)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0;

      final r = RRect.fromRectAndRadius(
        Rect.fromLTRB(x1, top, x2, bottom),
        const Radius.circular(8),
      );
      canvas.drawRRect(r, fill);
      canvas.drawRRect(r, stroke);

      if (z.label.trim().isNotEmpty) {
        final ko = _zoneLabelKo(z.label, dir: z.dir);
        // 왼쪽은 가려지기 쉬움 → 오른쪽 상단에 고정
        _labelRight(canvas, ko, Offset(x2 - 8, top + 4), c.withOpacity(0.92));
      }
    }
  }

  String _zoneLabelKo(String raw, {required int dir}) {
    final u = raw.trim().toUpperCase();
    if (u == 'FVG') return '갭(FVG)';
    if (u == 'OB') return dir >= 0 ? '매수구간(OB)' : '매도구간(OB)';
    if (u == 'BPR') return '겹침구간(BPR)';
    return raw;
  }

  void _drawReactionBand(Canvas canvas, Size size, double xRight) {
    // reactLow/high가 유효할 때만
    final lo = s.reactLow;
    final hi = s.reactHigh;
    if (lo <= 0 || hi <= 0 || (hi - lo).abs() < 1e-9) return;

    final y1 = priceToY(hi);
    final y2 = priceToY(lo);
    final top = y1 < y2 ? y1 : y2;
    final bottom = y1 < y2 ? y2 : y1;

    // 방향(초보용): LONG=반등, SHORT=막힘
    final bias = s.zoneBias.toUpperCase();

    // 확률(반응/돌파/함정) + 근거 1줄
    final probs = _calcReactionProbs(bias);

    // 반응구간 색: LONG=초록, SHORT=빨강, 그 외=노랑
    Color c = theme.warn;
    if (bias == 'LONG') c = theme.good;
    if (bias == 'SHORT') c = theme.bad;

    // "히트맵 띠" 느낌: 확률이 높을수록 더 진하게, 함정 높으면 붉은 안개 추가
    final baseOpacity = (0.06 + (probs.reactP / 100.0) * 0.14).clamp(0.06, 0.22);
    final trapOpacity = (probs.trapP / 100.0) * 0.10;

    final fill = Paint()..color = c.withOpacity(baseOpacity);
    final stroke = Paint()
      ..color = c.withOpacity((baseOpacity + 0.14).clamp(0.18, 0.38))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;

    final r = RRect.fromRectAndRadius(
      Rect.fromLTRB(0, top, xRight, bottom),
      const Radius.circular(10),
    );

    canvas.drawRRect(r, fill);
    canvas.drawRRect(r, stroke);

    // 함정(휩쏘) 위험이 높으면 빨간 haze를 얇게 겹친다.
    if (probs.trapP >= 55) {
      final haze = Paint()..color = theme.bad.withOpacity(trapOpacity.clamp(0.03, 0.12));
      canvas.drawRRect(r, haze);
    }

    // 확률 표시(초보용)
    final label = '반응 ${probs.reactP}% / 돌파 ${probs.breakP}% / 함정 ${probs.trapP}%';
    _label(canvas, size, label, Offset(10, top + 6), theme.textPrimary.withOpacity(0.92));

    // 근거 1줄(너무 길면 잘리게)
    if (probs.reason.trim().isNotEmpty) {
      _label(canvas, size, probs.reason, Offset(10, top + 24), theme.textSecondary.withOpacity(0.92));
    }

    // 구간명(짧게)
    final zoneName = (s.zoneName.trim().isNotEmpty) ? s.zoneName : '반응구간';
    _label(canvas, size, zoneName, Offset(10, bottom - 18), theme.textSecondary.withOpacity(0.92));
  }

  _ReactionProbs _calcReactionProbs(String bias) {
    // 기본값(기존 로직): zoneLongP/zoneShortP + sweepRisk
    final longP0 = s.zoneLongP.clamp(0, 100);
    final shortP0 = s.zoneShortP.clamp(0, 100);
    final trap0 = s.sweepRisk.clamp(0, 100);

    int reactP;
    int breakP;

    if (bias == 'LONG') {
      reactP = longP0;
      breakP = shortP0;
    } else if (bias == 'SHORT') {
      reactP = shortP0;
      breakP = longP0;
    } else {
      reactP = ((longP0 + shortP0) / 2).round();
      breakP = (100 - reactP).clamp(0, 100);
    }

    // === 고도화(정확도 우선) ===
    // - 반응: 방어/흡수/세력/종가 품질이 좋을수록 ↑
    // - 돌파: 돌파품질/거래량 질이 좋을수록 ↑
    // - 함정: 스윕 위험 + 분산(상단던짐) + 거래량 약할 때 ↑

    // 공통 스케일(0~100 -> -25~+25)
    double adjReact = 0;
    double adjBreak = 0;
    double adjTrap = 0;

    // 종가/돌파/거래량
    adjReact += (s.closeScore - 50) * 0.22;
    adjBreak += (s.breakoutScore - 50) * 0.30;
    adjBreak += (s.volumeScore - 50) * 0.22;

    // 세력/흡수/방어
    adjReact += (s.forceScore - 50) * 0.18;
    adjReact += (s.absorptionScore - 50) * 0.20;
    adjReact += (s.defenseScore - 50) * 0.22;

    // 분산(던짐)은 반응↓, 함정↑
    adjReact -= (s.distributionScore - 50) * 0.18;
    adjTrap += (s.distributionScore - 50) * 0.20;

    // 스윕 위험
    adjTrap += (s.sweepRisk - 50) * 0.35;

    // 구조 태그 보정: CHOCH는 아직 불안 → 함정 약간↑, BOS는 유지형 → 돌파/반응 소폭↑
    final tag = s.structureTag.toUpperCase();
    if (tag.startsWith('CHOCH')) {
      adjTrap += 6;
      adjReact -= 2;
    }
    if (tag.startsWith('BOS')) {
      adjBreak += 4;
      adjReact += 2;
    }
    if (tag.startsWith('MSB')) {
      // 큰 전환이면 반응(되돌림) 확률이 올라가는 경향
      adjReact += 4;
    }

    // 방향에 따른 해석:
    // LONG에서는 breakP = 하락 이탈이므로 adjBreak를 '반응 쪽'으로 일부 되돌림
    // SHORT에서는 breakP = 상승 이탈이므로 동일 처리
    if (bias == 'LONG' || bias == 'SHORT') {
      // 돌파/거래량이 강하면 "이탈 위험"이 줄어든다 → breakP 감소로 반영
      breakP = (breakP - adjBreak.round()).clamp(0, 100);
      reactP = (reactP + adjReact.round()).clamp(0, 100);
    } else {
      // 중립이면 돌파를 그대로 쓴다
      breakP = (breakP + adjBreak.round()).clamp(0, 100);
      reactP = (reactP + adjReact.round()).clamp(0, 100);
    }

    // 함정
    final trapP = (trap0 + adjTrap.round()).clamp(0, 100);

    // 반응/돌파 합계가 이상하면 재정규화(간단)
    final sum = reactP + breakP;
    if (sum > 100 && sum > 0) {
      final r = (reactP / sum * 100).round();
      reactP = r.clamp(0, 100);
      breakP = (100 - reactP).clamp(0, 100);
    } else if (sum < 60) {
      // 둘 다 너무 낮게 나오면 중립 보정
      reactP = (reactP + 10).clamp(0, 100);
      breakP = (breakP + 10).clamp(0, 100);
    }

    // 근거 1줄 생성(초보용 단어)
    final reasons = <String>[];
    if (s.defenseScore >= 62) reasons.add('가격 지킴');
    if (s.absorptionScore >= 62) reasons.add('받아줌(흡수)');
    if (s.breakoutScore >= 62) reasons.add('돌파 유지');
    if (s.volumeScore >= 62) reasons.add('거래량 힘');
    if (s.distributionScore >= 62) reasons.add('위에서 던짐');
    if (s.sweepRisk >= 65) reasons.add('휩쏘 주의');

    String reason = reasons.isEmpty ? '근거 수집 중' : reasons.take(3).join(' · ');
    // bias 설명을 앞에 붙여주기(짧게)
    if (bias == 'LONG') reason = '반등 쪽: $reason';
    if (bias == 'SHORT') reason = '막힘 쪽: $reason';

    

    // 추가: 지지/저항 핵심구간 요약(최대 2개)
    String _fmt(num v) => v >= 1000 ? '${(v / 1000).toStringAsFixed(1)}k' : v.toStringAsFixed(0);
    // FuState에는 priceNow/zones 필드가 없어서, 현재가(price) + 존 리스트를 합쳐 사용한다.
    final priceNow = s.price;
    final allZones = <FuZone>[...s.obZones, ...s.fvgZones, ...s.bprZones, ...s.mbZones];
    // v22: 너무 많은 박스가 화면을 덮지 않게, 현재가 기준 '가까운 구간'만 선별
    final pickedOb2 = _pickNearestZones(s.obZones, priceNow, 2);
    final pickedFvg2 = _pickNearestZones(s.fvgZones, priceNow, 2);
    final pickedBpr2 = _pickNearestZones(s.bprZones, priceNow, 2);
    final pickedMb2  = _pickNearestZones(s.mbZones,  priceNow, 1);
    final pickedZones = <FuZone>[...pickedOb2, ...pickedFvg2, ...pickedBpr2, ...pickedMb2];

    final obZones = allZones.where((z) => z.label.startsWith('OB')).toList()
      ..sort((a, b) => a.low.compareTo(b.low));
    final supports = <String>[];
    for (final z in obZones) {
      final mid = (z.low + z.high) / 2.0;
      if (mid <= priceNow && supports.length < 2) {
        supports.add('${supports.length + 1}) ${_fmt(z.low)}~${_fmt(z.high)}');
      }
    }
    final resist = <String>[];
    for (final z in obZones.reversed) {
      final mid = (z.low + z.high) / 2.0;
      if (mid >= priceNow && resist.length < 1) {
        resist.add('${_fmt(z.low)}~${_fmt(z.high)}');
      }
    }

    // 추가: 왜 반응자리인지(간단 태그)
    final tags = <String>[];
    if (allZones.any((z) => z.label.startsWith('OB'))) tags.add('OB');
    if (allZones.any((z) => z.label.startsWith('FVG'))) tags.add('FVG');
    if (allZones.any((z) => z.label.startsWith('BPR'))) tags.add('BPR');
    if (tags.isNotEmpty) {
      reason = '$reason · ${tags.join('+')}';
    }
    if (supports.isNotEmpty || resist.isNotEmpty) {
      final lines = <String>[];
      if (supports.isNotEmpty) lines.add("지지 ${supports.join(' / ')}");
      if (resist.isNotEmpty) lines.add("저항 ${resist.join(' / ')}");
      reason = "$reason\n${lines.join(' · ')}";
    }
return _ReactionProbs(
      reactP: reactP,
      breakP: breakP,
      trapP: trapP,
      reason: reason,
    );
  }


  void _drawStructureLine(Canvas canvas, Size size, double xRight) {
    final lvl = s.breakLevel;
    if (lvl <= 0) return;

    final y = priceToY(lvl);

    // dashed line
    final p = Paint()
      ..color = theme.textSecondary.withOpacity(0.35)
      ..strokeWidth = 1.2;

    const dashW = 6.0;
    const dashGap = 6.0;
    double x = 0;
    while (x < xRight) {
      canvas.drawLine(Offset(x, y), Offset((x + dashW).clamp(0.0, xRight), y), p);
      x += dashW + dashGap;
    }

    final tag = s.structureTag.toUpperCase();
    final label = _structureKo(tag);
    if (label.isEmpty) return;
    _label(canvas, size, label, Offset(10, y - 18), theme.textPrimary.withOpacity(0.92));
  }

  String _structureKo(String tag) {
    if (tag.contains('CHOCH_UP')) return '방향 바뀜 신호↑';
    if (tag.contains('CHOCH_DN')) return '방향 바뀜 신호↓';
    if (tag.contains('MSB_UP')) return '큰 전환(확정)↑';
    if (tag.contains('MSB_DN')) return '큰 전환(확정)↓';
    if (tag.contains('BOS_UP')) return '추세 유지(돌파)↑';
    if (tag.contains('BOS_DN')) return '추세 유지(이탈)↓';
    return '';
  }

  void _label(Canvas canvas, Size size, String text, Offset at, Color color) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          shadows: const [Shadow(blurRadius: 6, color: Color(0xAA000000))],
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: 520);

    // small dark backing
    final pad = const EdgeInsets.symmetric(horizontal: 6, vertical: 4);
    // ✅ 위/아래 잘림 방지
    final double boxW = tp.width + pad.horizontal;
    final double boxH = tp.height + pad.vertical;
    final double x = (at.dx - 2).clamp(6.0, (size.width - boxW - 6.0).clamp(6.0, size.width));
    final double y = (at.dy - 1).clamp(6.0, (size.height - boxH - 6.0).clamp(6.0, size.height));
    final r = RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, boxW, boxH),
      const Radius.circular(10),
    );
    final bg = Paint()..color = const Color(0xAA05060B);
    canvas.drawRRect(r, bg);
    tp.paint(canvas, Offset(x + pad.left, y + pad.top));
  }

  void _labelRight(Canvas canvas, String text, Offset rightTop, Color color) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          shadows: const [Shadow(blurRadius: 6, color: Color(0xAA000000))],
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: 220);

    final pad = const EdgeInsets.symmetric(horizontal: 6, vertical: 4);
    final w = tp.width + pad.horizontal;
    final h = tp.height + pad.vertical;
    final left = (rightTop.dx - w).clamp(6.0, rightTop.dx);
    final top = rightTop.dy;

    final r = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, top, w, h),
      const Radius.circular(10),
    );
    canvas.drawRRect(r, Paint()..color = const Color(0xAA05060B));
    tp.paint(canvas, Offset(left + pad.left, top + pad.top));
  }

  @override
  bool shouldRepaint(covariant ReactionZonesPainter oldDelegate) {
    return oldDelegate.s != s ||
        oldDelegate.candles.length != candles.length ||
        oldDelegate.startIndex != startIndex ||
        oldDelegate.visibleCount != visibleCount ||
        oldDelegate.projectionBars != projectionBars;
  }
}


class _ReactionProbs {
  final int reactP;
  final int breakP;
  final int trapP;
  final String reason;

  const _ReactionProbs({
    required this.reactP,
    required this.breakP,
    required this.trapP,
    required this.reason,
  });

}


// === Zone helpers (v22) ===
List<FuZone> _pickNearestZones(List<FuZone> zs, double priceNow, int maxN) {
  if (zs.isEmpty) return <FuZone>[];
  final withDist = zs.map((z) {
    final mid = (z.low + z.high) / 2.0;
    final d = (mid - priceNow).abs();
    return MapEntry<FuZone, double>(z, d);
  }).toList()
    ..sort((a, b) => a.value.compareTo(b.value));
  return withDist.take(maxN).map((e) => e.key).toList();
}

double _clamp(double v, double lo, double hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

Color _zoneFill(String tag) {
  if (tag.startsWith('OB')) return const Color(0xFF22D3EE).withOpacity(0.10);   // 청록
  if (tag.startsWith('FVG')) return const Color(0xFFA78BFA).withOpacity(0.10);  // 보라
  if (tag.startsWith('BPR')) return const Color(0xFFFBBF24).withOpacity(0.10);  // 주황
  if (tag.startsWith('MB')) return const Color(0xFFFB7185).withOpacity(0.08);   // 핑크(마켓브레이커 등)
  return Colors.white.withOpacity(0.06);
}

Color _zoneStroke(String tag) {
  if (tag.startsWith('OB')) return const Color(0xFF22D3EE).withOpacity(0.70);
  if (tag.startsWith('FVG')) return const Color(0xFFA78BFA).withOpacity(0.70);
  if (tag.startsWith('BPR')) return const Color(0xFFFBBF24).withOpacity(0.70);
  if (tag.startsWith('MB')) return const Color(0xFFFB7185).withOpacity(0.65);
  return Colors.white.withOpacity(0.35);
}


