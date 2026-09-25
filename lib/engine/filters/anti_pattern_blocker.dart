import '../../models/ultra_result.dart';

class AntiPatternBlocker {
  /// ì´ˆë³´ ë³´í˜¸???œí•¨??ë°©ì–´??1ì°?
  /// - Risk ?’ê³ 
  /// - Crowding ?’ê³ 
  /// - Flow/Shape ?½í•˜ë©?
  /// => ?¤ì–´ê°€ë©??”ë“¤ë¦¬ëŠ” êµ¬ê°„?´ë¼ ? ê¸ˆ
  static bool shouldBlock(UltraResult r) {
    final e = r.evidence;

    final highRisk = e.risk >= 70;
    final crowded = e.crowding >= 65;
    final weakFlow = e.flow < 55;
    final weakShape = e.shape < 55;

    return highRisk && crowded && (weakFlow || weakShape);
  }

  static String reason(UltraResult r) {
    final e = r.evidence;
    return '?¨ì •?¨í„´ ì°¨ë‹¨(R${e.risk}/C${e.crowding}, F${e.flow}/S${e.shape})';
  }
}