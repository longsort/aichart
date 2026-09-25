
import 'state_engine.dart';

class StateTransition {
  MarketState _last = MarketState.stable;

  MarketState smooth(MarketState next) {
    // hysteresis to avoid flicker
    if (_last == MarketState.danger && next != MarketState.danger) {
      return _last; // hold danger one more cycle
    }
    if (_last == MarketState.uncertain && next == MarketState.energy) {
      return MarketState.uncertain;
    }
    _last = next;
    return next;
  }
}
