import '../models/fu_state.dart';
import '../config/profit_mode.dart';

class ProfitSignalForcer {
  static bool shouldForce(FuState s) {
    if (ProfitConfig.mode != ProfitMode.profit) return false;
    return s.zoneHitSupport || s.zoneHitResist;
  }

  static String forcedDir(FuState s) {
    if (s.zoneHitSupport) return 'LONG';
    if (s.zoneHitResist) return 'SHORT';
    return 'NONE';
  }
}
