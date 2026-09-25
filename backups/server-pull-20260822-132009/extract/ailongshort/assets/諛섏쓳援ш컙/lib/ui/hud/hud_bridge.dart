import 'dart:async';

import '../../engine/consensus/consensus_bus.dart';
import 'hud_state.dart';

/// Bridges existing engine notifiers (ConsensusBus) -> Global HUD (FulinkHudBus)
///
/// - Compile-safe: only depends on ConsensusBus.
/// - Updates HUD immediately and periodically.
class HudBridge {
  HudBridge._();

  static bool _started = false;
  static Timer? _tick;

  static void start() {
    if (_started) return;
    _started = true;

    final bus = ConsensusBus.I;

    void push() {
      final lock = bus.noTradeLock.value;
      final reason = bus.noTradeReason.value;
      final c = bus.consensus01.value;

      final String decision = lock
          ? 'NO-TRADE'
          : (c >= 0.55 ? 'LONG' : (c <= 0.45 ? 'SHORT' : 'NEUTRAL'));

      final double up01 = c.clamp(0.0, 1.0);
      final double down01 = (1.0 - up01).clamp(0.0, 1.0);

      // Use TF up% map if available, otherwise fall back to consensus.
      final tfUp = bus.tfUp.value;
      double avgUpPct;
      if (tfUp.isEmpty) {
        avgUpPct = up01 * 100.0;
      } else {
        final sum = tfUp.values.fold<int>(0, (a, b) => a + b);
        avgUpPct = sum / tfUp.length;
      }
      final buy01 = (avgUpPct / 100.0).clamp(0.0, 1.0);
      final sell01 = (1.0 - buy01).clamp(0.0, 1.0);

      // Placeholder for engulf mode until Tyron event is bridged globally.
      final flags = bus.evidenceFlags.value;
      final engulf = (flags['거래량'] == true) && (flags['구조'] == true);

      FulinkHudBus.I.updateClamped(
        decision: decision,
        engulfMode: engulf,
        buyPressure01: buy01,
        sellPressure01: sell01,
        upProb01: up01,
        downProb01: down01,
        lockReason: lock ? reason : '',
      );
    }

    // Listeners
    bus.consensus01.addListener(push);
    bus.noTradeLock.addListener(push);
    bus.noTradeReason.addListener(push);
    bus.tfUp.addListener(push);
    bus.evidenceFlags.addListener(push);

    // Safety periodic tick (handles cases where notifiers change reference without firing).
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) => push());

    // Initial push
    push();
  }

  static void stop() {
    _tick?.cancel();
    _tick = null;
    _started = false;
  }
}
