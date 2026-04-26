import '../screens/ultra_home_screen.dart';
import '../../models/ultra_result.dart';

extension UltraHomeFix on _UltraHomeScreenState {
  String get tfLabel => selectedTf;

  UltraResult safeResult(UltraResult? r) {
    return r ?? UltraResult(decision: 'NO-TRADE', probability: 0);
  }
}