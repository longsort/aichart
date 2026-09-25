import 'package:flutter/material.dart';
import '../../core/models/future_path_price_dto.dart';
import '../../core/models/struct_mark.dart';
import '../../core/models/match_window.dart';
import '../../core/models/fu_state.dart' show FuZone;
import 'future_path_painter.dart';

/// STEP16: ?¥Îñ§ Ï∞®Ìä∏ ?ÑÏ†Ø?êÎèÑ ?πÏùÑ ???àÎäî ?§Î≤Ñ?àÏù¥ ?òÌçº
/// - chartChild ?ÑÏóê CustomPaintÎ•?Stack?ºÎ°ú ?πÎäî??
class FuturePathOverlay extends StatelessWidget {
  final Widget chartChild;
  final FuturePathPriceDTO fp;
  final double Function(int idx) indexToX;
  final double Function(double price) priceToY;
  final int anchorIndex;
  final int horizon;

  /// Íµ¨Ï°∞ ?úÍ∑∏(?? CHOCH_UP / BOS_DN / MSB_UP)
  final String? structureTag;

  /// Íµ¨Ï°∞ Í∏∞Ï?Í∞Ä(?åÌåå/?¥ÌÉà)
  final double? breakLevel;

  /// ÏßÑÏûÖ Í∞ÄÍ≤??†ÌÉù)
  final double? entryPrice;

  /// ?¨Ïö©???åÎûú ?ºÏù∏(?úÎûòÍ∑∏Î°ú Ï°∞Ï†ï)
  final double? planEntry;
  final double? planSl;
  final double? planTp;

  // Íµ¨Ï°∞ ?¥Î≤§???ºÎ≤®
  final List<StructMark>? structureEvents;

  // Í≥ºÍ±∞ ?†ÏÇ¨Íµ¨Í∞Ñ ?òÏù¥?ºÏù¥??  final List<MatchWindow>? matchWindows;

  // ÏßÄÏßÄ/?Ä???úÏãú(?†ÌÉù)
  final double? reactLow;
  final double? reactHigh;
  final List<FuZone> smcZones;
  final int? supportProb;
  final double? resistLow;
  final double? resistHigh;
  final int? resistProb;

  /// ?¨Ïö©??Ï°∞Ï†ï: Ï∞®Ìä∏ ?ºÎ≤® ?§Ì???  final int? labelBgColor;
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
