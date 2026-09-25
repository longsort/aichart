enum Exchange {
  bitget('Bitget'),
  binance('Binance'),
  bybit('Bybit');

  const Exchange(this.label);
  final String label;
}

enum Tf {
  m15('15m', '15m', 15),
  h1('1h', '1h', 60),
  h4('4h', '4h', 240),
  d1('1D', '1d', 1440),
  w1('1W', '1w', 10080),
  m1('1M', '1M', 43200);

  const Tf(this.label, this.intervalKey, this.minutes);
  final String label;
  final String intervalKey;
  final int minutes;
}
