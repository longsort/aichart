
import 'trade_state.dart';

class NoTradeLock {
  static TradeState eval({
    required double consensus,
    required int activeEvidence,
  }) {
    if(activeEvidence < 6) return TradeState.collecting;
    if(consensus >= 0.55) return TradeState.longReady;
    if(consensus <= 0.45) return TradeState.shortReady;
    return TradeState.noTrade;
  }
}
