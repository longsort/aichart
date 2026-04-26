import '../models/fu_state.dart';
import '../models/struct_mark.dart';

enum TyRongLevel { noTrade, watch, entry, strong }

class TaeyRongDecision {
  final String dirText;      // LONG/SHORT/NEUTRAL
  final String signalText;   // NO-TRADE/WATCH/ENTRY/STRONG
  final TyRongLevel level;
  final int score;           // 0~100
  final int hitCount;        // 0~5
  final int autoLev;         // 1~10 (entry ?¥ÏÉÅ)
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
    // 1) Î∞©Ìñ• ?ÑÎ≥¥: Ï¢ÖÍ? ?àÏßà(0~100)Î°úÎßå ?°Îäî??
    final int cs = cur.closeScore;
    String dir = 'NEUTRAL';
    if (cs >= 60) dir = 'LONG';
    if (cs <= 40) dir = 'SHORT';

    // ?ÅÏúÑ TF Ï¢ÖÍ? ?ôÏ°∞
    final bool htfAlign = dir == 'LONG'
        ? (htf.closeScore >= 55)
        : dir == 'SHORT'
            ? (htf.closeScore <= 45)
            : false;

    // === Í∑ºÍ±∞ 5Í∞?(0/1) ===
    // ??Íµ¨Ï°∞: CHOCH/BOS + (Ï¢ÖÍ? Î∞©Ìñ•) + ?ÅÏúÑTF ?ôÏ°∞
    final bool hasBosUp = cur.structMarks.any((m) => m.label == 'BOS_UP');
    final bool hasBosDn = cur.structMarks.any((m) => m.label == 'BOS_DN');
    final bool hasChUp = cur.structMarks.any((m) => m.label == 'CHOCH_UP');
    final bool hasChDn = cur.structMarks.any((m) => m.label == 'CHOCH_DN');

    final bool structureOk = dir == 'LONG'
        ? (htfAlign && (hasBosUp || hasChUp))
        : dir == 'SHORT'
            ? (htfAlign && (hasBosDn || hasChDn))
            : false;

    // ???®ÌÑ¥(?êÍ∏∞/?òÎ†¥/?¥ÌÉà): ?¨Í∏∞??'?åÌåå ?àÏßà'???®ÌÑ¥ ?ïÏ†ï proxyÎ°??¨Ïö©
    // (?§Ï†ú ?êÍ∏∞ ?ºÏù∏ Í≥ÑÏÇ∞?Ä ?•ÌõÑ Í≥†Í∏âÎ™®ÎìúÎ°?Î∂ÑÎ¶¨)
    final bool patternOk = dir == 'LONG'
        ? (cur.breakoutScore >= 55)
        : dir == 'SHORT'
            ? (cur.breakoutScore <= 45)
            : false;

    // ??Í±∞Îûò?? volumeScoreÎ°??ïÏ†ï
    final bool volumeOk = dir == 'LONG'
        ? (cur.volumeScore >= 55)
        : dir == 'SHORT'
            ? (cur.volumeScore <= 45)
            : false;

    // ???∏Î†•/Í≥†Îûò/?§ÎçîÎ∂?Ï≤¥Í≤∞ Í∞ïÎèÑ ?ôÏ°∞
    final int flowAvg = ((cur.whaleScore + cur.obImbalance + cur.tapeBuyPct) / 3).round();
    final bool flowOk = dir == 'LONG'
        ? (flowAvg >= 55)
        : dir == 'SHORT'
            ? (flowAvg <= 45)
            : false;

    // ??Zone ?Ä?? zoneBias + zoneStrength + wait ?ïÎ•† ??ùå
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

    // ?êÏàò: ?àÌä∏ Í∏∞Î∞ò + Ï¢ÖÍ?/?åÌåå/Í±∞Îûò??Í∞ÄÏ§?    final int base = (hits * 20);
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

    // ?êÎèô ?àÎ≤Ñ(ÏµúÎ? 10Î∞?
    int autoLev = 1;
    if (level.index >= TyRongLevel.entry.index) {
      autoLev = hits * 2;
      if (autoLev > 10) autoLev = 10;
    }

    final List<String> reasons = [
      '??Íµ¨Ï°∞(CHOCH/BOS): ${structureOk ? "?? : "??} (HTF ${htfLabel} ${htfAlign ? "?ôÏ°∞" : "Î∂àÏùºÏπ?})',
      '???®ÌÑ¥(?åÌåå): ${patternOk ? "?? : "??} (?åÌåå ${cur.breakoutScore})',
      '??Í±∞Îûò?? ${volumeOk ? "?? : "??} (Î≥ºÎ•® ${cur.volumeScore})',
      '???∏Î†•/Í≥†Îûò/?∏Í?/Ï≤¥Í≤∞: ${flowOk ? "?? : "??} (FLOW ${flowAvg})',
      '??Zone: ${zoneOk ? "?? : "??} (${cur.zoneName} / ${cur.zoneBias} / ${cur.zoneStrength})',
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
