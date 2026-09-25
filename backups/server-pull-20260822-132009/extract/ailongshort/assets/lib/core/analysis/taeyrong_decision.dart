import '../models/fu_state.dart';
import '../models/struct_mark.dart';

enum TyRongLevel { noTrade, watch, entry, strong }

class TaeyRongDecision {
  final String dirText;      // LONG/SHORT/NEUTRAL
  final String signalText;   // NO-TRADE/WATCH/ENTRY/STRONG
  final TyRongLevel level;
  final int score;           // 0~100
  final int hitCount;        // 0~5
  final int autoLev;         // 1~10 (entry 이상)
  final List<String> reasons;

  const TaeyRongDecision({
    required this.dirText,
    required this.signalText,
    required this.level,
    required this.score,
    required this.hitCount,
    required this.autoLev,
    required this.reasons,
  });

  static String higherTfLabel(String tfLabel) {
    switch (tfLabel) {
      case '5m':
        return '15m';
      case '15m':
        return '1h';
      case '1h':
        return '4h';
      case '4h':
        return '1D';
      case '1D':
        return '1W';
      case '1W':
        return '1M';
      case '1M':
        return '1Y';
      default:
        return tfLabel;
    }
  }

  static TaeyRongDecision fromStates({
    required String tfLabel,
    required FuState cur,
    required String htfLabel,
    required FuState htf,
  }) {
    // 1) 방향 후보: 종가 품질(0~100)로만 잡는다.
    final int cs = cur.closeScore;
    String dir = 'NEUTRAL';
    if (cs >= 60) dir = 'LONG';
    if (cs <= 40) dir = 'SHORT';

    // 상위 TF 종가 동조
    final bool htfAlign = dir == 'LONG'
        ? (htf.closeScore >= 55)
        : dir == 'SHORT'
            ? (htf.closeScore <= 45)
            : false;

    // === 근거 5개 (0/1) ===
    // ① 구조: CHOCH/BOS + (종가 방향) + 상위TF 동조
    final bool hasBosUp = cur.structMarks.any((m) => m.label == 'BOS_UP');
    final bool hasBosDn = cur.structMarks.any((m) => m.label == 'BOS_DN');
    final bool hasChUp = cur.structMarks.any((m) => m.label == 'CHOCH_UP');
    final bool hasChDn = cur.structMarks.any((m) => m.label == 'CHOCH_DN');

    final bool structureOk = dir == 'LONG'
        ? (htfAlign && (hasBosUp || hasChUp))
        : dir == 'SHORT'
            ? (htfAlign && (hasBosDn || hasChDn))
            : false;

    // ② 패턴(쐐기/수렴/이탈): 여기선 '돌파 품질'을 패턴 확정 proxy로 사용
    // (실제 쐐기 라인 계산은 향후 고급모드로 분리)
    final bool patternOk = dir == 'LONG'
        ? (cur.breakoutScore >= 55)
        : dir == 'SHORT'
            ? (cur.breakoutScore <= 45)
            : false;

    // ③ 거래량: volumeScore로 확정
    final bool volumeOk = dir == 'LONG'
        ? (cur.volumeScore >= 55)
        : dir == 'SHORT'
            ? (cur.volumeScore <= 45)
            : false;

    // ④ 세력/고래/오더북/체결 강도 동조
    final int flowAvg = ((cur.whaleScore + cur.obImbalance + cur.tapeBuyPct) / 3).round();
    final bool flowOk = dir == 'LONG'
        ? (flowAvg >= 55)
        : dir == 'SHORT'
            ? (flowAvg <= 45)
            : false;

    // ⑤ Zone 타점: zoneBias + zoneStrength + wait 확률 낮음
    final bool zoneOk = dir == 'LONG'
        ? (cur.zoneBias == 'LONG' && cur.zoneStrength >= 60 && cur.zoneWaitP <= 55)
        : dir == 'SHORT'
            ? (cur.zoneBias == 'SHORT' && cur.zoneStrength >= 60 && cur.zoneWaitP <= 55)
            : false;

    int hits = 0;
    if (structureOk) hits++;
    if (patternOk) hits++;
    if (volumeOk) hits++;
    if (flowOk) hits++;
    if (zoneOk) hits++;

    // 점수: 히트 기반 + 종가/돌파/거래량 가중
    final int base = (hits * 20);
    int score = base +
        ((cur.closeScore - 50).abs() ~/ 2) +
        ((cur.breakoutScore - 50).abs() ~/ 3) +
        ((cur.volumeScore - 50).abs() ~/ 4);
    if (dir == 'NEUTRAL') score = 50;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    TyRongLevel level;
    String sig;
    if (hits <= 2 || dir == 'NEUTRAL') {
      level = TyRongLevel.noTrade;
      sig = 'NO-TRADE';
    } else if (hits == 3) {
      level = TyRongLevel.watch;
      sig = 'WATCH';
    } else if (hits == 4) {
      level = TyRongLevel.entry;
      sig = 'ENTRY';
    } else {
      level = TyRongLevel.strong;
      sig = 'STRONG';
    }

    // 자동 레버(최대 10배)
    int autoLev = 1;
    if (level.index >= TyRongLevel.entry.index) {
      autoLev = hits * 2;
      if (autoLev > 10) autoLev = 10;
    }

    final List<String> reasons = [
      '① 구조(CHOCH/BOS): ${structureOk ? "✅" : "❌"} (HTF ${htfLabel} ${htfAlign ? "동조" : "불일치"})',
      '② 패턴(돌파): ${patternOk ? "✅" : "❌"} (돌파 ${cur.breakoutScore})',
      '③ 거래량: ${volumeOk ? "✅" : "❌"} (볼륨 ${cur.volumeScore})',
      '④ 세력/고래/호가/체결: ${flowOk ? "✅" : "❌"} (FLOW ${flowAvg})',
      '⑤ Zone: ${zoneOk ? "✅" : "❌"} (${cur.zoneName} / ${cur.zoneBias} / ${cur.zoneStrength})',
    ];

    return TaeyRongDecision(
      dirText: dir,
      signalText: sig,
      level: level,
      score: score,
      hitCount: hits,
      autoLev: autoLev,
      reasons: reasons,
    );
  }
}
