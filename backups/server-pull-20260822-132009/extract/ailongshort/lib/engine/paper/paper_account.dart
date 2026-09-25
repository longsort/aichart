import 'package:flutter/foundation.dart';

class PaperAccount {
  static final PaperAccount I = PaperAccount._();

  final ValueNotifier<double> balance = ValueNotifier<double>(1000);
  final ValueNotifier<double> seed = ValueNotifier<double>(1000);

  PaperAccount._();

  void setSeed(double v) {
    seed.value = v;
    balance.value = v;
  }

  void applyPnL(double pnl) {
    balance.value += pnl;
  }
}
