import 'models.dart';

class BacktestEngine {
  final List<TradeRecord> _trades = [];

  void openTrade(TradeRecord trade) {
    _trades.add(trade);
  }

  void closeTrade(TradeRecord trade, String result) {
    trade.result = result;
    trade.closeTime = DateTime.now();
  }

  BacktestStats stats() {
    int win = _trades.where((t) => t.result == 'TP').length;
    int loss = _trades.where((t) => t.result == 'SL').length;
    int total = win + loss;
    double rate = total == 0 ? 0 : (win / total) * 100;
    return BacktestStats(total, win, loss, rate);
  }
}
