import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/models/future_path_price_dto.dart';

/// 교체 카드: 롱숏 확률 · 핵심구간 · 지지반등 (메인/미래경로 공용)
/// CSV 카드 대신 사용 — 실시간 엔진 기준 롱숏 결정 + 구간 표시
class LongShortZoneCard extends StatelessWidget {
  final FuState s;
  final double? matchWinrate;
  final FuturePathPriceDTO? fp;

  const LongShortZoneCard({
    super.key,
    required this.s,
    this.matchWinrate,
    this.fp,
  });

  @override
  Widget build(BuildContext context) {
    final dir = s.signalDir.toUpperCase();
    final isLong = dir.contains('LONG');
    final isShort = dir.contains('SHORT');

    final zoneLong = (s.zoneLongP).clamp(0, 100);
    final zoneShort = (s.zoneShortP).clamp(0, 100);
    final engLong = isLong ? s.signalProb.clamp(0, 100) : (100 - s.signalProb.clamp(0, 100));
    final engShort = isShort ? s.signalProb.clamp(0, 100) : (100 - s.signalProb.clamp(0, 100));

    double patternLong = 50, patternShort = 50;
    double pathLong = 50, pathShort = 50;
    if (matchWinrate != null) {
      patternLong = isLong ? (matchWinrate!.clamp(0.0, 100.0)) : (100.0 - matchWinrate!.clamp(0.0, 100.0));
      patternShort = 100.0 - patternLong;
    }
    if (fp != null) {
      final fpMain = fp!.pMain.toDouble();
      pathLong = fp!.dir.toUpperCase().contains('LONG') ? fpMain : (100.0 - fpMain);
      pathShort = 100.0 - pathLong;
    }

    double longSum;
    double shortSum;
    if (zoneLong > 0 || zoneShort > 0) {
      longSum = (zoneLong * 0.25) + (engLong * 0.25) + (patternLong * 0.25) + (pathLong * 0.25);
      shortSum = (zoneShort * 0.25) + (engShort * 0.25) + (patternShort * 0.25) + (pathShort * 0.25);
    } else {
      longSum = (engLong * 0.4) + (patternLong * 0.3) + (pathLong * 0.3);
      shortSum = (engShort * 0.4) + (patternShort * 0.3) + (pathShort * 0.3);
    }
    final total = longSum + shortSum;
    final longPct = total > 0 ? (longSum / total * 100).round().clamp(0, 100) : 50;
    final shortPct = (100 - longPct).clamp(0, 100);

    final rLow = s.reactLow > 0 ? s.reactLow : 0.0;
    final rHigh = s.reactHigh > 0 ? s.reactHigh : 0.0;
    final breakLvl = s.breakLevel > 0 ? s.breakLevel : 0.0;
    final zoneName = s.zoneName.isNotEmpty ? s.zoneName : '구간정보없음';
    final zoneCode = s.zoneCode.isNotEmpty ? s.zoneCode : '';

    final decisionLong = longPct >= 55;
    final decisionShort = shortPct >= 55;
    final String decisionText;
    final Color decisionColor;
    if (decisionLong && longPct >= shortPct) {
      decisionText = 'LONG $longPct%';
      decisionColor = const Color(0xFF1EEA6A);
    } else if (decisionShort && shortPct >= longPct) {
      decisionText = 'SHORT $shortPct%';
      decisionColor = const Color(0xFFEA2A2A);
    } else {
      decisionText = '관망 L${longPct}% S${shortPct}%';
      decisionColor = const Color(0xFFB3B9C9);
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            decisionColor.withOpacity(0.08),
            const Color(0xFF0D1220),
          ],
        ),
        border: Border.all(color: decisionColor.withOpacity(0.35), width: 1.2),
        boxShadow: [
          BoxShadow(color: decisionColor.withOpacity(0.12), blurRadius: 18, spreadRadius: 0),
          BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 10, offset: const Offset(0, 3)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: LinearGradient(
                colors: [
                  decisionColor.withOpacity(0.2),
                  decisionColor.withOpacity(0.08),
                ],
              ),
              border: Border.all(color: decisionColor.withOpacity(0.6), width: 1.5),
              boxShadow: [BoxShadow(color: decisionColor.withOpacity(0.2), blurRadius: 12)],
            ),
            child: Row(
              children: [
                Text(
                  '롱숏 결정',
                  style: TextStyle(color: Colors.white.withOpacity(0.95), fontSize: 11, fontWeight: FontWeight.w900),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    decisionText,
                    style: TextStyle(
                      color: decisionColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                      shadows: [Shadow(color: decisionColor.withOpacity(0.5), blurRadius: 8)],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '롱숏 확률 · 핵심구간 · 지지반등',
            style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 11, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: LinearGradient(
                      colors: [
                        const Color(0xFF1EEA6A).withOpacity(0.2),
                        const Color(0xFF1EEA6A).withOpacity(0.06),
                      ],
                    ),
                    border: Border.all(color: const Color(0xFF1EEA6A).withOpacity(0.5)),
                    boxShadow: [BoxShadow(color: const Color(0xFF1EEA6A).withOpacity(0.15), blurRadius: 8)],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('LONG', style: TextStyle(color: Color(0xFF1EEA6A), fontSize: 10, fontWeight: FontWeight.w900)),
                      Text('$longPct%', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: LinearGradient(
                      colors: [
                        const Color(0xFFEA2A2A).withOpacity(0.2),
                        const Color(0xFFEA2A2A).withOpacity(0.06),
                      ],
                    ),
                    border: Border.all(color: const Color(0xFFEA2A2A).withOpacity(0.5)),
                    boxShadow: [BoxShadow(color: const Color(0xFFEA2A2A).withOpacity(0.15), blurRadius: 8)],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('SHORT', style: TextStyle(color: Color(0xFFEA2A2A), fontSize: 10, fontWeight: FontWeight.w900)),
                      Text('$shortPct%', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '핵심구간(승부): ${rLow > 0 && rHigh > 0 ? "${rLow.toStringAsFixed(0)} ~ ${rHigh.toStringAsFixed(0)}" : "-"}${breakLvl > 0 ? " · 돌파 ${breakLvl.toStringAsFixed(0)}" : ""}',
            style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w800),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            '지지반등: $zoneName${zoneCode.isNotEmpty ? " ($zoneCode)" : ""}${rLow > 0 && rHigh > 0 ? " · ${rLow.toStringAsFixed(0)}~${rHigh.toStringAsFixed(0)}" : ""}',
            style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w800),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
