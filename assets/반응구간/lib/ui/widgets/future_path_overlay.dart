import 'package:flutter/material.dart';
import '../../core/models/future_path_price_dto.dart';
import '../../core/models/struct_mark.dart';
import '../../core/models/match_window.dart';
import '../../core/models/fu_state.dart' show FuZone;
import 'future_path_painter.dart';

/// STEP16: 어떤 차트 위젯에도 얹을 수 있는 오버레이 래퍼
/// - chartChild 위에 CustomPaint를 Stack으로 얹는다.
class FuturePathOverlay extends StatelessWidget {
  final Widget chartChild;
  final FuturePathPriceDTO fp;
  final double Function(int idx) indexToX;
  final double Function(double price) priceToY;
  final int anchorIndex;
  final int horizon;

  /// 구조 태그(예: CHOCH_UP / BOS_DN / MSB_UP)
  final String? structureTag;

  /// 구조 기준가(돌파/이탈)
  final double? breakLevel;

  /// 진입 가격(선택)
  final double? entryPrice;

  /// 사용자 플랜 라인(드래그로 조정)
  final double? planEntry;
  final double? planSl;
  final double? planTp;

  // 구조 이벤트 라벨
  final List<StructMark>? structureEvents;

  // 과거 유사구간 하이라이트
  final List<MatchWindow>? matchWindows;

  // 지지/저항 표시(선택)
  final double? reactLow;
  final double? reactHigh;
  final List<FuZone> smcZones;
  final int? supportProb;
  final double? resistLow;
  final double? resistHigh;
  final int? resistProb;

  /// 사용자 조정: 차트 라벨 스타일
  final int? labelBgColor;
  final int? labelTextColor;
  final double? labelFontSize;
  final double? labelOffsetX;
  final double? labelOffsetY;

  const FuturePathOverlay({
    super.key,
    required this.chartChild,
    required this.fp,
    required this.indexToX,
    required this.priceToY,
    required this.anchorIndex,
    this.structureTag,
    this.breakLevel,
    this.entryPrice,
    this.planEntry,
    this.planSl,
    this.planTp,
    this.structureEvents,
    this.matchWindows,
    this.reactLow,
    this.reactHigh,
    this.smcZones = const [],
    this.supportProb,
    this.resistLow,
    this.resistHigh,
    this.resistProb,
    this.horizon = 60,
    this.labelBgColor,
    this.labelTextColor,
    this.labelFontSize,
    this.labelOffsetX,
    this.labelOffsetY,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(child: chartChild),
        Positioned.fill(
          child: IgnorePointer(
            child: CustomPaint(
              painter: FuturePathPainter(
                fp: fp,
                structureTag: structureTag,
                breakLevel: breakLevel,
                entryPrice: entryPrice,
                structureEvents: structureEvents,
                matchWindows: matchWindows,
                planEntry: planEntry,
                planSl: planSl,
                planTp: planTp,
                reactLow: reactLow,
                reactHigh: reactHigh,
            smcZones: smcZones,
                supportProb: supportProb,
                resistLow: resistLow,
                resistHigh: resistHigh,
                resistProb: resistProb,
                indexToX: indexToX,
                priceToY: priceToY,
                anchorIndex: anchorIndex,
                horizon: horizon,
                labelBgColor: labelBgColor ?? 0xFF1A1D24,
                labelTextColor: labelTextColor ?? 0xFFFFFFFF,
                labelFontSize: labelFontSize ?? 11.0,
                labelOffsetX: labelOffsetX ?? 0.0,
                labelOffsetY: labelOffsetY ?? 0.0,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
