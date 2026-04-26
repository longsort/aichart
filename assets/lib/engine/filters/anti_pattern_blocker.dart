import '../../models/ultra_result.dart';

class AntiPatternBlocker {
  /// 초보 보호형 “함정 방어” 1차:
  /// - Risk 높고
  /// - Crowding 높고
  /// - Flow/Shape 약하면
  /// => 들어가면 흔들리는 구간이라 잠금
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
    return '함정패턴 차단(R${e.risk}/C${e.crowding}, F${e.flow}/S${e.shape})';
  }
}