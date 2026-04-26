enum Exchange { binance, bitget }

extension ExchangeLabel on Exchange {
  String get label => this == Exchange.binance ? 'BINANCE' : 'BITGET';
}
