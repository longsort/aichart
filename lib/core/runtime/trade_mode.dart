
enum TradeMode {
  safe,   // ?�전 보호(?�정�?
  normal, // 기본
}

extension TradeModeX on TradeMode {
  String get label => this == TradeMode.safe ? "?�전 보호" : "기본";
}
