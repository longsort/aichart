
import '../models/decision.dart';

extension DecisionExt on Decision {
  bool get isLong => action.toString().contains('long');
  bool get isShort => action.toString().contains('short');
}
