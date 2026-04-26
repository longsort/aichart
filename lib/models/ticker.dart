class Ticker {
  final double lastPrice;
  final double price24hPcnt;

  Ticker({
    required this.lastPrice,
    required this.price24hPcnt,
  });

  factory Ticker.fromJson(Map<String, dynamic> json) {
    return Ticker(
      lastPrice: double.tryParse(json['lastPrice']?.toString() ?? '') ?? 0.0,
      price24hPcnt: double.tryParse(json['price24hPcnt']?.toString() ?? '') ?? 0.0,
    );
  }
}