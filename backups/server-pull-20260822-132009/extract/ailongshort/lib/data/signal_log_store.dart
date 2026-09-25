import 'package:flutter/foundation.dart';

class SignalLogEntry {
  final DateTime ts;
  final String symbol;
  final String whale;
  final int whaleStreak;
  final int up15;
  final int up1h;
  final int up4h;
  final int risk;
  final int evidenceHit;
  final int evidenceTotal;
  final String decision;
  final int confidence;

  const SignalLogEntry({
    required this.ts,
    required this.symbol,
    required this.whale,
    required this.whaleStreak,
    required this.up15,
    required this.up1h,
    required this.up4h,
    required this.risk,
    this.evidenceHit = 0,
    this.evidenceTotal = 10,
    this.decision = 'NO-TRADE',
    this.confidence = 0,
  });
}

class SignalLogStore {
  static final SignalLogStore I = SignalLogStore._();
  SignalLogStore._();

  final ValueNotifier<List<SignalLogEntry>> entries = ValueNotifier<List<SignalLogEntry>>(<SignalLogEntry>[]);

  void add(SignalLogEntry e) {
    final next = List<SignalLogEntry>.from(entries.value);
    next.insert(0, e);
    if (next.length > 200) next.removeRange(200, next.length);
    entries.value = next;
  }

  int get count => entries.value.length;
}