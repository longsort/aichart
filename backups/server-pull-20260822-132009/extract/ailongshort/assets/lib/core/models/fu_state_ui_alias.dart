import 'fu_state.dart';

/// Compatibility layer so UI code can use short field names
/// while the core model keeps the canonical names.
extension FuStateUiAlias on FuState {
  String get direction => signalDir;
  int get prob => signalProb;
  String get gradeLabel => signalGrade;

  /// Strength number 0..100. If not available, fallback to probability.
  int get srStrength {
    final v = signalProb;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }
}
